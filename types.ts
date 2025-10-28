
export interface TranscriptionEntry {
  author: 'user' | 'gemini';
  text: string;
}

export enum AppState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}
