import { Router } from 'express';
import pkg from '../../package.json' with { type: 'json' };
import userRoutes from './user.routes.js';
import adminRoutes from './admin/index.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ data: { name: pkg.name, version: pkg.version, docs: '/api/docs' } });
});

router.use('/users', userRoutes);
router.use('/admin', adminRoutes);

export default router;
