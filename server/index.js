const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 3001;

// Track which voice room a socket is in
const socketVoiceRoom = {};

io.on('connection', (socket) => {
  console.log(`User Connected: ${socket.id}`);

  // --- Text Chat Logic ---
  socket.on('join_text_channel', (channelId) => {
    socket.join(channelId);
    console.log(`Socket ${socket.id} joined text channel ${channelId}`);
  });

  socket.on('send_message', (data) => {
    // data: { channelId, message }
    socket.to(data.channelId).emit('receive_message', data.message);
  });

  // --- Voice/Video Logic ---
  socket.on('join_voice_channel', (channelId) => {
    // If already in a voice channel, leave it
    if (socketVoiceRoom[socket.id]) {
        const oldRoom = socketVoiceRoom[socket.id];
        socket.leave(oldRoom);
        socket.to(oldRoom).emit('user_left', socket.id);
    }

    socket.join(channelId);
    socketVoiceRoom[socket.id] = channelId;

    // Get list of other users in this voice channel
    const roomClients = io.sockets.adapter.rooms.get(channelId) || new Set();
    const otherUsers = Array.from(roomClients).filter(id => id !== socket.id);

    // Send list of existing users to the new joiner so they can initiate offers
    socket.emit('existing_users', otherUsers);

    console.log(`Socket ${socket.id} joined voice channel ${channelId}`);
  });

  socket.on('leave_voice_channel', () => {
      const roomId = socketVoiceRoom[socket.id];
      if (roomId) {
          socket.leave(roomId);
          socket.to(roomId).emit('user_left', socket.id);
          delete socketVoiceRoom[socket.id];
      }
  });

  // --- WebRTC Signaling ---

  // Forward Offer
  socket.on('offer', (data) => {
    // data: { to: socketId, sdp: ... }
    io.to(data.to).emit('offer', { from: socket.id, sdp: data.sdp });
  });

  // Forward Answer
  socket.on('answer', (data) => {
    // data: { to: socketId, sdp: ... }
    io.to(data.to).emit('answer', { from: socket.id, sdp: data.sdp });
  });

  // Forward ICE Candidate
  socket.on('candidate', (data) => {
    // data: { to: socketId, candidate: ... }
    io.to(data.to).emit('candidate', { from: socket.id, candidate: data.candidate });
  });

  socket.on('disconnect', () => {
    console.log('User Disconnected', socket.id);
    const voiceRoom = socketVoiceRoom[socket.id];
    if (voiceRoom) {
      socket.to(voiceRoom).emit('user_left', socket.id);
      delete socketVoiceRoom[socket.id];
    }
  });
});

server.listen(PORT, () => {
  console.log(`SERVER RUNNING ON PORT ${PORT}`);
});
