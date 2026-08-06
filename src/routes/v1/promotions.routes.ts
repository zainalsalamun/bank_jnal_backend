import { Router } from 'express';
import { getPromotions } from '../../controllers/promotionController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();
router.use(authenticate);

router.get('/', getPromotions);

export default router;
