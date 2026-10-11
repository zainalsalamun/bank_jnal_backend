import { Router } from 'express';
import authRoutes from './auth.routes';
import qrisRoutes from './qris.routes';
import productsRoutes from './products.routes';
import transactionsRoutes from './transactions.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/qris', qrisRoutes);
router.use('/products', productsRoutes);
router.use('/transactions', transactionsRoutes);

export default router;
