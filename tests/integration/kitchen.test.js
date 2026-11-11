import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';
import { createCupcake, createPaidOrder } from '../helpers/factories.js';

const app = createApp();
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000);

describe('Painel da cozinha (/api/v1/kitchen)', () => {
  let baker;
  let customer;
  let chocolate;

  beforeEach(async () => {
    await resetDatabase();
    baker = await createUser({ role: 'BAKER' });
    customer = await createUser({ fullName: 'Ana Souza' });
    chocolate = await createCupcake({ name: 'Chocolate', priceCents: 1000 });
  });

  const asBaker = (method, path, user = baker) => {
    const agent = request(app);
    return agent[method](`/api/v1/kitchen${path}`).set('Authorization', user.authHeader);
  };

  const paidOrder = (overrides = {}) =>
    createPaidOrder({
      userId: customer.id,
      items: [{ cupcake: chocolate, quantity: 2 }],
      ...overrides,
    });

  it('bloqueia clientes (US13 RNF#01) e libera confeiteiros e administradores', async () => {
    expect((await asBaker('get', '/orders', customer)).status).toBe(403);
    expect((await asBaker('get', '/orders')).status).toBe(200);
    expect((await asBaker('get', '/orders', await createUser({ role: 'ADMIN' }))).status).toBe(200);
  });

  it('lista apenas pedidos pagos e ativos, dos mais antigos aos mais recentes (US13 RN#01/RN#02)', async () => {
    const recent = await paidOrder({ paidAt: minutesAgo(5) });
    const oldest = await paidOrder({
      paidAt: minutesAgo(40),
      fulfillmentType: 'DELIVERY',
      notes: 'Sem granulado',
    });
    const ready = await paidOrder({ paidAt: minutesAgo(20), status: 'AWAITING_PICKUP' });
    await paidOrder({ status: 'COMPLETED', completedAt: new Date() });
    await paidOrder({ status: 'CANCELLED' });
    await prisma.order.create({
      data: {
        userId: customer.id,
        fulfillmentType: 'PICKUP',
        subtotalCents: 1000,
        totalCents: 1000,
      },
    });

    const response = await asBaker('get', '/orders');

    expect(response.body.data.map((order) => order.id)).toEqual([oldest.id, ready.id, recent.id]);
    expect(response.body.meta.summary).toEqual({
      IN_PREPARATION: 2,
      AWAITING_COURIER: 0,
      OUT_FOR_DELIVERY: 0,
      AWAITING_PICKUP: 1,
    });

    const card = response.body.data[0];
    expect(card).toMatchObject({
      orderNumber: oldest.orderNumber,
      fulfillmentType: 'DELIVERY',
      items: [{ name: 'Chocolate', quantity: 2 }],
      totalItems: 2,
      notes: 'Sem granulado',
      customer: { name: 'Ana Souza' },
      delivery: { address: { street: 'Avenida Paulista' }, courierName: null },
      nextAction: {
        nextStatus: 'AWAITING_COURIER',
        label: 'Pronto — chamar entregador',
        requiresCourierName: false,
      },
    });
    expect(card.elapsedMinutes).toBeGreaterThanOrEqual(39);
  });

  it('filtra por status e tipo de entrega', async () => {
    await paidOrder({ fulfillmentType: 'DELIVERY' });
    const pickup = await paidOrder();

    const response = await asBaker('get', '/orders?fulfillmentType=PICKUP&status=IN_PREPARATION');
    expect(response.body.data.map((order) => order.id)).toEqual([pickup.id]);
  });

  describe('avanço de status (US14)', () => {
    const advance = (order, body = {}, user = baker) =>
      asBaker('post', `/orders/${order.id}/advance`, user).send(body);

    it('retirada: Em preparo → Pronto para retirada → Concluído', async () => {
      const order = await paidOrder();

      const ready = await advance(order);
      expect(ready.body.data).toMatchObject({
        status: 'AWAITING_PICKUP',
        nextAction: { nextStatus: 'COMPLETED', label: 'Retirado pelo cliente' },
      });

      const done = await advance(order);
      expect(done.body.data).toMatchObject({ status: 'COMPLETED', nextAction: null });

      const stored = await prisma.order.findUnique({
        where: { id: order.id },
        include: { statusHistory: { orderBy: { createdAt: 'asc' } } },
      });
      expect(stored.completedAt).toBeInstanceOf(Date);
      expect(stored.statusHistory.slice(-2)).toEqual([
        expect.objectContaining({ toStatus: 'AWAITING_PICKUP', changedById: baker.id }),
        expect.objectContaining({ toStatus: 'COMPLETED', changedById: baker.id }),
      ]);
    });

    it('delivery: exige o nome do entregador ao sair para entrega e o exibe ao cliente', async () => {
      const order = await paidOrder({ fulfillmentType: 'DELIVERY' });
      await advance(order).expect(200);

      const withoutCourier = await advance(order);
      expect(withoutCourier.status).toBe(400);
      expect(withoutCourier.body.error.code).toBe('COURIER_NAME_REQUIRED');

      const out = await advance(order, { courierName: 'João Motoboy' });
      expect(out.body.data).toMatchObject({
        status: 'OUT_FOR_DELIVERY',
        delivery: { courierName: 'João Motoboy' },
        nextAction: { nextStatus: 'COMPLETED', label: 'Entregue' },
      });

      const customerView = await request(app)
        .get(`/api/v1/orders/${order.id}`)
        .set('Authorization', customer.authHeader);
      expect(customerView.body.data).toMatchObject({
        status: 'OUT_FOR_DELIVERY',
        statusLabel: 'Saiu para entrega',
        delivery: { courierName: 'João Motoboy' },
      });

      await advance(order).expect(200);
      expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('COMPLETED');
    });

    it('não avança pedidos concluídos, cancelados ou não pagos (US14 RN#02)', async () => {
      const completed = await paidOrder({ status: 'COMPLETED' });
      const cancelled = await paidOrder({ status: 'CANCELLED' });
      const unpaid = await prisma.order.create({
        data: {
          userId: customer.id,
          fulfillmentType: 'PICKUP',
          subtotalCents: 1000,
          totalCents: 1000,
        },
      });

      expect((await advance(completed)).body.error.code).toBe('ORDER_CANNOT_ADVANCE');
      expect((await advance(cancelled)).body.error.code).toBe('ORDER_CANNOT_ADVANCE');
      expect((await advance(unpaid)).status).toBe(404);
    });

    it('detecta quando outra pessoa já atualizou o pedido', async () => {
      const order = await paidOrder();
      await advance(order);

      const stale = await advance(order, { expectedStatus: 'IN_PREPARATION' });

      expect(stale.status).toBe(409);
      expect(stale.body.error).toMatchObject({
        code: 'ORDER_STATUS_CHANGED',
        details: { currentStatus: 'AWAITING_PICKUP' },
      });
    });

    it('cliques simultâneos não pulam etapas', async () => {
      const order = await paidOrder();
      const otherBaker = await createUser({ role: 'BAKER' });

      const responses = await Promise.all([
        advance(order, { expectedStatus: 'IN_PREPARATION' }),
        advance(order, { expectedStatus: 'IN_PREPARATION' }, otherBaker),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe(
        'AWAITING_PICKUP',
      );
    });

    it('impede clientes de alterar status', async () => {
      const order = await paidOrder();
      expect((await advance(order, {}, customer)).status).toBe(403);
    });
  });
});
