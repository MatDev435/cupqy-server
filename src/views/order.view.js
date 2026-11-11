import { config } from '../config/env.js';
import { STATUS_LABELS, flowFor } from '../services/orderStatus.js';

const PAYMENT_METHOD_LABELS = {
  pix: 'Pix',
  bank_transfer: 'Pix',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  account_money: 'Saldo Mercado Pago',
};

function toPaymentResponse(payment) {
  if (!payment) return null;
  return {
    id: payment.id,
    provider: payment.provider,
    status: payment.status,
    statusDetail: payment.statusDetail,
    method: payment.paymentMethodId,
    type: payment.paymentTypeId,
    methodLabel:
      PAYMENT_METHOD_LABELS[payment.paymentMethodId] ??
      PAYMENT_METHOD_LABELS[payment.paymentTypeId] ??
      null,
    amountCents: payment.amountCents,
    approvedAt: payment.approvedAt,
    refundStatus: payment.refundStatus,
  };
}

/** Pagamento mais relevante: o aprovado; senão, a tentativa mais recente. */
function mainPayment(payments = []) {
  return payments.find((payment) => payment.status === 'APPROVED') ?? payments[0] ?? null;
}

function toItemResponse(item) {
  return {
    id: item.id,
    cupcakeId: item.cupcakeId,
    name: item.cupcakeName,
    unitPriceCents: item.unitPriceCents,
    quantity: item.quantity,
    subtotalCents: item.subtotalCents,
  };
}

/** Linha do tempo do acompanhamento (US11 — CA#03). */
function toProgress(order) {
  if (order.status === 'CANCELLED') return [];
  const reachedAt = new Map(order.statusHistory.map((entry) => [entry.toStatus, entry.createdAt]));
  const flow = flowFor(order.fulfillmentType);
  const currentIndex = flow.indexOf(order.status);

  return flow.map((status, index) => ({
    status,
    label: STATUS_LABELS[status],
    reachedAt: reachedAt.get(status) ?? null,
    done: index <= currentIndex,
    current: index === currentIndex,
  }));
}

export function toOrderSummary(order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status],
    fulfillmentType: order.fulfillmentType,
    totalCents: order.totalCents,
    itemsCount: order.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    items: order.items?.map((item) => ({ name: item.cupcakeName, quantity: item.quantity })) ?? [],
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    completedAt: order.completedAt,
    cancelledAt: order.cancelledAt,
  };
}

/**
 * Detalhes completos do pedido. Informações de entrega só aparecem para delivery e o nome do
 * entregador só após a saída para entrega (US11 — CA#04 e RN#01).
 */
export function toOrderDetail(order) {
  const isDelivery = order.fulfillmentType === 'DELIVERY';
  const courierVisible = isDelivery && ['OUT_FOR_DELIVERY', 'COMPLETED'].includes(order.status);

  return {
    ...toOrderSummary(order),
    subtotalCents: order.subtotalCents,
    deliveryFeeCents: order.deliveryFeeCents,
    notes: order.notes,
    estimatedMinutes: order.estimatedMinutes,
    delivery: isDelivery
      ? {
          address: order.deliveryAddress,
          distanceKm: order.deliveryDistanceKm,
          courierName: courierVisible ? order.courierName : null,
        }
      : null,
    pickup: isDelivery ? null : { address: config.store.address },
    items: order.items.map(toItemResponse),
    payment: toPaymentResponse(mainPayment(order.payments)),
    paymentExpiresAt: order.status === 'AWAITING_PAYMENT' ? order.paymentExpiresAt : null,
    cancellationReason: order.cancellationReason,
    progress: toProgress(order),
    statusHistory: order.statusHistory.map((entry) => ({
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      label: STATUS_LABELS[entry.toStatus],
      note: entry.note,
      createdAt: entry.createdAt,
    })),
    updatedAt: order.updatedAt,
  };
}
