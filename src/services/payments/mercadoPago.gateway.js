/**
 * Adaptador do SDK oficial do Mercado Pago (Checkout Pro).
 * Isola a biblioteca externa: o restante da aplicação lida apenas com objetos normalizados.
 */
import {
  MPNotFoundError,
  MercadoPagoConfig,
  Payment,
  PaymentRefund,
  Preference,
} from 'mercadopago';
import { config } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../utils/AppError.js';
import { reaisToCents } from '../../utils/money.js';

let client;

function getClient() {
  if (!config.mercadoPago.accessToken) {
    throw AppError.serviceUnavailable(
      'Pagamentos indisponíveis: integração com o Mercado Pago não configurada.',
      'PAYMENTS_NOT_CONFIGURED',
    );
  }
  client ??= new MercadoPagoConfig({
    accessToken: config.mercadoPago.accessToken,
    options: { timeout: config.mercadoPago.timeoutMs },
  });
  return client;
}

function providerError(error, action) {
  logger.error({ err: error, action }, 'Falha na comunicação com o Mercado Pago');
  return AppError.badGateway(
    'Não foi possível comunicar com o Mercado Pago. Tente novamente em instantes.',
    'PAYMENT_PROVIDER_ERROR',
  );
}

/** Converte o pagamento da API do Mercado Pago para o formato interno. */
export function normalizePayment(payment) {
  return {
    id: String(payment.id),
    status: payment.status,
    statusDetail: payment.status_detail ?? null,
    externalReference: payment.external_reference ?? null,
    amountCents: reaisToCents(payment.transaction_amount ?? 0),
    currency: payment.currency_id ?? null,
    paymentMethodId: payment.payment_method_id ?? null,
    paymentTypeId: payment.payment_type_id ?? null,
    approvedAt: payment.date_approved ? new Date(payment.date_approved) : null,
    liveMode: payment.live_mode ?? null,
  };
}

/** Cria uma preferência do Checkout Pro. */
export async function createPreference(body, { idempotencyKey }) {
  const preferenceClient = new Preference(getClient());
  try {
    const preference = await preferenceClient.create({
      body,
      requestOptions: { idempotencyKey },
    });
    return {
      id: preference.id,
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
    };
  } catch (error) {
    throw providerError(error, 'createPreference');
  }
}

/** Consulta um pagamento (fonte da verdade). Retorna null se não existir. */
export async function getPayment(paymentId) {
  const paymentClient = new Payment(getClient());
  try {
    return normalizePayment(await paymentClient.get({ id: paymentId }));
  } catch (error) {
    if (error instanceof MPNotFoundError || error?.status === 404) return null;
    throw providerError(error, 'getPayment');
  }
}

/** Pagamentos vinculados a um pedido (external_reference = id do pedido). */
export async function searchPaymentsByReference(externalReference) {
  const paymentClient = new Payment(getClient());
  try {
    const result = await paymentClient.search({
      options: { external_reference: externalReference, sort: 'date_created', criteria: 'desc' },
    });
    return (result.results ?? []).map(normalizePayment);
  } catch (error) {
    throw providerError(error, 'searchPayments');
  }
}

/** Reembolso total de um pagamento (idempotente pela chave informada). */
export async function refundPayment(paymentId, { idempotencyKey }) {
  const refundClient = new PaymentRefund(getClient());
  try {
    const refund = await refundClient.create({
      payment_id: paymentId,
      body: {},
      requestOptions: { idempotencyKey },
    });
    return { id: String(refund.id), status: refund.status };
  } catch (error) {
    throw providerError(error, 'refundPayment');
  }
}
