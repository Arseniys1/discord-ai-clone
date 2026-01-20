import React, { useState, useEffect, useRef, useCallback } from "react";
import { SERVERS, ICONS } from "./constants";
import { Channel, ChannelType, Message, Server } from "./types";
import Sidebar from "./components/Sidebar";
import ChannelList from "./components/ChannelList";
import ChatArea from "./components/ChatArea";
import VoiceStage from "./components/VoiceStage";
import UserControlBar from "./components/UserControlBar";
import SettingsModal from "./components/SettingsModal";
import LoginScreen from "./components/LoginScreen";
import { Phone, Plus, Compass } from "lucide-react";
import { io, Socket } from "socket.io-client";

const App: React.FC = () => {
  // Login & Connection State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [username, setUsername] = useState("You");

  const [activeServer, setActiveServer] = useState<Server>(SERVERS[0]);
  const [activeChannel, setActiveChannel] = useState<Channel>(
    SERVERS[0].channels[0],
  );
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      author: "System",
      content:
        "Welcome! Connect to a text channel to chat or a voice channel to speak.",
      timestamp: new Date(),
    },
  ]);
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activeVideoTrack, setActiveVideoTrack] = useState<MediaStream | null>(
    null,
  );
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    new Map(),
  );
  const [remoteUsernames, setRemoteUsernames] = useState<Map<string, string>>(
    new Map(),
  );

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] =
    useState<string>("");
  const [inputVolume, setInputVolume] = useState<number>(100);

  // Socket & WebRTC Refs
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null); // Processed stream sent to peers
  const rawInputStreamRef = useRef<MediaStream | null>(null); // Raw stream from mic
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Handle Login / Connect
  const handleConnect = useCallback(
    (url: string, token: string, user: string) => {
      setConnectionError("");

      // Close existing socket if any
      if (socketRef.current) {
        socketRef.current.disconnect();
      }

      const newSocket = io(url, {
        auth: { token },
        transports: ["websocket", "polling"], // Enforce websocket for better performance if possible
      });

      newSocket.on("connect", () => {
        console.log("Connected to server");
        setIsLoggedIn(true);
        setUsername(user);
        setConnectionError("");

        // Save session to localStorage
        localStorage.setItem("discord_clone_token", token);
        localStorage.setItem("discord_clone_username", user);
        localStorage.setItem("discord_clone_url", url);
      });

      newSocket.on("connect_error", (err) => {
        console.error("Connection Error:", err);
        // Determine if it's an auth error based on message or structure
        let errorMsg = "Connection failed. Please check URL.";
        if (
          err.message === "Authentication error: Invalid token" ||
          err.message.includes("token")
        ) {
          errorMsg = "Session expired or invalid. Please login again.";
          // Clear session on auth error
          localStorage.removeItem("discord_clone_token");
          localStorage.removeItem("discord_clone_username");
          localStorage.removeItem("discord_clone_url");
          setIsLoggedIn(false);
        } else if (err.message === "xhr poll error") {
          errorMsg = "Server unreachable. Check URL.";
        }
        setConnectionError(errorMsg);
      });

      socketRef.current = newSocket;
    },
    [],
  );

  // Auto-login effect
  useEffect(() => {
    const savedToken = localStorage.getItem("discord_clone_token");
    const savedUsername = localStorage.getItem("discord_clone_username");
    const savedUrl = localStorage.getItem("discord_clone_url");

    if (savedToken && savedUsername && savedUrl) {
      handleConnect(savedUrl, savedToken, savedUsername);
    }
  }, [handleConnect]);

  // Socket Event Listeners (Setup ONLY when logged in)
  useEffect(() => {
    if (!isLoggedIn || !socketRef.current) return;

    const socket = socketRef.current;

    const onReceiveMessage = (message: any) => {
      setMessages((prev) => [
        ...prev,
        {
          id: message.id || Date.now().toString(),
          author: message.author || "Unknown",
          content: message.content || message, // Handle both object and string for backward compat
          timestamp: message.timestamp
            ? new Date(message.timestamp)
            : new Date(),
        },
      ]);
    };

    const onChatHistory = (history: any[]) => {
      const formattedMessages = history.map((msg) => ({
        id: msg.id.toString(),
        author: msg.username,
        content: msg.content,
        timestamp: new Date(msg.timestamp),
      }));
      setMessages(formattedMessages);
    };

    const onExistingUsers = (users: { id: string; username: string }[]) => {
      // Update usernames map
      const newUsernames = new Map(remoteUsernames);
      users.forEach((u) => {
        newUsernames.set(u.id, u.username);
        createPeerConnection(u.id, true);
      });
      setRemoteUsernames(newUsernames);
    };

    const onUserJoinedVoice = (user: { id: string; username: string }) => {
      setRemoteUsernames((prev) => {
        const newMap = new Map(prev);
        newMap.set(user.id, user.username);
        return newMap;
      });
    };

    const onUserLeft = (userId: string) => {
      if (peerConnectionsRef.current.has(userId)) {
        peerConnectionsRef.current.get(userId)?.close();
        peerConnectionsRef.current.delete(userId);
      }
      setRemoteStreams((prev) => {
        const newMap = new Map(prev);
        newMap.delete(userId);
        return newMap;
      });
      setRemoteUsernames((prev) => {
        const newMap = new Map(prev);
        newMap.delete(userId);
        return newMap;
      });
    };

    const onOffer = async (data: {
      from: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const pc = createPeerConnection(data.from, false);
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { to: data.from, sdp: answer });
    };

    const onAnswer = async (data: {
      from: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const pc = peerConnectionsRef.current.get(data.from);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      }
    };

    const onCandidate = async (data: {
      from: string;
      candidate: RTCIceCandidateInit;
    }) => {
      const pc = peerConnectionsRef.current.get(data.from);
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    };

    socket.on("receive_message", onReceiveMessage);
    socket.on("chat_history", onChatHistory);
    socket.on("existing_users", onExistingUsers);
    socket.on("user_joined_voice", onUserJoinedVoice);
    socket.on("user_left", onUserLeft);
    socket.on("offer", onOffer);
    socket.on("answer", onAnswer);
    socket.on("candidate", onCandidate);

    // Initial Join for Text Channel
    if (activeChannel.type === ChannelType.TEXT) {
      socket.emit("join_text_channel", activeChannel.id);
    }

    return () => {
      socket.off("receive_message", onReceiveMessage);
      socket.off("chat_history", onChatHistory);
      socket.off("existing_users", onExistingUsers);
      socket.off("user_joined_voice", onUserJoinedVoice);
      socket.off("user_left", onUserLeft);
      socket.off("offer", onOffer);
      socket.off("answer", onAnswer);
      socket.off("candidate", onCandidate);
    };
  }, [isLoggedIn, activeChannel.id]); // Re-bind if channel or login status changes

  // Join text channel on selection (Separate effect to handle channel switching after login)
  useEffect(() => {
    if (
      isLoggedIn &&
      activeChannel.type === ChannelType.TEXT &&
      socketRef.current
    ) {
      socketRef.current.emit("join_text_channel", activeChannel.id);
      setMessages([]);
    }
  }, [activeChannel, isLoggedIn]);

  const createPeerConnection = (userId: string, isInitiator: boolean) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peerConnectionsRef.current.set(userId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("candidate", {
          to: userId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStreams((prev) => {
        const newMap = new Map(prev);
        newMap.set(userId, event.streams[0]);
        return newMap;
      });
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        if (localStreamRef.current) {
          pc.addTrack(track, localStreamRef.current);
        }
      });
    }

    if (isInitiator) {
      pc.createOffer().then((offer) => {
        pc.setLocalDescription(offer);
        socketRef.current?.emit("offer", { to: userId, sdp: offer });
      });
    }

    return pc;
  };

  // Enumerate Devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        // Only request permission if we are about to setup devices or user logged in?
        // Better to wait until needed, but for listing in settings we need it.
        // We'll skip getUserMedia here to avoid popup on login screen, wait for settings open or voice join.
        // However, SettingsModal expects devices.
        if (isSettingsOpen || isVoiceConnected) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const inputs = devices.filter((d) => d.kind === "audioinput");
          setInputDevices(inputs);
          if (inputs.length > 0 && !selectedInputDeviceId) {
            setSelectedInputDeviceId(inputs[0].deviceId);
          }
        }
      } catch (e) {
        console.error("Error enumerating devices:", e);
      }
    };
    getDevices();
    navigator.mediaDevices.addEventListener("devicechange", getDevices);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", getDevices);
  }, [isSettingsOpen, isVoiceConnected, selectedInputDeviceId]);

  // Volume Control Effect
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = inputVolume / 100;
    }
  }, [inputVolume]);

  const handleInputDeviceChange = (deviceId: string) => {
    setSelectedInputDeviceId(deviceId);
    if (isVoiceConnected) {
      // Restart session with new device
      stopSession();
      // Small delay to ensure cleanup
      setTimeout(
        () => startVoiceSession(isVideoEnabled, isScreenSharing, deviceId),
        500,
      );
    }
  };

  const startVoiceSession = useCallback(
    async (
      withVideo = false,
      withScreen = false,
      specificDeviceId?: string,
    ) => {
      try {
        const deviceId = specificDeviceId || selectedInputDeviceId;
        let userStream: MediaStream;
        let finalStream: MediaStream;

        if (withScreen) {
          userStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
          finalStream = userStream;
        } else {
          // Get Raw Stream
          userStream = await navigator.mediaDevices.getUserMedia({
            video: withVideo,
            audio: deviceId ? { deviceId: { exact: deviceId } } : true,
          });

          rawInputStreamRef.current = userStream;

          // Process Audio (Volume Control)
          if (userStream.getAudioTracks().length > 0) {
            const audioCtx = new (
              window.AudioContext || (window as any).webkitAudioContext
            )();
            audioContextRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(userStream);
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = inputVolume / 100;
            gainNodeRef.current = gainNode;
            const destination = audioCtx.createMediaStreamDestination();

            source.connect(gainNode);
            gainNode.connect(destination);

            // Combine processed audio with original video
            const processedAudioTrack = destination.stream.getAudioTracks()[0];
            const videoTracks = userStream.getVideoTracks();
            finalStream = new MediaStream([
              processedAudioTrack,
              ...videoTracks,
            ]);
          } else {
            finalStream = userStream;
          }
        }

        localStreamRef.current = finalStream;
        setActiveVideoTrack(finalStream);

        // Add tracks to existing peer connections (if restarting/upgrading)
        peerConnectionsRef.current.forEach((pc) => {
          // Simple approach: Add new tracks.
          finalStream
            .getTracks()
            .forEach((track) => pc.addTrack(track, finalStream));
        });

        if (!isVoiceConnected) {
          socketRef.current?.emit("join_voice_channel", activeChannel.id);
        }

        setIsVoiceConnected(true);
        if (withVideo) setIsVideoEnabled(true);
        if (withScreen) setIsScreenSharing(true);
      } catch (err) {
        console.error("Failed to access media devices", err);
      }
    },
    [activeChannel, selectedInputDeviceId, inputVolume, isVoiceConnected],
  );

  const stopSession = useCallback(() => {
    // Stop Processed Stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    // Stop Raw Stream
    if (rawInputStreamRef.current) {
      rawInputStreamRef.current.getTracks().forEach((track) => track.stop());
      rawInputStreamRef.current = null;
    }
    // Close Audio Context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
      gainNodeRef.current = null;
    }

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    setRemoteStreams(new Map());
    setRemoteUsernames(new Map());

    socketRef.current?.emit("leave_voice_channel");

    setIsVoiceConnected(false);
    setIsVideoEnabled(false);
    setIsScreenSharing(false);
    setActiveVideoTrack(null);
  }, []);

  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      author: username, // Use dynamic username
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    socketRef.current?.emit("send_message", {
      channelId: activeChannel.id,
      message: text,
    });
  };

  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      stopSession();
    } else {
      stopSession();
      setTimeout(() => startVoiceSession(false, true), 500);
    }
  };

  const handleToggleVideo = () => {
    if (isVideoEnabled) {
      stopSession();
      startVoiceSession(false, false); // Audio only
    } else {
      stopSession();
      setTimeout(() => startVoiceSession(true, false), 500);
    }
  };

  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted]);

  if (!isLoggedIn) {
    return (
      <LoginScreen
        onConnect={handleConnect}
        connectionError={connectionError}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#313338] select-none">
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        inputDevices={inputDevices}
        selectedInputDeviceId={selectedInputDeviceId}
        onSelectInputDevice={handleInputDeviceChange}
        inputVolume={inputVolume}
        onInputVolumeChange={setInputVolume}
      />

      <Sidebar
        servers={SERVERS}
        activeServerId={activeServer.id}
        onSelectServer={(s) => {
          setActiveServer(s);
          setActiveChannel(s.channels[0]);
        }}
      />

      <div className="flex flex-col w-60 bg-[#2b2d31]">
        <div className="h-12 flex items-center px-4 shadow-sm border-b border-[#1f2023] font-bold text-white">
          {activeServer.name}
        </div>
        <div className="flex-1 overflow-y-auto pt-4 px-2 space-y-0.5">
          <ChannelList
            channels={activeServer.channels}
            activeChannelId={activeChannel.id}
            onSelectChannel={(channel) => {
              setActiveChannel(channel);
            }}
          />
        </div>

        <UserControlBar
          username={username}
          isMuted={isMuted}
          isDeafened={isDeafened}
          onMute={() => setIsMuted(!isMuted)}
          onDeafen={() => setIsDeafened(!isDeafened)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex items-center justify-between px-4 shadow-sm border-b border-[#1f2023] z-10 bg-[#313338]">
          <div className="flex items-center space-x-2">
            {activeChannel.type === ChannelType.TEXT ? (
              <ICONS.Hash size={20} className="text-[#80848e]" />
            ) : (
              <ICONS.Volume2 size={20} className="text-[#80848e]" />
            )}
            <span className="font-semibold text-white">
              {activeChannel.name}
            </span>
          </div>
          <div className="flex items-center space-x-4 text-[#b5bac1]">
            <Phone size={20} className="hover:text-white cursor-pointer" />
            <Plus size={20} className="hover:text-white cursor-pointer" />
            <Compass size={20} className="hover:text-white cursor-pointer" />
          </div>
        </header>

        <main className="flex-1 flex flex-col relative overflow-hidden">
          {activeChannel.type === ChannelType.TEXT ? (
            <ChatArea messages={messages} onSendMessage={handleSendMessage} />
          ) : (
            <VoiceStage
              isConnected={isVoiceConnected}
              onConnect={() => startVoiceSession()}
              onDisconnect={stopSession}
              onToggleVideo={handleToggleVideo}
              onToggleScreenShare={handleToggleScreenShare}
              isVideoEnabled={isVideoEnabled}
              isScreenSharing={isScreenSharing}
              videoTrack={activeVideoTrack}
              remoteStreams={remoteStreams}
              remoteUsernames={remoteUsernames}
            />
          )}
        </main>
      </div>

      <div className="hidden lg:flex flex-col w-60 bg-[#2b2d31] p-4">
        <h3 className="text-xs font-bold text-[#949ba4] uppercase mb-4">
          Members
        </h3>
        <div className="space-y-4">
          <div className="flex items-center space-x-3 cursor-pointer p-1 rounded hover:bg-[#35373c] group">
            <div className="relative">
              <img
                src="https://picsum.photos/id/64/40/40"
                className="w-8 h-8 rounded-full"
              />
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#2b2d31] rounded-full"></div>
            </div>
            <span className="text-[#949ba4] group-hover:text-white font-medium">
              {username} (You)
            </span>
          </div>

          {Array.from(remoteStreams.keys()).map((userId, i) => (
            <div
              key={userId}
              className="flex items-center space-x-3 cursor-pointer p-1 rounded hover:bg-[#35373c] group"
            >
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs text-white">
                  {userId.substring(0, 2).toUpperCase()}
                </div>
              </div>
              <span className="text-[#949ba4] group-hover:text-white font-medium truncate">
                {remoteUsernames.get(userId) ||
                  `User ${userId.substring(0, 5)}...`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;
