import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { expireUnpaidOrders } from '../../src/jobs/expireOrders.job.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';
import { createCupcake } from '../helpers/factories.js';
import { fakeMercadoPago } from '../helpers/fakeMercadoPago.js';

const app = createApp();

describe('Expiração de pedidos não pagos (US10 RN#02)', () => {
  let customer;
  let cupcake;

  beforeEach(async () => {
    await resetDatabase();
    customer = await createUser();
    cupcake = await createCupcake({ priceCents: 1000, stock: 10 });
  });

  async function placeOrder({ expiredMinutesAgo } = {}) {
    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', customer.authHeader)
      .send({ fulfillmentType: 'PICKUP', items: [{ cupcakeId: cupcake.id, quantity: 1 }] });
    const order = response.body.data;
    if (expiredMinutesAgo !== undefined) {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentExpiresAt: new Date(Date.now() - expiredMinutesAgo * 60 * 1000) },
      });
    }
    return order;
  }

  it('cancela pedidos vencidos sem pagamento e mantém os que ainda estão no prazo', async () => {
    const expired = await placeOrder({ expiredMinutesAgo: 5 });
    const onTime = await placeOrder();

    const result = await expireUnpaidOrders();

    expect(result).toEqual({ checked: 1, cancelled: 1, confirmed: 0 });
    const stored = await prisma.order.findUnique({
      where: { id: expired.id },
      include: { statusHistory: true },
    });
    expect(stored).toMatchObject({ status: 'CANCELLED', cancellationReason: 'PAYMENT_EXPIRED' });
    expect(stored.statusHistory.at(-1).note).toBe('Prazo de pagamento expirado');
    expect((await prisma.order.findUnique({ where: { id: onTime.id } })).status).toBe(
      'AWAITING_PAYMENT',
    );
  });

  it('respeita a tolerância para notificações em trânsito', async () => {
    await placeOrder({ expiredMinutesAgo: 0.5 });
    expect((await expireUnpaidOrders()).checked).toBe(0);
  });

  it('confirma em vez de cancelar quando o pagamento foi aprovado mas o webhook não chegou', async () => {
    const order = await placeOrder({ expiredMinutesAgo: 5 });
    fakeMercadoPago.createPayment({ orderId: order.id, amountCents: order.totalCents });

    const result = await expireUnpaidOrders();

    expect(result).toEqual({ checked: 1, cancelled: 0, confirmed: 1 });
    expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe(
      'IN_PREPARATION',
    );
  });

  it('cancela mesmo se o Mercado Pago estiver indisponível', async () => {
    const order = await placeOrder({ expiredMinutesAgo: 5 });
    fakeMercadoPago.failNext('searchPaymentsByReference');

    const result = await expireUnpaidOrders();

    expect(result.cancelled).toBe(1);
    expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('CANCELLED');
  });

  it('um pagamento aprovado que chega após a expiração é reembolsado', async () => {
    const order = await placeOrder({ expiredMinutesAgo: 5 });
    await expireUnpaidOrders();
    const late = fakeMercadoPago.createPayment({
      orderId: order.id,
      amountCents: order.totalCents,
    });

    await request(app)
      .post(`/api/v1/orders/${order.id}/payment/sync`)
      .set('Authorization', customer.authHeader)
      .send({ paymentId: late.id });

    expect(fakeMercadoPago.refunds()).toEqual([expect.objectContaining({ paymentId: late.id })]);
    expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('CANCELLED');
  });
});
