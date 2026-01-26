import React, { useState, useRef } from 'react';
import { X, Upload, Plus, Camera } from 'lucide-react';

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateServer: (name: string, icon: string) => Promise<void>;
}

const AddServerModal: React.FC<AddServerModalProps> = ({
  isOpen,
  onClose,
  onCreateServer,
}) => {
  const [serverName, setServerName] = useState('');
  const [iconPreview, setIconPreview] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setIconPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverName.trim()) return;

    setIsLoading(true);
    try {
      await onCreateServer(serverName, iconPreview);
      setServerName('');
      setIconPreview('');
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-in fade-in duration-200">
      <div className="bg-[#313338] w-[440px] rounded-md shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="p-6 text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Customize Your Server</h2>
          <p className="text-[#b5bac1] text-sm px-4">
            Give your new server a personality with a name and an icon. You can always change it later.
          </p>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-[#b5bac1] hover:text-[#dbdee1]"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 pb-4">
          <div className="flex justify-center mb-6">
            <div
              className="relative group cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-20 h-20 rounded-full bg-[#1e1f22] border-dashed border-2 border-[#4e5058] flex items-center justify-center overflow-hidden">
                {iconPreview ? (
                  <img src={iconPreview} alt="Server Icon" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center">
                    <Camera size={24} className="text-[#b5bac1] mb-1" />
                    <span className="text-[10px] font-bold text-[#b5bac1] uppercase">Upload</span>
                  </div>
                )}
              </div>
              <div className="absolute top-0 right-0 w-6 h-6 bg-[#5865f2] rounded-full flex items-center justify-center border-[3px] border-[#313338]">
                <Plus size={14} className="text-white" />
              </div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-xs font-bold text-[#b5bac1] uppercase mb-2">
                Server Name
              </label>
              <input
                type="text"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                className="w-full bg-[#1e1f22] text-white p-2.5 rounded border-none outline-none focus:ring-0 h-10 font-medium"
                placeholder="My Awesome Server"
                required
              />
              <p className="text-xs text-[#949ba4] mt-1">
                By creating a server, you agree to Discord's Community Guidelines.
              </p>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="bg-[#2b2d31] p-4 flex justify-between items-center">
          <button
            onClick={onClose}
            className="text-white text-sm font-medium hover:underline px-4"
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={!serverName.trim() || isLoading}
            className={`bg-[#5865f2] hover:bg-[#4752c4] text-white px-6 py-2.5 rounded text-sm font-medium transition-colors ${
              (!serverName.trim() || isLoading) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isLoading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddServerModal;
