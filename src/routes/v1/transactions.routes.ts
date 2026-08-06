import { Router } from 'express';
import { getTransactions, getTransactionById } from '../../controllers/transactionController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();
router.use(authenticate);

router.get('/', getTransactions);
router.get('/:transactionId', getTransactionById);

export default router;
