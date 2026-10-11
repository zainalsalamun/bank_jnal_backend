import { Router } from 'express';
import { 
  getPockets, 
  createPocket, 
  getPocketById, 
  updatePocket, 
  transferBetweenPockets, 
  deletePocket 
} from '../../controllers/pocketController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.get('/', getPockets);
router.post('/', createPocket);
router.post('/transfer', transferBetweenPockets);
router.get('/:pocketId', getPocketById);
router.patch('/:pocketId', updatePocket);
router.delete('/:pocketId', deletePocket);

export default router;
