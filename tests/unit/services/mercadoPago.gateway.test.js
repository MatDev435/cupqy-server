import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../src/config/env.js';

const sdk = vi.hoisted(() => ({
  preferenceCreate: vi.fn(),
  paymentGet: vi.fn(),
  paymentSearch: vi.fn(),
  refundCreate: vi.fn(),
}));

vi.mock('mercadopago', () => {
  class MPNotFoundError extends Error {
    status = 404;
  }
  return {
    MPNotFoundError,
    MercadoPagoConfig: class {
      constructor(options) {
        this.options = options;
      }
    },
    Preference: class {
      create = sdk.preferenceCreate;
    },
    Payment: class {
      get = sdk.paymentGet;
      search = sdk.paymentSearch;
    },
    PaymentRefund: class {
      create = sdk.refundCreate;
    },
  };
});

const gateway = await import('../../../src/services/payments/mercadoPago.gateway.js');
const { MPNotFoundError } = await import('mercadopago');

describe('mercadoPago.gateway', () => {
  beforeEach(() => {
    config.mercadoPago.accessToken = 'TEST-0000000000000000-000000';
  });

  it('normaliza o pagamento retornado pela API', () => {
    expect(
      gateway.normalizePayment({
        id: 123456789,
        status: 'approved',
        status_detail: 'accredited',
        external_reference: 'order-1',
        transaction_amount: 17.75,
        currency_id: 'BRL',
        payment_method_id: 'pix',
        payment_type_id: 'bank_transfer',
        date_approved: '2026-11-11T15:00:00.000-03:00',
        live_mode: false,
      }),
    ).toEqual({
      id: '123456789',
      status: 'approved',
      statusDetail: 'accredited',
      externalReference: 'order-1',
      amountCents: 1775,
      currency: 'BRL',
      paymentMethodId: 'pix',
      paymentTypeId: 'bank_transfer',
      approvedAt: new Date('2026-11-11T18:00:00.000Z'),
      liveMode: false,
    });
  });

  it('cria preferência enviando a chave de idempotência', async () => {
    sdk.preferenceCreate.mockResolvedValue({
      id: 'pref-1',
      init_point: 'https://mp/prod',
      sandbox_init_point: 'https://mp/sandbox',
    });

    const result = await gateway.createPreference({ items: [] }, { idempotencyKey: 'k-1' });

    expect(result).toEqual({
      id: 'pref-1',
      initPoint: 'https://mp/prod',
      sandboxInitPoint: 'https://mp/sandbox',
    });
    expect(sdk.preferenceCreate).toHaveBeenCalledWith({
      body: { items: [] },
      requestOptions: { idempotencyKey: 'k-1' },
    });
  });

  it('retorna null para pagamento inexistente e 502 para outras falhas', async () => {
    sdk.paymentGet.mockRejectedValueOnce(new MPNotFoundError('not found'));
    await expect(gateway.getPayment('1')).resolves.toBeNull();

    sdk.paymentGet.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(gateway.getPayment('1')).rejects.toMatchObject({
      statusCode: 502,
      code: 'PAYMENT_PROVIDER_ERROR',
    });
  });

  it('busca pagamentos pela referência do pedido e solicita reembolsos idempotentes', async () => {
    sdk.paymentSearch.mockResolvedValue({
      results: [{ id: 1, status: 'approved', transaction_amount: 9.9, external_reference: 'o-1' }],
    });
    sdk.refundCreate.mockResolvedValue({ id: 77, status: 'approved' });

    const payments = await gateway.searchPaymentsByReference('o-1');
    const refund = await gateway.refundPayment('1', { idempotencyKey: 'refund-1' });

    expect(payments[0]).toMatchObject({ id: '1', amountCents: 990 });
    expect(sdk.paymentSearch).toHaveBeenCalledWith({
      options: { external_reference: 'o-1', sort: 'date_created', criteria: 'desc' },
    });
    expect(refund).toEqual({ id: '77', status: 'approved' });
    expect(sdk.refundCreate).toHaveBeenCalledWith({
      payment_id: '1',
      body: {},
      requestOptions: { idempotencyKey: 'refund-1' },
    });
  });

  it('responde 503 quando o Mercado Pago não está configurado', async () => {
    config.mercadoPago.accessToken = undefined;
    await expect(gateway.getPayment('1')).rejects.toMatchObject({
      statusCode: 503,
      code: 'PAYMENTS_NOT_CONFIGURED',
    });
  });
});
