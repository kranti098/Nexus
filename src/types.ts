export type MessageRole = 'user' | 'model';

export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  isStreaming?: boolean;
  type?: 'chat' | 'image' | 'video' | 'code' | 'audio' | 'tts';
  status?: 'generating' | 'done';
  progress?: number;
  url?: string;
  code?: string;
  sessionId?: string;
  imageData?: string;
}

export type NexusMode = 'chat' | 'image' | 'video' | 'code' | 'system' | 'audio' | 'tts';

