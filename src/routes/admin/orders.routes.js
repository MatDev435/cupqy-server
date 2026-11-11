import { Router } from 'express';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { Permissions } from '../../config/permissions.js';
import * as orderAdminController from '../../controllers/orderAdmin.controller.js';
import {
  adminCancelOrderBody,
  adminOrderParams,
  listAdminOrdersQuery,
} from '../../validators/orderAdmin.validator.js';

/** Gestão de pedidos pelo administrador. */
const router = Router();

router.use(authorize(Permissions.ORDERS_MANAGE));

router.get('/', validate({ query: listAdminOrdersQuery }), orderAdminController.list);
router.get('/:orderId', validate({ params: adminOrderParams }), orderAdminController.get);
router.post(
  '/:orderId/cancel',
  validate({ params: adminOrderParams, body: adminCancelOrderBody }),
  orderAdminController.cancel,
);

export default router;
