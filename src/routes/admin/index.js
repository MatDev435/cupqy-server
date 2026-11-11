import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import usersRoutes from './users.routes.js';

/** Rotas do painel administrativo. Cada sub-rota aplica a sua própria permissão (RBAC). */
const router = Router();

router.use(authenticate);
router.use('/users', usersRoutes);

export default router;
