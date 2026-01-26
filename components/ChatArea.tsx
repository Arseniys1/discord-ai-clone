import React, { useRef, useEffect, useState } from "react";
import { Message } from "../types";
import { PlusCircle, Gift, Sticker, Smile, Trash2, MoreVertical } from "lucide-react";

interface ChatAreaProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  onDeleteMessage?: (messageId: string | number) => void;
  currentUserId?: number;
  isAdmin?: boolean;
  permissions?: string[];
}

const ChatArea: React.FC<ChatAreaProps> = ({ 
  messages, 
  onSendMessage, 
  onDeleteMessage,
  currentUserId,
  isAdmin,
  permissions 
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputRef.current?.value) {
      onSendMessage(inputRef.current.value);
      inputRef.current.value = "";
    }
  };

  const canDeleteMessage = (msg: Message) => {
    if (!onDeleteMessage) return false;
    const hasAdminPerms = isAdmin || (permissions && permissions.includes("admin"));
    const hasModeratorPerms = permissions && (
      permissions.includes("manage_users") || 
      permissions.includes("delete_messages")
    );
    const isAuthor = msg.userId === currentUserId;
    return hasAdminPerms || hasModeratorPerms || isAuthor;
  };

  return (
    <div className="flex-1 flex flex-col bg-[#313338] overflow-hidden">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="flex space-x-4 hover:bg-[#2e3035] -mx-4 px-4 py-1 group relative"
            onMouseEnter={() => setHoveredMessageId(msg.id)}
            onMouseLeave={() => setHoveredMessageId(null)}
          >
            <img
              src={
                msg.isAI
                  ? "https://picsum.photos/id/102/40/40"
                  : msg.avatar || "https://picsum.photos/id/64/40/40"
              }
              className="w-10 h-10 rounded-full mt-1 shrink-0 object-cover"
            />
            <div className="flex-1">
              <div className="flex items-baseline space-x-2">
                <span
                  className={`font-semibold cursor-pointer hover:underline ${msg.isAI ? "text-blue-400" : "text-white"}`}
                >
                  {msg.author}
                  {msg.isAI && (
                    <span className="ml-1 px-1 bg-[#5865f2] text-[10px] text-white rounded">
                      BOT
                    </span>
                  )}
                </span>
                <span className="text-xs text-[#949ba4]">
                  {msg.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-[#dbdee1] leading-relaxed break-words">
                {msg.content}
              </p>
            </div>
            {canDeleteMessage(msg) && hoveredMessageId === msg.id && (
              <button
                onClick={() => {
                  const messageId = msg.dbId || msg.id;
                  if (onDeleteMessage) {
                    onDeleteMessage(messageId);
                  }
                }}
                className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-[#1e1f22] text-[#b5bac1] hover:text-red-400"
                title="Delete message"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="px-4 pb-6">
        <form
          onSubmit={handleSubmit}
          className="relative flex items-center bg-[#383a40] rounded-lg px-4 py-2.5"
        >
          <button
            type="button"
            className="text-[#b5bac1] hover:text-[#dbdee1] mr-4"
          >
            <PlusCircle size={24} />
          </button>
          <input
            ref={inputRef}
            type="text"
            placeholder="Message #general"
            className="flex-1 bg-transparent text-[#dbdee1] focus:outline-none placeholder-[#949ba4]"
          />
          <div className="flex items-center space-x-3 ml-4 text-[#b5bac1]">
            <Gift size={24} className="hover:text-[#dbdee1] cursor-pointer" />
            <Sticker
              size={24}
              className="hover:text-[#dbdee1] cursor-pointer"
            />
            <Smile size={24} className="hover:text-[#dbdee1] cursor-pointer" />
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatArea;
