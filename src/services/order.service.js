import { config } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { Permissions, hasPermission } from '../config/permissions.js';
import * as orderModel from '../models/order.model.js';
import { AppError } from '../utils/AppError.js';
import { buildPageMeta, toSkipTake } from '../utils/pagination.js';
import { CartItemStatus, evaluateCart } from './cart.service.js';
import { FINAL_STATUSES, OrderStatus } from './orderStatus.js';
import * as shippingService from './shipping.service.js';
import * as paymentService from './payment.service.js';

const SCOPES = {
  active: Object.values(OrderStatus).filter((status) => !FINAL_STATUSES.includes(status)),
  history: FINAL_STATUSES,
  all: undefined,
};

export function orderNotFound() {
  return AppError.notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND');
}

/**
 * Cria o pedido a partir do carrinho (US10 — RN#03: status inicial "Aguardando pagamento").
 *
 * Preços, subtotal, frete e total são SEMPRE calculados no servidor. O estoque é verificado
 * aqui, mas a baixa só acontece na confirmação do pagamento (US17 — RN#01).
 */
export async function createOrder(user, input) {
  const pending = await orderModel.countAwaitingPaymentByUser(user.id);
  if (pending >= config.orders.maxPendingPerUser) {
    throw AppError.conflict(
      'Você tem pedidos aguardando pagamento. Pague ou cancele-os antes de criar um novo.',
      'TOO_MANY_PENDING_ORDERS',
      { pending },
    );
  }

  const cart = await evaluateCart(input.items);
  if (!cart.canCheckout) {
    throw AppError.conflict(
      'Alguns itens do carrinho não estão mais disponíveis nas quantidades escolhidas.',
      'CART_UNAVAILABLE',
      { issues: cart.issues },
    );
  }

  const shipping = await shippingService.quote({
    userId: user.id,
    fulfillmentType: input.fulfillmentType,
    addressId: input.addressId,
    address: input.address,
  });

  const subtotalCents = cart.subtotalCents;
  const deliveryFeeCents = shipping.feeCents;
  const paymentExpiresAt = new Date(
    Date.now() + config.orders.paymentExpirationMinutes * 60 * 1000,
  );

  const order = await prisma.$transaction((tx) =>
    orderModel.create(
      {
        userId: user.id,
        status: OrderStatus.AWAITING_PAYMENT,
        fulfillmentType: input.fulfillmentType,
        subtotalCents,
        deliveryFeeCents,
        totalCents: subtotalCents + deliveryFeeCents,
        notes: input.notes ?? null,
        deliveryAddress: shipping.deliveryAddress ?? undefined,
        deliveryDistanceKm: shipping.distanceKm,
        estimatedMinutes: shipping.estimatedMinutes,
        saveAddress: Boolean(input.saveAddress && input.address),
        paymentExpiresAt,
        items: {
          create: cart.items.map((line) => ({
            cupcakeId: line.cupcakeId,
            cupcakeName: line.name,
            unitPriceCents: line.unitPriceCents,
            quantity: line.quantity,
            subtotalCents: line.subtotalCents,
          })),
        },
        statusHistory: {
          create: {
            toStatus: OrderStatus.AWAITING_PAYMENT,
            changedById: user.id,
            note: 'Pedido criado',
          },
        },
      },
      tx,
    ),
  );

  logger.info({ orderId: order.id, orderNumber: order.orderNumber }, 'Pedido criado');

  try {
    const checkout = await paymentService.createCheckout(order, user.profile ?? user);
    return { order, checkout };
  } catch (error) {
    // Sem preferência de pagamento o pedido não pode ser pago: cancela para não ficar pendurado.
    await cancelBySystem(order.id, 'PAYMENT_SETUP_FAILED', 'Falha ao iniciar o pagamento');
    throw error;
  }
}

async function cancelBySystem(orderId, reason, note) {
  await prisma.$transaction(async (tx) => {
    const updated = await orderModel.updateIfStatus(
      orderId,
      [OrderStatus.AWAITING_PAYMENT],
      { status: OrderStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: reason },
      tx,
    );
    if (updated) {
      await orderModel.addStatusHistory(
        {
          orderId,
          fromStatus: OrderStatus.AWAITING_PAYMENT,
          toStatus: OrderStatus.CANCELLED,
          note,
        },
        tx,
      );
    }
  });
}

/**
 * Gera um novo link de pagamento para um pedido do cliente que ainda aguarda pagamento
 * (ex.: o cliente fechou a janela do Checkout Pro ou o pagamento foi recusado — US10 CA#04).
 */
export async function startPayment(user, orderId) {
  const order = await orderModel.findById(orderId);
  if (!order || order.userId !== user.id) throw orderNotFound();

  if (order.status !== OrderStatus.AWAITING_PAYMENT) {
    throw AppError.conflict('Este pedido não está aguardando pagamento.', 'ORDER_NOT_PAYABLE');
  }
  if (order.paymentExpiresAt <= new Date()) {
    throw AppError.conflict(
      'O prazo para pagamento deste pedido expirou. Faça um novo pedido.',
      'ORDER_PAYMENT_EXPIRED',
    );
  }

  const checkout = await paymentService.createCheckout(order, user.profile ?? user);
  return { order: await orderModel.findById(orderId), checkout };
}

/** Histórico de pedidos do cliente, do mais recente ao mais antigo (US12 — 20 por página). */
export async function listMyOrders(userId, { scope, page, pageSize }) {
  const { items, total } = await orderModel.listByUser(userId, {
    statuses: SCOPES[scope],
    ...toSkipTake({ page, pageSize }),
  });
  return { items, meta: buildPageMeta({ page, pageSize }, total) };
}

/**
 * Busca um pedido respeitando a privacidade: o cliente só vê os próprios pedidos;
 * a equipe (confeiteiro/admin) vê qualquer um. Pedidos de terceiros respondem 404.
 */
export async function getOrderForUser(user, orderId) {
  const order = await orderModel.findById(orderId);
  const canReadAny = hasPermission(user.role, Permissions.ORDERS_READ_ANY);
  if (!order || (order.userId !== user.id && !canReadAny)) throw orderNotFound();
  return order;
}

/** O cliente pode cancelar o próprio pedido enquanto ele aguarda pagamento. */
export async function cancelMyOrder(user, orderId) {
  const order = await orderModel.findById(orderId);
  if (!order || order.userId !== user.id) throw orderNotFound();

  await prisma.$transaction(async (tx) => {
    const updated = await orderModel.updateIfStatus(
      orderId,
      [OrderStatus.AWAITING_PAYMENT],
      {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: 'CUSTOMER_REQUEST',
      },
      tx,
    );
    if (!updated) {
      throw AppError.conflict(
        'Apenas pedidos aguardando pagamento podem ser cancelados pelo cliente.',
        'ORDER_NOT_CANCELLABLE',
      );
    }
    await orderModel.addStatusHistory(
      {
        orderId,
        fromStatus: OrderStatus.AWAITING_PAYMENT,
        toStatus: OrderStatus.CANCELLED,
        changedById: user.id,
        note: 'Cancelado pelo cliente',
      },
      tx,
    );
  });

  return orderModel.findById(orderId);
}

/**
 * Consulta o Mercado Pago e atualiza o pedido (retorno do Checkout Pro ou atraso do webhook).
 * A confirmação vem SEMPRE do gateway, nunca dos parâmetros do redirecionamento.
 */
export async function syncPayment(user, orderId, { paymentId } = {}) {
  await getOrderForUser(user, orderId);
  await paymentService.syncOrderPayments(orderId, { paymentId });
  return orderModel.findById(orderId);
}

/**
 * "Repetir pedido" (US12 — CA#05): monta um carrinho com os mesmos cupcakes de um pedido anterior.
 * RN#01: inclui apenas o que tem estoque hoje (quantidades ajustadas ao disponível) e informa o que
 * ficou de fora. RN#02: usa os preços ATUAIS, não os da época do pedido original.
 */
export async function buildReorderCart(user, orderId) {
  const order = await orderModel.findById(orderId);
  if (!order || order.userId !== user.id) throw orderNotFound();

  const cart = await evaluateCart(
    order.items.map((item) => ({ cupcakeId: item.cupcakeId, quantity: item.quantity })),
  );
  const previousPrices = new Map(order.items.map((item) => [item.cupcakeId, item.unitPriceCents]));
  const previousNames = new Map(order.items.map((item) => [item.cupcakeId, item.cupcakeName]));

  const items = [];
  const adjusted = [];
  const unavailable = [];

  for (const line of cart.items) {
    if (line.status === CartItemStatus.OK || line.status === CartItemStatus.INSUFFICIENT_STOCK) {
      const quantity = Math.min(line.quantity, line.availableQuantity);
      if (quantity < line.quantity) {
        adjusted.push({
          cupcakeId: line.cupcakeId,
          name: line.name,
          requestedQuantity: line.quantity,
          addedQuantity: quantity,
        });
      }
      items.push({
        cupcakeId: line.cupcakeId,
        name: line.name,
        flavor: line.flavor,
        imageUrl: line.imageUrl,
        unitPriceCents: line.unitPriceCents,
        previousUnitPriceCents: previousPrices.get(line.cupcakeId),
        quantity,
        subtotalCents: line.unitPriceCents * quantity,
      });
    } else {
      unavailable.push({
        cupcakeId: line.cupcakeId,
        name: line.name ?? previousNames.get(line.cupcakeId),
        reason: line.status,
      });
    }
  }

  const subtotalCents = items.reduce((sum, item) => sum + item.subtotalCents, 0);
  return {
    sourceOrderId: order.id,
    sourceOrderNumber: order.orderNumber,
    items,
    subtotalCents,
    adjusted,
    unavailable,
    canCheckout: items.length > 0,
  };
}
