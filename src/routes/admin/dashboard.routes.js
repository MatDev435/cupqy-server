import { Router } from 'express';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { Permissions } from '../../config/permissions.js';
import * as dashboardController from '../../controllers/dashboard.controller.js';
import { dashboardQuery } from '../../validators/dashboard.validator.js';

/** Dashboard de faturamento (US16) — somente administradores. */
const router = Router();

router.get(
  '/',
  authorize(Permissions.FINANCE_READ),
  validate({ query: dashboardQuery }),
  dashboardController.get,
);

export default router;
