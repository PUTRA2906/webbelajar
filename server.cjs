const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 5e6, // 5MB for large scene data
});

// Serve static files from Vite build output
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ── Room-based state ──
const rooms = {};

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      elements: [],
      users: {},
    };
  }
  return rooms[roomId];
}

const COLORS = [
  '#6c5ce7', '#00cec9', '#e17055', '#00b894',
  '#fdcb6e', '#e84393', '#0984e3', '#d63031',
  '#6ab04c', '#f0932b', '#eb4d4b', '#7ed6df',
  '#22a6b3', '#be2edd', '#4834d4', '#130f40',
];

io.on('connection', (socket) => {
  const userId = socket.id;
  const userName = socket.handshake.query.userName || `User ${userId.slice(0, 4)}`;
  const roomId = socket.handshake.query.roomId || 'default-room';

  console.log(`[${roomId}] User connected: ${userName} (${userId})`);

  // Join room
  socket.join(roomId);
  const room = getRoom(roomId);

  // Assign color
  const usedColors = Object.values(room.users).map((u) => u.color);
  const color = COLORS.find((c) => !usedColors.includes(c)) ||
    '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
  
  room.users[userId] = { name: userName, color };

  // Notify self
  socket.emit('user:self', { id: userId, color, name: userName });

  // Update all users in room
  const usersList = Object.entries(room.users).map(([id, u]) => ({ id, ...u }));
  io.to(roomId).emit('users:update', usersList);

  // Send existing scene to new user
  socket.emit('scene:init', { elements: room.elements });

  // User requests scene (e.g. after reconnect)
  socket.on('scene:request', () => {
    socket.emit('scene:init', { elements: room.elements });
  });

  // Scene update from user
  socket.on('scene:update', ({ elements }) => {
    room.elements = elements || [];
    socket.to(roomId).emit('scene:update', { elements: room.elements });
  });

  // Cursor movement
  socket.on('cursor:move', ({ pointer, button, selectedElementIds }) => {
    socket.to(roomId).emit('cursor:update', {
      id: userId,
      pointer,
      button,
      name: userName,
      color,
      selectedElementIds,
    });
  });

  // Clear canvas
  socket.on('canvas:clear', () => {
    room.elements = [];
    io.to(roomId).emit('canvas:clear');
  });

  // Disconnect
  socket.on('disconnect', () => {
    delete room.users[userId];
    io.to(roomId).emit('cursor:remove', userId);
    const remainingUsers = Object.entries(room.users).map(([id, u]) => ({ id, ...u }));
    io.to(roomId).emit('users:update', remainingUsers);
    console.log(`[${roomId}] User disconnected: ${userName} (${userId})`);

    // Clean up empty rooms
    if (Object.keys(room.users).length === 0) {
      delete rooms[roomId];
      console.log(`[${roomId}] Room cleaned up`);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
