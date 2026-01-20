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
  // --- Global State ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [username, setUsername] = useState("You");

  const [activeServer, setActiveServer] = useState<Server>(SERVERS[0]);
  const [activeChannel, setActiveChannel] = useState<Channel>(
    SERVERS[0].channels[0],
  );

  // Chat State
  const [messages, setMessages] = useState<Message[]>([]);

  // Voice/Video State
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activeVideoTrack, setActiveVideoTrack] = useState<MediaStream | null>(
    null,
  );

  // Remote Users State
  // Map<socketId, MediaStream>
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    new Map(),
  );
  // Map<socketId, username>
  const [remoteUsernames, setRemoteUsernames] = useState<Map<string, string>>(
    new Map(),
  );

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] =
    useState<string>("");
  const [inputVolume, setInputVolume] = useState<number>(100);

  // --- Refs ---
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceCandidatesQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map(),
  );

  // Local Media Refs
  const localStreamRef = useRef<MediaStream | null>(null); // Final stream sent to peers
  const rawInputStreamRef = useRef<MediaStream | null>(null); // Raw mic stream
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // --- Auth & Socket Connection ---
  const handleConnect = useCallback(
    (url: string, token: string, user: string) => {
      setConnectionError("");

      if (socketRef.current) {
        socketRef.current.disconnect();
      }

      const newSocket = io(url, {
        auth: { token },
        transports: ["websocket", "polling"],
      });

      newSocket.on("connect", () => {
        console.log("Connected to server");
        setIsLoggedIn(true);
        setUsername(user);
        setConnectionError("");

        localStorage.setItem("discord_clone_token", token);
        localStorage.setItem("discord_clone_username", user);
        localStorage.setItem("discord_clone_url", url);
      });

      newSocket.on("connect_error", (err) => {
        console.error("Connection Error:", err);
        let errorMsg = "Connection failed.";
        if (
          err.message.includes("token") ||
          err.message.includes("Authentication")
        ) {
          errorMsg = "Session expired. Please login again.";
          localStorage.removeItem("discord_clone_token");
          setIsLoggedIn(false);
        }
        setConnectionError(errorMsg);
      });

      socketRef.current = newSocket;
    },
    [],
  );

  // Auto-login
  useEffect(() => {
    const savedToken = localStorage.getItem("discord_clone_token");
    const savedUsername = localStorage.getItem("discord_clone_username");
    const savedUrl = localStorage.getItem("discord_clone_url");

    if (savedToken && savedUsername && savedUrl) {
      handleConnect(savedUrl, savedToken, savedUsername);
    }
  }, [handleConnect]);

  // --- WebRTC Core Logic ---

  // Helper to add ICE candidate safely
  const addIceCandidate = async (
    pc: RTCPeerConnection,
    candidate: RTCIceCandidateInit,
  ) => {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error("Error adding ICE candidate", e);
    }
  };

  // Create or Get PeerConnection
  const getOrCreatePeerConnection = (userId: string) => {
    if (peerConnectionsRef.current.has(userId)) {
      return peerConnectionsRef.current.get(userId)!;
    }

    console.log(`Creating new PeerConnection for ${userId}`);
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit("candidate", {
          to: userId,
          candidate: event.candidate,
        });
      }
    };

    // Handle Remote Track
    pc.ontrack = (event) => {
      console.log(`Received remote track from ${userId}`, event.streams[0]);
      setRemoteStreams((prev) => {
        const newMap = new Map(prev);
        newMap.set(userId, event.streams[0]);
        return newMap;
      });
    };

    // Clean up on ICE failure
    pc.oniceconnectionstatechange = () => {
      if (
        pc.iceConnectionState === "failed" ||
        pc.iceConnectionState === "disconnected"
      ) {
        console.warn(
          `ICE connection state for ${userId}: ${pc.iceConnectionState}`,
        );
      }
    };

    peerConnectionsRef.current.set(userId, pc);
    return pc;
  };

  // --- Socket Event Handlers ---
  useEffect(() => {
    if (!isLoggedIn || !socketRef.current) return;
    const socket = socketRef.current;

    const handleReceiveMessage = (message: any) => {
      const msgObj =
        typeof message === "string" ? { content: message } : message;
      setMessages((prev) => [
        ...prev,
        {
          id: msgObj.id || Date.now().toString(),
          author: msgObj.author || "Unknown",
          content: msgObj.content || "Message",
          timestamp: msgObj.timestamp ? new Date(msgObj.timestamp) : new Date(),
        },
      ]);
    };

    const handleChatHistory = (history: any[]) => {
      const formatted = history.map((msg) => ({
        id: msg.id.toString(),
        author: msg.username,
        content: msg.content,
        timestamp: new Date(msg.timestamp),
      }));
      setMessages(formatted);
    };

    // --- Voice Events ---

    const handleExistingUsers = async (
      users: { id: string; username: string }[],
    ) => {
      console.log("Existing users in channel:", users);

      // 1. Update Username Map
      setRemoteUsernames((prev) => {
        const next = new Map(prev);
        users.forEach((u) => next.set(u.id, u.username));
        return next;
      });

      // 2. Initiate Connections (We are the Joiner)
      for (const user of users) {
        const pc = getOrCreatePeerConnection(user.id);

        // Add Local Tracks
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => {
            if (localStreamRef.current) {
              pc.addTrack(track, localStreamRef.current);
            }
          });
        }

        // Create Offer
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("offer", { to: user.id, sdp: offer });
        } catch (e) {
          console.error("Error creating offer:", e);
        }
      }
    };

    const handleUserJoinedVoice = (user: { id: string; username: string }) => {
      console.log("User joined:", user);
      setRemoteUsernames((prev) => {
        const next = new Map(prev);
        next.set(user.id, user.username);
        return next;
      });
      // Do NOTHING else. Wait for their Offer.
    };

    const handleOffer = async (data: {
      from: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      console.log("Received Offer from:", data.from);
      const pc = getOrCreatePeerConnection(data.from);

      // Add Local Tracks (Important! Otherwise they won't hear/see us)
      if (localStreamRef.current) {
        // Check if tracks are already added to avoid duplication?
        // RTCPeerConnection.addTrack throws if track already exists, but simple iteration is usually fine if PC is fresh.
        // Since we might reuse PC or create fresh, let's just try adding.
        const senders = pc.getSenders();
        localStreamRef.current.getTracks().forEach((track) => {
          const alreadyHas = senders.some((s) => s.track === track);
          if (!alreadyHas && localStreamRef.current) {
            pc.addTrack(track, localStreamRef.current);
          }
        });
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        // Process Queued Candidates
        const queue = iceCandidatesQueueRef.current.get(data.from) || [];
        for (const candidate of queue) {
          await addIceCandidate(pc, candidate);
        }
        iceCandidatesQueueRef.current.delete(data.from);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { to: data.from, sdp: answer });
      } catch (e) {
        console.error("Error handling offer:", e);
      }
    };

    const handleAnswer = async (data: {
      from: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      console.log("Received Answer from:", data.from);
      const pc = peerConnectionsRef.current.get(data.from);
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        // Process Queued Candidates
        const queue = iceCandidatesQueueRef.current.get(data.from) || [];
        for (const candidate of queue) {
          await addIceCandidate(pc, candidate);
        }
        iceCandidatesQueueRef.current.delete(data.from);
      } catch (e) {
        console.error("Error handling answer:", e);
      }
    };

    const handleCandidate = async (data: {
      from: string;
      candidate: RTCIceCandidateInit;
    }) => {
      const pc = peerConnectionsRef.current.get(data.from);
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        await addIceCandidate(pc, data.candidate);
      } else {
        // Queue it
        const currentQueue = iceCandidatesQueueRef.current.get(data.from) || [];
        currentQueue.push(data.candidate);
        iceCandidatesQueueRef.current.set(data.from, currentQueue);
      }
    };

    const handleUserLeft = (userId: string) => {
      console.log("User left:", userId);
      // Clean up PC
      if (peerConnectionsRef.current.has(userId)) {
        peerConnectionsRef.current.get(userId)?.close();
        peerConnectionsRef.current.delete(userId);
      }
      // Clean up State
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
      setRemoteUsernames((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
      iceCandidatesQueueRef.current.delete(userId);
    };

    socket.on("receive_message", handleReceiveMessage);
    socket.on("chat_history", handleChatHistory);
    socket.on("existing_users", handleExistingUsers);
    socket.on("user_joined_voice", handleUserJoinedVoice);
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("candidate", handleCandidate);
    socket.on("user_left", handleUserLeft);

    return () => {
      socket.off("receive_message", handleReceiveMessage);
      socket.off("chat_history", handleChatHistory);
      socket.off("existing_users", handleExistingUsers);
      socket.off("user_joined_voice", handleUserJoinedVoice);
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("candidate", handleCandidate);
      socket.off("user_left", handleUserLeft);
    };
  }, [isLoggedIn]); // Only re-run if login status changes

  // --- UI Interactions ---

  const joinTextChannel = (channelId: string) => {
    if (socketRef.current) {
      socketRef.current.emit("join_text_channel", channelId);
      setMessages([]);
    }
  };

  const startVoiceSession = async (
    withVideo = false,
    withScreen = false,
    specificDeviceId?: string,
  ) => {
    // 1. Get Local Media FIRST
    try {
      const deviceId = specificDeviceId || selectedInputDeviceId;
      let stream: MediaStream;

      if (withScreen) {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
      } else {
        const constraints = {
          video: withVideo,
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      }

      // 2. Setup Audio Processing (Volume)
      rawInputStreamRef.current = stream;
      let finalStream = stream;

      // If audio present, route through GainNode
      if (stream.getAudioTracks().length > 0) {
        const audioCtx = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = inputVolume / 100;
        gainNodeRef.current = gainNode;
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(gainNode);
        gainNode.connect(dest);

        // Mix processed audio + original video
        finalStream = new MediaStream([
          ...dest.stream.getAudioTracks(),
          ...stream.getVideoTracks(),
        ]);
      }

      // 3. Set State
      localStreamRef.current = finalStream;
      setActiveVideoTrack(finalStream);
      setIsVoiceConnected(true);
      if (withVideo) setIsVideoEnabled(true);
      if (withScreen) setIsScreenSharing(true);

      // 4. Finally Join Channel
      if (socketRef.current) {
        socketRef.current.emit("join_voice_channel", activeChannel.id);
      }
    } catch (e) {
      console.error("Failed to start voice session:", e);
      alert("Could not access camera/microphone. Check permissions.");
    }
  };

  const stopSession = useCallback(() => {
    // Stop Local Tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (rawInputStreamRef.current) {
      rawInputStreamRef.current.getTracks().forEach((t) => t.stop());
      rawInputStreamRef.current = null;
    }
    // Close Audio Context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Close Peers
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    setRemoteStreams(new Map());
    setRemoteUsernames(new Map());
    iceCandidatesQueueRef.current.clear();

    // Leave Server Channel
    if (socketRef.current) {
      socketRef.current.emit("leave_voice_channel");
    }

    setIsVoiceConnected(false);
    setIsVideoEnabled(false);
    setIsScreenSharing(false);
    setActiveVideoTrack(null);
  }, []);

  const handleInputDeviceChange = (deviceId: string) => {
    setSelectedInputDeviceId(deviceId);
    if (isVoiceConnected) {
      stopSession();
      // Allow cleanup
      setTimeout(
        () => startVoiceSession(isVideoEnabled, isScreenSharing, deviceId),
        500,
      );
    }
  };

  // Channel Selection
  useEffect(() => {
    if (isLoggedIn && activeChannel.type === ChannelType.TEXT) {
      joinTextChannel(activeChannel.id);
    }
  }, [activeChannel, isLoggedIn]);

  // Volume Effect
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = inputVolume / 100;
    }
  }, [inputVolume]);

  // Mute Effect
  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current
        .getAudioTracks()
        .forEach((t) => (t.enabled = !isMuted));
    }
  }, [isMuted]);

  // --- Render ---

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
          onOpenSettings={() => {
            // Trigger device enumeration only when opening settings
            (async () => {
              try {
                // Request permission just to list labels if needed, or assume we have it
                const devices = await navigator.mediaDevices.enumerateDevices();
                const inputs = devices.filter((d) => d.kind === "audioinput");
                setInputDevices(inputs);
                if (inputs.length > 0 && !selectedInputDeviceId) {
                  setSelectedInputDeviceId(inputs[0].deviceId);
                }
              } catch (e) {
                console.error(e);
              }
            })();
            setIsSettingsOpen(true);
          }}
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
            <ChatArea
              messages={messages}
              onSendMessage={(text) => {
                if (socketRef.current && text.trim()) {
                  // Optimistic update
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: Date.now().toString(),
                      author: username,
                      content: text,
                      timestamp: new Date(),
                    },
                  ]);
                  socketRef.current.emit("send_message", {
                    channelId: activeChannel.id,
                    message: text,
                  });
                }
              }}
            />
          ) : (
            <VoiceStage
              isConnected={isVoiceConnected}
              onConnect={() => startVoiceSession(false, false)}
              onDisconnect={stopSession}
              onToggleVideo={() => {
                if (isVideoEnabled) {
                  stopSession();
                  startVoiceSession(false, false);
                } else {
                  stopSession();
                  setTimeout(() => startVoiceSession(true, false), 500);
                }
              }}
              onToggleScreenShare={() => {
                if (isScreenSharing) {
                  stopSession();
                  startVoiceSession(false, false);
                } else {
                  stopSession();
                  setTimeout(() => startVoiceSession(false, true), 500);
                }
              }}
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

          {Array.from(remoteUsernames.entries()).map(([id, name]) => (
            <div
              key={id}
              className="flex items-center space-x-3 cursor-pointer p-1 rounded hover:bg-[#35373c] group"
            >
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs text-white">
                  {name.substring(0, 2).toUpperCase()}
                </div>
              </div>
              <span className="text-[#949ba4] group-hover:text-white font-medium truncate">
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;
