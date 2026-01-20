import React from 'react';
import { X, Mic, Volume2 } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputDevices: MediaDeviceInfo[];
  selectedInputDeviceId: string;
  onSelectInputDevice: (deviceId: string) => void;
  inputVolume: number; // 0 to 200 (percent)
  onInputVolumeChange: (volume: number) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  inputDevices,
  selectedInputDeviceId,
  onSelectInputDevice,
  inputVolume,
  onInputVolumeChange
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-in fade-in duration-200">
      <div className="bg-[#313338] w-[800px] h-[600px] rounded-lg shadow-2xl flex overflow-hidden scale-100">
        {/* Sidebar */}
        <div className="w-[230px] bg-[#2b2d31] flex flex-col items-end py-14 pr-4 border-r border-[#1e1f22]">
          <div className="w-full pl-4 mb-2">
            <div className="text-xs font-bold text-[#949ba4] uppercase mb-1.5 px-2.5">User Settings</div>
            <div className="bg-[#404249] text-white px-2.5 py-1.5 rounded cursor-pointer text-base font-medium mb-0.5">
              Voice & Video
            </div>
             <div className="text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1] px-2.5 py-1.5 rounded cursor-pointer text-base font-medium">
              Profile
            </div>
             <div className="text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1] px-2.5 py-1.5 rounded cursor-pointer text-base font-medium">
              Appearance
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col relative bg-[#313338]">
            <div className="p-10 pb-20 overflow-y-auto h-full scrollbar-hide">
                <h2 className="text-xl font-bold text-white mb-6">Voice Settings</h2>

                 {/* Input Device Selection */}
                 <div className="mb-8 border-b border-[#3f4147] pb-8">
                    <label className="block text-xs font-bold text-[#b5bac1] uppercase mb-2">
                        Input Device
                    </label>
                    <div className="relative">
                        <select
                            value={selectedInputDeviceId}
                            onChange={(e) => onSelectInputDevice(e.target.value)}
                            className="w-full bg-[#1e1f22] text-white p-2.5 rounded hover:bg-[#1e1f22] focus:bg-[#1e1f22] border border-transparent outline-none appearance-none cursor-pointer text-base font-medium shadow-sm transition-colors"
                        >
                            {inputDevices.map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                                </option>
                            ))}
                        </select>
                         <Mic className="absolute right-3 top-3 text-[#b5bac1] pointer-events-none" size={18} />
                    </div>
                 </div>

                 {/* Input Volume Slider */}
                 <div className="mb-6">
                     <label className="block text-xs font-bold text-[#b5bac1] uppercase mb-2">
                        Input Volume
                    </label>
                    <div className="flex items-center space-x-4">
                        <Volume2 size={24} className="text-[#b5bac1]" />
                        <div className="flex-1 relative h-2 bg-[#4e5058] rounded-full group cursor-pointer">
                            <input
                                type="range"
                                min="0"
                                max="200"
                                value={inputVolume}
                                onChange={(e) => onInputVolumeChange(parseInt(e.target.value))}
                                className="absolute w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div
                                className="absolute top-0 left-0 h-full bg-[#5865f2] rounded-full pointer-events-none"
                                style={{ width: `${Math.min(inputVolume / 2, 100)}%` }}
                            ></div>
                            <div
                                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md pointer-events-none transition-transform group-hover:scale-125"
                                style={{ left: `${Math.min(inputVolume / 2, 100)}%` }}
                            ></div>
                        </div>
                        <span className="text-white text-sm w-12 text-right font-mono">{inputVolume}%</span>
                    </div>
                 </div>
            </div>

            {/* Close Button */}
            <div className="absolute top-4 right-4 flex flex-col items-center z-10">
                 <button
                    onClick={onClose}
                    className="flex flex-col items-center text-[#b5bac1] hover:text-white group transition-colors"
                >
                    <div className="w-9 h-9 border-2 border-[#b5bac1] group-hover:border-white rounded-full flex items-center justify-center mb-1 transition-colors bg-[#313338]">
                        <X size={20} strokeWidth={3} />
                    </div>
                    <span className="text-xs font-semibold">ESC</span>
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
