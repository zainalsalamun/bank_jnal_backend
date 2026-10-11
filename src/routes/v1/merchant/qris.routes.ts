import { Router } from 'express';
import { createDynamicQris, getStaticQris, checkOrderStatus } from '../../../controllers/merchant/merchantQrisController';
import { authenticate } from '../../../middleware/authMiddleware';

const router = Router();

router.post('/dynamic', authenticate, createDynamicQris);
router.get('/static', authenticate, getStaticQris);
router.get('/orders/:orderNumber', authenticate, checkOrderStatus);

export default router;
