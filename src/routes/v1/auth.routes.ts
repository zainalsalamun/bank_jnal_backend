import { Router } from 'express';
import { login, refresh, logout } from '../../controllers/authController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);

export default router;
