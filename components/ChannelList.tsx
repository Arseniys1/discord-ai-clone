
import React from 'react';
import { Channel, ChannelType } from '../types';
import { ICONS } from '../constants';

interface ChannelListProps {
  channels: Channel[];
  activeChannelId: string;
  onSelectChannel: (channel: Channel) => void;
}

const ChannelList: React.FC<ChannelListProps> = ({ channels, activeChannelId, onSelectChannel }) => {
  const textChannels = channels.filter(c => c.type === ChannelType.TEXT);
  const voiceChannels = channels.filter(c => c.type === ChannelType.VOICE);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[#949ba4] text-xs font-bold uppercase mb-1 px-1">
          <span>Text Channels</span>
        </div>
        <div className="space-y-0.5">
          {textChannels.map((channel) => (
            <div
              key={channel.id}
              onClick={() => onSelectChannel(channel)}
              className={`flex items-center space-x-1.5 px-2 py-1.5 rounded cursor-pointer transition-colors group ${activeChannelId === channel.id ? 'bg-[#3f4147] text-white' : 'hover:bg-[#35373c] text-[#80848e] hover:text-[#dbdee1]'}`}
            >
              <ICONS.Hash size={20} className="text-[#80848e]" />
              <span className="font-medium">{channel.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[#949ba4] text-xs font-bold uppercase mb-1 px-1">
          <span>Voice Channels</span>
        </div>
        <div className="space-y-0.5">
          {voiceChannels.map((channel) => (
            <div
              key={channel.id}
              onClick={() => onSelectChannel(channel)}
              className={`flex items-center space-x-1.5 px-2 py-1.5 rounded cursor-pointer transition-colors group ${activeChannelId === channel.id ? 'bg-[#3f4147] text-white' : 'hover:bg-[#35373c] text-[#80848e] hover:text-[#dbdee1]'}`}
            >
              <ICONS.Volume2 size={20} className="text-[#80848e]" />
              <span className="font-medium">{channel.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChannelList;
