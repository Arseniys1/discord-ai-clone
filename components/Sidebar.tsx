import React from "react";
import { Server } from "../types";
import { Plus, Compass } from "lucide-react";

interface SidebarProps {
  servers: Server[];
  activeServerId: string;
  onSelectServer: (server: Server) => void;
  onAddServer: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  servers,
  activeServerId,
  onSelectServer,
  onAddServer,
}) => {
  return (
    <div className="flex flex-col items-center w-[72px] bg-[#1e1f22] py-3 space-y-2 shrink-0">
      <div className="group relative flex items-center justify-center w-full mb-1">
        <div className="absolute left-0 w-1 bg-white rounded-r-full transition-all duration-300 h-8 opacity-100"></div>
        <div className="w-12 h-12 rounded-[16px] bg-[#5865f2] flex items-center justify-center text-white cursor-pointer hover:rounded-[16px] transition-all duration-300">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/e/e3/Google_Gemini_logo.svg"
            className="w-8 h-8"
          />
        </div>
      </div>

      <div className="w-8 h-[2px] bg-[#35363c] mx-auto rounded-full mb-2"></div>

      {servers.map((server) => (
        <div
          key={server.id}
          className="group relative flex items-center justify-center w-full"
        >
          <div
            className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-300 ${activeServerId === server.id ? "h-8 opacity-100" : "h-2 opacity-0 group-hover:opacity-100 group-hover:h-5"}`}
          ></div>
          <div
            onClick={() => onSelectServer(server)}
            className={`w-12 h-12 overflow-hidden cursor-pointer transition-all duration-300 ${activeServerId === server.id ? "rounded-[16px]" : "rounded-[24px] group-hover:rounded-[16px]"}`}
          >
            <img
              src={server.icon}
              alt={server.name}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      ))}

      <div
        onClick={onAddServer}
        className="group relative flex items-center justify-center"
      >
        <div className="h-12 w-12 rounded-[24px] group-hover:rounded-[16px] transition-all duration-200 bg-[#313338] group-hover:bg-[#23a559] text-[#23a559] group-hover:text-white flex items-center justify-center cursor-pointer">
          <Plus size={24} />
        </div>
      </div>

      <div className="group relative flex items-center justify-center w-full">
        <div className="w-12 h-12 rounded-[24px] bg-[#313338] hover:bg-[#5865f2] hover:rounded-[16px] flex items-center justify-center text-[#23a559] hover:text-white cursor-pointer transition-all duration-300">
          <Compass size={24} />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
