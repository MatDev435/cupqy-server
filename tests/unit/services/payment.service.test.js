import { describe, expect, it, vi } from 'vitest';
import { buildOrderUrl, buildPreferenceBody } from '../../../src/services/payment.service.js';
import { config } from '../../../src/config/env.js';

vi.mock('../../../src/config/prisma.js', () => ({ prisma: {} }));

const order = {
  id: '0b7f6f3e-6a59-4a39-9e3e-6f4c2b1d9a10',
  orderNumber: 1042,
  deliveryFeeCents: 785,
  paymentExpiresAt: new Date('2026-11-11T19:30:00Z'),
  items: [
    { cupcakeId: 'c1', cupcakeName: 'Chocolate', unitPriceCents: 990, quantity: 2 },
    { cupcakeId: 'c2', cupcakeName: 'Limão', unitPriceCents: 1255, quantity: 1 },
  ],
};

describe('payment.service — preferência do Checkout Pro', () => {
  it('converte centavos em reais, inclui a taxa de entrega e referencia o pedido', () => {
    const body = buildPreferenceBody(
      order,
      { email: 'cliente@cupqy.test' },
      new Date('2026-11-11T19:00:00Z'),
    );

    expect(body.items).toEqual([
      { id: 'c1', title: 'Chocolate', quantity: 2, unit_price: 9.9, currency_id: 'BRL' },
      { id: 'c2', title: 'Limão', quantity: 1, unit_price: 12.55, currency_id: 'BRL' },
      {
        id: 'delivery-fee',
        title: 'Taxa de entrega',
        quantity: 1,
        unit_price: 7.85,
        currency_id: 'BRL',
      },
    ]);
    expect(body.external_reference).toBe(order.id);
    expect(body.metadata).toEqual({ order_id: order.id, order_number: 1042 });
  });

  it('expira a preferência junto com o prazo de pagamento do pedido', () => {
    const body = buildPreferenceBody(order, null, new Date('2026-11-11T19:00:00Z'));

    expect(body).toMatchObject({
      expires: true,
      expiration_date_from: '2026-11-11T19:00:00.000Z',
      expiration_date_to: '2026-11-11T19:30:00.000Z',
      date_of_expiration: '2026-11-11T19:30:00.000Z',
    });
  });

  it('aceita apenas Pix e cartão de crédito (US10)', () => {
    const { payment_methods: methods } = buildPreferenceBody(order, null);
    expect(methods.excluded_payment_types.map((type) => type.id)).toEqual([
      'ticket',
      'atm',
      'debit_card',
      'prepaid_card',
    ]);
  });

  it('define as URLs de retorno para a tela do pedido no front-end', () => {
    const body = buildPreferenceBody(order, null);
    const orderUrl = `http://localhost:5173/pedidos/${order.id}`;

    expect(buildOrderUrl(order.id)).toBe(orderUrl);
    expect(body.back_urls).toEqual({
      success: `${orderUrl}?pagamento=sucesso`,
      pending: `${orderUrl}?pagamento=pendente`,
      failure: `${orderUrl}?pagamento=falha`,
    });
  });

  it('em ambiente local (HTTP) não envia auto_return nem notification_url', () => {
    const body = buildPreferenceBody(order, null);
    expect(body.auto_return).toBeUndefined();
    expect(body.notification_url).toBeUndefined();
  });

  it('com URLs públicas HTTPS configura retorno automático e webhook', () => {
    const original = { frontend: { ...config.frontend }, api: { ...config.api } };
    config.frontend.url = 'https://cupqy.vercel.app';
    config.api.publicUrl = 'https://cupqy-api.onrender.com';
    try {
      const body = buildPreferenceBody(order, null);
      expect(body.auto_return).toBe('approved');
      expect(body.notification_url).toBe(
        'https://cupqy-api.onrender.com/api/v1/payments/webhooks/mercadopago?source_news=webhooks',
      );
    } finally {
      Object.assign(config.frontend, original.frontend);
      Object.assign(config.api, original.api);
    }
  });

  it('no sandbox não pré-preenche o pagador (o comprador deve ser um usuário de teste)', () => {
    expect(buildPreferenceBody(order, { email: 'real@cupqy.test' }).payer).toBeUndefined();
  });
});
