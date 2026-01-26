import React, { useState, useEffect, useRef, useCallback } from "react";
import { ICONS } from "./constants";
import { Channel, ChannelType, Message, Server } from "./types";
import ChannelList from "./components/ChannelList";
import ChatArea from "./components/ChatArea";
import VoiceStage from "./components/VoiceStage";
import UserControlBar from "./components/UserControlBar";
import SettingsModal from "./components/SettingsModal";
import LoginScreen from "./components/LoginScreen";
import { io, Socket } from "socket.io-client";

const App: React.FC = () => {
  // --- Global State ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [username, setUsername] = useState("You");
  const [displayName, setDisplayName] = useState("You");
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [userId, setUserId] = useState<number | undefined>(undefined);

  const [servers, setServers] = useState<Server[]>([]);
  const [activeServer, setActiveServer] = useState<Server | null>(null);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);

  // Chat State
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<
    { id: string; username: string; displayName?: string; userId?: number; avatar?: string }[]
  >([]);

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
  const [remoteAvatars, setRemoteAvatars] = useState<Map<string, string>>(
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
  const screenStreamRef = useRef<MediaStream | null>(null); // Screen share source stream
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // --- Auth & Socket Connection ---
  const handleConnect = useCallback(
    (
      url: string,
      token: string,
      user: string,
      userAvatar?: string,
      userPermissions?: string[],
      userUserId?: number,
      userDisplayName?: string,
    ) => {
      setConnectionError("");

      if (socketRef.current) {
        socketRef.current.disconnect();
      }

      const newSocket = io(url, {
        auth: { token },
        transports: ["websocket", "polling"],
      });

      const dn = userDisplayName || user;

      newSocket.on("connect", async () => {
        console.log("Connected to server");
        setIsLoggedIn(true);
        setUsername(user);
        setDisplayName(dn);
        setAvatar(userAvatar);
        setPermissions(userPermissions || []);
        setUserId(userUserId);
        setConnectionError("");

        localStorage.setItem("discord_clone_token", token);
        localStorage.setItem("discord_clone_username", user);
        localStorage.setItem("discord_clone_displayName", dn);
        if (userAvatar)
          localStorage.setItem("discord_clone_avatar", userAvatar);
        if (userPermissions)
          localStorage.setItem(
            "discord_clone_permissions",
            JSON.stringify(userPermissions),
          );
        if (userUserId)
          localStorage.setItem("discord_clone_userId", userUserId.toString());
        localStorage.setItem("discord_clone_url", url);

        // Load servers from API
        try {
          const serversRes = await fetch(`${url}/servers`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (serversRes.ok) {
            const serversData = await serversRes.json();
            // Transform server data to match Server type
            const transformedServers: Server[] = serversData.map((s: any) => ({
              id: s.id,
              name: s.name,
              icon: s.icon,
              channels: (s.channels || []).map((c: any) => ({
                id: c.id,
                name: c.name,
                type: c.type === "VOICE" ? ChannelType.VOICE : ChannelType.TEXT,
              })),
            }));
            // Используем только первый сервер
            if (transformedServers.length > 0) {
              const firstServer = transformedServers[0];
              setServers([firstServer]);
              setActiveServer(firstServer);
              if (firstServer.channels.length > 0) {
                setActiveChannel(firstServer.channels[0]);
              }
            }
          }
        } catch (e) {
          console.error("Failed to load servers:", e);
        }
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
    const savedDisplayName = localStorage.getItem("discord_clone_displayName");
    const savedUrl = localStorage.getItem("discord_clone_url");
    const savedAvatar = localStorage.getItem("discord_clone_avatar");
    const savedPermissionsStr = localStorage.getItem(
      "discord_clone_permissions",
    );
    const savedUserIdStr = localStorage.getItem("discord_clone_userId");

    if (savedToken && savedUsername && savedUrl) {
      let savedPermissions: string[] = [];
      try {
        if (savedPermissionsStr)
          savedPermissions = JSON.parse(savedPermissionsStr);
      } catch (e) {}
      
      const savedUserId = savedUserIdStr ? parseInt(savedUserIdStr) : undefined;

      handleConnect(
        savedUrl,
        savedToken,
        savedUsername,
        savedAvatar || undefined,
        savedPermissions,
        savedUserId,
        savedDisplayName || undefined,
      );
    }
  }, [handleConnect]);

  // Load servers when logged in (if not already loaded)
  useEffect(() => {
    if (isLoggedIn && servers.length === 0 && socketRef.current) {
      const loadServers = async () => {
        try {
          const savedUrl = localStorage.getItem("discord_clone_url");
          const token = localStorage.getItem("discord_clone_token");
          if (!savedUrl || !token) return;

          const serversRes = await fetch(`${savedUrl}/servers`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (serversRes.ok) {
            const serversData = await serversRes.json();
            const transformedServers: Server[] = serversData.map((s: any) => ({
              id: s.id,
              name: s.name,
              icon: s.icon,
              channels: (s.channels || []).map((c: any) => ({
                id: c.id,
                name: c.name,
                type: c.type === "VOICE" ? ChannelType.VOICE : ChannelType.TEXT,
              })),
            }));
            // Используем только первый сервер
            if (transformedServers.length > 0 && !activeServer) {
              const firstServer = transformedServers[0];
              setServers([firstServer]);
              setActiveServer(firstServer);
              if (firstServer.channels.length > 0) {
                setActiveChannel(firstServer.channels[0]);
              }
            }
          }
        } catch (e) {
          console.error("Failed to load servers:", e);
        }
      };
      loadServers();
    }
  }, [isLoggedIn, servers.length, activeServer]);

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
          avatar: msgObj.avatar,
          content: msgObj.content || "Message",
          timestamp: msgObj.timestamp ? new Date(msgObj.timestamp) : new Date(),
          dbId: msgObj.dbId,
        },
      ]);
    };

    const handleMessageDeleted = (data: { messageId: string | number }) => {
      setMessages((prev) => prev.filter((msg) => {
        const msgId = msg.dbId || msg.id;
        return msgId.toString() !== data.messageId.toString();
      }));
    };

    const handleError = (data: { message: string }) => {
      console.error("Socket error:", data.message);
      alert(data.message);
    };

    const handleChatHistory = (history: any[]) => {
      const formatted = history.map((msg) => ({
        id: msg.id.toString(),
        author: msg.display_name || msg.username,
        avatar: msg.avatar,
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        dbId: msg.id,
        userId: msg.user_id,
      }));
      setMessages(formatted);
    };

    const handleOnlineUsersList = (
      users: { id: string; username: string; displayName?: string; userId?: number; avatar?: string }[],
    ) => {
      setOnlineUsers(users);
    };

    // --- Voice Events ---

    const handleExistingUsers = async (
      users: { id: string; username: string; displayName?: string; avatar?: string }[],
    ) => {
      console.log("Existing users in channel:", users);

      setRemoteUsernames((prev) => {
        const next = new Map(prev);
        users.forEach((u) => next.set(u.id, u.displayName || u.username));
        return next;
      });

      setRemoteAvatars((prev) => {
        const next = new Map(prev);
        users.forEach((u) => {
          if (u.avatar) next.set(u.id, u.avatar);
        });
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

    const handleUserJoinedVoice = (user: {
      id: string;
      username: string;
      displayName?: string;
      avatar?: string;
    }) => {
      console.log("User joined:", user);
      setRemoteUsernames((prev) => {
        const next = new Map(prev);
        next.set(user.id, user.displayName || user.username);
        return next;
      });
      if (user.avatar) {
        setRemoteAvatars((prev) => {
          const next = new Map(prev);
          next.set(user.id, user.avatar!);
          return next;
        });
      }
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
      setRemoteAvatars((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
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
    socket.on("online_users_list", handleOnlineUsersList);
    socket.on("existing_users", handleExistingUsers);
    socket.on("user_joined_voice", handleUserJoinedVoice);
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("candidate", handleCandidate);
    socket.on("user_left", handleUserLeft);
    socket.on("message_deleted", handleMessageDeleted);
    socket.on("error", handleError);

    // Request initial state
    socket.emit("request_online_users");

    return () => {
      socket.off("receive_message", handleReceiveMessage);
      socket.off("chat_history", handleChatHistory);
      socket.off("online_users_list", handleOnlineUsersList);
      socket.off("existing_users", handleExistingUsers);
      socket.off("user_joined_voice", handleUserJoinedVoice);
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("candidate", handleCandidate);
      socket.off("user_left", handleUserLeft);
      socket.off("message_deleted", handleMessageDeleted);
      socket.off("error", handleError);
    };
  }, [isLoggedIn]); // Only re-run if login status changes

  // --- UI Interactions ---

  const joinTextChannel = (channelId: string) => {
    if (socketRef.current) {
      socketRef.current.emit("join_text_channel", channelId);
      setMessages([]);
    }
  };

  const stopSession = useCallback(() => {
    // Stop Final Stream Tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    // Stop Raw Mic Stream
    if (rawInputStreamRef.current) {
      rawInputStreamRef.current.getTracks().forEach((track) => track.stop());
      rawInputStreamRef.current = null;
    }
    // Stop Screen Stream
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    // Close Audio Context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
      gainNodeRef.current = null;
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

  const startVoiceSession = async (
    withVideo = false,
    withScreen = false,
    specificDeviceId?: string,
  ) => {
    try {
      const deviceId = specificDeviceId || selectedInputDeviceId;

      // 1. Capture Microphone (Always needed for voice chat)
      // We get this separate from display media to ensure we have mic audio
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false,
      });
      rawInputStreamRef.current = micStream;

      let displayStream: MediaStream | null = null;
      let cameraStream: MediaStream | null = null;

      if (withScreen) {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true, // Capture system audio
        });
        screenStreamRef.current = displayStream;

        // Handle user clicking "Stop Sharing" in browser UI
        displayStream.getVideoTracks()[0].onended = () => {
          stopSession();
        };
      }

      if (withVideo && !withScreen) {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false, // Mic already captured
        });
      }

      // 2. Audio Processing (Mix Mic + System Audio)
      const audioCtx = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
      audioContextRef.current = audioCtx;
      const dest = audioCtx.createMediaStreamDestination();

      // Mic Input
      const micSource = audioCtx.createMediaStreamSource(micStream);
      const micGain = audioCtx.createGain();
      micGain.gain.value = inputVolume / 100;
      gainNodeRef.current = micGain;
      micSource.connect(micGain);
      micGain.connect(dest);

      // System Audio Input (from Screen Share)
      if (displayStream && displayStream.getAudioTracks().length > 0) {
        const sysSource = audioCtx.createMediaStreamSource(displayStream);
        const sysGain = audioCtx.createGain();
        sysGain.gain.value = 1.0;
        sysSource.connect(sysGain);
        sysGain.connect(dest);
      }

      // 3. Assemble Final Stream
      const finalTracks: MediaStreamTrack[] = [];

      // Audio
      if (dest.stream.getAudioTracks().length > 0) {
        finalTracks.push(dest.stream.getAudioTracks()[0]);
      } else {
        // Fallback
        micStream.getAudioTracks().forEach((t) => finalTracks.push(t));
      }

      // Video
      if (displayStream) {
        displayStream.getVideoTracks().forEach((t) => finalTracks.push(t));
      } else if (cameraStream) {
        cameraStream.getVideoTracks().forEach((t) => finalTracks.push(t));
      }

      const finalStream = new MediaStream(finalTracks);
      localStreamRef.current = finalStream;
      setActiveVideoTrack(finalStream);

      // Update tracks in existing peer connections
      peerConnectionsRef.current.forEach((pc, userId) => {
        const senders = pc.getSenders();
        
        // Replace audio track
        const audioTrack = finalStream.getAudioTracks()[0];
        if (audioTrack) {
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
          if (audioSender) {
            audioSender.replaceTrack(audioTrack).catch(err => {
              console.error(`Error replacing audio track for ${userId}:`, err);
            });
          } else {
            pc.addTrack(audioTrack, finalStream);
          }
        }

        // Replace video track
        const videoTrack = finalStream.getVideoTracks()[0];
        if (videoTrack) {
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(videoTrack).catch(err => {
              console.error(`Error replacing video track for ${userId}:`, err);
            });
          } else {
            pc.addTrack(videoTrack, finalStream);
          }
        } else {
          // Remove video track if no video
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) {
            pc.removeTrack(videoSender);
          }
        }
      });

      setIsVoiceConnected(true);
      if (withVideo) setIsVideoEnabled(true);
      if (withScreen) setIsScreenSharing(true);

      // 4. Join Channel
      if (socketRef.current && activeChannel) {
        socketRef.current.emit("join_voice_channel", activeChannel.id);
      }
    } catch (e) {
      console.error("Failed to start voice session:", e);
      // Cleanup if failed
      if (rawInputStreamRef.current) {
        rawInputStreamRef.current.getTracks().forEach((t) => t.stop());
        rawInputStreamRef.current = null;
      }
      alert("Could not start session. Check permissions.");
    }
  };

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
    if (!isLoggedIn || !activeChannel) return;

    if (activeChannel.type === ChannelType.TEXT) {
      joinTextChannel(activeChannel.id);
      // If we were in a voice channel, leave it
      if (isVoiceConnected) {
        stopSession();
      }
    }
    // Note: Voice channel joining is handled by the user clicking "Join Voice" button
    // We don't auto-join voice channels when switching to them
  }, [activeChannel?.id, activeChannel?.type, isLoggedIn]); // Only depend on channel ID and type, not the whole object

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

  // Deafen Effect - Mute local mic when deafened
  useEffect(() => {
    if (isDeafened) {
      // Mute local mic when deafened
      if (localStreamRef.current) {
        localStreamRef.current
          .getAudioTracks()
          .forEach((t) => (t.enabled = false));
      }
    } else {
      // Restore local mic state based on mute
      if (localStreamRef.current) {
        localStreamRef.current
          .getAudioTracks()
          .forEach((t) => (t.enabled = !isMuted));
      }
    }
    // Note: Remote audio muting is handled in VoiceStage component via isDeafened prop
  }, [isDeafened, isMuted]);

  // --- Render ---

  if (!isLoggedIn) {
    return (
      <LoginScreen
        onConnect={handleConnect}
        connectionError={connectionError}
      />
    );
  }

  if (!activeServer || !activeChannel) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#313338] text-white">
        <div>Loading servers...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#2b2d31] select-none">
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        inputDevices={inputDevices}
        selectedInputDeviceId={selectedInputDeviceId}
        onSelectInputDevice={handleInputDeviceChange}
        inputVolume={inputVolume}
        onInputVolumeChange={setInputVolume}
        currentAvatar={avatar}
        onUpdateAvatar={async (url) => {
          if (!isLoggedIn) return;
          try {
            const savedUrl = localStorage.getItem("discord_clone_url");
            const token = localStorage.getItem("discord_clone_token");
            const res = await fetch(`${savedUrl}/users/avatar`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ avatar: url }),
            });
            if (res.ok) {
              const data = await res.json();
              const newAvatar = data.avatarUrl || url;
              setAvatar(newAvatar);
              localStorage.setItem("discord_clone_avatar", newAvatar);
            }
          } catch (e) {
            console.error("Failed to update avatar", e);
          }
        }}
        currentDisplayName={displayName}
        onUpdateDisplayName={async (name) => {
          if (!isLoggedIn) return;
          try {
            const savedUrl = localStorage.getItem("discord_clone_url");
            const token = localStorage.getItem("discord_clone_token");
            const res = await fetch(`${savedUrl}/users/display-name`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ displayName: name }),
            });
            if (res.ok) {
              const data = await res.json();
              const newName = data.displayName || name;
              setDisplayName(newName);
              localStorage.setItem("discord_clone_displayName", newName);
            }
          } catch (e) {
            console.error("Failed to update display name", e);
          }
        }}
        isAdmin={permissions.includes("admin")}
        permissions={permissions}
        activeServerId={activeServer?.id}
        activeChannelId={activeChannel?.id}
      />


      <div className="flex flex-col w-60 bg-[#2b2d31] border-r border-[#1f2023]">
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
          displayName={displayName}
          avatar={avatar}
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

      <div className="flex-1 flex flex-col min-w-0 bg-[#313338]">
        <header className="h-12 flex items-center px-4 shadow-sm border-b border-[#1f2023] z-10 bg-[#313338]">
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
        </header>

        <main className="flex-1 flex flex-col relative overflow-hidden">
          {activeChannel.type === ChannelType.TEXT ? (
            <ChatArea
              messages={messages}
              onSendMessage={(text) => {
                if (socketRef.current && text.trim() && activeChannel) {
                  // Optimistic update
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: Date.now().toString(),
                      author: displayName,
                      content: text,
                      timestamp: new Date(),
                      userId: userId,
                    },
                  ]);
                  socketRef.current.emit("send_message", {
                    channelId: activeChannel.id,
                    message: text,
                  });
                }
              }}
              onDeleteMessage={(messageId) => {
                if (socketRef.current && activeChannel) {
                  socketRef.current.emit("delete_message", {
                    messageId: messageId,
                    channelId: activeChannel.id,
                  });
                }
              }}
              currentUserId={userId}
              isAdmin={permissions.includes("admin")}
              permissions={permissions}
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
              isDeafened={isDeafened}
            />
          )}
        </main>
      </div>

      <div className="hidden lg:flex flex-col w-60 bg-[#2b2d31] p-4">
        <h3 className="text-xs font-bold text-[#949ba4] uppercase mb-4">
          {activeChannel.type === ChannelType.TEXT
            ? `Online — ${onlineUsers.length}`
            : `Members — ${remoteUsernames.size + 1}`}
        </h3>
        <div className="space-y-4">
          {activeChannel.type === ChannelType.TEXT ? (
            // Render Online Users
            onlineUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center space-x-3 cursor-pointer p-1 rounded hover:bg-[#35373c] group"
              >
                <div className="relative">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs text-white">
                      {(user.displayName || user.username).substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#2b2d31] rounded-full"></div>
                </div>
                <span className="text-[#949ba4] group-hover:text-white font-medium truncate">
                  {user.displayName || user.username} {user.userId === userId ? "(You)" : ""}
                </span>
              </div>
            ))
          ) : (
            // Render Voice Participants
            <>
              <div className="flex items-center space-x-3 cursor-pointer p-1 rounded hover:bg-[#35373c] group">
                <div className="relative">
                  {avatar ? (
                    <img
                      src={avatar}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <img
                      src="https://picsum.photos/id/64/40/40"
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#2b2d31] rounded-full"></div>
                </div>
                <span className="text-[#949ba4] group-hover:text-white font-medium">
                  {displayName} (You)
                </span>
              </div>

              {Array.from(remoteUsernames.entries()).map(([id, name]) => (
                <div
                  key={id}
                  className="flex items-center space-x-3 cursor-pointer p-1 rounded hover:bg-[#35373c] group"
                >
                  <div className="relative">
                    {remoteAvatars.get(id) ? (
                      <img
                        src={remoteAvatars.get(id)}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs text-white">
                        {name.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="text-[#949ba4] group-hover:text-white font-medium truncate">
                    {name}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
