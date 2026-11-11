import { Router } from 'express';
import pkg from '../../package.json' with { type: 'json' };
import userRoutes from './user.routes.js';
import adminRoutes from './admin/index.js';
import catalogRoutes from './catalog.routes.js';
import shippingRoutes from './shipping.routes.js';
import cartRoutes from './cart.routes.js';
import orderRoutes from './order.routes.js';
import paymentRoutes from './payment.routes.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ data: { name: pkg.name, version: pkg.version, docs: '/api/docs' } });
});

router.use(catalogRoutes);
router.use(shippingRoutes);
router.use(cartRoutes);
router.use(paymentRoutes);
router.use('/users', userRoutes);
router.use('/orders', orderRoutes);
router.use('/admin', adminRoutes);

export default router;
