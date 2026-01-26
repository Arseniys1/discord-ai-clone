import React, { useState, useEffect, useRef } from "react";
import { X, Mic, Volume2, Save, Ban, VolumeX, UserX } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputDevices: MediaDeviceInfo[];
  selectedInputDeviceId: string;
  onSelectInputDevice: (deviceId: string) => void;
  inputVolume: number; // 0 to 200 (percent)
  onInputVolumeChange: (volume: number) => void;
  currentAvatar?: string;
  onUpdateAvatar: (url: string) => void;
  isAdmin?: boolean;
  permissions?: string[];
  activeServerId?: string;
  activeChannelId?: string;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  inputDevices,
  selectedInputDeviceId,
  onSelectInputDevice,
  inputVolume,
  onInputVolumeChange,
  currentAvatar,
  onUpdateAvatar,
  isAdmin,
  permissions = [],
  activeServerId,
  activeChannelId,
}) => {
  // Check if user can moderate (admin or moderator)
  const canModerate = isAdmin || 
    permissions.includes("admin") || 
    permissions.includes("manage_users") || 
    permissions.includes("delete_messages");
  const [activeTab, setActiveTab] = useState<"voice" | "profile" | "members">(
    "voice",
  );
  const [avatarUrl, setAvatarUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [serverMembers, setServerMembers] = useState<any[]>([]);
  const [bannedUsers, setBannedUsers] = useState<any[]>([]);
  const [mutedUsers, setMutedUsers] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && activeTab === "members") {
      const fetchData = async () => {
        try {
          const token = localStorage.getItem("discord_clone_token");
          const savedUrl = localStorage.getItem("discord_clone_url");

          if (isAdmin) {
            // Fetch global users and roles for global admin
            const [usersRes, rolesRes] = await Promise.all([
              fetch(`${savedUrl}/admin/users`, {
                headers: { Authorization: `Bearer ${token}` },
              }),
              fetch(`${savedUrl}/admin/roles`, {
                headers: { Authorization: `Bearer ${token}` },
              }),
            ]);

            if (usersRes.ok && rolesRes.ok) {
              setUsers(await usersRes.json());
              setRoles(await rolesRes.json());
            }
          }

          // Fetch server-specific data if server is selected
          if (activeServerId) {
            const [membersRes, bannedRes, mutedRes] = await Promise.all([
              fetch(`${savedUrl}/servers/${activeServerId}/members`, {
                headers: { Authorization: `Bearer ${token}` },
              }).catch(() => ({ ok: false })),
              fetch(`${savedUrl}/servers/${activeServerId}/banned`, {
                headers: { Authorization: `Bearer ${token}` },
              }).catch(() => ({ ok: false })),
              fetch(`${savedUrl}/servers/${activeServerId}/muted${activeChannelId ? `?channelId=${activeChannelId}` : ''}`, {
                headers: { Authorization: `Bearer ${token}` },
              }).catch(() => ({ ok: false })),
            ]);

            if (membersRes.ok) {
              setServerMembers(await membersRes.json());
            }
            if (bannedRes.ok) {
              setBannedUsers(await bannedRes.json());
            }
            if (mutedRes.ok) {
              setMutedUsers(await mutedRes.json());
            }
          }
        } catch (e) {
          console.error(e);
        }
      };
      fetchData();
    }
  }, [isOpen, activeTab, isAdmin, activeServerId, activeChannelId]);

  const handleRoleUpdate = async (userId: string, roleId: number) => {
    try {
      const token = localStorage.getItem("discord_clone_token");
      const savedUrl = localStorage.getItem("discord_clone_url");
      await fetch(`${savedUrl}/admin/user-role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, roleId }),
      });
      // Refresh list
      const usersRes = await fetch(`${savedUrl}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (usersRes.ok) setUsers(await usersRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleBanUser = async (userId: number, reason?: string) => {
    if (!activeServerId) return;
    try {
      const token = localStorage.getItem("discord_clone_token");
      const savedUrl = localStorage.getItem("discord_clone_url");
      const res = await fetch(`${savedUrl}/servers/${activeServerId}/ban`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, reason }),
      });
      if (res.ok) {
        // Refresh lists
        const [membersRes, bannedRes] = await Promise.all([
          fetch(`${savedUrl}/servers/${activeServerId}/members`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${savedUrl}/servers/${activeServerId}/banned`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (membersRes.ok) setServerMembers(await membersRes.json());
        if (bannedRes.ok) setBannedUsers(await bannedRes.json());
      } else {
        const error = await res.json();
        alert(error.error || "Failed to ban user");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to ban user");
    }
  };

  const handleUnbanUser = async (userId: number) => {
    if (!activeServerId) return;
    try {
      const token = localStorage.getItem("discord_clone_token");
      const savedUrl = localStorage.getItem("discord_clone_url");
      const res = await fetch(`${savedUrl}/servers/${activeServerId}/unban`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        // Refresh banned list
        const bannedRes = await fetch(`${savedUrl}/servers/${activeServerId}/banned`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (bannedRes.ok) setBannedUsers(await bannedRes.json());
      } else {
        const error = await res.json();
        alert(error.error || "Failed to unban user");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to unban user");
    }
  };

  const handleMuteUser = async (userId: number, durationMinutes?: number, reason?: string) => {
    if (!activeServerId) return;
    try {
      const token = localStorage.getItem("discord_clone_token");
      const savedUrl = localStorage.getItem("discord_clone_url");
      const res = await fetch(`${savedUrl}/servers/${activeServerId}/mute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          userId, 
          channelId: activeChannelId || null,
          durationMinutes,
          reason 
        }),
      });
      if (res.ok) {
        // Refresh muted list
        const mutedRes = await fetch(`${savedUrl}/servers/${activeServerId}/muted${activeChannelId ? `?channelId=${activeChannelId}` : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (mutedRes.ok) setMutedUsers(await mutedRes.json());
      } else {
        const error = await res.json();
        alert(error.error || "Failed to mute user");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to mute user");
    }
  };

  const handleUnmuteUser = async (userId: number) => {
    if (!activeServerId) return;
    try {
      const token = localStorage.getItem("discord_clone_token");
      const savedUrl = localStorage.getItem("discord_clone_url");
      const res = await fetch(`${savedUrl}/servers/${activeServerId}/unmute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, channelId: activeChannelId || null }),
      });
      if (res.ok) {
        // Refresh muted list
        const mutedRes = await fetch(`${savedUrl}/servers/${activeServerId}/muted${activeChannelId ? `?channelId=${activeChannelId}` : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (mutedRes.ok) setMutedUsers(await mutedRes.json());
      } else {
        const error = await res.json();
        alert(error.error || "Failed to unmute user");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to unmute user");
    }
  };

  useEffect(() => {
    if (isOpen && currentAvatar) {
      setAvatarUrl(currentAvatar);
    }
  }, [isOpen, currentAvatar]);

  if (!isOpen) return null;

  const handleSaveAvatar = () => {
    onUpdateAvatar(avatarUrl);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-in fade-in duration-200">
      <div className="bg-[#313338] w-[800px] h-[600px] rounded-lg shadow-2xl flex overflow-hidden scale-100">
        {/* Sidebar */}
        <div className="w-[230px] bg-[#2b2d31] flex flex-col items-end py-14 pr-4 border-r border-[#1e1f22]">
          <div className="w-full pl-4 mb-2">
            <div className="text-xs font-bold text-[#949ba4] uppercase mb-1.5 px-2.5">
              User Settings
            </div>
            <div
              className={`px-2.5 py-1.5 rounded cursor-pointer text-base font-medium mb-0.5 ${activeTab === "voice" ? "bg-[#404249] text-white" : "text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1]"}`}
              onClick={() => setActiveTab("voice")}
            >
              Voice & Video
            </div>
            <div
              className={`px-2.5 py-1.5 rounded cursor-pointer text-base font-medium ${activeTab === "profile" ? "bg-[#404249] text-white" : "text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1]"}`}
              onClick={() => setActiveTab("profile")}
            >
              Profile
            </div>
            {isAdmin && (
              <div
                className={`px-2.5 py-1.5 rounded cursor-pointer text-base font-medium ${activeTab === "members" ? "bg-[#404249] text-white" : "text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1]"}`}
                onClick={() => setActiveTab("members")}
              >
                Members
              </div>
            )}
            <div className="text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1] px-2.5 py-1.5 rounded cursor-pointer text-base font-medium">
              Appearance
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col relative bg-[#313338]">
          <div className="p-10 pb-20 overflow-y-auto h-full scrollbar-hide">
            {activeTab === "voice" && (
              <>
                <h2 className="text-xl font-bold text-white mb-6">
                  Voice Settings
                </h2>

                {/* Input Device Selection */}
                <div className="mb-8 border-b border-[#3f4147] pb-8">
                  <label className="block text-xs font-bold text-[#b5bac1] uppercase mb-2">
                    Input Device
                  </label>
                  <div className="relative">
                    <select
                      value={selectedInputDeviceId}
                      onChange={(e) => onSelectInputDevice(e.target.value)}
                      className="w-full bg-[#1e1f22] text-white p-2.5 rounded hover:bg-[#1e1f22] focus:bg-[#1e1f22] border border-transparent outline-none appearance-none cursor-pointer text-base font-medium shadow-sm transition-colors"
                    >
                      {inputDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label ||
                            `Microphone ${device.deviceId.slice(0, 5)}...`}
                        </option>
                      ))}
                    </select>
                    <Mic
                      className="absolute right-3 top-3 text-[#b5bac1] pointer-events-none"
                      size={18}
                    />
                  </div>
                </div>

                {/* Input Volume Slider */}
                <div className="mb-6">
                  <label className="block text-xs font-bold text-[#b5bac1] uppercase mb-2">
                    Input Volume
                  </label>
                  <div className="flex items-center space-x-4">
                    <Volume2 size={24} className="text-[#b5bac1]" />
                    <div className="flex-1 relative h-2 bg-[#4e5058] rounded-full group cursor-pointer">
                      <input
                        type="range"
                        min="0"
                        max="200"
                        value={inputVolume}
                        onChange={(e) =>
                          onInputVolumeChange(parseInt(e.target.value))
                        }
                        className="absolute w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div
                        className="absolute top-0 left-0 h-full bg-[#5865f2] rounded-full pointer-events-none"
                        style={{ width: `${Math.min(inputVolume / 2, 100)}%` }}
                      ></div>
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md pointer-events-none transition-transform group-hover:scale-125"
                        style={{ left: `${Math.min(inputVolume / 2, 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-white text-sm w-12 text-right font-mono">
                      {inputVolume}%
                    </span>
                  </div>
                </div>
              </>
            )}

            {activeTab === "profile" && (
              <>
                <h2 className="text-xl font-bold text-white mb-6">
                  User Profile
                </h2>

                <div className="mb-8">
                  <div className="flex items-start space-x-6">
                    <div
                      className="relative group cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="w-24 h-24 rounded-full overflow-hidden bg-[#1e1f22] border-4 border-[#1e1f22]">
                        <img
                          src={
                            avatarUrl || "https://picsum.photos/id/64/128/128"
                          }
                          alt="Avatar"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "https://picsum.photos/id/64/128/128";
                          }}
                        />
                      </div>
                      <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-white text-xs font-bold">
                          UPLOAD
                        </span>
                      </div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept="image/*"
                      />
                    </div>

                    <div className="flex-1">
                      <h3 className="text-white font-semibold mb-2">
                        Profile Image
                      </h3>
                      <p className="text-[#b5bac1] text-sm mb-4">
                        Click on the avatar to upload a new image.
                      </p>

                      <button
                        onClick={handleSaveAvatar}
                        className="bg-[#5865f2] hover:bg-[#4752c4] text-white px-4 py-2 rounded text-sm font-medium transition-colors flex items-center"
                      >
                        <Save size={16} className="mr-2" />
                        Save Changes
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "members" && (
              <>
                <h2 className="text-xl font-bold text-white mb-6">
                  {activeServerId ? "Server Members" : "Manage Members"}
                </h2>

                {activeServerId && (
                  <>
                    {/* Server Members */}
                    <div className="mb-6">
                      <h3 className="text-sm font-bold text-[#b5bac1] uppercase mb-3">
                        Members
                      </h3>
                      <div className="space-y-2">
                        {serverMembers.length === 0 ? (
                          <p className="text-[#949ba4] text-sm">No members found</p>
                        ) : (
                          serverMembers.map((member) => (
                            <div
                              key={member.id}
                              className="flex items-center justify-between p-3 bg-[#2b2d31] rounded-md"
                            >
                              <div className="flex items-center space-x-3">
                                {member.avatar ? (
                                  <img
                                    src={member.avatar}
                                    className="w-8 h-8 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-white font-bold text-sm">
                                    {member.username.substring(0, 2).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <div className="text-white font-medium">
                                    {member.username}
                                  </div>
                                  <div className="text-[#949ba4] text-xs capitalize">
                                    {member.role || "User"}
                                  </div>
                                </div>
                              </div>

                              {canModerate && (
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => {
                                      const duration = prompt("Mute duration in minutes (leave empty for permanent):");
                                      const reason = prompt("Reason (optional):");
                                      handleMuteUser(
                                        member.id,
                                        duration ? parseInt(duration) : undefined,
                                        reason || undefined
                                      );
                                    }}
                                    className="px-2 py-1 text-xs rounded border border-[#4e5058] text-[#b5bac1] hover:border-[#b5bac1] hover:text-white transition-colors flex items-center space-x-1"
                                    title="Mute user"
                                  >
                                    <VolumeX size={14} />
                                    <span>Mute</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      const reason = prompt("Ban reason (optional):");
                                      if (confirm(`Ban ${member.username}?`)) {
                                        handleBanUser(member.id, reason || undefined);
                                      }
                                    }}
                                    className="px-2 py-1 text-xs rounded border border-red-500/50 text-red-400 hover:border-red-500 hover:bg-red-500/10 transition-colors flex items-center space-x-1"
                                    title="Ban user"
                                  >
                                    <Ban size={14} />
                                    <span>Ban</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Muted Users */}
                    {mutedUsers.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-sm font-bold text-[#b5bac1] uppercase mb-3">
                          Muted Users
                        </h3>
                        <div className="space-y-2">
                          {mutedUsers.map((muted) => (
                            <div
                              key={muted.id}
                              className="flex items-center justify-between p-3 bg-[#2b2d31] rounded-md"
                            >
                              <div className="flex items-center space-x-3">
                                {muted.avatar ? (
                                  <img
                                    src={muted.avatar}
                                    className="w-8 h-8 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-white font-bold text-sm">
                                    {muted.username.substring(0, 2).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <div className="text-white font-medium">
                                    {muted.username}
                                  </div>
                                  <div className="text-[#949ba4] text-xs">
                                    {muted.muted_until ? `Until: ${new Date(muted.muted_until).toLocaleString()}` : "Permanent"}
                                  </div>
                                </div>
                              </div>

                              {canModerate && (
                                <button
                                  onClick={() => handleUnmuteUser(muted.user_id)}
                                  className="px-2 py-1 text-xs rounded border border-[#4e5058] text-[#b5bac1] hover:border-[#b5bac1] hover:text-white transition-colors"
                                >
                                  Unmute
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Banned Users */}
                    {bannedUsers.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-sm font-bold text-[#b5bac1] uppercase mb-3">
                          Banned Users
                        </h3>
                        <div className="space-y-2">
                          {bannedUsers.map((banned) => (
                            <div
                              key={banned.id}
                              className="flex items-center justify-between p-3 bg-[#2b2d31] rounded-md"
                            >
                              <div className="flex items-center space-x-3">
                                {banned.avatar ? (
                                  <img
                                    src={banned.avatar}
                                    className="w-8 h-8 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-white font-bold text-sm">
                                    {banned.username.substring(0, 2).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <div className="text-white font-medium">
                                    {banned.username}
                                  </div>
                                  {banned.reason && (
                                    <div className="text-[#949ba4] text-xs">
                                      Reason: {banned.reason}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {canModerate && (
                                <button
                                  onClick={() => {
                                    if (confirm(`Unban ${banned.username}?`)) {
                                      handleUnbanUser(banned.user_id);
                                    }
                                  }}
                                  className="px-2 py-1 text-xs rounded border border-[#4e5058] text-[#b5bac1] hover:border-[#b5bac1] hover:text-white transition-colors"
                                >
                                  Unban
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Global Admin: All Users */}
                {!activeServerId && isAdmin && (
                  <div className="space-y-2">
                    {users.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-3 bg-[#2b2d31] rounded-md"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-white font-bold text-sm">
                            {user.username.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-white font-medium">
                              {user.username}
                            </div>
                            <div className="text-[#949ba4] text-xs capitalize">
                              {user.role || "User"}
                            </div>
                          </div>
                        </div>

                        <div className="flex space-x-2">
                          {roles.map((role) => (
                            <button
                              key={role.id}
                              onClick={() => handleRoleUpdate(user.id, role.id)}
                              className={`px-2 py-1 text-xs rounded border transition-colors ${
                                user.role === role.name
                                  ? "bg-[#5865f2] border-[#5865f2] text-white"
                                  : "border-[#4e5058] text-[#b5bac1] hover:border-[#b5bac1] hover:text-white"
                              }`}
                            >
                              {role.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!activeServerId && !isAdmin && (
                  <p className="text-[#949ba4] text-sm">
                    Select a server to manage its members
                  </p>
                )}
              </>
            )}
          </div>

          {/* Close Button */}
          <div className="absolute top-4 right-4 flex flex-col items-center z-10">
            <button
              onClick={onClose}
              className="flex flex-col items-center text-[#b5bac1] hover:text-white group transition-colors"
            >
              <div className="w-9 h-9 border-2 border-[#b5bac1] group-hover:border-white rounded-full flex items-center justify-center mb-1 transition-colors bg-[#313338]">
                <X size={20} strokeWidth={3} />
              </div>
              <span className="text-xs font-semibold">ESC</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
