import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { dateOnlyToDate } from '../../src/utils/dates.js';

async function createCustomer() {
  return prisma.profile.create({
    data: { id: crypto.randomUUID(), email: 'cliente@cupqy.test', fullName: 'Cliente' },
  });
}

async function createCupcake(overrides = {}) {
  return prisma.cupcake.create({
    data: {
      name: 'Chocolate',
      description: 'Cupcake de chocolate',
      flavor: 'Chocolate',
      ingredients: 'Farinha, cacau',
      priceCents: 990,
      ...overrides,
    },
  });
}

describe('Banco de dados (PostgreSQL real)', () => {
  beforeEach(resetDatabase);

  it('GET /health/ready confirma a conexão com o banco', async () => {
    const response = await request(createApp()).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body.checks).toEqual([{ name: 'database', status: 'ok' }]);
  });

  it('numera pedidos a partir de 1001', async () => {
    const user = await createCustomer();
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        fulfillmentType: 'PICKUP',
        subtotalCents: 990,
        totalCents: 990,
      },
    });

    expect(order.orderNumber).toBe(1001);
  });

  it('impede preço zerado ou negativo (US15 RN#02)', async () => {
    await expect(createCupcake({ priceCents: 0 })).rejects.toThrow(/cupcakes_price_positive/);
  });

  it('impede estoque negativo', async () => {
    const cupcake = await createCupcake();
    await expect(
      prisma.dailyStock.create({
        data: { cupcakeId: cupcake.id, date: dateOnlyToDate('2026-11-11'), quantity: -1 },
      }),
    ).rejects.toThrow(/daily_stock_quantity_non_negative/);
  });

  it('garante consistência do total do pedido e frete zero na retirada', async () => {
    const user = await createCustomer();
    const base = { userId: user.id, subtotalCents: 1000 };

    await expect(
      prisma.order.create({ data: { ...base, fulfillmentType: 'PICKUP', totalCents: 900 } }),
    ).rejects.toThrow(/orders_total_consistent/);

    await expect(
      prisma.order.create({
        data: { ...base, fulfillmentType: 'PICKUP', deliveryFeeCents: 500, totalCents: 1500 },
      }),
    ).rejects.toThrow(/orders_pickup_without_fee/);

    await expect(
      prisma.order.create({ data: { ...base, fulfillmentType: 'DELIVERY', totalCents: 1000 } }),
    ).rejects.toThrow(/orders_delivery_has_address/);
  });

  it('impede remover fisicamente um cupcake que já foi vendido (US15 RN#01)', async () => {
    const user = await createCustomer();
    const cupcake = await createCupcake();
    await prisma.order.create({
      data: {
        userId: user.id,
        fulfillmentType: 'PICKUP',
        subtotalCents: 990,
        totalCents: 990,
        items: {
          create: {
            cupcakeId: cupcake.id,
            cupcakeName: cupcake.name,
            unitPriceCents: 990,
            quantity: 1,
            subtotalCents: 990,
          },
        },
      },
    });

    await expect(prisma.cupcake.delete({ where: { id: cupcake.id } })).rejects.toThrow();
  });

  it('permite apenas um endereço padrão por usuário', async () => {
    const user = await createCustomer();
    const address = {
      userId: user.id,
      zipCode: '01310100',
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      isDefault: true,
    };

    await prisma.address.create({ data: address });
    await expect(prisma.address.create({ data: address })).rejects.toThrow();
  });
});

describe('Fuso horário do banco', () => {
  it('a sessão usa UTC, então instantes gravados pelo Prisma batem com o SQL', async () => {
    const [{ timezone }] = await prisma.$queryRaw`SELECT current_setting('TimeZone') AS timezone`;
    expect(timezone).toBe('UTC');

    const profile = await prisma.profile.create({
      data: { id: crypto.randomUUID(), deletedAt: new Date('2026-11-10T02:30:00Z') },
    });
    const [{ epoch }] = await prisma.$queryRaw`
      SELECT extract(epoch FROM deleted_at)::bigint AS epoch FROM profiles WHERE id = ${profile.id}::uuid`;
    expect(Number(epoch)).toBe(Date.parse('2026-11-10T02:30:00Z') / 1000);
  });
});
