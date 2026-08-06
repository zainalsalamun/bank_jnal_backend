import { Router } from 'express';
import { getCards, updateLimit, freezeCard, unfreezeCard } from '../../controllers/cardsController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();
router.use(authenticate);

router.get('/', getCards);
router.patch('/:cardId/limit', updateLimit);
router.post('/:cardId/freeze', freezeCard);
router.post('/:cardId/unfreeze', unfreezeCard);

export default router;
