
import { Hash, Volume2, Plus, Compass, Download, Settings, Mic, Headphones, Phone } from 'lucide-react';
import { Server, ChannelType } from './types';

export const SERVERS: Server[] = [
  {
    id: '1',
    name: 'Gemini AI Lab',
    icon: 'https://picsum.photos/id/1/200/200',
    channels: [
      { id: 'c1', name: 'general', type: ChannelType.TEXT },
      { id: 'c2', name: 'announcements', type: ChannelType.TEXT },
      { id: 'v1', name: 'Voice Lounge', type: ChannelType.VOICE },
      { id: 'v2', name: 'Video Call', type: ChannelType.VOICE }
    ]
  },
  {
    id: '2',
    name: 'Tech Enthusiasts',
    icon: 'https://picsum.photos/id/10/200/200',
    channels: [
      { id: 'c3', name: 'tech-talk', type: ChannelType.TEXT },
      { id: 'v3', name: 'Coffee Shop', type: ChannelType.VOICE }
    ]
  }
];

// Store the components themselves, not rendered elements
export const ICONS = {
  Hash,
  Volume2,
  Plus,
  Compass,
  Download,
  Settings,
  Mic,
  Headphones,
  Phone
};
