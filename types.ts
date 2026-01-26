export enum ChannelType {
  TEXT = "TEXT",
  VOICE = "VOICE",
}

export interface Message {
  id: string;
  author: string;
  avatar?: string;
  content: string;
  timestamp: Date;
  isAI?: boolean;
  dbId?: number;
  userId?: number;
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

export interface User {
  id: string;
  username: string;
  avatar?: string;
  permissions?: string[];
}
