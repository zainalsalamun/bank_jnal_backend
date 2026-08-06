import { Router } from 'express';
import { getPockets, createPocket, getPocketById, updatePocket } from '../../controllers/pocketController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', getPockets);
router.post('/', createPocket);
router.get('/:pocketId', getPocketById);
router.patch('/:pocketId', updatePocket);

export default router;
