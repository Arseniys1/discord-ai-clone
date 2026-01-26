import React, { useEffect, useRef, useState } from "react";
import {
  Mic,
  Video,
  Monitor,
  PhoneOff,
  User,
  MoreHorizontal,
  MessageSquare,
  Volume2,
  VolumeX,
  Maximize,
} from "lucide-react";

interface VoiceStageProps {
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  videoTrack: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  remoteUsernames: Map<string, string>;
  isDeafened?: boolean;
}

const VideoTile: React.FC<{
  stream: MediaStream | null;
  label: string;
  isLocal?: boolean;
  forceShowVideo?: boolean;
  isDeafened?: boolean;
}> = ({ stream, label, isLocal = false, forceShowVideo = false, isDeafened = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useState(100);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (mediaRef.current && stream) {
      mediaRef.current.srcObject = stream;
      // Ensure playback for both video and audio
      if (mediaRef.current instanceof HTMLVideoElement) {
        mediaRef.current.play().catch(err => {
          console.error("Error playing video:", err);
        });
      } else if (mediaRef.current instanceof HTMLAudioElement) {
        mediaRef.current.play().catch(err => {
          console.error("Error playing audio:", err);
        });
      }
    } else if (mediaRef.current && !stream) {
      mediaRef.current.srcObject = null;
    }
  }, [stream]);

  // Handle volume change
  useEffect(() => {
    if (mediaRef.current && !isLocal) {
      mediaRef.current.volume = isDeafened ? 0 : volume / 100;
    }
    if (audioRef.current && !isLocal) {
      audioRef.current.volume = isDeafened ? 0 : volume / 100;
    }
  }, [volume, isLocal, isDeafened]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error(
          `Error attempting to enable fullscreen mode: ${err.message} (${err.name})`,
        );
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Determine if we should show the video element or the placeholder
  const showVideo =
    (stream && stream.getVideoTracks().length > 0) || forceShowVideo;

  return (
    <div
      ref={containerRef}
      className="relative bg-[#2b2d31] rounded-xl overflow-hidden aspect-video group shadow-md border border-[#1f2023]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {showVideo ? (
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          autoPlay
          playsInline
          muted={isLocal} // Local user should be muted to avoid feedback
          className="w-full h-full object-cover bg-black"
          onLoadedMetadata={() => {
            // Ensure video plays when metadata is loaded
            if (mediaRef.current instanceof HTMLVideoElement) {
              mediaRef.current.play().catch(err => {
                console.error("Error playing video after metadata loaded:", err);
              });
            }
          }}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center space-y-4 bg-[#2b2d31]">
          <div className="w-24 h-24 bg-[#5865f2] rounded-full flex items-center justify-center text-white">
            <User size={64} />
          </div>
          <span className="text-white font-semibold">{label}</span>
          {/* If there is an audio stream but no video, we need an audio element to play sound */}
          {stream && stream.getAudioTracks().length > 0 && (
            <audio
              ref={(el) => {
                audioRef.current = el;
                if (el) {
                  el.srcObject = stream;
                  el.play().catch(err => {
                    console.error("Error playing audio:", err);
                  });
                }
              }}
              autoPlay
              playsInline
              muted={isLocal}
              className="hidden"
            />
          )}
        </div>
      )}

      {/* Label */}
      <div className="absolute bottom-4 left-4 flex items-center bg-black/50 px-2 py-1 rounded text-white text-xs font-semibold z-10 backdrop-blur-sm">
        {label}
      </div>

      {/* Controls Overlay */}
      <div
        className={`absolute top-4 right-4 flex space-x-2 transition-opacity duration-200 ${isHovered ? "opacity-100" : "opacity-0"}`}
      >
        <button
          onClick={toggleFullscreen}
          className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white backdrop-blur-md transition-colors"
          title="Fullscreen"
        >
          <Maximize size={16} />
        </button>
      </div>

      {/* Remote Volume Control Overlay */}
      {!isLocal && (
        <div
          className={`absolute bottom-4 right-4 flex items-center bg-black/60 p-2 rounded-lg backdrop-blur-md transition-opacity duration-200 ${isHovered ? "opacity-100" : "opacity-0"}`}
        >
          <div className="mr-2 text-gray-300">
            {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => setVolume(parseInt(e.target.value))}
            className="w-24 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-[#5865f2]"
          />
        </div>
      )}
    </div>
  );
};

const VoiceStage: React.FC<VoiceStageProps> = ({
  isConnected,
  onConnect,
  onDisconnect,
  onToggleVideo,
  onToggleScreenShare,
  isVideoEnabled,
  isScreenSharing,
  videoTrack,
  remoteStreams,
  remoteUsernames,
  isDeafened = false,
}) => {
  if (!isConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#1e1f22]">
        <div className="bg-[#313338] p-8 rounded-xl shadow-2xl text-center space-y-6 max-w-sm border border-[#1f2023]">
          <div className="w-20 h-20 bg-[#5865f2] rounded-full flex items-center justify-center mx-auto text-white shadow-lg">
            <User size={48} />
          </div>
          <h2 className="text-2xl font-bold text-white">Ready to join?</h2>
          <p className="text-[#949ba4]">
            Connect to the voice channel to start talking, sharing your camera,
            or showing your screen.
          </p>
          <button
            onClick={onConnect}
            className="w-full bg-[#23a559] hover:bg-[#1a7f45] text-white font-bold py-3 px-6 rounded transition-colors shadow-sm"
          >
            Join Voice
          </button>
        </div>
      </div>
    );
  }

  const remoteStreamEntries = Array.from(remoteStreams.entries());

  return (
    <div className="flex-1 bg-black flex flex-col relative group overflow-hidden">
      {/* Video Grid */}
      <div
        className={`flex-1 p-4 grid gap-4 overflow-y-auto ${
          remoteStreamEntries.length === 0
            ? "grid-cols-1 max-w-4xl mx-auto w-full content-center"
            : remoteStreamEntries.length === 1
              ? "grid-cols-1 md:grid-cols-2 content-center"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        }`}
      >
        {/* User Local Stream */}
        <VideoTile
          stream={videoTrack}
          label={isScreenSharing ? "You (Screen)" : "You"}
          isLocal={true}
          forceShowVideo={isVideoEnabled || isScreenSharing}
        />

        {/* Remote Streams */}
        {remoteStreamEntries.map(([id, stream]) => (
          <VideoTile
            key={id}
            stream={stream}
            label={remoteUsernames.get(id) || `User ${id.substring(0, 5)}...`}
            isDeafened={isDeafened}
          />
        ))}
      </div>

      {/* Floating Controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center space-x-4 bg-[#111214] p-3 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity shadow-2xl border border-[#1f2023] z-50">
        <button
          onClick={onToggleVideo}
          className={`p-4 rounded-xl transition-all duration-200 ${isVideoEnabled ? "bg-white text-black hover:bg-gray-200" : "bg-[#313338] text-white hover:bg-[#3f4147]"}`}
          title="Toggle Video"
        >
          <Video size={24} />
        </button>
        <button
          onClick={onToggleScreenShare}
          className={`p-4 rounded-xl transition-all duration-200 ${isScreenSharing ? "bg-white text-black hover:bg-gray-200" : "bg-[#313338] text-white hover:bg-[#3f4147]"}`}
          title="Share Screen"
        >
          <Monitor size={24} />
        </button>
        <button className="p-4 bg-[#313338] text-white rounded-xl hover:bg-[#3f4147] transition-all duration-200">
          <Mic size={24} />
        </button>
        <button className="p-4 bg-[#313338] text-white rounded-xl hover:bg-[#3f4147] transition-all duration-200">
          <MoreHorizontal size={24} />
        </button>
        <button
          onClick={onDisconnect}
          className="p-4 bg-[#da373c] hover:bg-[#a1282c] text-white rounded-xl transition-all duration-200"
          title="Disconnect"
        >
          <PhoneOff size={24} />
        </button>
      </div>

      {/* Sidebar Overlay Action Buttons */}
      <div className="absolute top-4 right-4 flex space-x-2 z-10">
        <div className="p-2 bg-black/40 hover:bg-black/60 rounded cursor-pointer text-[#b5bac1] hover:text-white backdrop-blur-md">
          <User size={20} />
        </div>
        <div className="p-2 bg-black/40 hover:bg-black/60 rounded cursor-pointer text-[#b5bac1] hover:text-white backdrop-blur-md">
          <MessageSquare size={20} />
        </div>
      </div>
    </div>
  );
};

export default VoiceStage;
