
import React from 'react';
import { AppState } from '../types';
import { Mic, StopCircle, Loader2 } from 'lucide-react';

interface ConversationControlsProps {
  appState: AppState;
  onStart: () => void;
  onStop: () => void;
}

const ConversationControls: React.FC<ConversationControlsProps> = ({ appState, onStart, onStop }) => {
    
    const getButtonContent = () => {
        switch (appState) {
            case AppState.IDLE:
            case AppState.ERROR:
                return (
                    <>
                        <Mic size={24} />
                        <span>Start Conversation</span>
                    </>
                );
            case AppState.CONNECTING:
                return (
                    <>
                        <Loader2 size={24} className="animate-spin" />
                        <span>Connecting...</span>
                    </>
                );
            case AppState.CONNECTED:
                return (
                    <>
                        <StopCircle size={24} />
                        <span>Stop Conversation</span>
                    </>
                );
        }
    }
    
    const isConnecting = appState === AppState.CONNECTING;
    const isConnected = appState === AppState.CONNECTED;

    return (
        <div className="flex flex-col items-center justify-center gap-3">
            <button
                onClick={isConnected ? onStop : onStart}
                disabled={isConnecting}
                className={`
                    px-6 py-3 rounded-full font-semibold text-white flex items-center justify-center space-x-2
                    transition-all duration-200 ease-in-out transform
                    focus:outline-none focus:ring-4
                    ${isConnecting ? 'bg-gray-600 cursor-not-allowed' : ''}
                    ${!isConnecting && !isConnected ? 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500/50' : ''}
                    ${isConnected ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500/50 relative' : ''}
                `}
            >
                {isConnected && (
                    <span className="absolute h-full w-full rounded-full bg-red-500 animate-ping opacity-50"></span>
                )}
                {getButtonContent()}
            </button>
            <p className="text-xs text-gray-500 h-4">
                {isConnected ? "Listening..." : "Click start to begin"}
            </p>
        </div>
    );
};

export default ConversationControls;
