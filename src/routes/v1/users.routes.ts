import { Router } from 'express';
import { getProfile, updateProfile, updatePin, updatePassword } from '../../controllers/userController';
import { getShortcuts, updateShortcuts } from '../../controllers/shortcutController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', getProfile);
router.patch('/', updateProfile);
router.put('/security/pin', updatePin);
router.put('/security/password', updatePassword);

router.get('/shortcuts', getShortcuts);
router.post('/shortcuts', updateShortcuts);

export default router;
