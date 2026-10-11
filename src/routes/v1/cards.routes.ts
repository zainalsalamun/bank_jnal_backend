import { Router } from 'express';
import { getCards, createCard, updateLimit, freezeCard, unfreezeCard } from '../../controllers/cardsController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();
router.use(authenticate);

router.get('/', getCards);
router.post('/', createCard);
router.patch('/:cardId/limit', updateLimit);
router.post('/:cardId/freeze', freezeCard);
router.post('/:cardId/unfreeze', unfreezeCard);

export default router;
