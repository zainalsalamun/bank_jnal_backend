import app from './app';
import dotenv from 'dotenv';
import { db } from './config/db';
import http from 'http';
import { Server } from 'socket.io';

dotenv.config();

const PORT = process.env.PORT || 3001;

const server = http.createServer(app);
export const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Client should emit 'join' with their userId to subscribe to their notifications
  socket.on('join', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`Socket ${socket.id} joined room user_${userId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const startServer = async () => {
  try {
    await db.$connect();
    console.log('Database connected successfully.');

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
