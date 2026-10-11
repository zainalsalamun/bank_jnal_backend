import { Router } from 'express';
import { getProducts, createProduct, updateProduct, deleteProduct } from '../../../controllers/merchant/merchantProductController';
import { authenticate } from '../../../middleware/authMiddleware';

const router = Router();
router.use(authenticate);

router.get('/', getProducts);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);

export default router;
