import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';
import { createCupcake, createPaidOrder } from '../helpers/factories.js';

const app = createApp();
// Quarta-feira, 11/11/2026, 15:00 em São Paulo.
const NOW = new Date('2026-11-11T18:00:00Z');

describe('Dashboard financeiro (/api/v1/admin/dashboard)', () => {
  let admin;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    await resetDatabase();
    admin = await createUser({ role: 'ADMIN' });
    const customer = await createUser();
    const chocolate = await createCupcake({ name: 'Chocolate', priceCents: 1000 });
    const lemon = await createCupcake({ name: 'Limão', priceCents: 1000 });

    const completed = (quantity, completedAt, extra = {}) =>
      createPaidOrder({
        userId: customer.id,
        items: [{ cupcake: extra.cupcake ?? chocolate, quantity }],
        status: 'COMPLETED',
        paidAt: new Date(completedAt.getTime() - 30 * 60 * 1000),
        completedAt,
        createdAt: new Date(completedAt.getTime() - 40 * 60 * 1000),
        fulfillmentType: extra.fulfillmentType ?? 'PICKUP',
      });

    // Hoje (11/11, 11:00 local) — retirada, R$ 20,00
    await completed(2, new Date('2026-11-11T14:00:00Z'));
    // Segunda 09/11 às 23:30 local (já é 10/11 em UTC) — delivery, R$ 10,00 + R$ 5,00
    await completed(1, new Date('2026-11-10T02:30:00Z'), {
      fulfillmentType: 'DELIVERY',
      cupcake: lemon,
    });
    // 01/11 — fora da semana, dentro do mês, R$ 30,00
    await completed(3, new Date('2026-11-01T12:00:00Z'));
    // 31/10 — fora do mês
    await completed(1, new Date('2026-10-31T12:00:00Z'));

    // Em andamento (pago hoje), cancelado hoje e aguardando pagamento: não contam no faturamento
    await createPaidOrder({
      userId: customer.id,
      items: [{ cupcake: chocolate, quantity: 1 }],
      paidAt: new Date('2026-11-11T17:00:00Z'),
      createdAt: new Date('2026-11-11T16:50:00Z'),
    });
    await prisma.order.create({
      data: {
        userId: customer.id,
        fulfillmentType: 'PICKUP',
        status: 'CANCELLED',
        subtotalCents: 4000,
        totalCents: 4000,
        cancelledAt: new Date('2026-11-11T15:00:00Z'),
        createdAt: new Date('2026-11-11T14:30:00Z'),
      },
    });
    await prisma.order.create({
      data: {
        userId: customer.id,
        fulfillmentType: 'PICKUP',
        subtotalCents: 9900,
        totalCents: 9900,
        createdAt: new Date('2026-11-11T17:30:00Z'),
      },
    });
  });

  afterEach(() => vi.useRealTimers());

  const dashboard = (period, user = admin) => {
    const path = period ? `/api/v1/admin/dashboard?period=${period}` : '/api/v1/admin/dashboard';
    return request(app).get(path).set('Authorization', user.authHeader);
  };

  it('restringe aos administradores', async () => {
    expect((await dashboard('today', await createUser({ role: 'BAKER' }))).status).toBe(403);
  });

  it('hoje: soma apenas pedidos concluídos no dia (US16 RN#01)', async () => {
    const response = await dashboard();

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toMatchObject({
      period: 'today',
      timeZone: 'America/Sao_Paulo',
      range: { startDate: '2026-11-11', endDate: '2026-11-11' },
      revenueCents: 2000,
      completedOrders: 1,
      averageTicketCents: 2000,
      inProgress: { orders: 1, amountCents: 1000 },
      cancelledOrders: 1,
      daily: [{ date: '2026-11-11', revenueCents: 2000, completedOrders: 1 }],
    });
    expect(response.body.data.ordersByStatus).toMatchObject({
      COMPLETED: 1,
      IN_PREPARATION: 1,
      CANCELLED: 1,
      AWAITING_PAYMENT: 1,
    });
  });

  it('semana: de segunda até hoje, respeitando o fuso da loja', async () => {
    const response = await dashboard('week');

    expect(response.body.data).toMatchObject({
      range: { startDate: '2026-11-09', endDate: '2026-11-15' },
      revenueCents: 3500,
      completedOrders: 2,
      averageTicketCents: 1750,
      revenueByFulfillment: { DELIVERY: 1500, PICKUP: 2000 },
      daily: [
        { date: '2026-11-09', revenueCents: 1500, completedOrders: 1 },
        { date: '2026-11-10', revenueCents: 0, completedOrders: 0 },
        { date: '2026-11-11', revenueCents: 2000, completedOrders: 1 },
      ],
    });
  });

  it('mês: inclui todo o mês vigente e os cupcakes mais vendidos', async () => {
    const response = await dashboard('month');

    expect(response.body.data).toMatchObject({
      range: { startDate: '2026-11-01', endDate: '2026-11-30' },
      revenueCents: 6500,
      completedOrders: 3,
    });
    expect(response.body.data.daily).toHaveLength(11);
    expect(response.body.data.topCupcakes).toEqual([
      expect.objectContaining({ name: 'Chocolate', quantity: 5, revenueCents: 5000 }),
      expect.objectContaining({ name: 'Limão', quantity: 1, revenueCents: 1000 }),
    ]);
  });

  it('valida o período', async () => {
    expect((await dashboard('year')).status).toBe(400);
  });
});
