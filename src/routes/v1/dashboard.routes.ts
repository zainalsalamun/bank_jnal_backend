import { Router } from 'express';
import { getDashboard } from '../../controllers/dashboardController';
import { authenticate } from '../../middleware/authMiddleware';

const router = Router();

router.get('/', authenticate, getDashboard);

export default router;
