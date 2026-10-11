import { Router } from 'express';
import { inquiryTransfer, transfer, getSavedAccounts, saveAccount, deleteSavedAccount } from '../../controllers/transactionController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();
router.use(authenticate);

router.get('/saved', getSavedAccounts);
router.post('/saved', saveAccount);
router.delete('/saved/:id', deleteSavedAccount);
router.post('/inquiry', inquiryTransfer);
router.post('/', transfer);

export default router;
