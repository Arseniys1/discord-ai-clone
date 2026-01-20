import React, { useState, useEffect, useRef, useCallback } from "react";
import { SERVERS, ICONS } from "./constants";
import { Channel, ChannelType, Message, Server } from "./types";
import Sidebar from "./components/Sidebar";
import ChannelList from "./components/ChannelList";
import ChatArea from "./components/ChatArea";
import VoiceStage from "./components/VoiceStage";
import UserControlBar from "./components/UserControlBar";
import { Phone, Plus, Compass } from "lucide-react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = "http://localhost:3001";

const App: React.FC = () => {
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

  // Socket & WebRTC Refs
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  // Initialize Socket
  useEffect(() => {
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on("connect", () => {
      console.log("Connected to server");
    });

    socketRef.current.on("receive_message", (message: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          author: "User", // In a real app, send author info
          content: message,
          timestamp: new Date(),
        },
      ]);
    });

    // WebRTC Signaling Events
    socketRef.current.on("existing_users", (users: string[]) => {
      users.forEach((userId) => createPeerConnection(userId, true));
    });

    socketRef.current.on("user_left", (userId: string) => {
      if (peerConnectionsRef.current.has(userId)) {
        peerConnectionsRef.current.get(userId)?.close();
        peerConnectionsRef.current.delete(userId);
      }
      setRemoteStreams((prev) => {
        const newMap = new Map(prev);
        newMap.delete(userId);
        return newMap;
      });
    });

    socketRef.current.on(
      "offer",
      async (data: { from: string; sdp: RTCSessionDescriptionInit }) => {
        const pc = createPeerConnection(data.from, false);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current?.emit("answer", { to: data.from, sdp: answer });
      },
    );

    socketRef.current.on(
      "answer",
      async (data: { from: string; sdp: RTCSessionDescriptionInit }) => {
        const pc = peerConnectionsRef.current.get(data.from);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        }
      },
    );

    socketRef.current.on(
      "candidate",
      async (data: { from: string; candidate: RTCIceCandidateInit }) => {
        const pc = peerConnectionsRef.current.get(data.from);
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      },
    );

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // Join text channel on selection
  useEffect(() => {
    if (activeChannel.type === ChannelType.TEXT) {
      socketRef.current?.emit("join_text_channel", activeChannel.id);
      setMessages([]); // Clear messages when switching channels (optional)
    }
  }, [activeChannel]);

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

  const startVoiceSession = useCallback(
    async (withVideo = false, withScreen = false) => {
      try {
        let stream: MediaStream;
        if (withScreen) {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
        } else {
          stream = await navigator.mediaDevices.getUserMedia({
            video: withVideo,
            audio: true,
          });
        }

        localStreamRef.current = stream;
        setActiveVideoTrack(stream);

        // Add tracks to existing peer connections if we are reconnecting or upgrading
        peerConnectionsRef.current.forEach((pc) => {
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        });

        socketRef.current?.emit("join_voice_channel", activeChannel.id);
        setIsVoiceConnected(true);

        if (withVideo) setIsVideoEnabled(true);
        if (withScreen) setIsScreenSharing(true);
      } catch (err) {
        console.error("Failed to access media devices", err);
      }
    },
    [activeChannel],
  );

  const stopSession = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    setRemoteStreams(new Map());

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
      author: "You",
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
      // Logic could be improved to replace tracks instead of full restart
      stopSession();
      setTimeout(() => startVoiceSession(false, true), 500);
    }
  };

  const handleToggleVideo = () => {
    if (isVideoEnabled) {
      // Ideally just stop video track
      stopSession();
      startVoiceSession(false, false); // Audio only
    } else {
      stopSession();
      setTimeout(() => startVoiceSession(true, false), 500);
    }
  };

  // Mute/Deafen logic would involve toggling track.enabled
  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#313338] select-none">
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
              if (channel.type === ChannelType.VOICE && !isVoiceConnected) {
                // Optional: Auto-join could go here
              }
            }}
          />
        </div>

        <UserControlBar
          isMuted={isMuted}
          isDeafened={isDeafened}
          onMute={() => setIsMuted(!isMuted)}
          onDeafen={() => setIsDeafened(!isDeafened)}
          onOpenSettings={() => {}}
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
              You
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
                User {userId.substring(0, 5)}...
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;
