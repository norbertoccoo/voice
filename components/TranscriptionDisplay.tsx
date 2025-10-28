import React, { useEffect, useRef } from 'react';
import type { TranscriptionEntry } from '../types';
import { AppState } from '../types';
import { BotMessageSquare, User, Loader2, Sparkles } from 'lucide-react';

interface TranscriptionDisplayProps {
  history: TranscriptionEntry[];
  appState: AppState;
  isProcessingFileQuery: boolean;
}

const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({ history, appState, isProcessingFileQuery }) => {
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);
  
  const renderStatus = () => {
    if (isProcessingFileQuery) {
        return <div className="text-center text-gray-400 flex items-center justify-center space-x-2">
            <Sparkles className="animate-pulse text-purple-400" size={20} />
            <span>Gemini is thinking about your files...</span>
        </div>
    }
    switch(appState) {
        case AppState.IDLE:
            return <div className="text-center text-gray-400">Click the microphone to start the conversation.</div>
        case AppState.CONNECTING:
            return <div className="text-center text-gray-400 flex items-center justify-center space-x-2">
                <Loader2 className="animate-spin" size={20} />
                <span>Connecting to Gemini...</span>
            </div>
        case AppState.CONNECTED:
             if (history.length === 0) {
                return <div className="text-center text-gray-400">Connected. You can start speaking now.</div>
             }
             return null;
        case AppState.ERROR:
             if (history.length === 0) {
                 return <div className="text-center text-red-400">Connection failed. Please check console for errors.</div>
             }
             return null;
        default:
            return null;
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {history.map((entry, index) => (
        <div key={index} className={`flex items-start gap-3 ${entry.author === 'user' ? 'justify-end' : 'justify-start'}`}>
          {entry.author === 'gemini' && (
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center">
              <BotMessageSquare size={18} />
            </div>
          )}
          <div className={`max-w-md p-3 rounded-lg ${entry.author === 'user' ? 'bg-blue-600 rounded-br-none' : 'bg-gray-700 rounded-bl-none'}`}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{entry.text}</p>
          </div>
          {entry.author === 'user' && (
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
              <User size={18} />
            </div>
          )}
        </div>
      ))}
      <div className="pt-4">
        {renderStatus()}
      </div>
      <div ref={endOfMessagesRef} />
    </div>
  );
};

export default TranscriptionDisplay;
