import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { config } from '../../src/config/env.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';
import { createCupcake, setStock, today } from '../helpers/factories.js';
import { fakeMercadoPago } from '../helpers/fakeMercadoPago.js';
import { geoFixtures, routeFetch } from '../helpers/fakeHttp.js';
import { clearGeocodingCache } from '../../src/services/geo/geocoding.service.js';

const app = createApp();
const SECRET = 'test-webhook-secret-not-real';

/** Envia uma notificação assinada exatamente como o Mercado Pago. */
function sendWebhook(paymentId, { secret = SECRET, type = 'payment' } = {}) {
  const requestId = randomUUID();
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac('sha256', secret)
    .update(`id:${paymentId};request-id:${requestId};ts:${ts};`)
    .digest('hex');

  return request(app)
    .post(`/api/v1/payments/webhooks/mercadopago?data.id=${paymentId}&type=${type}`)
    .set('x-signature', `ts=${ts},v1=${v1}`)
    .set('x-request-id', requestId)
    .send({ action: 'payment.updated', type, data: { id: paymentId } });
}

async function stockOf(cupcakeId) {
  const stock = await prisma.dailyStock.findFirst({ where: { cupcakeId } });
  return stock.quantity;
}

describe('Webhooks do Mercado Pago e confirmação de pagamentos', () => {
  let customer;
  let cupcake;

  beforeEach(async () => {
    await resetDatabase();
    clearGeocodingCache();
    customer = await createUser();
    cupcake = await createCupcake({ name: 'Chocolate', priceCents: 1000, stock: 10 });
  });

  afterEach(() => {
    config.mercadoPago.webhookSecret = SECRET;
  });

  async function placeOrder({ user = customer, quantity = 2, item = cupcake, ...rest } = {}) {
    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', user.authHeader)
      .send({ fulfillmentType: 'PICKUP', items: [{ cupcakeId: item.id, quantity }], ...rest });
    expect(response.status).toBe(201);
    return response.body.data;
  }

  const payFor = (order, overrides = {}) =>
    fakeMercadoPago.createPayment({
      orderId: order.id,
      amountCents: order.totalCents,
      ...overrides,
    });

  const getOrder = (orderId) =>
    prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true, statusHistory: true },
    });

  describe('validação da notificação', () => {
    it('rejeita assinatura inválida sem alterar nada', async () => {
      const order = await placeOrder();
      const payment = payFor(order);

      const response = await sendWebhook(payment.id, { secret: 'segredo-falso' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
      expect((await getOrder(order.id)).status).toBe('AWAITING_PAYMENT');
    });

    it('responde 503 (para o Mercado Pago reenviar) quando o segredo não está configurado', async () => {
      config.mercadoPago.webhookSecret = undefined;
      const response = await sendWebhook('123');
      expect(response.status).toBe(503);
    });

    it('ignora notificações que não são de pagamento e pagamentos inexistentes', async () => {
      const merchantOrder = await sendWebhook('555', { type: 'merchant_order' });
      expect(merchantOrder.body).toEqual({ received: true, ignored: true });

      const unknown = await sendWebhook('999999');
      expect(unknown.status).toBe(200);
      expect(unknown.body.outcome).toBe('IGNORED');
    });

    it('responde 502 quando o Mercado Pago está indisponível (notificação será reenviada)', async () => {
      const order = await placeOrder();
      const payment = payFor(order);
      fakeMercadoPago.failNext('getPayment');

      const response = await sendWebhook(payment.id);

      expect(response.status).toBe(502);
      expect((await getOrder(order.id)).status).toBe('AWAITING_PAYMENT');
    });
  });

  describe('pagamento aprovado', () => {
    it('confirma o pedido, baixa o estoque e registra o pagamento (US10 RN#04, US17 RN#01)', async () => {
      const order = await placeOrder({ quantity: 3 });
      const payment = payFor(order, { paymentMethodId: 'pix', paymentTypeId: 'bank_transfer' });

      const response = await sendWebhook(payment.id);

      expect(response.status).toBe(200);
      expect(response.body.outcome).toBe('CONFIRMED');
      const stored = await getOrder(order.id);
      expect(stored.status).toBe('IN_PREPARATION');
      expect(stored.paidAt).toBeInstanceOf(Date);
      expect(stored.stockDate.toISOString().slice(0, 10)).toBe(today());
      expect(stored.payments).toEqual([
        expect.objectContaining({
          providerPaymentId: payment.id,
          status: 'APPROVED',
          paymentMethodId: 'pix',
          amountCents: 3000,
          refundStatus: 'NONE',
        }),
      ]);
      expect(stored.statusHistory.map((entry) => entry.toStatus)).toEqual([
        'AWAITING_PAYMENT',
        'IN_PREPARATION',
      ]);
      expect(await stockOf(cupcake.id)).toBe(7);

      const detail = await request(app)
        .get(`/api/v1/orders/${order.id}`)
        .set('Authorization', customer.authHeader);
      expect(detail.body.data.payment).toMatchObject({ status: 'APPROVED', methodLabel: 'Pix' });
    });

    it('é idempotente: notificações repetidas e simultâneas baixam o estoque uma única vez', async () => {
      const order = await placeOrder({ quantity: 2 });
      const payment = payFor(order);

      const responses = await Promise.all(Array.from({ length: 5 }, () => sendWebhook(payment.id)));
      const again = await sendWebhook(payment.id);

      const outcomes = responses.map((response) => response.body.outcome).sort();
      expect(outcomes).toEqual([
        'ALREADY_PROCESSED',
        'ALREADY_PROCESSED',
        'ALREADY_PROCESSED',
        'ALREADY_PROCESSED',
        'CONFIRMED',
      ]);
      expect(again.body.outcome).toBe('ALREADY_PROCESSED');
      expect(await stockOf(cupcake.id)).toBe(8);
      expect(await prisma.payment.count()).toBe(1);
      expect(await prisma.orderStatusHistory.count({ where: { toStatus: 'IN_PREPARATION' } })).toBe(
        1,
      );
    });

    it('salva o endereço de entrega no perfil quando solicitado (US09 RN#03)', async () => {
      vi.stubGlobal(
        'fetch',
        routeFetch([['https://brasilapi.com.br', () => ({ body: geoFixtures.brasilApiNearby })]]),
      );
      const order = await placeOrder({
        fulfillmentType: 'DELIVERY',
        saveAddress: true,
        address: {
          zipCode: '01310100',
          street: 'Avenida Paulista',
          number: '1000',
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
        },
      });
      expect(await prisma.address.count()).toBe(0);

      await sendWebhook(payFor(order).id);

      const addresses = await prisma.address.findMany({ where: { userId: customer.id } });
      expect(addresses).toEqual([
        expect.objectContaining({ street: 'Avenida Paulista', number: '1000', isDefault: true }),
      ]);
    });
  });

  describe('concorrência na baixa de estoque (US17 RNF#01)', () => {
    it('nunca vende além do disponível quando vários pagamentos chegam ao mesmo tempo', async () => {
      await setStock(cupcake.id, 3);
      const buyers = await Promise.all([createUser(), createUser(), createUser()]);
      const orders = [];
      for (const buyer of buyers) orders.push(await placeOrder({ user: buyer, quantity: 2 }));
      const payments = orders.map((order) => payFor(order));

      const responses = await Promise.all(payments.map((payment) => sendWebhook(payment.id)));

      const outcomes = responses.map((response) => response.body.outcome).sort();
      expect(outcomes).toEqual(['CONFIRMED', 'OUT_OF_STOCK', 'OUT_OF_STOCK']);
      expect(await stockOf(cupcake.id)).toBe(1);

      const cancelled = await prisma.order.findMany({
        where: { status: 'CANCELLED' },
        include: { payments: true },
      });
      expect(cancelled).toHaveLength(2);
      for (const order of cancelled) {
        expect(order.cancellationReason).toBe('OUT_OF_STOCK');
        expect(order.payments[0].refundStatus).toBe('COMPLETED');
      }
      expect(fakeMercadoPago.refunds()).toHaveLength(2);
    });

    it('confirma todos quando o estoque é suficiente para os pagamentos simultâneos', async () => {
      await setStock(cupcake.id, 5);
      const orders = [];
      for (let i = 0; i < 5; i += 1) {
        orders.push(await placeOrder({ user: await createUser(), quantity: 1 }));
      }

      const responses = await Promise.all(orders.map((order) => sendWebhook(payFor(order).id)));

      expect(responses.every((response) => response.body.outcome === 'CONFIRMED')).toBe(true);
      expect(await stockOf(cupcake.id)).toBe(0);
      const catalog = await request(app).get(`/api/v1/cupcakes/${cupcake.id}`);
      expect(catalog.body.data.stock).toEqual({ available: 0, soldOut: true });
    });
  });

  describe('casos de reembolso automático', () => {
    it('cancela e reembolsa quando o valor pago difere do total do pedido', async () => {
      const order = await placeOrder();
      const payment = payFor(order, { amountCents: order.totalCents - 1 });

      const response = await sendWebhook(payment.id);

      expect(response.body.outcome).toBe('AMOUNT_MISMATCH');
      const stored = await getOrder(order.id);
      expect(stored).toMatchObject({
        status: 'CANCELLED',
        cancellationReason: 'PAYMENT_AMOUNT_MISMATCH',
      });
      expect(stored.payments[0].refundStatus).toBe('COMPLETED');
      expect(fakeMercadoPago.refunds()).toEqual([
        expect.objectContaining({ paymentId: payment.id, idempotencyKey: `refund-${payment.id}` }),
      ]);
      expect(await stockOf(cupcake.id)).toBe(10);
    });

    it('cancela e reembolsa quando o estoque acabou entre o checkout e o pagamento', async () => {
      const order = await placeOrder({ quantity: 4 });
      await setStock(cupcake.id, 3);

      const response = await sendWebhook(payFor(order).id);

      expect(response.body.outcome).toBe('OUT_OF_STOCK');
      expect((await getOrder(order.id)).cancellationReason).toBe('OUT_OF_STOCK');
      expect(await stockOf(cupcake.id)).toBe(3);
    });

    it('reembolsa pagamento aprovado para pedido já cancelado pelo cliente', async () => {
      const order = await placeOrder();
      await request(app)
        .post(`/api/v1/orders/${order.id}/cancel`)
        .set('Authorization', customer.authHeader);

      const response = await sendWebhook(payFor(order).id);

      expect(response.body.outcome).toBe('DUPLICATE_REFUNDED');
      expect((await getOrder(order.id)).status).toBe('CANCELLED');
      expect(fakeMercadoPago.refunds()).toHaveLength(1);
    });

    it('reembolsa um segundo pagamento para o mesmo pedido', async () => {
      const order = await placeOrder();
      await sendWebhook(payFor(order).id);

      const duplicate = await sendWebhook(payFor(order).id);

      expect(duplicate.body.outcome).toBe('DUPLICATE_REFUNDED');
      expect((await getOrder(order.id)).status).toBe('IN_PREPARATION');
      expect(await stockOf(cupcake.id)).toBe(8);
    });

    it('marca reembolso com falha e tenta de novo na próxima notificação', async () => {
      const order = await placeOrder();
      const payment = payFor(order, { amountCents: 1 });
      fakeMercadoPago.failNext('refundPayment');

      await sendWebhook(payment.id);
      let record = await prisma.payment.findFirst();
      expect(record.refundStatus).toBe('FAILED');

      await sendWebhook(payment.id);
      record = await prisma.payment.findFirst();
      expect(record.refundStatus).toBe('COMPLETED');
    });
  });

  describe('outros status', () => {
    it('registra pagamento recusado sem cancelar o pedido (o cliente pode tentar de novo)', async () => {
      const order = await placeOrder();
      const rejected = payFor(order, { status: 'rejected', paymentTypeId: 'credit_card' });

      const response = await sendWebhook(rejected.id);

      expect(response.body.outcome).toBe('RECORDED');
      const stored = await getOrder(order.id);
      expect(stored.status).toBe('AWAITING_PAYMENT');
      expect(stored.payments[0].status).toBe('REJECTED');

      const approved = payFor(order);
      expect((await sendWebhook(approved.id)).body.outcome).toBe('CONFIRMED');
    });

    it('acompanha o pagamento pendente até a aprovação', async () => {
      const order = await placeOrder();
      const payment = payFor(order, { status: 'pending' });

      await sendWebhook(payment.id);
      expect((await getOrder(order.id)).status).toBe('AWAITING_PAYMENT');

      fakeMercadoPago.setPaymentStatus(payment.id, 'approved');
      expect((await sendWebhook(payment.id)).body.outcome).toBe('CONFIRMED');
    });

    it('cancela o pedido e devolve o estoque quando o pagamento é estornado no Mercado Pago', async () => {
      const order = await placeOrder({ quantity: 3 });
      const payment = payFor(order);
      await sendWebhook(payment.id);
      expect(await stockOf(cupcake.id)).toBe(7);

      fakeMercadoPago.setPaymentStatus(payment.id, 'refunded');
      const response = await sendWebhook(payment.id);

      expect(response.body.outcome).toBe('ORDER_CANCELLED');
      const stored = await getOrder(order.id);
      expect(stored).toMatchObject({ status: 'CANCELLED', cancellationReason: 'PAYMENT_REFUNDED' });
      expect(stored.payments[0]).toMatchObject({ status: 'REFUNDED', refundStatus: 'COMPLETED' });
      expect(await stockOf(cupcake.id)).toBe(10);
    });
  });

  describe('sincronização no retorno do Checkout Pro', () => {
    const sync = (order, body = {}, user = customer) =>
      request(app)
        .post(`/api/v1/orders/${order.id}/payment/sync`)
        .set('Authorization', user.authHeader)
        .send(body);

    it('confirma o pedido consultando o Mercado Pago (sem depender do webhook)', async () => {
      const order = await placeOrder();
      payFor(order);

      const response = await sync(order);

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('IN_PREPARATION');
      expect(await stockOf(cupcake.id)).toBe(8);
    });

    it('aceita o payment_id recebido no retorno, validando que pertence ao pedido', async () => {
      const order = await placeOrder();
      const other = await placeOrder({ user: await createUser() });
      const foreignPayment = payFor(other);

      const ignored = await sync(order, { paymentId: foreignPayment.id });
      expect(ignored.body.data.status).toBe('AWAITING_PAYMENT');

      const ownPayment = payFor(order);
      const confirmed = await sync(order, { paymentId: ownPayment.id });
      expect(confirmed.body.data.status).toBe('IN_PREPARATION');
    });

    it('não depende dos parâmetros do redirecionamento: sem pagamento aprovado, nada muda', async () => {
      const order = await placeOrder();
      payFor(order, { status: 'in_process' });

      const response = await sync(order);

      expect(response.body.data.status).toBe('AWAITING_PAYMENT');
      expect(response.body.data.payment.status).toBe('IN_PROCESS');
    });

    it('protege pedidos de outros clientes', async () => {
      const order = await placeOrder();
      expect((await sync(order, {}, await createUser())).status).toBe(404);
    });
  });
});
