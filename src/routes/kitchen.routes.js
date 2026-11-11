import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { Permissions } from '../config/permissions.js';
import * as kitchenController from '../controllers/kitchen.controller.js';
import {
  advanceOrderBody,
  kitchenOrderParams,
  kitchenOrdersQuery,
} from '../validators/kitchen.validator.js';

/** Painel da cozinha (US13/US14) — confeiteiros e administradores. */
const router = Router();

router.use(authenticate, authorize(Permissions.KITCHEN_ACCESS));

router.get('/orders', validate({ query: kitchenOrdersQuery }), kitchenController.list);
router.post(
  '/orders/:orderId/advance',
  validate({ params: kitchenOrderParams, body: advanceOrderBody }),
  kitchenController.advance,
);

export default router;
