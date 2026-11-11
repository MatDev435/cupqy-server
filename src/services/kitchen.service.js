import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import * as orderModel from '../models/order.model.js';
import { AppError } from '../utils/AppError.js';
import { KITCHEN_STATUSES, OrderStatus, STATUS_LABELS, nextKitchenStatus } from './orderStatus.js';

/** Texto do botão de ação rápida conforme o próximo passo (US14 — CA#02). */
const ACTION_LABELS = {
  'DELIVERY:AWAITING_COURIER': 'Pronto — chamar entregador',
  'PICKUP:AWAITING_PICKUP': 'Pronto para retirada',
  'DELIVERY:OUT_FOR_DELIVERY': 'Saiu para entrega',
  'DELIVERY:COMPLETED': 'Entregue',
  'PICKUP:COMPLETED': 'Retirado pelo cliente',
};

export function nextAction(order) {
  const nextStatus = nextKitchenStatus(order.fulfillmentType, order.status);
  if (!nextStatus) return null;
  return {
    nextStatus,
    label: ACTION_LABELS[`${order.fulfillmentType}:${nextStatus}`],
    requiresCourierName: nextStatus === OrderStatus.OUT_FOR_DELIVERY,
  };
}

/** Fila da cozinha (US13): pedidos pagos e ativos, os mais antigos primeiro. */
export async function listKitchenOrders({ status, fulfillmentType }) {
  const statuses = status ? [status] : KITCHEN_STATUSES;
  const orders = await orderModel.findForKitchen({ statuses, fulfillmentType });

  const summary = Object.fromEntries(KITCHEN_STATUSES.map((value) => [value, 0]));
  for (const order of orders) summary[order.status] += 1;

  return { orders, summary };
}

/**
 * Avança o pedido para a próxima etapa do fluxo logístico (US14 — RN#01/RN#02).
 * Controle otimista: a atualização só ocorre se o status não mudou desde a leitura
 * (dois confeiteiros clicando ao mesmo tempo não pulam etapas).
 */
export async function advanceOrder(actor, orderId, { expectedStatus, courierName }) {
  const order = await orderModel.findByIdForKitchen(orderId);
  if (!order || order.status === OrderStatus.AWAITING_PAYMENT) {
    // Pedidos não pagos não fazem parte da cozinha.
    throw AppError.notFound('Pedido não encontrado na cozinha.', 'ORDER_NOT_IN_KITCHEN');
  }
  if (expectedStatus && expectedStatus !== order.status) {
    throw AppError.conflict(
      'O pedido foi atualizado por outra pessoa. Atualize o painel.',
      'ORDER_STATUS_CHANGED',
      { currentStatus: order.status },
    );
  }

  const action = nextAction(order);
  if (!action) {
    throw AppError.conflict(
      `O pedido está "${STATUS_LABELS[order.status]}" e não pode avançar.`,
      'ORDER_CANNOT_ADVANCE',
    );
  }
  if (action.requiresCourierName && !courierName) {
    throw AppError.badRequest(
      'Informe o nome do entregador para registrar a saída para entrega.',
      'COURIER_NAME_REQUIRED',
    );
  }

  const data = { status: action.nextStatus };
  if (action.requiresCourierName) data.courierName = courierName;
  if (action.nextStatus === OrderStatus.COMPLETED) data.completedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const updated = await orderModel.updateIfStatus(orderId, [order.status], data, tx);
    if (!updated) {
      throw AppError.conflict(
        'O pedido foi atualizado por outra pessoa. Atualize o painel.',
        'ORDER_STATUS_CHANGED',
      );
    }
    await orderModel.addStatusHistory(
      {
        orderId,
        fromStatus: order.status,
        toStatus: action.nextStatus,
        changedById: actor.id,
        note: action.requiresCourierName ? `Entregador: ${courierName}` : action.label,
      },
      tx,
    );
  });

  logger.info(
    { orderId, from: order.status, to: action.nextStatus, actorId: actor.id },
    'Status do pedido atualizado pela cozinha',
  );
  return orderModel.findByIdForKitchen(orderId);
}
