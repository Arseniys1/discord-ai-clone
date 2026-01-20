
export enum ChannelType {
  TEXT = 'TEXT',
  VOICE = 'VOICE'
}

export interface Message {
  id: string;
  author: string;
  content: string;
  timestamp: Date;
  isAI?: boolean;
}

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
}

export interface Server {
  id: string;
  name: string;
  icon: string;
  channels: Channel[];
}
