const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Store canvas state (list of drawn elements)
let canvasElements = [];
const users = {};

io.on('connection', (socket) => {
  const userId = socket.id;
  console.log('User connected:', userId);

  // Send existing canvas state to new user
  socket.emit('canvas:init', canvasElements);

  // Assign user color
  const colors = ['#e74c3c', '#3498db'];
  const usedColors = Object.values(users).map(u => u.color);
  const color = colors.find(c => !usedColors.includes(c)) || '#' + Math.floor(Math.random()*16777215).toString(16);
  users[userId] = { color, name: `User ${Object.keys(users).length + 1}` };

  // Notify all about user list
  io.emit('users:update', Object.entries(users).map(([id, u]) => ({ id, ...u })));
  socket.emit('user:self', { id: userId, ...users[userId] });

  // Live cursor movement
  socket.on('cursor:move', (pos) => {
    socket.broadcast.emit('cursor:update', { id: userId, ...pos, color: users[userId]?.color, name: users[userId]?.name });
  });

  // Drawing events
  socket.on('draw:start', (data) => {
    socket.broadcast.emit('draw:start', data);
  });

  socket.on('draw:move', (data) => {
    socket.broadcast.emit('draw:move', data);
  });

  socket.on('draw:end', (element) => {
    canvasElements.push(element);
    socket.broadcast.emit('draw:end', element);
  });

  // Shape drawn (rect, ellipse, line, text)
  socket.on('shape:add', (element) => {
    canvasElements.push(element);
    socket.broadcast.emit('shape:add', element);
  });

  // Clear canvas
  socket.on('canvas:clear', () => {
    canvasElements = [];
    io.emit('canvas:clear');
  });

  // Undo last element
  socket.on('canvas:undo', () => {
    canvasElements.pop();
    io.emit('canvas:init', canvasElements);
  });

  socket.on('disconnect', () => {
    delete users[userId];
    io.emit('cursor:remove', userId);
    io.emit('users:update', Object.entries(users).map(([id, u]) => ({ id, ...u })));
    console.log('User disconnected:', userId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
