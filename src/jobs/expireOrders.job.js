import { logger } from '../config/logger.js';
import { prisma } from '../config/prisma.js';
import * as orderModel from '../models/order.model.js';
import { OrderStatus } from '../services/orderStatus.js';
import * as paymentService from '../services/payment.service.js';

/** Tolerância após o prazo, para notificações de pagamento em trânsito. */
const GRACE_PERIOD_MS = 60 * 1000;
const BATCH_SIZE = 50;

async function cancelIfStillAwaiting(orderId) {
  return prisma.$transaction(async (tx) => {
    const cancelled = await orderModel.updateIfStatus(
      orderId,
      [OrderStatus.AWAITING_PAYMENT],
      {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: 'PAYMENT_EXPIRED',
      },
      tx,
    );
    if (cancelled) {
      await orderModel.addStatusHistory(
        {
          orderId,
          fromStatus: OrderStatus.AWAITING_PAYMENT,
          toStatus: OrderStatus.CANCELLED,
          note: 'Prazo de pagamento expirado',
        },
        tx,
      );
    }
    return cancelled;
  });
}

/**
 * Cancela pedidos não pagos dentro do prazo (US10 — RN#02).
 * Antes de cancelar, sincroniza com o Mercado Pago para não perder um pagamento aprovado
 * cujo webhook não chegou. Se o gateway estiver indisponível, cancela mesmo assim: um pagamento
 * aprovado que chegue depois é reembolsado automaticamente.
 *
 * @returns {Promise<{ checked: number, cancelled: number, confirmed: number }>}
 */
export async function expireUnpaidOrders(now = new Date()) {
  const expired = await orderModel.findExpiredAwaitingPayment(
    new Date(now.getTime() - GRACE_PERIOD_MS),
    BATCH_SIZE,
  );

  let cancelled = 0;
  let confirmed = 0;

  for (const order of expired) {
    try {
      const outcomes = await paymentService.syncOrderPayments(order.id);
      if (outcomes.includes(paymentService.PaymentOutcome.CONFIRMED)) {
        confirmed += 1;
        continue;
      }
    } catch (error) {
      logger.warn(
        { err: error, orderId: order.id },
        'Não foi possível sincronizar antes de expirar',
      );
    }

    if (await cancelIfStillAwaiting(order.id)) {
      cancelled += 1;
      logger.info({ orderId: order.id, orderNumber: order.orderNumber }, 'Pedido expirado');
    }
  }

  return { checked: expired.length, cancelled, confirmed };
}
