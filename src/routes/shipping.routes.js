import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { createRateLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import * as shippingController from '../controllers/shipping.controller.js';
import { cepParams, shippingQuoteBody } from '../validators/shipping.validator.js';

const router = Router();

// Protege as APIs externas de CEP/geocodificação contra uso abusivo.
const externalLookupLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: 'Muitas consultas de endereço. Aguarde alguns minutos.',
});

router.get('/store', shippingController.getStore);
router.get(
  '/shipping/cep/:cep',
  externalLookupLimiter,
  validate({ params: cepParams }),
  shippingController.lookupCep,
);
router.post(
  '/shipping/quote',
  authenticate,
  externalLookupLimiter,
  validate({ body: shippingQuoteBody }),
  shippingController.quote,
);

export default router;
