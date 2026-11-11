import { randomUUID } from 'node:crypto';
import { config } from '../config/env.js';
import { centsToReais } from '../utils/money.js';
import * as orderModel from '../models/order.model.js';
import * as gateway from './payments/mercadoPago.gateway.js';

/**
 * Formas de pagamento do Checkout Pro: Pix e cartão de crédito (US10).
 * Boleto, lotérica, débito e pré-pago são excluídos.
 */
const EXCLUDED_PAYMENT_TYPES = ['ticket', 'atm', 'debit_card', 'prepaid_card'];

/** URL da tela do pedido no front-end (retorno do Checkout Pro). */
export function buildOrderUrl(orderId) {
  return `${config.frontend.url}${config.frontend.orderPath.replace(':orderId', orderId)}`;
}

/**
 * Monta a preferência do Checkout Pro a partir do pedido GRAVADO no banco
 * (valores calculados pelo servidor, nunca pelo front-end).
 */
export function buildPreferenceBody(order, payer, now = new Date()) {
  const items = order.items.map((item) => ({
    id: item.cupcakeId,
    title: item.cupcakeName,
    quantity: item.quantity,
    unit_price: centsToReais(item.unitPriceCents),
    currency_id: 'BRL',
  }));

  if (order.deliveryFeeCents > 0) {
    items.push({
      id: 'delivery-fee',
      title: 'Taxa de entrega',
      quantity: 1,
      unit_price: centsToReais(order.deliveryFeeCents),
      currency_id: 'BRL',
    });
  }

  const orderUrl = buildOrderUrl(order.id);
  const expiresAt = order.paymentExpiresAt.toISOString();

  const body = {
    items,
    external_reference: order.id,
    metadata: { order_id: order.id, order_number: order.orderNumber },
    statement_descriptor: config.mercadoPago.statementDescriptor,
    back_urls: {
      success: `${orderUrl}?pagamento=sucesso`,
      pending: `${orderUrl}?pagamento=pendente`,
      failure: `${orderUrl}?pagamento=falha`,
    },
    expires: true,
    expiration_date_from: now.toISOString(),
    expiration_date_to: expiresAt,
    // Validade do Pix (pagamentos "em dinheiro") alinhada ao prazo do pedido.
    date_of_expiration: expiresAt,
    payment_methods: {
      excluded_payment_types: EXCLUDED_PAYMENT_TYPES.map((id) => ({ id })),
    },
  };

  // No sandbox o comprador deve ser um usuário de teste: não pré-preenchemos o pagador real.
  if (!config.mercadoPago.sandbox && payer?.email) {
    body.payer = { email: payer.email, name: payer.fullName ?? undefined };
  }

  // O Mercado Pago só aceita retorno automático e webhooks em URLs públicas HTTPS.
  if (config.frontend.url.startsWith('https://')) body.auto_return = 'approved';
  if (config.api.publicUrl?.startsWith('https://')) {
    body.notification_url = `${config.api.publicUrl}/api/v1/payments/webhooks/mercadopago?source_news=webhooks`;
  }

  return body;
}

/**
 * Cria a preferência de pagamento do pedido e retorna a URL do Checkout Pro.
 * @returns {Promise<{ preferenceId: string, checkoutUrl: string, sandbox: boolean, expiresAt: Date }>}
 */
export async function createCheckout(order, payer) {
  const preference = await gateway.createPreference(buildPreferenceBody(order, payer), {
    idempotencyKey: `preference-${order.id}-${randomUUID()}`,
  });

  await orderModel.setPreference(order.id, preference.id);

  const sandbox = config.mercadoPago.sandbox;
  return {
    preferenceId: preference.id,
    checkoutUrl: sandbox
      ? (preference.sandboxInitPoint ?? preference.initPoint)
      : preference.initPoint,
    sandbox,
    expiresAt: order.paymentExpiresAt,
  };
}
