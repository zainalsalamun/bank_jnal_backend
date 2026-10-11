import { Router } from 'express';
import { getTransactions, getTransactionById, topUpPocket, getTransactionAnalytics, getAccountStatement } from '../../controllers/transactionController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();
router.use(authenticate);

router.get('/', getTransactions);
router.get('/statement', getAccountStatement);
router.post('/topup', topUpPocket);
router.get('/analytics', getTransactionAnalytics);
router.get('/:transactionId', getTransactionById);

export default router;
