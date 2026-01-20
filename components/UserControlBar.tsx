
import React from 'react';
import { ICONS } from '../constants';
import { Mic, MicOff, Headphones, Settings } from 'lucide-react';

interface UserControlBarProps {
  isMuted: boolean;
  isDeafened: boolean;
  onMute: () => void;
  onDeafen: () => void;
  onOpenSettings: () => void;
}

const UserControlBar: React.FC<UserControlBarProps> = ({ isMuted, isDeafened, onMute, onDeafen, onOpenSettings }) => {
  return (
    <div className="bg-[#232428] p-2 flex items-center justify-between shrink-0">
      <div className="flex items-center space-x-2 cursor-pointer p-1 rounded hover:bg-[#35373c] min-w-0 flex-1">
        <div className="relative">
          <img src="https://picsum.photos/id/64/32/32" className="w-8 h-8 rounded-full shrink-0" />
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#232428] rounded-full"></div>
        </div>
        <div className="min-w-0 leading-tight">
          <div className="text-white text-sm font-semibold truncate">You</div>
          <div className="text-[#949ba4] text-xs truncate">Online</div>
        </div>
      </div>
      <div className="flex items-center text-[#b5bac1]">
        <button 
          onClick={onMute}
          className={`p-2 rounded hover:bg-[#35373c] ${isMuted ? 'text-[#f23f43]' : ''}`}
        >
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button 
          onClick={onDeafen}
          className={`p-2 rounded hover:bg-[#35373c] ${isDeafened ? 'text-[#f23f43]' : ''}`}
        >
          <Headphones size={20} className={isDeafened ? 'stroke-[3px]' : ''} />
        </button>
        <button 
          onClick={onOpenSettings}
          className="p-2 rounded hover:bg-[#35373c]"
        >
          <Settings size={20} />
        </button>
      </div>
    </div>
  );
};

export default UserControlBar;
