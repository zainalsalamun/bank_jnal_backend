import { Router } from 'express';
import { inquiryTransfer, transfer } from '../../controllers/transactionController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();
router.use(authenticate);

router.post('/inquiry', inquiryTransfer);
router.post('/', transfer);

export default router;
