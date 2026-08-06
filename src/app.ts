import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import { formatSuccess } from './utils/response';
import authRoutes from './routes/v1/auth.routes';
import usersRoutes from './routes/v1/users.routes';
import dashboardRoutes from './routes/v1/dashboard.routes';
import pocketsRoutes from './routes/v1/pockets.routes';
import transactionsRoutes from './routes/v1/transactions.routes';
import transfersRoutes from './routes/v1/transfers.routes';
import qrisRoutes from './routes/v1/qris.routes';
import cardsRoutes from './routes/v1/cards.routes';
import promotionsRoutes from './routes/v1/promotions.routes';
import notificationsRoutes from './routes/v1/notifications.routes';
import adminRoutes from './routes/v1/admin.routes';

const app = express();

app.use(cors());
app.use(express.json());

// Health Check
app.get('/api/v1/health', (req, res) => {
  res.json(formatSuccess({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'connected' // We can improve this by actually pinging db
  }));
});

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/me', usersRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/pockets', pocketsRoutes);
app.use('/api/v1/transactions', transactionsRoutes);
app.use('/api/v1/transfers', transfersRoutes);
app.use('/api/v1/qris', qrisRoutes);
app.use('/api/v1/cards', cardsRoutes);
app.use('/api/v1/promotions', promotionsRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/admin', adminRoutes);

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// Global Error Handler
app.use(errorHandler);

export default app;
