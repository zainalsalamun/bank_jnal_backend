import { Router } from 'express';
import { 
  getUsers, createUser, updateUserStatus, updateUser, deleteUser, getTransactions, getStats, getMonitoring,
  getNotifications, createNotification,
  getPromotions, createPromotion
} from '../../controllers/adminController';
import { authenticate } from '../../middleware/authMiddleware';
import { requireAdmin } from '../../middleware/adminMiddleware';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/users', getUsers);
router.post('/users', createUser);
router.patch('/users/:id/status', updateUserStatus);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.get('/transactions', getTransactions);
router.get('/stats', getStats);
router.get('/monitoring', getMonitoring);

router.get('/notifications', getNotifications);
router.post('/notifications', createNotification);

router.get('/promotions', getPromotions);
router.post('/promotions', createPromotion);

export default router;
