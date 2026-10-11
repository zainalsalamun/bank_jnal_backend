import { Router } from 'express';
import { login, register, refresh, logout, forgotPassword, verifyOtp, resetPassword } from '../../controllers/authController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);

export default router;
