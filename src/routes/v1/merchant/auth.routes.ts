import { Router } from 'express';
import { registerMerchant, loginMerchant, getMerchantProfile } from '../../../controllers/merchant/merchantAuthController';
import { authenticate } from '../../../middleware/authMiddleware';

const router = Router();

router.post('/register', authenticate, registerMerchant);
router.post('/login', loginMerchant);
router.get('/profile', authenticate, getMerchantProfile);

export default router;
