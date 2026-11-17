import { randomUUID } from 'node:crypto';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/prisma.js';
import * as addressModel from '../models/address.model.js';
import * as orderModel from '../models/order.model.js';
import * as paymentModel from '../models/payment.model.js';
import * as profileModel from '../models/profile.model.js';
import * as stockModel from '../models/stock.model.js';
import { dateToDateOnly } from '../utils/dates.js';
import { centsToReais } from '../utils/money.js';
import { MAX_ADDRESSES_PER_USER } from './address.service.js';
import { KITCHEN_STATUSES, OrderStatus } from './orderStatus.js';
import * as gateway from './payments/mercadoPago.gateway.js';
import { storeToday } from './storeCalendar.service.js';

const PROVIDER = 'MERCADO_PAGO';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

const STATUS_MAP = {
  pending: 'PENDING',
  in_process: 'IN_PROCESS',
  authorized: 'AUTHORIZED',
  approved: 'APPROVED',
  in_mediation: 'IN_MEDIATION',
  rejected: 'REJECTED',
  cancelled: 'CANCELLED',
  refunded: 'REFUNDED',
  charged_back: 'CHARGED_BACK',
};

/** Resultado do processamento de um pagamento (útil para logs e testes). */
export const PaymentOutcome = Object.freeze({
  CONFIRMED: 'CONFIRMED',
  ALREADY_PROCESSED: 'ALREADY_PROCESSED',
  RECORDED: 'RECORDED',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  DUPLICATE_REFUNDED: 'DUPLICATE_REFUNDED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  IGNORED: 'IGNORED',
});

export function mapPaymentStatus(status) {
  return STATUS_MAP[status] ?? 'PENDING';
}

/**
 * Formas de pagamento do Checkout Pro: Pix e cartão de crédito (US10).
 * Boleto, lotérica, débito e pré-pago são excluídos.
 */
const EXCLUDED_PAYMENT_TYPES = ['ticket', 'atm', 'debit_card', 'prepaid_card'];

/** URL da tela do pedido no front-end (retorno do Checkout Pro). */
export function buildOrderUrl(orderId) {
  return `${config.frontend.url}${config.frontend.orderPath.replace(':orderId', orderId)}`;
}

/**
 * Monta a preferência do Checkout Pro a partir do pedido GRAVADO no banco
 * (valores calculados pelo servidor, nunca pelo front-end).
 */
/** Limite de caracteres aceito pelo Mercado Pago na descrição do item. */
const MAX_ITEM_DESCRIPTION_LENGTH = 256;

/**
 * Resumo legível do pedido (ex.: "Pedido #1042: 2× Chocolate, 1× Limão"), exibido
 * na tela do Checkout Pro, que costuma agrupar vários itens sob um rótulo genérico.
 */
export function buildOrderDescription(order) {
  const summary = order.items.map((item) => `${item.quantity}× ${item.cupcakeName}`).join(', ');
  const description = `Pedido #${order.orderNumber}: ${summary}`;
  return description.length > MAX_ITEM_DESCRIPTION_LENGTH
    ? `${description.slice(0, MAX_ITEM_DESCRIPTION_LENGTH - 1)}…`
    : description;
}

export function buildPreferenceBody(order, payer, now = new Date()) {
  const description = buildOrderDescription(order);
  const items = order.items.map((item) => ({
    id: item.cupcakeId,
    title: item.cupcakeName,
    description,
    quantity: item.quantity,
    unit_price: centsToReais(item.unitPriceCents),
    currency_id: 'BRL',
  }));

  if (order.deliveryFeeCents > 0) {
    items.push({
      id: 'delivery-fee',
      title: 'Taxa de entrega',
      description,
      quantity: 1,
      unit_price: centsToReais(order.deliveryFeeCents),
      currency_id: 'BRL',
    });
  }

  const orderUrl = buildOrderUrl(order.id);
  const expiresAt = order.paymentExpiresAt.toISOString();

  const body = {
    items,
    external_reference: order.id,
    metadata: { order_id: order.id, order_number: order.orderNumber },
    statement_descriptor: config.mercadoPago.statementDescriptor,
    back_urls: {
      success: `${orderUrl}?pagamento=sucesso`,
      pending: `${orderUrl}?pagamento=pendente`,
      failure: `${orderUrl}?pagamento=falha`,
    },
    expires: true,
    expiration_date_from: now.toISOString(),
    expiration_date_to: expiresAt,
    // Validade do Pix (pagamentos "em dinheiro") alinhada ao prazo do pedido.
    date_of_expiration: expiresAt,
    payment_methods: {
      excluded_payment_types: EXCLUDED_PAYMENT_TYPES.map((id) => ({ id })),
    },
  };

  // No sandbox o comprador deve ser um usuário de teste: não pré-preenchemos o pagador real.
  if (!config.mercadoPago.sandbox && payer?.email) {
    body.payer = { email: payer.email, name: payer.fullName ?? undefined };
  }

  // O Mercado Pago só aceita retorno automático e webhooks em URLs públicas HTTPS.
  if (config.frontend.url.startsWith('https://')) body.auto_return = 'approved';
  if (config.api.publicUrl?.startsWith('https://')) {
    body.notification_url = `${config.api.publicUrl}/api/v1/payments/webhooks/mercadopago?source_news=webhooks`;
  }

  return body;
}

/**
 * Cria a preferência de pagamento do pedido e retorna a URL do Checkout Pro.
 * @returns {Promise<{ preferenceId: string, checkoutUrl: string, sandbox: boolean, expiresAt: Date }>}
 */
export async function createCheckout(order, payer) {
  const preference = await gateway.createPreference(buildPreferenceBody(order, payer), {
    idempotencyKey: `preference-${order.id}-${randomUUID()}`,
  });

  await orderModel.setPreference(order.id, preference.id);

  const sandbox = config.mercadoPago.sandbox;
  return {
    preferenceId: preference.id,
    checkoutUrl: sandbox
      ? (preference.sandboxInitPoint ?? preference.initPoint)
      : preference.initPoint,
    sandbox,
    expiresAt: order.paymentExpiresAt,
  };
}

// ---------------------------------------------------------------------------
// Confirmação de pagamentos (webhook e sincronização)
// ---------------------------------------------------------------------------

async function cancelOrderTx(order, reason, note, tx) {
  await orderModel.update(
    order.id,
    { status: OrderStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: reason },
    tx,
  );
  await orderModel.addStatusHistory(
    { orderId: order.id, fromStatus: order.status, toStatus: OrderStatus.CANCELLED, note },
    tx,
  );
}

/** Marca o pagamento para reembolso. Retorna o registro, ou null se já foi reembolsado. */
async function markRefundPending(record, tx) {
  if (record.refundStatus === 'COMPLETED') return null;
  if (record.refundStatus === 'PENDING') return record;
  return paymentModel.update(record.id, { refundStatus: 'PENDING' }, tx);
}

/**
 * Devolve ao estoque os itens de um pedido pago, se a baixa foi feita no dia atual
 * (o estoque é diário: unidades de dias anteriores não voltam a ser vendáveis).
 */
export async function restockOrderTx(order, tx) {
  if (!order.stockDate) return false;
  const { date, dateOnly } = storeToday();
  if (dateToDateOnly(order.stockDate) !== dateOnly) return false;

  for (const item of order.items) {
    await stockModel.increment(item.cupcakeId, date, item.quantity, tx);
  }
  return true;
}

/** US09 — RN#03: salva o endereço de entrega no perfil quando o pedido é pago. */
async function saveDeliveryAddressTx(order, tx) {
  const profile = await profileModel.findById(order.userId, tx);
  if (!profile || profile.deletedAt) return;

  const total = await addressModel.countByUser(order.userId, tx);
  if (total >= MAX_ADDRESSES_PER_USER) return;

  const address = order.deliveryAddress;
  const saved = await addressModel.listByUser(order.userId, tx);
  const duplicate = saved.some(
    (existing) =>
      existing.zipCode === address.zipCode &&
      existing.street === address.street &&
      existing.number === address.number &&
      (existing.complement ?? null) === (address.complement ?? null),
  );
  if (duplicate) return;

  await addressModel.create(
    {
      userId: order.userId,
      zipCode: address.zipCode,
      street: address.street,
      number: address.number,
      complement: address.complement ?? null,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      isDefault: total === 0,
    },
    tx,
  );
}

/**
 * Confirma o pedido pago: baixa ATÔMICA do estoque do dia e status "Em preparo" (US10 RN#04,
 * US17 RN#01). As linhas de estoque ficam bloqueadas (FOR UPDATE) durante a verificação, de modo
 * que compras simultâneas nunca vendem além do disponível (US17 RNF#01).
 */
async function confirmOrderTx({ order, record, tx }) {
  const { dateOnly, date } = storeToday();
  const available = await stockModel.lockForUpdate(
    order.items.map((item) => item.cupcakeId),
    dateOnly,
    tx,
  );

  const shortages = order.items
    .filter((item) => (available.get(item.cupcakeId) ?? 0) < item.quantity)
    .map((item) => ({
      cupcakeId: item.cupcakeId,
      name: item.cupcakeName,
      requested: item.quantity,
      available: available.get(item.cupcakeId) ?? 0,
    }));

  if (shortages.length > 0) {
    await cancelOrderTx(
      order,
      'OUT_OF_STOCK',
      'Estoque insuficiente na confirmação do pagamento; valor reembolsado',
      tx,
    );
    return {
      outcome: PaymentOutcome.OUT_OF_STOCK,
      shortages,
      refundRecord: await markRefundPending(record, tx),
    };
  }

  for (const item of order.items) {
    const decremented = await stockModel.decrement(item.cupcakeId, date, item.quantity, tx);
    if (!decremented) throw new Error(`Falha na baixa de estoque do cupcake ${item.cupcakeId}`);
  }

  await orderModel.update(
    order.id,
    { status: OrderStatus.IN_PREPARATION, paidAt: new Date(), stockDate: date },
    tx,
  );
  await orderModel.addStatusHistory(
    {
      orderId: order.id,
      fromStatus: OrderStatus.AWAITING_PAYMENT,
      toStatus: OrderStatus.IN_PREPARATION,
      note: 'Pagamento aprovado',
    },
    tx,
  );

  if (order.saveAddress && order.deliveryAddress) await saveDeliveryAddressTx(order, tx);

  return { outcome: PaymentOutcome.CONFIRMED };
}

async function handleApprovedTx({ order, record, previous, payment, tx }) {
  if (order.status === OrderStatus.AWAITING_PAYMENT) {
    // Nunca confiar em valores externos: o valor pago deve ser exatamente o total do pedido.
    if (payment.currency !== 'BRL' || payment.amountCents !== order.totalCents) {
      logger.error(
        { orderId: order.id, paid: payment.amountCents, expected: order.totalCents },
        'Valor pago diferente do total do pedido',
      );
      await cancelOrderTx(
        order,
        'PAYMENT_AMOUNT_MISMATCH',
        'Valor pago diferente do total do pedido; valor reembolsado',
        tx,
      );
      return {
        outcome: PaymentOutcome.AMOUNT_MISMATCH,
        refundRecord: await markRefundPending(record, tx),
      };
    }
    return confirmOrderTx({ order, record, tx });
  }

  if (previous?.status === 'APPROVED') {
    // Notificação repetida: nada muda (apenas retenta um reembolso pendente ou que falhou).
    const retry = ['PENDING', 'FAILED'].includes(record.refundStatus) ? record : null;
    return { outcome: PaymentOutcome.ALREADY_PROCESSED, refundRecord: retry };
  }

  // Pagamento aprovado para pedido cancelado/expirado ou já pago por outro pagamento.
  logger.warn({ orderId: order.id, paymentId: payment.id }, 'Pagamento excedente será reembolsado');
  return {
    outcome: PaymentOutcome.DUPLICATE_REFUNDED,
    refundRecord: await markRefundPending(record, tx),
  };
}

/** Estorno ou chargeback de um pagamento que já tinha confirmado o pedido. */
async function handleReversalTx({ order, record, previous, tx }) {
  if (previous?.status === record.status) return { outcome: PaymentOutcome.ALREADY_PROCESSED };

  if (record.status === 'REFUNDED' && record.refundStatus !== 'COMPLETED') {
    await paymentModel.update(record.id, { refundStatus: 'COMPLETED', refundedAt: new Date() }, tx);
  }

  if (previous?.status === 'APPROVED' && KITCHEN_STATUSES.includes(order.status)) {
    await restockOrderTx(order, tx);
    await cancelOrderTx(order, 'PAYMENT_REFUNDED', 'Pagamento estornado no Mercado Pago', tx);
    return { outcome: PaymentOutcome.ORDER_CANCELLED };
  }

  return { outcome: PaymentOutcome.RECORDED };
}

/** Solicita o reembolso total de um pagamento registrado (idempotente). */
export async function refundPaymentRecord(record) {
  try {
    await gateway.refundPayment(record.providerPaymentId, {
      idempotencyKey: `refund-${record.providerPaymentId}`,
    });
    await paymentModel.update(record.id, { refundStatus: 'COMPLETED', refundedAt: new Date() });
    logger.info({ paymentId: record.providerPaymentId }, 'Pagamento reembolsado');
  } catch (error) {
    // Fica como FAILED: uma nova notificação ou sincronização tentará de novo.
    logger.error({ err: error, paymentId: record.providerPaymentId }, 'Falha ao reembolsar');
    await paymentModel.update(record.id, { refundStatus: 'FAILED' });
  }
}

/**
 * Aplica o estado de um pagamento consultado NO GATEWAY ao pedido correspondente.
 *
 * Idempotente e seguro contra concorrência:
 * - a linha do pedido é bloqueada, serializando notificações simultâneas;
 * - o pagamento é único por (provedor, id do pagamento);
 * - transições de status só ocorrem a partir do estado esperado;
 * - reembolsos usam chave de idempotência.
 *
 * @param {ReturnType<typeof gateway.normalizePayment>} payment
 * @param {{ expectedOrderId?: string }} [options]
 */
export async function applyPayment(payment, { expectedOrderId } = {}) {
  const orderId = payment.externalReference;
  if (!UUID_PATTERN.test(orderId ?? '') || (expectedOrderId && orderId !== expectedOrderId)) {
    logger.warn({ paymentId: payment.id, orderId }, 'Pagamento sem pedido correspondente');
    return { outcome: PaymentOutcome.IGNORED };
  }

  const result = await prisma.$transaction(async (tx) => {
    if (!(await orderModel.lockById(orderId, tx))) {
      return { outcome: PaymentOutcome.IGNORED };
    }
    const order = await orderModel.findById(orderId, tx);
    const previous = await paymentModel.findByProviderId(PROVIDER, payment.id, tx);

    const record = await paymentModel.upsert(
      {
        provider: PROVIDER,
        providerPaymentId: payment.id,
        orderId,
        status: mapPaymentStatus(payment.status),
        statusDetail: payment.statusDetail,
        paymentMethodId: payment.paymentMethodId,
        paymentTypeId: payment.paymentTypeId,
        amountCents: payment.amountCents,
        approvedAt: payment.approvedAt,
      },
      tx,
    );

    if (record.status === 'APPROVED') {
      return handleApprovedTx({ order, record, previous, payment, tx });
    }
    if (record.status === 'REFUNDED' || record.status === 'CHARGED_BACK') {
      return handleReversalTx({ order, record, previous, tx });
    }
    return { outcome: PaymentOutcome.RECORDED };
  }, TRANSACTION_OPTIONS);

  if (result.refundRecord) await refundPaymentRecord(result.refundRecord);

  logger.info(
    { orderId, paymentId: payment.id, status: payment.status, outcome: result.outcome },
    'Pagamento processado',
  );
  return result;
}

/** Notificação do webhook: consulta o pagamento no Mercado Pago e aplica ao pedido. */
export async function processPaymentNotification(paymentId) {
  const payment = await gateway.getPayment(paymentId);
  if (!payment) {
    logger.warn({ paymentId }, 'Pagamento notificado não encontrado no Mercado Pago');
    return { outcome: PaymentOutcome.IGNORED };
  }
  return applyPayment(payment);
}

/**
 * Sincroniza os pagamentos de um pedido diretamente com o Mercado Pago.
 * Usado no retorno do Checkout Pro e como alternativa quando o webhook atrasa.
 */
export async function syncOrderPayments(orderId, { paymentId } = {}) {
  let payments;
  if (paymentId) {
    const payment = await gateway.getPayment(paymentId);
    payments = payment ? [payment] : [];
  } else {
    payments = await gateway.searchPaymentsByReference(orderId);
  }

  // Do mais antigo para o mais recente: o primeiro aprovado confirma; os demais são reembolsados.
  const ordered = [...payments].sort(
    (a, b) => (a.approvedAt?.getTime() ?? Infinity) - (b.approvedAt?.getTime() ?? Infinity),
  );
  const outcomes = [];
  for (const payment of ordered) {
    outcomes.push((await applyPayment(payment, { expectedOrderId: orderId })).outcome);
  }
  return outcomes;
}
