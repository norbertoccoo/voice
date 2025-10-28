import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { TranscriptionEntry } from './types';
import { AppState } from './types';
import { LiveSession, startConversation, stopConversation, generateContentWithFiles, generateSpeech, playAudio, getOutputAudioContext } from './services/geminiService';
import TranscriptionDisplay from './components/TranscriptionDisplay';
import ConversationControls from './components/ConversationControls';
import { Mic, BotMessageSquare, AlertTriangle, Paperclip, X, File as FileIcon } from 'lucide-react';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [transcriptionHistory, setTranscriptionHistory] = useState<TranscriptionEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isProcessingFileQuery, setIsProcessingFileQuery] = useState<boolean>(false);
  
  const liveSessionRef = useRef<LiveSession | null>(null);
  const currentInputTranscriptionRef = useRef<string>('');
  const currentOutputTranscriptionRef = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files);
      setUploadedFiles(prevFiles => {
        // Create a map of the previous files for easy lookup.
        const fileMap = new Map(prevFiles.map(file => [file.name, file]));
        
        // Add or replace files from the new selection.
        for (const file of newFiles) {
          fileMap.set(file.name, file);
        }
        
        // Convert the map back to an array.
        return Array.from(fileMap.values());
      });

      // Reset the input value to allow re-uploading the same file after removing it.
      event.target.value = '';
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = (fileName: string) => {
    setUploadedFiles(prevFiles => prevFiles.filter(file => file.name !== fileName));
  };

  const handleStart = useCallback(async () => {
    setError(null);
    setAppState(AppState.CONNECTING);
    setTranscriptionHistory([]);

    const onMessage = async (
      inputTranscript: string | null,
      outputTranscript: string | null,
      isTurnComplete: boolean
    ) => {
      if (inputTranscript) {
        currentInputTranscriptionRef.current += inputTranscript;
      }
      if (outputTranscript) {
        currentOutputTranscriptionRef.current += outputTranscript;
      }

      if (isTurnComplete) {
        const fullInput = currentInputTranscriptionRef.current.trim();
        const fullOutput = currentOutputTranscriptionRef.current.trim();
        
        let newHistory: TranscriptionEntry[] = [];
        if (fullInput) {
            newHistory.push({ author: 'user', text: fullInput });
        }
        if (fullOutput) {
            newHistory.push({ author: 'gemini', text: fullOutput });
        }
        if(newHistory.length > 0) {
            setTranscriptionHistory(prev => [...prev, ...newHistory]);
        }
        
        // If there are uploaded files and the user has spoken, use generateContent
        if (fullInput && uploadedFiles.length > 0) {
          setIsProcessingFileQuery(true);
          setError(null);
          try {
            const textResponse = await generateContentWithFiles(fullInput, uploadedFiles);
            setTranscriptionHistory(prev => [...prev, { author: 'gemini', text: textResponse }]);
            const audioBuffer = await generateSpeech(textResponse);
            playAudio(audioBuffer);
          } catch(e) {
            const err = e as Error;
            console.error("Error processing file query:", err);
            setError(`Error answering question about files: ${err.message}`);
          } finally {
            setIsProcessingFileQuery(false);
          }
        }
        
        currentInputTranscriptionRef.current = '';
        currentOutputTranscriptionRef.current = '';
      }
    };

    const onOpen = () => {
        setAppState(AppState.CONNECTED);
    };

    const onError = (e: Error) => {
      console.error('Gemini Live API Error:', e);
      setError(`An error occurred: ${e.message}. Please try again.`);
      setAppState(AppState.ERROR);
      if (liveSessionRef.current) {
        stopConversation(liveSessionRef.current);
        liveSessionRef.current = null;
      }
    };

    const onClose = () => {
        if(appState !== AppState.ERROR) {
            setAppState(AppState.IDLE);
        }
    };
    
    try {
      const session = await startConversation({ onOpen, onMessage, onError, onClose });
      liveSessionRef.current = session;
    } catch (e) {
      const err = e as Error;
      console.error("Failed to start conversation:", err);
      setError(`Failed to start session: ${err.message}. Please ensure microphone access is granted.`);
      setAppState(AppState.ERROR);
    }
  }, [appState, uploadedFiles]);

  const handleStop = useCallback(() => {
    if (liveSessionRef.current) {
      stopConversation(liveSessionRef.current);
      liveSessionRef.current = null;
    }
    setAppState(AppState.IDLE);
  }, []);

  useEffect(() => {
    // Ensure the output audio context is initialized when the component mounts
    getOutputAudioContext();
    return () => {
      if (liveSessionRef.current) {
        stopConversation(liveSessionRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl mx-auto flex flex-col h-[90vh] bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-700">
        <header className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-tr from-purple-500 to-indigo-600 rounded-lg">
              <BotMessageSquare size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Gemini Live Audio</h1>
              <p className="text-sm text-gray-400">Real-time voice conversation agent</p>
            </div>
          </div>
          <div>
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              aria-hidden="true"
              accept="image/*,text/*,.pdf,.doc,.docx"
            />
            <button
              onClick={handleUploadClick}
              className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
              aria-label="Upload files"
              title="Upload files"
            >
              <Paperclip size={20} />
            </button>
          </div>
        </header>
        
        {uploadedFiles.length > 0 && (
          <div className="p-3 border-b border-gray-700 bg-gray-800/50 max-h-32 overflow-y-auto">
            <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Uploaded Files</p>
            <div className="flex flex-wrap gap-2">
              {uploadedFiles.map(file => (
                <div key={file.name} className="flex items-center gap-2 bg-gray-700 rounded-full py-1 pl-2 pr-1 text-sm">
                   <FileIcon size={16} className="text-gray-400 flex-shrink-0" />
                   <span className="truncate max-w-48" title={file.name}>{file.name}</span>
                   <button onClick={() => handleRemoveFile(file.name)} className="text-gray-500 hover:text-white rounded-full p-0.5 hover:bg-gray-600 transition-colors">
                     <X size={14} />
                   </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <TranscriptionDisplay history={transcriptionHistory} appState={appState} isProcessingFileQuery={isProcessingFileQuery} />
        
        {error && (
            <div className="p-4 bg-red-900/50 text-red-300 flex items-center space-x-3">
                <AlertTriangle className="text-red-400" />
                <p className="text-sm">{error}</p>
            </div>
        )}

        <footer className="p-4 mt-auto border-t border-gray-700">
          <ConversationControls 
            appState={appState}
            onStart={handleStart}
            onStop={handleStop}
          />
        </footer>
      </div>
       <p className="text-center text-xs text-gray-500 mt-4">
        Powered by Gemini 2.5 Native Audio & Pro APIs.
      </p>
    </div>
  );
};

export default App;