import app from './app';
import dotenv from 'dotenv';
import { db } from './config/db';

dotenv.config();

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    await db.$connect();
    console.log('Database connected successfully.');

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
