import { config } from '../config/env.js';
import * as paymentService from '../services/payment.service.js';
import { verifyWebhookSignature } from '../services/payments/webhookSignature.js';
import { AppError } from '../utils/AppError.js';

/**
 * Webhook do Mercado Pago (notificações de pagamento).
 * 1. Valida a assinatura (x-signature) com o segredo configurado.
 * 2. Consulta o pagamento no Mercado Pago (o corpo da notificação não é confiável).
 * 3. Aplica ao pedido de forma idempotente.
 * Erros 5xx fazem o Mercado Pago reenviar a notificação.
 */
export async function mercadoPagoWebhook(req, res) {
  const secret = config.mercadoPago.webhookSecret;
  if (!secret) {
    throw AppError.serviceUnavailable(
      'Webhook do Mercado Pago não configurado.',
      'WEBHOOK_NOT_CONFIGURED',
    );
  }

  const dataId = req.query['data.id'] ?? req.body?.data?.id;
  const valid = verifyWebhookSignature({
    signatureHeader: req.get('x-signature'),
    requestId: req.get('x-request-id'),
    dataId,
    secret,
  });
  if (!valid) {
    throw AppError.unauthorized('Assinatura do webhook inválida.', 'INVALID_WEBHOOK_SIGNATURE');
  }

  const type = req.query.type ?? req.body?.type;
  if (type !== 'payment' || !dataId) {
    return res.status(200).json({ received: true, ignored: true });
  }

  const result = await paymentService.processPaymentNotification(String(dataId));
  return res.status(200).json({ received: true, outcome: result.outcome });
}
