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

    // Get 'User' role ID (assuming it exists from seed)
    db.get("SELECT id FROM roles WHERE name = 'User'", (err, role) => {
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
        res
          .status(201)
          .json({ message: "User created successfully", userId: this.lastID });
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
    // We construct the full message object here to ensure author is correct
    const timestamp = new Date().toISOString();
    const messagePayload = {
      content: data.message,
      author: socket.user.username,
      avatar: socket.user.avatar,
      id: Date.now().toString(), // Using timestamp as simplistic ID, but DB has auto-increment ID
      timestamp: timestamp,
    };

    // Save to DB
    const insertSql =
      "INSERT INTO messages (channel_id, user_id, username, content, timestamp) VALUES (?, ?, ?, ?, ?)";
    db.run(
      insertSql,
      [
        data.channelId,
        socket.user.id,
        socket.user.username,
        data.message,
        timestamp,
      ],
      (err) => {
        if (err) console.error("Error saving message:", err);
      },
    );

    // Broadcast to others in the channel
    socket.to(data.channelId).emit("receive_message", messagePayload);
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
