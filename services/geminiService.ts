// Fix: Use `Session` from `@google/genai` as it is the correct exported type for a live session.
import { GoogleGenAI, Session as GeminiLiveSession, LiveServerMessage, Modality, Blob, Part } from "@google/genai";
import { decode, decodeAudioData, encode } from '../utils/audioUtils';
import { fileToBase64 } from "../utils/fileUtils";

// Constants for audio processing
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;

let outputAudioContext: AudioContext | null = null;

// Singleton pattern to ensure only one AudioContext is created
export const getOutputAudioContext = (): AudioContext => {
    if (!outputAudioContext || outputAudioContext.state === 'closed') {
        outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
    }
    return outputAudioContext;
};


export interface LiveSession {
  sessionPromise: Promise<GeminiLiveSession>;
  inputStream: MediaStream;
  inputAudioContext: AudioContext;
  scriptProcessor: ScriptProcessorNode;
  close: () => void;
}

interface ConversationCallbacks {
    onOpen: () => void;
    onMessage: (input: string | null, output: string | null, turnComplete: boolean) => Promise<void>;
    onError: (e: Error) => void;
    onClose: () => void;
}

function createBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    return {
      data: encode(new Uint8Array(int16.buffer)),
      mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
    };
}

export const startConversation = async (callbacks: ConversationCallbacks): Promise<LiveSession> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

    const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: INPUT_SAMPLE_RATE });
    const localOutputAudioContext = getOutputAudioContext();
    const outputNode = localOutputAudioContext.createGain();
    outputNode.connect(localOutputAudioContext.destination);

    const sources = new Set<AudioBufferSourceNode>();
    let nextStartTime = 0;

    const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: 'You are a friendly and helpful conversational AI. For general chat, keep your responses concise. When answering questions about provided files, be thorough and detailed.',
        },
        callbacks: {
            onopen: async () => {
                callbacks.onOpen();
            },
            onmessage: async (message: LiveServerMessage) => {
                const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                if (base64Audio) {
                    nextStartTime = Math.max(nextStartTime, localOutputAudioContext.currentTime);
                    const audioBuffer = await decodeAudioData(decode(base64Audio), localOutputAudioContext, OUTPUT_SAMPLE_RATE, 1);
                    const source = localOutputAudioContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(outputNode);
                    source.addEventListener('ended', () => {
                        sources.delete(source);
                    });
                    source.start(nextStartTime);
                    nextStartTime += audioBuffer.duration;
                    sources.add(source);
                }

                if (message.serverContent?.interrupted) {
                    for (const source of sources.values()) {
                        source.stop();
                    }
                    sources.clear();
                    nextStartTime = 0;
                }
                
                const inputTranscript = message.serverContent?.inputTranscription?.text ?? null;
                const outputTranscript = message.serverContent?.outputTranscription?.text ?? null;
                const isTurnComplete = !!message.serverContent?.turnComplete;
                await callbacks.onMessage(inputTranscript, outputTranscript, isTurnComplete);
            },
            onerror: (e: ErrorEvent) => {
                callbacks.onError(new Error(e.message));
            },
            onclose: () => {
                callbacks.onClose();
            },
        },
    });

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = inputAudioContext.createMediaStreamSource(stream);
    const scriptProcessor = inputAudioContext.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1);
    
    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
        const pcmBlob = createBlob(inputData);
        sessionPromise.then((session) => {
            session.sendRealtimeInput({ media: pcmBlob });
        });
    };
    
    source.connect(scriptProcessor);
    scriptProcessor.connect(inputAudioContext.destination);

    const close = () => {
        sessionPromise.then(session => session.close());
        scriptProcessor.disconnect();
        source.disconnect();
        inputAudioContext.close();
        // Do not close the shared output context here
        stream.getTracks().forEach(track => track.stop());
    };
    
    return { sessionPromise, inputStream: stream, inputAudioContext, scriptProcessor, close };
};


export const stopConversation = (liveSession: LiveSession) => {
    liveSession.close();
};

export const generateContentWithFiles = async (prompt: string, files: File[]): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    
    const fileParts: Part[] = await Promise.all(
        files.map(async (file) => {
            const base64Data = await fileToBase64(file);
            return {
                inlineData: {
                    mimeType: file.type,
                    data: base64Data,
                },
            };
        })
    );

    const allParts: Part[] = [{ text: prompt }, ...fileParts];

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: { parts: allParts },
    });

    return response.text;
};

export const generateSpeech = async (text: string): Promise<AudioBuffer> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Zephyr' },
                },
            },
        },
    });
    
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
        throw new Error("No audio data received from TTS API.");
    }

    const audioBytes = decode(base64Audio);
    const localOutputAudioContext = getOutputAudioContext();
    return await decodeAudioData(audioBytes, localOutputAudioContext, OUTPUT_SAMPLE_RATE, 1);
};

export const playAudio = (audioBuffer: AudioBuffer) => {
    const localOutputAudioContext = getOutputAudioContext();
    const source = localOutputAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    const outputNode = localOutputAudioContext.createGain();
    outputNode.connect(localOutputAudioContext.destination);
    source.connect(outputNode);
    source.start();
};
