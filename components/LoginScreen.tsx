import React, { useState } from "react";

interface LoginScreenProps {
  onConnect: (
    url: string,
    token: string,
    username: string,
    avatar?: string,
  ) => void;
  connectionError?: string;
}

const LoginScreen: React.FC<LoginScreenProps> = ({
  onConnect,
  connectionError: socketError,
}) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [url, setUrl] = useState("http://localhost:3001");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !username || !password) return;

    setIsLoading(true);
    setAuthError("");

    try {
      // Clean URL
      const baseUrl = url.replace(/\/$/, "");

      if (isRegistering) {
        // Register
        const regResponse = await fetch(`${baseUrl}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });

        const regData = await regResponse.json();
        if (!regResponse.ok) {
          throw new Error(regData.error || "Registration failed");
        }
        // If successful, proceed to login automatically
      }

      // Login
      const loginResponse = await fetch(`${baseUrl}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const loginData = await loginResponse.json();

      if (!loginResponse.ok) {
        throw new Error(loginData.error || "Login failed");
      }

      if (loginData.token) {
        onConnect(url, loginData.token, loginData.username, loginData.avatar);
      } else {
        throw new Error("No access token received");
      }
    } catch (err: any) {
      setAuthError(err.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const displayError = authError || socketError;

  return (
    <div className="min-h-screen bg-[url('https://cdn.discordapp.com/attachments/1078759551465291848/1148657662803021915/discord_login_bg.png')] bg-cover bg-center flex items-center justify-center font-sans">
      <div className="bg-[#313338] p-8 rounded-md shadow-2xl w-full max-w-[480px] animate-in fade-in zoom-in duration-300">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">
            {isRegistering ? "Create an Account" : "Welcome back!"}
          </h2>
          <p className="text-[#b5bac1]">
            {isRegistering
              ? "We're so excited to have you join us!"
              : "We're so excited to see you again!"}
          </p>
        </div>

        {displayError && (
          <div className="mb-4 p-3 bg-[#f23f43]/10 border border-[#f23f43] rounded text-[#f23f43] text-sm font-medium">
            {displayError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Server URL Input (kept for flexibility) */}
          <div>
            <label className="block text-xs font-bold text-[#b5bac1] uppercase mb-2">
              Server URL
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
              Username <span className="text-[#f23f43]">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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

          {!isRegistering && (
            <div className="text-[#00a8fc] text-sm font-medium cursor-pointer hover:underline mb-4">
              Forgot your password?
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full bg-[#5865f2] hover:bg-[#4752c4] text-white font-medium py-2.5 rounded transition-colors mt-2 mb-2 ${isLoading ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            {isLoading
              ? "Processing..."
              : isRegistering
                ? "Continue"
                : "Log In"}
          </button>

          <div className="text-sm text-[#949ba4] mt-4">
            <span className="font-medium">
              {isRegistering ? "Already have an account?" : "Need an account?"}
            </span>{" "}
            <span
              onClick={() => {
                setIsRegistering(!isRegistering);
                setAuthError("");
              }}
              className="text-[#00a8fc] cursor-pointer hover:underline ml-1"
            >
              {isRegistering ? "Log In" : "Register"}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;
