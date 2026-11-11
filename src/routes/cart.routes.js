import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import * as cartController from '../controllers/cart.controller.js';
import { validateCartBody } from '../validators/cart.validator.js';

/** O carrinho é mantido no front-end; a API valida preços e estoque atuais (US08). */
const router = Router();

router.post('/cart/validate', validate({ body: validateCartBody }), cartController.validate);

export default router;
