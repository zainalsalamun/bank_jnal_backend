import { Router } from 'express';
import { resolveQris, payQris } from '../../controllers/qrisController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();
router.use(authenticate);

router.post('/resolve', resolveQris);
router.post('/payments', payQris);

export default router;
