import { Router } from 'express';
import { 
  createPosOrder, 
  getMerchantOrders, 
  getDailySummary, 
  getTransferAccount, 
  getTransferMutations 
} from '../../../controllers/merchant/merchantTransactionController';
import { authenticate } from '../../../middleware/authMiddleware';

const router = Router();
router.use(authenticate);

router.post('/pos/checkout', createPosOrder);
router.get('/orders', getMerchantOrders);
router.get('/summary/daily', getDailySummary);
router.get('/transfer-account', getTransferAccount);
router.get('/transfer-mutations', getTransferMutations);

export default router;
