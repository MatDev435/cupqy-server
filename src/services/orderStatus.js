/**
 * Status dos pedidos e o fluxo logístico (US10 RN#03/RN#04, US11, US14 RN#01).
 *
 * DELIVERY: Aguardando Pagamento → Em Preparo → Aguardando Entregador → Em Rota → Concluído
 * PICKUP:   Aguardando Pagamento → Em Preparo → Aguardando Retirada → Concluído
 * Cancelado: a partir de qualquer status não final.
 */

export const OrderStatus = Object.freeze({
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  IN_PREPARATION: 'IN_PREPARATION',
  AWAITING_COURIER: 'AWAITING_COURIER',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  AWAITING_PICKUP: 'AWAITING_PICKUP',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});

export const STATUS_LABELS = Object.freeze({
  AWAITING_PAYMENT: 'Aguardando pagamento',
  IN_PREPARATION: 'Em preparo',
  AWAITING_COURIER: 'Aguardando entregador',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  AWAITING_PICKUP: 'Pronto para retirada',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
});

export const FINAL_STATUSES = [OrderStatus.COMPLETED, OrderStatus.CANCELLED];

/** Pedidos pagos que a cozinha precisa acompanhar (US13). */
export const KITCHEN_STATUSES = [
  OrderStatus.IN_PREPARATION,
  OrderStatus.AWAITING_COURIER,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.AWAITING_PICKUP,
];

const FLOWS = {
  DELIVERY: [
    OrderStatus.AWAITING_PAYMENT,
    OrderStatus.IN_PREPARATION,
    OrderStatus.AWAITING_COURIER,
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.COMPLETED,
  ],
  PICKUP: [
    OrderStatus.AWAITING_PAYMENT,
    OrderStatus.IN_PREPARATION,
    OrderStatus.AWAITING_PICKUP,
    OrderStatus.COMPLETED,
  ],
};

export function isFinal(status) {
  return FINAL_STATUSES.includes(status);
}

/** Sequência de status do tipo de entrega. */
export function flowFor(fulfillmentType) {
  return FLOWS[fulfillmentType];
}

/**
 * Próximo status no fluxo da cozinha (botão de ação rápida — US14).
 * O pagamento (AWAITING_PAYMENT → IN_PREPARATION) é confirmado apenas pelo gateway.
 * @returns {string | null}
 */
export function nextKitchenStatus(fulfillmentType, status) {
  if (!KITCHEN_STATUSES.includes(status)) return null;
  const flow = FLOWS[fulfillmentType];
  const index = flow.indexOf(status);
  return index >= 0 && index < flow.length - 1 ? flow[index + 1] : null;
}
