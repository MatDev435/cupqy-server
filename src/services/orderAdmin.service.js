import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/prisma.js';
import * as orderModel from '../models/order.model.js';
import * as paymentModel from '../models/payment.model.js';
import { AppError } from '../utils/AppError.js';
import { startOfLocalDay, addDays } from '../utils/dates.js';
import { buildPageMeta, toSkipTake } from '../utils/pagination.js';
import { orderNotFound } from './order.service.js';
import { OrderStatus, isFinal } from './orderStatus.js';
import { refundPaymentRecord, restockOrderTx } from './payment.service.js';

/** Listagem geral de pedidos para o administrador. */
export async function listOrders({
  status,
  fulfillmentType,
  from,
  to,
  orderNumber,
  page,
  pageSize,
}) {
  const timeZone = config.store.timeZone;
  const { items, total } = await orderModel.searchAll({
    statuses: status,
    fulfillmentType,
    orderNumber,
    from: from ? startOfLocalDay(from, timeZone) : undefined,
    to: to ? startOfLocalDay(addDays(to, 1), timeZone) : undefined,
    ...toSkipTake({ page, pageSize }),
  });
  return { items, meta: buildPageMeta({ page, pageSize }, total) };
}

export async function getOrder(orderId) {
  const order = await orderModel.findById(orderId);
  if (!order) throw orderNotFound();
  return order;
}

/**
 * Cancelamento pelo administrador (ex.: imprevisto na cozinha).
 * Pedidos pagos têm o pagamento reembolsado e os itens devolvidos ao estoque do dia.
 */
export async function cancelOrder(actor, orderId, { reason }) {
  const order = await orderModel.findById(orderId);
  if (!order) throw orderNotFound();
  if (isFinal(order.status)) {
    throw AppError.conflict('Este pedido já foi finalizado.', 'ORDER_ALREADY_FINALIZED');
  }

  const refunds = await prisma.$transaction(async (tx) => {
    await orderModel.lockById(orderId, tx);
    const current = await orderModel.findById(orderId, tx);
    if (isFinal(current.status)) {
      throw AppError.conflict('Este pedido já foi finalizado.', 'ORDER_ALREADY_FINALIZED');
    }

    const wasPaid = current.status !== OrderStatus.AWAITING_PAYMENT;
    if (wasPaid) await restockOrderTx(current, tx);

    await orderModel.update(
      orderId,
      {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: 'ADMIN_REQUEST',
      },
      tx,
    );
    await orderModel.addStatusHistory(
      {
        orderId,
        fromStatus: current.status,
        toStatus: OrderStatus.CANCELLED,
        changedById: actor.id,
        note: reason ? `Cancelado pela loja: ${reason}` : 'Cancelado pela loja',
      },
      tx,
    );

    const approved = await paymentModel.findApprovedByOrder(orderId, tx);
    const pending = [];
    for (const payment of approved.filter((record) => record.refundStatus !== 'COMPLETED')) {
      pending.push(await paymentModel.update(payment.id, { refundStatus: 'PENDING' }, tx));
    }
    return pending;
  });

  for (const record of refunds) await refundPaymentRecord(record);

  logger.info(
    { orderId, actorId: actor.id, refunds: refunds.length },
    'Pedido cancelado pela loja',
  );
  return orderModel.findById(orderId);
}
