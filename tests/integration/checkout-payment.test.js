import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';
import { createCupcake } from '../helpers/factories.js';
import { fakeMercadoPago } from '../helpers/fakeMercadoPago.js';

const app = createApp();

describe('Checkout com Mercado Pago (preferências)', () => {
  let customer;
  let cupcake;

  beforeEach(async () => {
    await resetDatabase();
    customer = await createUser();
    cupcake = await createCupcake({ name: 'Chocolate', priceCents: 990 });
  });

  const checkout = () =>
    request(app)
      .post('/api/v1/orders')
      .set('Authorization', customer.authHeader)
      .send({ fulfillmentType: 'PICKUP', items: [{ cupcakeId: cupcake.id, quantity: 3 }] });

  it('cria a preferência do pedido e devolve a URL do Checkout Pro (sandbox)', async () => {
    const response = await checkout();

    expect(response.status).toBe(201);
    const { checkout: payment, id: orderId } = response.body.data;
    const preference = fakeMercadoPago.lastPreference();

    expect(payment).toMatchObject({
      preferenceId: preference.id,
      sandbox: true,
      checkoutUrl: expect.stringContaining('sandbox.mercadopago.com.br'),
    });
    expect(preference.body.external_reference).toBe(orderId);
    expect(preference.body.items).toEqual([
      { id: cupcake.id, title: 'Chocolate', quantity: 3, unit_price: 9.9, currency_id: 'BRL' },
    ]);
    expect(preference.idempotencyKey).toMatch(new RegExp(`^preference-${orderId}-`));

    const stored = await prisma.order.findUnique({ where: { id: orderId } });
    expect(stored.mpPreferenceId).toBe(preference.id);
  });

  it('cancela o pedido se o Mercado Pago falhar ao criar a preferência', async () => {
    fakeMercadoPago.failNext('createPreference');

    const response = await checkout();

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('PAYMENT_PROVIDER_ERROR');
    const [order] = await prisma.order.findMany();
    expect(order).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'PAYMENT_SETUP_FAILED',
    });
  });

  it('gera um novo link de pagamento para um pedido pendente (nova tentativa)', async () => {
    const order = (await checkout()).body.data;

    const response = await request(app)
      .post(`/api/v1/orders/${order.id}/payment`)
      .set('Authorization', customer.authHeader);

    expect(response.status).toBe(201);
    expect(fakeMercadoPago.preferences()).toHaveLength(2);
    expect(response.body.data.checkout.preferenceId).toBe(fakeMercadoPago.lastPreference().id);
  });

  it('não gera link para pedido expirado, pago ou de outro cliente', async () => {
    const order = (await checkout()).body.data;
    const pay = (user = customer) =>
      request(app).post(`/api/v1/orders/${order.id}/payment`).set('Authorization', user.authHeader);

    await prisma.order.update({
      where: { id: order.id },
      data: { paymentExpiresAt: new Date(Date.now() - 1000) },
    });
    expect((await pay()).body.error.code).toBe('ORDER_PAYMENT_EXPIRED');

    await prisma.order.update({ where: { id: order.id }, data: { status: 'IN_PREPARATION' } });
    expect((await pay()).body.error.code).toBe('ORDER_NOT_PAYABLE');

    expect((await pay(await createUser())).status).toBe(404);
  });
});
