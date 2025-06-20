// server/index.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors()); // allow all origins; adjust in production

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('WebRTC signaling server running');
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join', (roomID) => {
    console.log(`Socket ${socket.id} requested to join room ${roomID}`);
    const room = io.sockets.adapter.rooms.get(roomID);
    const numClients = room ? room.size : 0;

    if (numClients === 0) {
      socket.join(roomID);
      socket.emit('created', roomID);
      console.log(`Room ${roomID} created by ${socket.id}`);
    } else if (numClients === 1) {
      socket.join(roomID);
      socket.emit('joined', roomID);
      // Notify both peers they can start negotiation
      io.to(roomID).emit('ready');
      console.log(`Socket ${socket.id} joined room ${roomID}`);
    } else {
      // max 2
      socket.emit('full', roomID);
      console.log(`Room ${roomID} is full. Rejecting ${socket.id}`);
    }
  });

  socket.on('offer', ({ offer, roomID }) => {
    console.log(`Received offer from ${socket.id} for room ${roomID}`);
    socket.to(roomID).emit('offer', offer);
  });

  socket.on('answer', ({ answer, roomID }) => {
    console.log(`Received answer from ${socket.id} for room ${roomID}`);
    socket.to(roomID).emit('answer', answer);
  });

  socket.on('ice-candidate', ({ candidate, roomID }) => {
    // Forward ICE candidate to peer
    socket.to(roomID).emit('ice-candidate', candidate);
  });

  // Forward mute/unmute events
  socket.on('toggle-audio', ({ enabled, roomID }) => {
    socket.to(roomID).emit('toggle-audio', enabled);
  });
  socket.on('toggle-video', ({ enabled, roomID }) => {
    socket.to(roomID).emit('toggle-video', enabled);
  });

  socket.on('leave', (roomID) => {
    console.log(`Socket ${socket.id} leaving room ${roomID}`);
    socket.leave(roomID);
    socket.to(roomID).emit('peer-left');
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Notify peers in all rooms this socket was in
    for (const roomID of socket.rooms) {
      if (roomID === socket.id) continue;
      socket.to(roomID).emit('peer-left');
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Signaling server listening on port http://localhost:${PORT}`);
});
