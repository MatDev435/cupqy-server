import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { resetDatabase } from '../helpers/db.js';
import { createCupcake } from '../helpers/factories.js';

const app = createApp();
const validateCart = (items) => request(app).post('/api/v1/cart/validate').send({ items });

describe('Validação do carrinho (POST /api/v1/cart/validate)', () => {
  beforeEach(resetDatabase);

  it('calcula subtotais e total com os preços atuais do banco', async () => {
    const chocolate = await createCupcake({ name: 'Chocolate', priceCents: 990, stock: 10 });
    const lemon = await createCupcake({ name: 'Limão', priceCents: 1250, stock: 10 });

    const response = await validateCart([
      { cupcakeId: chocolate.id, quantity: 2 },
      { cupcakeId: lemon.id, quantity: 1 },
    ]);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      subtotalCents: 3230,
      totalQuantity: 3,
      canCheckout: true,
      issues: [],
    });
    expect(response.body.data.items[0]).toMatchObject({
      name: 'Chocolate',
      unitPriceCents: 990,
      quantity: 2,
      subtotalCents: 1980,
      status: 'OK',
    });
  });

  it('ignora preços enviados pelo cliente', async () => {
    const cupcake = await createCupcake({ priceCents: 990 });

    const response = await request(app)
      .post('/api/v1/cart/validate')
      .send({ items: [{ cupcakeId: cupcake.id, quantity: 1, unitPriceCents: 1 }] });

    expect(response.status).toBe(400);
  });

  it('soma itens repetidos', async () => {
    const cupcake = await createCupcake({ stock: 10 });

    const response = await validateCart([
      { cupcakeId: cupcake.id, quantity: 2 },
      { cupcakeId: cupcake.id, quantity: 3 },
    ]);

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].quantity).toBe(5);
  });

  it('bloqueia o checkout quando a quantidade excede o estoque do dia (US08 RN#02)', async () => {
    const cupcake = await createCupcake({ name: 'Raro', stock: 3 });

    const response = await validateCart([{ cupcakeId: cupcake.id, quantity: 5 }]);

    expect(response.body.data.canCheckout).toBe(false);
    expect(response.body.data.issues).toEqual([
      {
        cupcakeId: cupcake.id,
        name: 'Raro',
        status: 'INSUFFICIENT_STOCK',
        requestedQuantity: 5,
        availableQuantity: 3,
      },
    ]);
  });

  it('identifica itens esgotados, inativos, excluídos ou inexistentes', async () => {
    const soldOut = await createCupcake({ stock: 0 });
    const inactive = await createCupcake({ isActive: false });
    const deleted = await createCupcake({ deletedAt: new Date() });
    const missing = crypto.randomUUID();
    const ok = await createCupcake({ priceCents: 1000 });

    const response = await validateCart([
      { cupcakeId: soldOut.id, quantity: 1 },
      { cupcakeId: inactive.id, quantity: 1 },
      { cupcakeId: deleted.id, quantity: 1 },
      { cupcakeId: missing, quantity: 1 },
      { cupcakeId: ok.id, quantity: 1 },
    ]);

    const statuses = response.body.data.items.map((item) => item.status);
    expect(statuses).toEqual(['SOLD_OUT', 'UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE', 'OK']);
    expect(response.body.data.subtotalCents).toBe(1000);
    expect(response.body.data.canCheckout).toBe(false);
  });

  it('valida carrinho vazio e quantidades fora dos limites', async () => {
    const cupcake = await createCupcake();

    expect((await validateCart([])).status).toBe(400);
    expect((await validateCart([{ cupcakeId: cupcake.id, quantity: 0 }])).status).toBe(400);
    expect((await validateCart([{ cupcakeId: cupcake.id, quantity: 51 }])).status).toBe(400);
    expect((await validateCart([{ cupcakeId: cupcake.id, quantity: 1.5 }])).status).toBe(400);
  });
});
