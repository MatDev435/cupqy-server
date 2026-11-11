import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';
import { createCupcake, setStock, today } from '../helpers/factories.js';
import { addDays } from '../../src/utils/dates.js';

const app = createApp();

describe('Estoque diário (/api/v1/admin/stock)', () => {
  let admin;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createUser({ role: 'ADMIN' });
  });

  const asAdmin = (method, path = '') => {
    const agent = request(app);
    return agent[method](`/api/v1/admin/stock${path}`).set('Authorization', admin.authHeader);
  };

  it('restringe o acesso a administradores', async () => {
    const baker = await createUser({ role: 'BAKER' });
    const response = await request(app)
      .get('/api/v1/admin/stock')
      .set('Authorization', baker.authHeader);
    expect(response.status).toBe(403);
  });

  it('lista cupcakes com a quantidade do dia, alertas e resumo (US17 CA#01/CA#03)', async () => {
    await createCupcake({ name: 'A — farto', stock: 20 });
    await createCupcake({ name: 'B — baixo', stock: 3 });
    await createCupcake({ name: 'C — esgotado', stock: 0 });
    await createCupcake({ name: 'D — sem estoque definido', stock: null });
    await createCupcake({ name: 'E — inativo', isActive: false, stock: 2 });
    await createCupcake({ name: 'F — excluído', deletedAt: new Date() });

    const response = await asAdmin('get');

    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.date).toBe(today());
    expect(data.lowStockThreshold).toBe(5);
    expect(
      data.items.map((item) => [item.cupcake.name, item.quantity, item.lowStock, item.soldOut]),
    ).toEqual([
      ['A — farto', 20, false, false],
      ['B — baixo', 3, true, false],
      ['C — esgotado', 0, false, true],
      ['D — sem estoque definido', 0, false, true],
      ['E — inativo', 2, true, false],
    ]);
    expect(data.items[3].isSet).toBe(false);
    expect(data.summary).toEqual({
      activeCupcakes: 4,
      totalUnits: 23,
      lowStock: 1,
      soldOut: 2,
      notSet: 1,
    });
  });

  it('lista apenas alertas de cupcakes ativos com estoque baixo ou esgotado', async () => {
    await createCupcake({ name: 'Farto', stock: 50 });
    await createCupcake({ name: 'Baixo', stock: 4 });
    await createCupcake({ name: 'Zerado', stock: 0 });
    await createCupcake({ name: 'Inativo baixo', isActive: false, stock: 1 });

    const response = await asAdmin('get', '/alerts');

    expect(response.body.data.items.map((item) => item.cupcake.name)).toEqual(['Baixo', 'Zerado']);
  });

  it('define o estoque de vários cupcakes atomicamente (US17 CA#02)', async () => {
    const first = await createCupcake({ stock: null });
    const second = await createCupcake({ stock: 5 });

    const response = await asAdmin('put').send({
      items: [
        { cupcakeId: first.id, quantity: 30 },
        { cupcakeId: second.id, quantity: 12 },
      ],
    });

    expect(response.status).toBe(200);
    const quantities = Object.fromEntries(
      response.body.data.items.map((item) => [item.cupcake.id, item.quantity]),
    );
    expect(quantities).toEqual({ [first.id]: 30, [second.id]: 12 });
  });

  it('não grava nada se algum cupcake do lote for inválido', async () => {
    const cupcake = await createCupcake({ stock: 5 });
    const missing = crypto.randomUUID();

    const response = await asAdmin('put').send({
      items: [
        { cupcakeId: cupcake.id, quantity: 99 },
        { cupcakeId: missing, quantity: 1 },
      ],
    });

    expect(response.status).toBe(422);
    expect(response.body.error.details).toEqual({ cupcakeIds: [missing] });
    const stock = await prisma.dailyStock.findFirst({ where: { cupcakeId: cupcake.id } });
    expect(stock.quantity).toBe(5);
  });

  it('permite zerar o estoque de um item a qualquer momento (US17 CA#04)', async () => {
    const cupcake = await createCupcake({ stock: 15 });

    const response = await asAdmin('put', `/${cupcake.id}`).send({ quantity: 0 });

    expect(response.status).toBe(200);
    const catalog = await request(app).get(`/api/v1/cupcakes/${cupcake.id}`);
    expect(catalog.body.data.stock).toEqual({ available: 0, soldOut: true });
    expect((await request(app).get('/api/v1/cupcakes')).body.data).toEqual([]);
  });

  it('permite planejar dias futuros, mas não alterar dias passados', async () => {
    const cupcake = await createCupcake({ stock: null });
    const tomorrow = addDays(today(), 1);
    const yesterday = addDays(today(), -1);

    const future = await asAdmin('put', `/${cupcake.id}`).send({ date: tomorrow, quantity: 40 });
    expect(future.status).toBe(200);
    expect(future.body.data.date).toBe(tomorrow);

    const past = await asAdmin('put', `/${cupcake.id}`).send({ date: yesterday, quantity: 40 });
    expect(past.status).toBe(422);
    expect(past.body.error.code).toBe('PAST_STOCK_DATE');

    const history = await asAdmin('get', `?date=${yesterday}`);
    expect(history.status).toBe(200);
  });

  it('valida quantidades, datas e duplicidades', async () => {
    const cupcake = await createCupcake();

    expect((await asAdmin('put', `/${cupcake.id}`).send({ quantity: -1 })).status).toBe(400);
    expect((await asAdmin('put', `/${cupcake.id}`).send({ quantity: 2.5 })).status).toBe(400);
    expect((await asAdmin('get', '?date=31-12-2026')).status).toBe(400);

    const duplicated = await asAdmin('put').send({
      items: [
        { cupcakeId: cupcake.id, quantity: 1 },
        { cupcakeId: cupcake.id, quantity: 2 },
      ],
    });
    expect(duplicated.body.error.code).toBe('DUPLICATE_CUPCAKE');
  });

  it('não permite definir estoque de cupcake excluído', async () => {
    const deleted = await createCupcake({ deletedAt: new Date(), stock: null });
    await setStock(deleted.id, 0);

    const response = await asAdmin('put', `/${deleted.id}`).send({ quantity: 10 });
    expect(response.status).toBe(422);
  });
});
