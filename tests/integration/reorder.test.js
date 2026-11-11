import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';
import { createCupcake, createPaidOrder, setStock } from '../helpers/factories.js';

const app = createApp();

describe('Repetir pedido (POST /api/v1/orders/:orderId/reorder)', () => {
  let customer;
  let chocolate;
  let lemon;
  let vanilla;
  let order;

  beforeEach(async () => {
    await resetDatabase();
    customer = await createUser();
    chocolate = await createCupcake({ name: 'Chocolate', priceCents: 1000, stock: 10 });
    lemon = await createCupcake({ name: 'Limão', priceCents: 1200, stock: 10 });
    vanilla = await createCupcake({ name: 'Baunilha', priceCents: 800, stock: 10 });
    order = await createPaidOrder({
      userId: customer.id,
      status: 'COMPLETED',
      items: [
        { cupcake: chocolate, quantity: 2 },
        { cupcake: lemon, quantity: 3 },
        { cupcake: vanilla, quantity: 1 },
      ],
    });
  });

  const reorder = (user = customer) =>
    request(app).post(`/api/v1/orders/${order.id}/reorder`).set('Authorization', user.authHeader);

  it('monta o carrinho com os mesmos itens quando tudo está disponível', async () => {
    const response = await reorder();

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      sourceOrderNumber: order.orderNumber,
      subtotalCents: 2000 + 3600 + 800,
      adjusted: [],
      unavailable: [],
      canCheckout: true,
    });
    expect(response.body.data.items.map((item) => [item.name, item.quantity])).toEqual([
      ['Baunilha', 1],
      ['Chocolate', 2],
      ['Limão', 3],
    ]);
  });

  it('usa os preços atuais, não os da época do pedido (US12 RN#02)', async () => {
    await prisma.cupcake.update({ where: { id: chocolate.id }, data: { priceCents: 1500 } });

    const response = await reorder();
    const item = response.body.data.items.find((line) => line.cupcakeId === chocolate.id);

    expect(item).toMatchObject({
      unitPriceCents: 1500,
      previousUnitPriceCents: 1000,
      subtotalCents: 3000,
    });
  });

  it('adiciona apenas o que tem estoque hoje e avisa sobre o restante (US12 RN#01)', async () => {
    await setStock(lemon.id, 1);
    await setStock(vanilla.id, 0);
    await prisma.cupcake.update({
      where: { id: chocolate.id },
      data: { deletedAt: new Date(), isActive: false },
    });

    const response = await reorder();

    expect(response.body.data.items.map((item) => [item.name, item.quantity])).toEqual([
      ['Limão', 1],
    ]);
    expect(response.body.data.adjusted).toEqual([
      { cupcakeId: lemon.id, name: 'Limão', requestedQuantity: 3, addedQuantity: 1 },
    ]);
    expect(response.body.data.unavailable).toEqual(
      expect.arrayContaining([
        { cupcakeId: chocolate.id, name: 'Chocolate', reason: 'UNAVAILABLE' },
        { cupcakeId: vanilla.id, name: 'Baunilha', reason: 'SOLD_OUT' },
      ]),
    );
    expect(response.body.data.subtotalCents).toBe(1200);
  });

  it('não permite checkout quando nada está disponível', async () => {
    for (const cupcake of [chocolate, lemon, vanilla]) await setStock(cupcake.id, 0);

    const response = await reorder();

    expect(response.body.data).toMatchObject({ items: [], subtotalCents: 0, canCheckout: false });
  });

  it('não expõe pedidos de outros clientes', async () => {
    expect((await reorder(await createUser())).status).toBe(404);
  });
});
