import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';
import { createCupcake, createPaidOrder, setStock } from '../helpers/factories.js';
import { fakeMercadoPago } from '../helpers/fakeMercadoPago.js';
import { addDays } from '../../src/utils/dates.js';
import { storeToday } from '../../src/services/storeCalendar.service.js';
import { dateOnlyToDate } from '../../src/utils/dates.js';

const app = createApp();

describe('Gestão de pedidos (/api/v1/admin/orders)', () => {
  let admin;
  let customer;
  let cupcake;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createUser({ role: 'ADMIN' });
    customer = await createUser({ fullName: 'Ana Souza', email: 'ana@cupqy.test' });
    cupcake = await createCupcake({ name: 'Chocolate', priceCents: 1000, stock: 10 });
  });

  const asAdmin = (method, path = '', user = admin) => {
    const agent = request(app);
    return agent[method](`/api/v1/admin/orders${path}`).set('Authorization', user.authHeader);
  };

  async function paidOrderWithPayment(quantity = 2) {
    const order = await createPaidOrder({ userId: customer.id, items: [{ cupcake, quantity }] });
    await setStock(cupcake.id, 10 - quantity);
    const payment = fakeMercadoPago.createPayment({
      orderId: order.id,
      amountCents: order.totalCents,
    });
    await prisma.payment.create({
      data: {
        orderId: order.id,
        providerPaymentId: payment.id,
        status: 'APPROVED',
        amountCents: order.totalCents,
        paymentMethodId: 'pix',
        approvedAt: new Date(),
      },
    });
    return { order, payment };
  }

  it('restringe a administradores', async () => {
    expect((await asAdmin('get', '', await createUser({ role: 'BAKER' }))).status).toBe(403);
  });

  it('lista todos os pedidos com cliente e filtros por status, tipo, número e período', async () => {
    const pickup = await createPaidOrder({
      userId: customer.id,
      items: [{ cupcake, quantity: 1 }],
    });
    const delivery = await createPaidOrder({
      userId: customer.id,
      items: [{ cupcake, quantity: 2 }],
      fulfillmentType: 'DELIVERY',
      status: 'COMPLETED',
    });

    const all = await asAdmin('get');
    expect(all.body.meta.total).toBe(2);
    expect(all.body.data[0]).toMatchObject({
      id: delivery.id,
      customer: { name: 'Ana Souza', email: 'ana@cupqy.test' },
      deliveryFeeCents: 500,
    });

    expect((await asAdmin('get', '?status=COMPLETED')).body.data.map((o) => o.id)).toEqual([
      delivery.id,
    ]);
    expect((await asAdmin('get', '?fulfillmentType=PICKUP')).body.data.map((o) => o.id)).toEqual([
      pickup.id,
    ]);
    expect((await asAdmin('get', `?orderNumber=${pickup.orderNumber}`)).body.data).toHaveLength(1);

    const today = storeToday().dateOnly;
    expect((await asAdmin('get', `?from=${today}&to=${today}`)).body.meta.total).toBe(2);
    expect((await asAdmin('get', `?from=${addDays(today, 1)}`)).body.meta.total).toBe(0);
    expect((await asAdmin('get', `?from=${today}&to=${addDays(today, -1)}`)).status).toBe(400);
  });

  it('detalha qualquer pedido', async () => {
    const order = await createPaidOrder({ userId: customer.id, items: [{ cupcake, quantity: 1 }] });
    const response = await asAdmin('get', `/${order.id}`);
    expect(response.body.data).toMatchObject({ id: order.id, status: 'IN_PREPARATION' });
  });

  it('cancela pedido pago: reembolsa e devolve os itens ao estoque do dia', async () => {
    const { order, payment } = await paidOrderWithPayment(3);

    const response = await asAdmin('post', `/${order.id}/cancel`).send({ reason: 'Forno quebrou' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'ADMIN_REQUEST',
    });
    expect(response.body.data.statusHistory.at(-1).note).toBe('Cancelado pela loja: Forno quebrou');
    expect(fakeMercadoPago.refunds()).toEqual([
      expect.objectContaining({ paymentId: payment.id, idempotencyKey: `refund-${payment.id}` }),
    ]);
    const record = await prisma.payment.findFirst({ where: { orderId: order.id } });
    expect(record.refundStatus).toBe('COMPLETED');
    expect((await prisma.dailyStock.findFirst({ where: { cupcakeId: cupcake.id } })).quantity).toBe(
      10,
    );
  });

  it('não devolve ao estoque itens baixados em dias anteriores', async () => {
    const { order } = await paidOrderWithPayment(2);
    await prisma.order.update({
      where: { id: order.id },
      data: { stockDate: dateOnlyToDate(addDays(storeToday().dateOnly, -1)) },
    });

    await asAdmin('post', `/${order.id}/cancel`).send({}).expect(200);

    expect((await prisma.dailyStock.findFirst({ where: { cupcakeId: cupcake.id } })).quantity).toBe(
      8,
    );
  });

  it('cancela pedido aguardando pagamento sem reembolso', async () => {
    const order = await prisma.order.create({
      data: {
        userId: customer.id,
        fulfillmentType: 'PICKUP',
        subtotalCents: 1000,
        totalCents: 1000,
      },
    });

    await asAdmin('post', `/${order.id}/cancel`).send({}).expect(200);

    expect(fakeMercadoPago.refunds()).toEqual([]);
  });

  it('não cancela pedidos finalizados', async () => {
    const order = await createPaidOrder({
      userId: customer.id,
      items: [{ cupcake, quantity: 1 }],
      status: 'COMPLETED',
    });

    const response = await asAdmin('post', `/${order.id}/cancel`).send({});
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ORDER_ALREADY_FINALIZED');
  });
});
