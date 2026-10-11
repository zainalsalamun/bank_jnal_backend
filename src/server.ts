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

  // Merchant app joins merchant room for payment voice alerts
  socket.on('join_merchant', (merchantId) => {
    socket.join(`merchant_${merchantId}`);
    console.log(`Socket ${socket.id} joined room merchant_${merchantId}`);
  });

  // Cashier device joins outlet room
  socket.on('join_outlet', (outletId) => {
    socket.join(`outlet_${outletId}`);
    console.log(`Socket ${socket.id} joined room outlet_${outletId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const startServer = async () => {
  try {
    await db.$connect();
    console.log('Database connected successfully.');

    server.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT} (0.0.0.0)`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
