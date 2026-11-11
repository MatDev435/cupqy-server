/**
 * Substituto em memória de src/services/payments/mercadoPago.gateway.js.
 * Permite simular o cliente pagando no Checkout Pro sem acessar o Mercado Pago.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { AppError } from '../../src/utils/AppError.js';

const state = {
  preferences: [],
  payments: new Map(),
  refunds: [],
  failures: new Set(),
};

function failIfRequested(method) {
  if (state.failures.has(method)) {
    state.failures.delete(method);
    throw AppError.badGateway(
      'Não foi possível comunicar com o Mercado Pago. Tente novamente em instantes.',
      'PAYMENT_PROVIDER_ERROR',
    );
  }
}

export const fakeMercadoPago = {
  reset() {
    state.preferences.length = 0;
    state.payments.clear();
    state.refunds.length = 0;
    state.failures.clear();
  },

  failNext(method) {
    state.failures.add(method);
  },

  preferences() {
    return [...state.preferences];
  },

  lastPreference() {
    return state.preferences.at(-1);
  },

  /** Simula um pagamento realizado no Checkout Pro para um pedido. */
  createPayment({
    orderId,
    amountCents,
    status = 'approved',
    paymentMethodId = 'pix',
    paymentTypeId = 'bank_transfer',
    currency = 'BRL',
    id = String(randomInt(10_000_000, 99_999_999)),
  }) {
    const payment = {
      id,
      status,
      statusDetail: status === 'approved' ? 'accredited' : status,
      externalReference: orderId,
      amountCents,
      currency,
      paymentMethodId,
      paymentTypeId,
      approvedAt: status === 'approved' ? new Date() : null,
      liveMode: false,
    };
    state.payments.set(id, payment);
    return payment;
  },

  setPaymentStatus(id, status) {
    const payment = state.payments.get(id);
    payment.status = status;
    payment.statusDetail = status;
    if (status === 'approved') payment.approvedAt = new Date();
  },

  refunds() {
    return [...state.refunds];
  },
};

export async function createPreference(body, { idempotencyKey }) {
  failIfRequested('createPreference');
  const id = `pref-${randomUUID()}`;
  state.preferences.push({ id, body, idempotencyKey });
  return {
    id,
    initPoint: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${id}`,
    sandboxInitPoint: `https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=${id}`,
  };
}

export async function getPayment(paymentId) {
  failIfRequested('getPayment');
  const payment = state.payments.get(String(paymentId));
  return payment ? { ...payment } : null;
}

export async function searchPaymentsByReference(externalReference) {
  failIfRequested('searchPaymentsByReference');
  return [...state.payments.values()]
    .filter((payment) => payment.externalReference === externalReference)
    .map((payment) => ({ ...payment }));
}

export async function refundPayment(paymentId, { idempotencyKey }) {
  failIfRequested('refundPayment');
  const previous = state.refunds.find((refund) => refund.idempotencyKey === idempotencyKey);
  if (previous) return { id: previous.id, status: 'approved' };

  const refund = { id: `refund-${randomUUID()}`, paymentId: String(paymentId), idempotencyKey };
  state.refunds.push(refund);
  const payment = state.payments.get(String(paymentId));
  if (payment) payment.status = 'refunded';
  return { id: refund.id, status: 'approved' };
}
