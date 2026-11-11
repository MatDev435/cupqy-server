import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { createRateLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import { Permissions } from '../config/permissions.js';
import * as orderController from '../controllers/order.controller.js';
import {
  createOrderBody,
  listOrdersQuery,
  orderParams,
  syncPaymentBody,
} from '../validators/order.validator.js';

const router = Router();

const checkoutLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: 'Muitas tentativas de finalizar pedidos. Aguarde alguns minutos.',
});

const paymentSyncLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: 'Muitas consultas de pagamento. Aguarde alguns instantes.',
});

router.use(authenticate);

router.post(
  '/',
  authorize(Permissions.ORDERS_CREATE),
  checkoutLimiter,
  validate({ body: createOrderBody }),
  orderController.create,
);
router.get(
  '/',
  authorize(Permissions.ORDERS_READ_OWN),
  validate({ query: listOrdersQuery }),
  orderController.list,
);
router.get(
  '/:orderId',
  authorize(Permissions.ORDERS_READ_OWN),
  validate({ params: orderParams }),
  orderController.get,
);
router.post(
  '/:orderId/payment',
  authorize(Permissions.ORDERS_CREATE),
  checkoutLimiter,
  validate({ params: orderParams }),
  orderController.startPayment,
);
router.post(
  '/:orderId/payment/sync',
  authorize(Permissions.ORDERS_READ_OWN),
  paymentSyncLimiter,
  validate({ params: orderParams, body: syncPaymentBody }),
  orderController.syncPayment,
);
router.post(
  '/:orderId/cancel',
  authorize(Permissions.ORDERS_READ_OWN),
  validate({ params: orderParams }),
  orderController.cancel,
);

export default router;
