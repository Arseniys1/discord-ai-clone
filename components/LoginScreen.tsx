import React, { useState } from 'react';
import { Disc } from 'lucide-react';

interface LoginScreenProps {
  onConnect: (url: string, password: string, username: string) => void;
  connectionError?: string;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onConnect, connectionError }) => {
  const [url, setUrl] = useState('http://localhost:3001');
  const [password, setPassword] = useState('admin');
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !password || !username) return;

    setIsLoading(true);
    // Simulate a brief loading state for UX
    setTimeout(() => {
        onConnect(url, password, username);
        setIsLoading(false);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-[url('https://cdn.discordapp.com/attachments/1078759551465291848/1148657662803021915/discord_login_bg.png')] bg-cover bg-center flex items-center justify-center font-sans">
      <div className="bg-[#313338] p-8 rounded-md shadow-2xl w-full max-w-[480px] animate-in fade-in zoom-in duration-300">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">Welcome back!</h2>
          <p className="text-[#b5bac1]">We're so excited to see you again!</p>
        </div>

        {connectionError && (
            <div className="mb-4 p-3 bg-[#f23f43]/10 border border-[#f23f43] rounded text-[#f23f43] text-sm font-medium">
                {connectionError}
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#b5bac1] uppercase mb-2">
              Server URL <span className="text-[#f23f43]">*</span>
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-[#1e1f22] text-white p-2.5 rounded border-none outline-none focus:ring-0 h-10 font-medium"
              required
            />
          </div>

          <div>
             <label className="block text-xs font-bold text-[#b5bac1] uppercase mb-2">
              Password <span className="text-[#f23f43]">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#1e1f22] text-white p-2.5 rounded border-none outline-none focus:ring-0 h-10 font-medium"
              required
            />
          </div>

           <div>
             <label className="block text-xs font-bold text-[#b5bac1] uppercase mb-2">
              Username <span className="text-[#f23f43]">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[#1e1f22] text-white p-2.5 rounded border-none outline-none focus:ring-0 h-10 font-medium"
              placeholder="Enter your display name"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full bg-[#5865f2] hover:bg-[#4752c4] text-white font-medium py-2.5 rounded transition-colors mt-4 mb-2 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isLoading ? 'Connecting...' : 'Log In'}
          </button>

          <div className="text-xs text-[#949ba4]">
              <span className="font-bold text-[#949ba4]">Need an account?</span>{' '}
              <span className="text-[#00a8fc] cursor-pointer hover:underline">Register</span>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;
