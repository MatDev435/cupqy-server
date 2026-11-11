import { Router } from 'express';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { Permissions } from '../../config/permissions.js';
import * as stockController from '../../controllers/stock.controller.js';
import {
  setSingleStockBody,
  setStockBody,
  stockDateQuery,
  stockParams,
} from '../../validators/stock.validator.js';

/** Controle de estoque diário (US17) — somente administradores. */
const router = Router();

router.use(authorize(Permissions.STOCK_MANAGE));

router.get('/', validate({ query: stockDateQuery }), stockController.overview);
router.get('/alerts', validate({ query: stockDateQuery }), stockController.alerts);
router.put('/', validate({ body: setStockBody }), stockController.setMany);
router.put(
  '/:cupcakeId',
  validate({ params: stockParams, body: setSingleStockBody }),
  stockController.setOne,
);

export default router;
