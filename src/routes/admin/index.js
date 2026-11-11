import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import usersRoutes from './users.routes.js';
import stockRoutes from './stock.routes.js';
import ordersRoutes from './orders.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import catalogRoutes from './catalog.routes.js';

/** Rotas do painel administrativo. Cada sub-rota aplica a sua própria permissão (RBAC). */
const router = Router();

router.use(authenticate);
router.use('/users', usersRoutes);
router.use('/stock', stockRoutes);
router.use('/orders', ordersRoutes);
router.use('/dashboard', dashboardRoutes);
// Catálogo por último: suas rotas ficam na raiz de /admin (cupcakes, categories, dietary-tags).
router.use(catalogRoutes);

export default router;
