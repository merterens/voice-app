const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// rooms = { roomId: { socketId: { name } } }
const rooms = {};

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('join-room', ({ room, name }) => {
    currentRoom = room;
    socket.join(room);

    if (!rooms[room]) rooms[room] = {};

    // Yeni kullanıcıya odadaki mevcut kullanıcıların listesini gönder
    const existingUsers = Object.entries(rooms[room]).map(([id, u]) => ({
      id,
      name: u.name,
    }));
    socket.emit('existing-users', existingUsers);

    rooms[room][socket.id] = { name: name || 'Anonim' };

    // Odadaki diğerlerine yeni kullanıcıyı bildir
    socket.to(room).emit('user-joined', { id: socket.id, name: name || 'Anonim' });
  });

  // WebRTC sinyalleşme mesajlarını ilgili kişiye ilet
  socket.on('offer', ({ to, offer }) => {
    io.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      delete rooms[currentRoom][socket.id];
      socket.to(currentRoom).emit('user-left', { id: socket.id });
      if (Object.keys(rooms[currentRoom]).length === 0) {
        delete rooms[currentRoom];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
