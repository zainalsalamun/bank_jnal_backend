import { Router } from 'express';
import { getNotifications, markRead } from '../../controllers/notificationController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();
router.use(authenticate);

router.get('/', getNotifications);
router.post('/:notificationId/read', markRead);

export default router;
