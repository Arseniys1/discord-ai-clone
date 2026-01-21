import React, { useState, useEffect, useRef } from "react";
import { X, Mic, Volume2, Save } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputDevices: MediaDeviceInfo[];
  selectedInputDeviceId: string;
  onSelectInputDevice: (deviceId: string) => void;
  inputVolume: number; // 0 to 200 (percent)
  onInputVolumeChange: (volume: number) => void;
  currentAvatar?: string;
  onUpdateAvatar: (url: string) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  inputDevices,
  selectedInputDeviceId,
  onSelectInputDevice,
  inputVolume,
  onInputVolumeChange,
  currentAvatar,
  onUpdateAvatar,
}) => {
  const [activeTab, setActiveTab] = useState<"voice" | "profile">("voice");
  const [avatarUrl, setAvatarUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && currentAvatar) {
      setAvatarUrl(currentAvatar);
    }
  }, [isOpen, currentAvatar]);

  if (!isOpen) return null;

  const handleSaveAvatar = () => {
    onUpdateAvatar(avatarUrl);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-in fade-in duration-200">
      <div className="bg-[#313338] w-[800px] h-[600px] rounded-lg shadow-2xl flex overflow-hidden scale-100">
        {/* Sidebar */}
        <div className="w-[230px] bg-[#2b2d31] flex flex-col items-end py-14 pr-4 border-r border-[#1e1f22]">
          <div className="w-full pl-4 mb-2">
            <div className="text-xs font-bold text-[#949ba4] uppercase mb-1.5 px-2.5">
              User Settings
            </div>
            <div
              className={`px-2.5 py-1.5 rounded cursor-pointer text-base font-medium mb-0.5 ${activeTab === "voice" ? "bg-[#404249] text-white" : "text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1]"}`}
              onClick={() => setActiveTab("voice")}
            >
              Voice & Video
            </div>
            <div
              className={`px-2.5 py-1.5 rounded cursor-pointer text-base font-medium ${activeTab === "profile" ? "bg-[#404249] text-white" : "text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1]"}`}
              onClick={() => setActiveTab("profile")}
            >
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
            {activeTab === "voice" && (
              <>
                <h2 className="text-xl font-bold text-white mb-6">
                  Voice Settings
                </h2>

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
                      {inputDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label ||
                            `Microphone ${device.deviceId.slice(0, 5)}...`}
                        </option>
                      ))}
                    </select>
                    <Mic
                      className="absolute right-3 top-3 text-[#b5bac1] pointer-events-none"
                      size={18}
                    />
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
                        onChange={(e) =>
                          onInputVolumeChange(parseInt(e.target.value))
                        }
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
                    <span className="text-white text-sm w-12 text-right font-mono">
                      {inputVolume}%
                    </span>
                  </div>
                </div>
              </>
            )}

            {activeTab === "profile" && (
              <>
                <h2 className="text-xl font-bold text-white mb-6">
                  User Profile
                </h2>

                <div className="mb-8">
                  <div className="flex items-start space-x-6">
                    <div
                      className="relative group cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="w-24 h-24 rounded-full overflow-hidden bg-[#1e1f22] border-4 border-[#1e1f22]">
                        <img
                          src={
                            avatarUrl || "https://picsum.photos/id/64/128/128"
                          }
                          alt="Avatar"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "https://picsum.photos/id/64/128/128";
                          }}
                        />
                      </div>
                      <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-white text-xs font-bold">
                          UPLOAD
                        </span>
                      </div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept="image/*"
                      />
                    </div>

                    <div className="flex-1">
                      <h3 className="text-white font-semibold mb-2">
                        Profile Image
                      </h3>
                      <p className="text-[#b5bac1] text-sm mb-4">
                        Click on the avatar to upload a new image.
                      </p>

                      <button
                        onClick={handleSaveAvatar}
                        className="bg-[#5865f2] hover:bg-[#4752c4] text-white px-4 py-2 rounded text-sm font-medium transition-colors flex items-center"
                      >
                        <Save size={16} className="mr-2" />
                        Save Changes
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
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
