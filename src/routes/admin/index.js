import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import usersRoutes from './users.routes.js';
import catalogRoutes from './catalog.routes.js';
import stockRoutes from './stock.routes.js';

/** Rotas do painel administrativo. Cada sub-rota aplica a sua própria permissão (RBAC). */
const router = Router();

router.use(authenticate);
router.use('/users', usersRoutes);
router.use('/stock', stockRoutes);
router.use(catalogRoutes);

export default router;
