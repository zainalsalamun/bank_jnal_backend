import { Router } from 'express';
import { getNotifications, markRead, markAllRead } from '../../controllers/notificationController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();
router.use(authenticate);

router.get('/', getNotifications);
router.post('/read-all', markAllRead);
router.post('/:notificationId/read', markRead);
router.patch('/:notificationId/read', markRead);

export default router;
