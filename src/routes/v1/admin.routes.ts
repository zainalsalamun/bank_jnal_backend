import { Router } from 'express';
import { 
  getUsers, getUserById, createUser, updateUserStatus, updateUser, deleteUser, adminTopUpUser, 
  getTransactions, getTransactionById, getStats, getMonitoring,
  getNotifications, createNotification,
  getPromotions, createPromotion
} from '../../controllers/adminController';
import {
  getAllMerchants, getMerchantDetail, updateMerchantStatus, getAllMerchantTransactions, getMerchantGlobalStats
} from '../../controllers/merchant/merchantAdminController';
import { authenticate } from '../../middleware/authMiddleware';
import { requireAdmin, requireSuperAdmin } from '../../middleware/adminMiddleware';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/users', requireSuperAdmin, getUsers);
router.get('/users/:id', requireSuperAdmin, getUserById);
router.post('/users', requireSuperAdmin, createUser);
router.post('/users/:id/topup', requireSuperAdmin, adminTopUpUser);
router.patch('/users/:id/status', requireSuperAdmin, updateUserStatus);
router.patch('/users/:id', requireSuperAdmin, updateUser);
router.delete('/users/:id', requireSuperAdmin, deleteUser);
router.get('/transactions', requireSuperAdmin, getTransactions);
router.get('/transactions/:id', requireSuperAdmin, getTransactionById);
router.get('/stats', requireSuperAdmin, getStats);
router.get('/monitoring', requireSuperAdmin, getMonitoring);

// Merchant Management for Admin
router.get('/merchants', getAllMerchants);
router.get('/merchants/stats', getMerchantGlobalStats);
router.get('/merchants/transactions', getAllMerchantTransactions);
router.get('/merchants/:id', getMerchantDetail);
router.patch('/merchants/:id/status', updateMerchantStatus);

router.get('/notifications', getNotifications);
router.post('/notifications', createNotification);

router.get('/promotions', getPromotions);
router.post('/promotions', createPromotion);

export default router;
