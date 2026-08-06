import { Router } from 'express';
import { getUsers, getTransactions } from '../../controllers/adminController';
import { authenticate } from '../../middleware/authMiddleware';
import { requireAdmin } from '../../middleware/adminMiddleware';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/users', getUsers);
router.get('/transactions', getTransactions);

export default router;
