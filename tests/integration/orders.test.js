import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';
import { createCupcake } from '../helpers/factories.js';
import { geoFixtures, routeFetch } from '../helpers/fakeHttp.js';
import { clearGeocodingCache } from '../../src/services/geo/geocoding.service.js';

const app = createApp();

const address = {
  zipCode: '01310-100',
  street: 'Avenida Paulista',
  number: '1000',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
};

function mockGeo() {
  vi.stubGlobal(
    'fetch',
    routeFetch([['https://brasilapi.com.br', () => ({ body: geoFixtures.brasilApiNearby })]]),
  );
}

describe('Pedidos (/api/v1/orders)', () => {
  let customer;
  let chocolate;
  let lemon;

  beforeEach(async () => {
    await resetDatabase();
    clearGeocodingCache();
    customer = await createUser();
    chocolate = await createCupcake({ name: 'Chocolate', priceCents: 990, stock: 10 });
    lemon = await createCupcake({ name: 'Limão', priceCents: 1250, stock: 10 });
  });

  const asCustomer = (method, path = '', user = customer) => {
    const agent = request(app);
    return agent[method](`/api/v1/orders${path}`).set('Authorization', user.authHeader);
  };

  const pickupOrder = (items = [{ cupcakeId: chocolate.id, quantity: 2 }]) =>
    asCustomer('post').send({ fulfillmentType: 'PICKUP', items, notes: 'Sem granulado' });

  describe('checkout', () => {
    it('cria pedido de retirada aguardando pagamento, com valores calculados no servidor', async () => {
      const before = Date.now();
      const response = await pickupOrder([
        { cupcakeId: chocolate.id, quantity: 2 },
        { cupcakeId: lemon.id, quantity: 1 },
      ]);

      expect(response.status).toBe(201);
      const order = response.body.data;
      expect(order).toMatchObject({
        orderNumber: 1001,
        status: 'AWAITING_PAYMENT',
        statusLabel: 'Aguardando pagamento',
        fulfillmentType: 'PICKUP',
        subtotalCents: 3230,
        deliveryFeeCents: 0,
        totalCents: 3230,
        notes: 'Sem granulado',
        delivery: null,
        estimatedMinutes: 30,
      });
      expect(order.items).toEqual([
        expect.objectContaining({
          name: 'Chocolate',
          unitPriceCents: 990,
          quantity: 2,
          subtotalCents: 1980,
        }),
        expect.objectContaining({
          name: 'Limão',
          unitPriceCents: 1250,
          quantity: 1,
          subtotalCents: 1250,
        }),
      ]);
      expect(order.pickup.address).toContain('São Paulo');
      const expiresIn = new Date(order.paymentExpiresAt).getTime() - before;
      expect(expiresIn).toBeGreaterThanOrEqual(29 * 60 * 1000);
      expect(expiresIn).toBeLessThanOrEqual(31 * 60 * 1000);
      expect(order.statusHistory).toEqual([
        expect.objectContaining({ fromStatus: null, toStatus: 'AWAITING_PAYMENT' }),
      ]);
    });

    it('não baixa o estoque na criação do pedido (somente após o pagamento)', async () => {
      await pickupOrder([{ cupcakeId: chocolate.id, quantity: 4 }]).expect(201);

      const stock = await prisma.dailyStock.findFirst({ where: { cupcakeId: chocolate.id } });
      expect(stock.quantity).toBe(10);
    });

    it('cria pedido de delivery com frete calculado e cópia do endereço', async () => {
      mockGeo();
      const response = await asCustomer('post').send({
        fulfillmentType: 'DELIVERY',
        address,
        saveAddress: true,
        items: [{ cupcakeId: chocolate.id, quantity: 1 }],
      });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        subtotalCents: 990,
        deliveryFeeCents: 785,
        totalCents: 1775,
        estimatedMinutes: 35,
        delivery: {
          distanceKm: 1.9,
          courierName: null,
          address: { zipCode: '01310100', street: 'Avenida Paulista', number: '1000' },
        },
      });
      const stored = await prisma.order.findUnique({ where: { id: response.body.data.id } });
      expect(stored.saveAddress).toBe(true);
    });

    it('aceita endereço salvo do próprio cliente', async () => {
      mockGeo();
      const saved = await prisma.address.create({
        data: { ...address, zipCode: '01310100', userId: customer.id },
      });

      const response = await asCustomer('post').send({
        fulfillmentType: 'DELIVERY',
        addressId: saved.id,
        items: [{ cupcakeId: lemon.id, quantity: 1 }],
      });

      expect(response.status).toBe(201);
      expect(response.body.data.totalCents).toBe(1250 + 785);
    });

    it('recusa o pedido se algum item não tiver estoque suficiente, sem criar nada', async () => {
      const rare = await createCupcake({ name: 'Raro', stock: 1 });

      const response = await pickupOrder([
        { cupcakeId: chocolate.id, quantity: 1 },
        { cupcakeId: rare.id, quantity: 2 },
      ]);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CART_UNAVAILABLE');
      expect(response.body.error.details.issues).toEqual([
        expect.objectContaining({
          cupcakeId: rare.id,
          status: 'INSUFFICIENT_STOCK',
          availableQuantity: 1,
        }),
      ]);
      expect(await prisma.order.count()).toBe(0);
    });

    it('rejeita valores financeiros enviados pelo front-end', async () => {
      const response = await asCustomer('post').send({
        fulfillmentType: 'PICKUP',
        items: [{ cupcakeId: chocolate.id, quantity: 1 }],
        totalCents: 1,
      });
      expect(response.status).toBe(400);
    });

    it('limita pedidos simultâneos aguardando pagamento', async () => {
      for (let i = 0; i < 5; i += 1) await pickupOrder().expect(201);

      const response = await pickupOrder();

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('TOO_MANY_PENDING_ORDERS');
    });

    it('valida o corpo do checkout', async () => {
      const saveWithSavedAddress = await asCustomer('post').send({
        fulfillmentType: 'DELIVERY',
        addressId: crypto.randomUUID(),
        saveAddress: true,
        items: [{ cupcakeId: chocolate.id, quantity: 1 }],
      });
      const noItems = await asCustomer('post').send({ fulfillmentType: 'PICKUP', items: [] });

      expect(saveWithSavedAddress.status).toBe(400);
      expect(noItems.status).toBe(400);
    });
  });

  describe('consulta', () => {
    it('lista apenas os pedidos do cliente, do mais recente ao mais antigo, com filtros', async () => {
      const first = (await pickupOrder()).body.data;
      const second = (await pickupOrder()).body.data;
      await prisma.order.update({ where: { id: first.id }, data: { status: 'COMPLETED' } });
      const other = await createUser();
      await asCustomer('post', '', other).send({
        fulfillmentType: 'PICKUP',
        items: [{ cupcakeId: lemon.id, quantity: 1 }],
      });

      const all = await asCustomer('get');
      expect(all.body.data.map((order) => order.orderNumber)).toEqual([
        second.orderNumber,
        first.orderNumber,
      ]);
      expect(all.body.meta).toMatchObject({ total: 2, pageSize: 20 });
      expect(all.body.data[0]).toMatchObject({
        itemsCount: 2,
        items: [{ name: 'Chocolate', quantity: 2 }],
      });

      const history = await asCustomer('get', '?scope=history');
      expect(history.body.data.map((order) => order.id)).toEqual([first.id]);

      const active = await asCustomer('get', '?scope=active');
      expect(active.body.data.map((order) => order.id)).toEqual([second.id]);
    });

    it('detalha o pedido com linha do tempo e protege pedidos de terceiros', async () => {
      const order = (await pickupOrder()).body.data;

      const own = await asCustomer('get', `/${order.id}`);
      expect(own.status).toBe(200);
      expect(own.body.data.progress.map((step) => [step.status, step.current])).toEqual([
        ['AWAITING_PAYMENT', true],
        ['IN_PREPARATION', false],
        ['AWAITING_PICKUP', false],
        ['COMPLETED', false],
      ]);

      const stranger = await createUser();
      expect((await asCustomer('get', `/${order.id}`, stranger)).status).toBe(404);

      const baker = await createUser({ role: 'BAKER' });
      expect((await asCustomer('get', `/${order.id}`, baker)).status).toBe(200);
    });

    it('só exibe o entregador em pedidos de delivery que já saíram para entrega', async () => {
      mockGeo();
      const order = (
        await asCustomer('post').send({
          fulfillmentType: 'DELIVERY',
          address,
          items: [{ cupcakeId: chocolate.id, quantity: 1 }],
        })
      ).body.data;
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'AWAITING_COURIER', courierName: 'João' },
      });
      expect((await asCustomer('get', `/${order.id}`)).body.data.delivery.courierName).toBeNull();

      await prisma.order.update({ where: { id: order.id }, data: { status: 'OUT_FOR_DELIVERY' } });
      expect((await asCustomer('get', `/${order.id}`)).body.data.delivery.courierName).toBe('João');
    });
  });

  describe('cancelamento pelo cliente', () => {
    it('cancela pedido aguardando pagamento e registra no histórico', async () => {
      const order = (await pickupOrder()).body.data;

      const response = await asCustomer('post', `/${order.id}/cancel`);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        status: 'CANCELLED',
        cancellationReason: 'CUSTOMER_REQUEST',
        progress: [],
      });
      expect(response.body.data.statusHistory.at(-1)).toMatchObject({
        fromStatus: 'AWAITING_PAYMENT',
        toStatus: 'CANCELLED',
      });
    });

    it('não cancela pedidos já pagos ou de outros clientes', async () => {
      const order = (await pickupOrder()).body.data;
      await prisma.order.update({ where: { id: order.id }, data: { status: 'IN_PREPARATION' } });

      const paid = await asCustomer('post', `/${order.id}/cancel`);
      expect(paid.status).toBe(409);
      expect(paid.body.error.code).toBe('ORDER_NOT_CANCELLABLE');

      const stranger = await createUser();
      expect((await asCustomer('post', `/${order.id}/cancel`, stranger)).status).toBe(404);
    });
  });
});
