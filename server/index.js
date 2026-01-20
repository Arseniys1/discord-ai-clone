const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const PORT = 3001;
const JWT_SECRET = "your-secret-key-change-this-in-production";

// --- Database Setup ---
const db = new sqlite3.Database("./database.sqlite", (err) => {
  if (err) {
    console.error("Error opening database", err.message);
  } else {
    console.log("Connected to the SQLite database.");
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )`,
      (err) => {
        if (err) {
          console.error("Error creating table:", err.message);
        }
      },
    );
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
    const sql = "INSERT INTO users (username, password) VALUES (?, ?)";
    db.run(sql, [username, hashedPassword], function (err) {
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

  const sql = "SELECT * FROM users WHERE username = ?";
  db.get(sql, [username], async (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (match) {
      const token = jwt.sign(
        { id: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: "24h" },
      );
      res.json({ token, username: user.username, userId: user.id });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });
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

io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id} (${socket.user.username})`);

  // --- Text Chat Logic ---
  socket.on("join_text_channel", (channelId) => {
    socket.join(channelId);
    console.log(`Socket ${socket.id} joined text channel ${channelId}`);
  });

  socket.on("send_message", (data) => {
    // data: { channelId, message }
    // We construct the full message object here to ensure author is correct
    const messagePayload = {
      content: data.message,
      author: socket.user.username,
      id: Date.now().toString(),
      timestamp: new Date(),
    };

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
    const otherUsers = Array.from(roomClients).filter((id) => id !== socket.id);

    // Send list of existing users to the new joiner so they can initiate offers
    socket.emit("existing_users", otherUsers);

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
  });
});

server.listen(PORT, () => {
  console.log(`SERVER RUNNING ON PORT ${PORT}`);
});
