import { Router } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { createRateLimiter } from '../middlewares/rateLimit.js';
import * as paymentController from '../controllers/payment.controller.js';

const router = Router();

const webhookLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  limit: 300,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip)}`,
});

// Rota pública chamada pelo Mercado Pago (autenticada pela assinatura HMAC).
router.post('/payments/webhooks/mercadopago', webhookLimiter, paymentController.mercadoPagoWebhook);

export default router;
