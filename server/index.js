const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const config = require("./config");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  },
});

const { PORT, JWT_SECRET } = config;

// --- Database Setup ---
const db = new sqlite3.Database(config.DB_PATH, (err) => {
  if (err) {
    console.error("Error opening database", err.message);
  } else {
    console.log("Connected to the SQLite database.");

    db.serialize(() => {
      // Create Roles Table
      db.run(`CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            permissions TEXT
        )`);

      // Seed Roles
      const roles = [
        {
          name: "Admin",
          permissions: JSON.stringify([
            "admin",
            "manage_users",
            "manage_roles",
            "delete_messages",
          ]),
        },
        {
          name: "Moderator",
          permissions: JSON.stringify(["manage_users", "delete_messages"]),
        },
        { name: "User", permissions: JSON.stringify(["send_messages"]) },
      ];

      const insertRole = db.prepare(
        "INSERT OR IGNORE INTO roles (name, permissions) VALUES (?, ?)",
      );
      roles.forEach((role) => insertRole.run(role.name, role.permissions));
      insertRole.finalize();

      // Create Users Table
      db.run(
        `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role_id INTEGER,
            FOREIGN KEY(role_id) REFERENCES roles(id)
        )`,
      );

      // Migration: Add role_id if it doesn't exist (for existing databases)
      db.run("ALTER TABLE users ADD COLUMN role_id INTEGER", (err) => {
        // Ignore error if column already exists

        // Assign default role 'User' to existing users with NULL role_id
        db.get("SELECT id FROM roles WHERE name = 'User'", (err, role) => {
          if (role) {
            db.run("UPDATE users SET role_id = ? WHERE role_id IS NULL", [
              role.id,
            ]);
          }
        });
      });

      // Migration: Add avatar column
      db.run("ALTER TABLE users ADD COLUMN avatar TEXT", (err) => {
        // Ignore error if column already exists
      });

      // Create Messages Table
      db.run(
        `CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id TEXT,
            user_id INTEGER,
            username TEXT,
            content TEXT,
            timestamp TEXT
        )`,
      );

      // Create Servers Table
      db.run(
        `CREATE TABLE IF NOT EXISTS servers (
            id TEXT PRIMARY KEY,
            name TEXT,
            icon TEXT
        )`,
      );

      // Create Channels Table
      db.run(
        `CREATE TABLE IF NOT EXISTS channels (
            id TEXT PRIMARY KEY,
            server_id TEXT,
            name TEXT,
            type TEXT,
            FOREIGN KEY(server_id) REFERENCES servers(id)
        )`,
      );

      // Create Server Members Table (tracks which users are in which servers)
      // Note: Roles are managed globally via roles table, not per-server
      db.run(
        `CREATE TABLE IF NOT EXISTS server_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id TEXT,
            user_id INTEGER,
            joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(server_id) REFERENCES servers(id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            UNIQUE(server_id, user_id)
        )`,
      );

      // Create Server Admins Table
      db.run(
        `CREATE TABLE IF NOT EXISTS server_admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id TEXT,
            user_id INTEGER,
            FOREIGN KEY(server_id) REFERENCES servers(id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            UNIQUE(server_id, user_id)
        )`,
      );

      // Create Banned Users Table (users banned from servers)
      db.run(
        `CREATE TABLE IF NOT EXISTS banned_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id TEXT,
            user_id INTEGER,
            banned_by INTEGER,
            reason TEXT,
            banned_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(server_id) REFERENCES servers(id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(banned_by) REFERENCES users(id),
            UNIQUE(server_id, user_id)
        )`,
      );

      // Create Muted Users Table (users muted in channels or servers)
      db.run(
        `CREATE TABLE IF NOT EXISTS muted_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id TEXT,
            channel_id TEXT,
            user_id INTEGER,
            muted_by INTEGER,
            reason TEXT,
            muted_until TEXT,
            muted_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(server_id) REFERENCES servers(id),
            FOREIGN KEY(channel_id) REFERENCES channels(id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(muted_by) REFERENCES users(id)
        )`,
      );

      // Seed Servers and Channels
      db.get("SELECT COUNT(*) as count FROM servers", (err, row) => {
        if (row && row.count === 0) {
          const servers = [
            {
              id: "server_1",
              name: "Discord Clone",
              icon: "https://picsum.photos/id/10/50/50",
            },
            {
              id: "server_2",
              name: "Gaming Community",
              icon: "https://picsum.photos/id/11/50/50",
            },
          ];

          const insertServer = db.prepare(
            "INSERT INTO servers (id, name, icon) VALUES (?, ?, ?)",
          );
          servers.forEach((s) => insertServer.run(s.id, s.name, s.icon));
          insertServer.finalize();

          const channels = [
            {
              id: "channel_1",
              server_id: "server_1",
              name: "general",
              type: "TEXT",
            },
            {
              id: "channel_2",
              server_id: "server_1",
              name: "voice-chat",
              type: "VOICE",
            },
            {
              id: "channel_3",
              server_id: "server_2",
              name: "lfg",
              type: "TEXT",
            },
            {
              id: "channel_4",
              server_id: "server_2",
              name: "lobby",
              type: "VOICE",
            },
          ];

          const insertChannel = db.prepare(
            "INSERT INTO channels (id, server_id, name, type) VALUES (?, ?, ?, ?)",
          );
          channels.forEach((c) =>
            insertChannel.run(c.id, c.server_id, c.name, c.type),
          );
          insertChannel.finalize();
        }
      });
    });
  }
});

// --- HTTP Auth Routes ---

// Register
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if any users exist
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
      if (err) return res.status(500).json({ error: err.message });

      const isFirstUser = row.count === 0;
      const roleName = isFirstUser ? "Admin" : "User";

      // Get role ID
      db.get("SELECT id FROM roles WHERE name = ?", [roleName], (err, role) => {
        const roleId = role ? role.id : null;

        const sql =
          "INSERT INTO users (username, password, role_id) VALUES (?, ?, ?)";
        db.run(sql, [username, hashedPassword, roleId], function (err) {
          if (err) {
            if (err.message.includes("UNIQUE constraint failed")) {
              return res.status(400).json({ error: "Username already exists" });
            }
            return res.status(500).json({ error: err.message });
          }
          res.status(201).json({
            message: "User created successfully",
            userId: this.lastID,
            role: roleName,
          });
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const sql = `
    SELECT users.id, users.username, users.password, users.avatar, users.role_id, roles.name as role_name, roles.permissions
    FROM users
    LEFT JOIN roles ON users.role_id = roles.id
    WHERE username = ?
  `;
  db.get(sql, [username], async (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (match) {
      const permissions = user.permissions ? JSON.parse(user.permissions) : [];
      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          role: user.role_name,
          permissions: permissions,
        },
        JWT_SECRET,
        { expiresIn: "24h" },
      );
      // Automatically add user to all existing servers as member
      db.all("SELECT id FROM servers", [], (err, servers) => {
        if (!err && servers) {
          servers.forEach((server) => {
            db.run(
              "INSERT OR IGNORE INTO server_members (server_id, user_id) VALUES (?, ?)",
              [server.id, user.id],
              () => {}
            );
          });
        }
      });

      res.json({
        token,
        username: user.username,
        userId: user.id,
        avatar: user.avatar,
        role: user.role_name,
        permissions: permissions,
      });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });
});

// --- Middleware for Admin Routes ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
};

const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    const userPermissions = req.user.permissions || [];
    if (
      userPermissions.includes("admin") ||
      userPermissions.includes(requiredPermission)
    ) {
      next();
    } else {
      res.status(403).json({ error: "Insufficient permissions" });
    }
  };
};

// --- Admin Routes ---

// Get all users
app.get(
  "/admin/users",
  authenticateToken,
  checkPermission("manage_users"),
  (req, res) => {
    const sql = `
        SELECT users.id, users.username, roles.name as role
        FROM users
        LEFT JOIN roles ON users.role_id = roles.id
    `;
    db.all(sql, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  },
);

// Get all roles
app.get(
  "/admin/roles",
  authenticateToken,
  checkPermission("manage_roles"),
  (req, res) => {
    db.all("SELECT * FROM roles", [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      // Parse permissions JSON for frontend
      const roles = rows.map((r) => ({
        ...r,
        permissions: JSON.parse(r.permissions),
      }));
      res.json(roles);
    });
  },
);

// Assign role to user
app.post(
  "/admin/user-role",
  authenticateToken,
  checkPermission("manage_roles"),
  (req, res) => {
    const { userId, roleId } = req.body;
    if (!userId || !roleId) {
      return res.status(400).json({ error: "UserId and RoleId required" });
    }

    db.run(
      "UPDATE users SET role_id = ? WHERE id = ?",
      [roleId, userId],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "User role updated successfully" });
      },
    );
  },
);

// Update user avatar
app.post("/users/avatar", authenticateToken, (req, res) => {
  const { avatar } = req.body; // Base64 string or URL
  const userId = req.user.id;

  let avatarUrl = avatar;

  if (avatar && avatar.startsWith("data:image")) {
    try {
      const matches = avatar.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const extension = matches[1].split("/")[1];
        const data = matches[2];
        const buffer = Buffer.from(data, "base64");
        const filename = `avatar_${userId}_${Date.now()}.${extension}`;
        const filePath = path.join(__dirname, "uploads", filename);

        fs.writeFileSync(filePath, buffer);
        avatarUrl = `${req.protocol}://${req.get("host")}/uploads/${filename}`;
      }
    } catch (error) {
      console.error("Error saving avatar:", error);
      return res.status(500).json({ error: "Failed to upload avatar" });
    }
  }

  db.run(
    "UPDATE users SET avatar = ? WHERE id = ?",
    [avatarUrl, userId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });

      // Update online users
      for (const [socketId, user] of onlineUsers.entries()) {
        if (user.userId === userId) {
          // Update the map
          onlineUsers.set(socketId, { ...user, avatar: avatarUrl });

          // Update the socket object itself if we can find it
          const socket = io.sockets.sockets.get(socketId);
          if (socket && socket.user) {
            socket.user.avatar = avatarUrl;
          }
        }
      }

      // Broadcast updated online list
      io.emit("online_users_list", Array.from(onlineUsers.values()));

      res.json({ message: "Avatar updated successfully", avatarUrl });
    },
  );
});

// Get servers and their channels
app.get("/servers", authenticateToken, (req, res) => {
  db.all("SELECT * FROM servers", [], async (err, servers) => {
    if (err) return res.status(500).json({ error: err.message });

    try {
      const serversWithChannels = await Promise.all(
        servers.map(async (server) => {
          return new Promise((resolve, reject) => {
            db.all(
              "SELECT * FROM channels WHERE server_id = ?",
              [server.id],
              (err, channels) => {
                if (err) reject(err);
                else resolve({ ...server, channels });
              },
            );
          });
        }),
      );
      res.json(serversWithChannels);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

// --- Server Moderation Routes ---

// Helper: Check if user is server admin
const isServerAdmin = (serverId, userId, callback) => {
  db.get(
    "SELECT * FROM server_admins WHERE server_id = ? AND user_id = ?",
    [serverId, userId],
    (err, row) => {
      if (err) return callback(err, false);
      callback(null, !!row);
    },
  );
};

// Helper: Check if user has admin permissions globally (from roles table)
const hasAdminPermission = (userPermissions) => {
  return userPermissions && userPermissions.includes("admin");
};

// Helper: Check if user has moderator permissions globally (from roles table)
const hasModeratorPermission = (userPermissions) => {
  return userPermissions && (
    userPermissions.includes("admin") || 
    userPermissions.includes("manage_users") ||
    userPermissions.includes("delete_messages")
  );
};

// Helper: Check if user can moderate a server (server admin OR global admin/moderator)
const canModerateServer = (serverId, userId, userPermissions, callback) => {
  isServerAdmin(serverId, userId, (err, isServerAdminUser) => {
    if (err) return callback(err, false);
    const isGlobalAdmin = hasAdminPermission(userPermissions);
    const isModerator = hasModeratorPermission(userPermissions);
    callback(null, isServerAdminUser || isGlobalAdmin || isModerator);
  });
};

// Get server members (with their global roles)
app.get(
  "/servers/:serverId/members",
  authenticateToken,
  (req, res) => {
    const { serverId } = req.params;
    const sql = `
      SELECT 
        users.id, 
        users.username, 
        users.avatar, 
        roles.name as role,
        roles.permissions,
        server_members.joined_at
      FROM server_members
      JOIN users ON server_members.user_id = users.id
      LEFT JOIN roles ON users.role_id = roles.id
      WHERE server_members.server_id = ?
    `;
    db.all(sql, [serverId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      // Parse permissions JSON
      const members = rows.map(row => ({
        ...row,
        permissions: row.permissions ? JSON.parse(row.permissions) : []
      }));
      res.json(members);
    });
  },
);

// Ban user from server
app.post(
  "/servers/:serverId/ban",
  authenticateToken,
  (req, res) => {
    const { serverId } = req.params;
    const { userId, reason } = req.body;
    const adminId = req.user.id;

    if (!userId) {
      return res.status(400).json({ error: "UserId required" });
    }

    // Check if user can moderate (server admin OR global admin/moderator)
    canModerateServer(serverId, adminId, req.user.permissions, (err, canModerate) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (!canModerate) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      // Insert into banned_users
      db.run(
        "INSERT OR REPLACE INTO banned_users (server_id, user_id, banned_by, reason) VALUES (?, ?, ?, ?)",
        [serverId, userId, adminId, reason || null],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          
          // Remove from server members if exists
          db.run(
            "DELETE FROM server_members WHERE server_id = ? AND user_id = ?",
            [serverId, userId],
            () => {}
          );
          
          res.json({ message: "User banned successfully" });
        },
      );
    });
  },
);

// Unban user from server
app.post(
  "/servers/:serverId/unban",
  authenticateToken,
  (req, res) => {
    const { serverId } = req.params;
    const { userId } = req.body;
    const adminId = req.user.id;

    if (!userId) {
      return res.status(400).json({ error: "UserId required" });
    }

    canModerateServer(serverId, adminId, req.user.permissions, (err, canModerate) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (!canModerate) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      db.run(
        "DELETE FROM banned_users WHERE server_id = ? AND user_id = ?",
        [serverId, userId],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ message: "User unbanned successfully" });
        },
      );
    });
  },
);

// Mute user in channel or server
app.post(
  "/servers/:serverId/mute",
  authenticateToken,
  (req, res) => {
    const { serverId } = req.params;
    const { userId, channelId, reason, durationMinutes } = req.body;
    const adminId = req.user.id;

    if (!userId) {
      return res.status(400).json({ error: "UserId required" });
    }

    canModerateServer(serverId, adminId, req.user.permissions, (err, canModerate) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (!canModerate) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      let mutedUntil = null;
      if (durationMinutes) {
        const date = new Date();
        date.setMinutes(date.getMinutes() + durationMinutes);
        mutedUntil = date.toISOString();
      }

      db.run(
        "INSERT INTO muted_users (server_id, channel_id, user_id, muted_by, reason, muted_until) VALUES (?, ?, ?, ?, ?, ?)",
        [serverId, channelId || null, userId, adminId, reason || null, mutedUntil],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ message: "User muted successfully" });
        },
      );
    });
  },
);

// Unmute user
app.post(
  "/servers/:serverId/unmute",
  authenticateToken,
  (req, res) => {
    const { serverId } = req.params;
    const { userId, channelId } = req.body;
    const adminId = req.user.id;

    if (!userId) {
      return res.status(400).json({ error: "UserId required" });
    }

    canModerateServer(serverId, adminId, req.user.permissions, (err, canModerate) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (!canModerate) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      const sql = channelId
        ? "DELETE FROM muted_users WHERE server_id = ? AND user_id = ? AND channel_id = ?"
        : "DELETE FROM muted_users WHERE server_id = ? AND user_id = ? AND channel_id IS NULL";
      
      const params = channelId ? [serverId, userId, channelId] : [serverId, userId];

      db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "User unmuted successfully" });
      });
    });
  },
);

// Delete message
app.delete(
  "/messages/:messageId",
  authenticateToken,
  (req, res) => {
    const { messageId } = req.params;
    const userId = req.user.id;

    // First, get the message to check server and permissions
    db.get(
      `SELECT messages.*, channels.server_id 
       FROM messages 
       JOIN channels ON messages.channel_id = channels.id 
       WHERE messages.id = ?`,
      [messageId],
      (err, message) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!message) return res.status(404).json({ error: "Message not found" });

        // Check if user can delete (author OR server admin OR global admin/moderator)
        const isAuthor = message.user_id === userId;
        const canDelete = isAuthor || 
          hasAdminPermission(req.user.permissions) || 
          hasModeratorPermission(req.user.permissions);
        
        if (canDelete) {
          // User has permission, proceed with deletion
          db.run("DELETE FROM messages WHERE id = ?", [messageId], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Message deleted successfully" });
          });
        } else {
          // Check if user is server admin
          isServerAdmin(message.server_id, userId, (err, isServerAdminUser) => {
            if (err) return res.status(500).json({ error: err.message });
            
            if (!isServerAdminUser) {
              return res.status(403).json({ error: "Insufficient permissions" });
            }

            // User is server admin, proceed with deletion
            db.run("DELETE FROM messages WHERE id = ?", [messageId], function (err) {
              if (err) return res.status(500).json({ error: err.message });
              res.json({ message: "Message deleted successfully" });
            });
          });
        }
      },
    );
  },
);

// Get banned users for a server
app.get(
  "/servers/:serverId/banned",
  authenticateToken,
  (req, res) => {
    const { serverId } = req.params;
    const adminId = req.user.id;

    canModerateServer(serverId, adminId, req.user.permissions, (err, canModerate) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (!canModerate) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      const sql = `
        SELECT banned_users.*, users.username, users.avatar
        FROM banned_users
        JOIN users ON banned_users.user_id = users.id
        WHERE banned_users.server_id = ?
      `;
      db.all(sql, [serverId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    });
  },
);

// Get muted users for a server/channel
app.get(
  "/servers/:serverId/muted",
  authenticateToken,
  (req, res) => {
    const { serverId } = req.params;
    const { channelId } = req.query;
    const adminId = req.user.id;

    canModerateServer(serverId, adminId, req.user.permissions, (err, canModerate) => {
      if (err) return res.status(500).json({ error: err.message });
      
      if (!canModerate) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      const sql = channelId
        ? `SELECT muted_users.*, users.username, users.avatar
           FROM muted_users
           JOIN users ON muted_users.user_id = users.id
           WHERE muted_users.server_id = ? AND muted_users.channel_id = ?`
        : `SELECT muted_users.*, users.username, users.avatar
           FROM muted_users
           JOIN users ON muted_users.user_id = users.id
           WHERE muted_users.server_id = ? AND muted_users.channel_id IS NULL`;
      
      const params = channelId ? [serverId, channelId] : [serverId];

      db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      });
    });
  },
);

// Set server admin
app.post(
  "/servers/:serverId/admin",
  authenticateToken,
  (req, res) => {
    const { serverId } = req.params;
    const { userId } = req.body;
    const adminId = req.user.id;

    if (!userId) {
      return res.status(400).json({ error: "UserId required" });
    }

    // Only global admins can set server admins
    if (!hasAdminPermission(req.user.permissions)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    db.run(
      "INSERT OR IGNORE INTO server_admins (server_id, user_id) VALUES (?, ?)",
      [serverId, userId],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Server admin set successfully" });
      },
    );
  },
);

// Remove server admin
app.delete(
  "/servers/:serverId/admin/:userId",
  authenticateToken,
  (req, res) => {
    const { serverId, userId } = req.params;
    const adminId = req.user.id;

    // Only global admins can remove server admins
    if (!hasAdminPermission(req.user.permissions)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    db.run(
      "DELETE FROM server_admins WHERE server_id = ? AND user_id = ?",
      [serverId, userId],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Server admin removed successfully" });
      },
    );
  },
);

// --- Socket.IO Middleware for Authentication ---
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Authentication error: Token required"));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error("Authentication error: Invalid token"));
    }
    socket.user = decoded; // Attach user info to socket
    next();
  });
});

// --- Socket.IO Logic ---

// Track which voice room a socket is in
const socketVoiceRoom = {};
// Track all online users: Map<socketId, {id, username, userId}>
const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id} (${socket.user.username})`);

  // Add to global online list
  onlineUsers.set(socket.id, {
    id: socket.id,
    username: socket.user.username,
    userId: socket.user.id,
    avatar: socket.user.avatar,
  });

  // Broadcast updated online list to EVERYONE
  io.emit("online_users_list", Array.from(onlineUsers.values()));

  // Send list to requester immediately upon request
  socket.on("request_online_users", () => {
    socket.emit("online_users_list", Array.from(onlineUsers.values()));
  });

  // --- Text Chat Logic ---
  socket.on("join_text_channel", (channelId) => {
    socket.join(channelId);
    console.log(`Socket ${socket.id} joined text channel ${channelId}`);

    // Get server_id from channel and ensure user is a member
    db.get(
      "SELECT server_id FROM channels WHERE id = ?",
      [channelId],
      (err, channel) => {
        if (!err && channel) {
          // Add user to server_members if not already a member
          db.run(
            "INSERT OR IGNORE INTO server_members (server_id, user_id) VALUES (?, ?)",
            [channel.server_id, socket.user.id],
            () => {}
          );
        }
      }
    );

    // Load history
    const sql = `
      SELECT messages.*, users.avatar
      FROM messages
      LEFT JOIN users ON messages.user_id = users.id
      WHERE channel_id = ?
      ORDER BY timestamp ASC LIMIT 100
    `;
    db.all(sql, [channelId], (err, rows) => {
      if (err) {
        console.error("Error fetching history:", err);
        return;
      }
      // Send history to the user who joined
      socket.emit("chat_history", rows);
    });
  });

  socket.on("send_message", (data) => {
    // data: { channelId, message }
    const userId = socket.user.id;
    const channelId = data.channelId;

    // Get server_id from channel
    db.get(
      "SELECT server_id FROM channels WHERE id = ?",
      [channelId],
      (err, channel) => {
        if (err || !channel) {
          socket.emit("error", { message: "Channel not found" });
          return;
        }

        const serverId = channel.server_id;

        // Check if user is banned from this server
        db.get(
          "SELECT * FROM banned_users WHERE server_id = ? AND user_id = ?",
          [serverId, userId],
          (err, ban) => {
            if (err) {
              console.error("Error checking ban:", err);
              socket.emit("error", { message: "Error checking permissions" });
              return;
            }

            if (ban) {
              socket.emit("error", { message: "You are banned from this server" });
              return;
            }

            // Check if user is muted in this channel or server
            db.get(
              `SELECT * FROM muted_users 
               WHERE server_id = ? AND user_id = ? 
               AND (channel_id = ? OR channel_id IS NULL)
               AND (muted_until IS NULL OR muted_until > datetime('now'))`,
              [serverId, userId, channelId],
              (err, mute) => {
                if (err) {
                  console.error("Error checking mute:", err);
                  socket.emit("error", { message: "Error checking permissions" });
                  return;
                }

                if (mute) {
                  socket.emit("error", { message: "You are muted in this channel" });
                  return;
                }

                // User can send message
                const timestamp = new Date().toISOString();
                const messagePayload = {
                  content: data.message,
                  author: socket.user.username,
                  avatar: socket.user.avatar,
                  id: Date.now().toString(),
                  timestamp: timestamp,
                };

                // Save to DB
                const insertSql =
                  "INSERT INTO messages (channel_id, user_id, username, content, timestamp) VALUES (?, ?, ?, ?, ?)";
                db.run(
                  insertSql,
                  [
                    channelId,
                    userId,
                    socket.user.username,
                    data.message,
                    timestamp,
                  ],
                  function (err) {
                    if (err) {
                      console.error("Error saving message:", err);
                      socket.emit("error", { message: "Failed to send message" });
                      return;
                    }
                    
                    // Include database ID in payload
                    messagePayload.dbId = this.lastID;

                    // Broadcast to others in the channel
                    socket.to(channelId).emit("receive_message", messagePayload);
                  },
                );
              },
            );
          },
        );
      },
    );
  });

  // Delete message via socket
  socket.on("delete_message", (data) => {
    // data: { messageId, channelId }
    const { messageId, channelId } = data;
    const userId = socket.user.id;

    // Get message and server info
    db.get(
      `SELECT messages.*, channels.server_id 
       FROM messages 
       JOIN channels ON messages.channel_id = channels.id 
       WHERE messages.id = ?`,
      [messageId],
      (err, message) => {
        if (err || !message) {
          socket.emit("error", { message: "Message not found" });
          return;
        }

        const isAuthor = message.user_id === userId;

        // Check if user can delete (author OR server admin OR global admin/moderator)
        const canDelete = isAuthor || 
          hasAdminPermission(socket.user.permissions) || 
          hasModeratorPermission(socket.user.permissions);
        
        if (!canDelete) {
          // Check if user is server admin
          isServerAdmin(message.server_id, userId, (err, isServerAdminUser) => {
            if (err) {
              socket.emit("error", { message: "Error checking permissions" });
              return;
            }

            if (!isServerAdminUser) {
              socket.emit("error", { message: "Insufficient permissions" });
              return;
            }

            // User is server admin, proceed with deletion
            deleteMessage();
          });
        } else {
          // User has permission, proceed with deletion
          deleteMessage();
        }

          function deleteMessage() {
            // Delete from DB
            db.run("DELETE FROM messages WHERE id = ?", [messageId], (err) => {
              if (err) {
                socket.emit("error", { message: "Failed to delete message" });
                return;
              }

              // Broadcast deletion to channel
              io.to(channelId).emit("message_deleted", { messageId });
            });
          }
      },
    );
  });

  // --- Voice/Video Logic ---
  socket.on("join_voice_channel", (channelId) => {
    // If already in a voice channel, leave it
    if (socketVoiceRoom[socket.id]) {
      const oldRoom = socketVoiceRoom[socket.id];
      socket.leave(oldRoom);
      socket.to(oldRoom).emit("user_left", socket.id);
    }

    socket.join(channelId);
    socketVoiceRoom[socket.id] = channelId;

    // Get list of other users in this voice channel
    const roomClients = io.sockets.adapter.rooms.get(channelId) || new Set();

    const otherUsers = [];
    roomClients.forEach((clientId) => {
      if (clientId !== socket.id) {
        const clientSocket = io.sockets.sockets.get(clientId);
        if (clientSocket && clientSocket.user) {
          otherUsers.push({
            id: clientId,
            username: clientSocket.user.username,
            avatar: clientSocket.user.avatar,
          });
        }
      }
    });

    // Send list of existing users to the new joiner so they can initiate offers
    socket.emit("existing_users", otherUsers);

    // Notify others in the room about the new user (so they can update name mapping)
    socket.to(channelId).emit("user_joined_voice", {
      id: socket.id,
      username: socket.user.username,
      avatar: socket.user.avatar,
    });

    console.log(`Socket ${socket.id} joined voice channel ${channelId}`);
  });

  socket.on("leave_voice_channel", () => {
    const roomId = socketVoiceRoom[socket.id];
    if (roomId) {
      socket.leave(roomId);
      socket.to(roomId).emit("user_left", socket.id);
      delete socketVoiceRoom[socket.id];
    }
  });

  // --- WebRTC Signaling ---

  // Forward Offer
  socket.on("offer", (data) => {
    // data: { to: socketId, sdp: ... }
    io.to(data.to).emit("offer", { from: socket.id, sdp: data.sdp });
  });

  // Forward Answer
  socket.on("answer", (data) => {
    // data: { to: socketId, sdp: ... }
    io.to(data.to).emit("answer", { from: socket.id, sdp: data.sdp });
  });

  // Forward ICE Candidate
  socket.on("candidate", (data) => {
    // data: { to: socketId, candidate: ... }
    io.to(data.to).emit("candidate", {
      from: socket.id,
      candidate: data.candidate,
    });
  });

  socket.on("disconnect", () => {
    console.log(`User Disconnected ${socket.id} (${socket.user.username})`);
    const voiceRoom = socketVoiceRoom[socket.id];
    if (voiceRoom) {
      socket.to(voiceRoom).emit("user_left", socket.id);
      delete socketVoiceRoom[socket.id];
    }

    // Remove from global list and broadcast
    onlineUsers.delete(socket.id);
    io.emit("online_users_list", Array.from(onlineUsers.values()));
  });
});

server.listen(PORT, () => {
  console.log(`SERVER RUNNING ON PORT ${PORT}`);
});
