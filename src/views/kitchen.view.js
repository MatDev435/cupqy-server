import { STATUS_LABELS } from '../services/orderStatus.js';
import { nextAction } from '../services/kitchen.service.js';

/** Cartão do pedido no painel da cozinha (US13 — CA#03/CA#04). */
export function toKitchenOrder(order, now = new Date()) {
  const paidAt = order.paidAt ?? order.createdAt;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status],
    fulfillmentType: order.fulfillmentType,
    paidAt: order.paidAt,
    elapsedMinutes: Math.max(0, Math.floor((now.getTime() - paidAt.getTime()) / 60_000)),
    items: order.items.map((item) => ({ name: item.cupcakeName, quantity: item.quantity })),
    totalItems: order.items.reduce((sum, item) => sum + item.quantity, 0),
    notes: order.notes,
    customer: { name: order.user?.fullName ?? null, phone: order.user?.phone ?? null },
    delivery:
      order.fulfillmentType === 'DELIVERY'
        ? { address: order.deliveryAddress, courierName: order.courierName }
        : null,
    nextAction: nextAction(order),
  };
}
