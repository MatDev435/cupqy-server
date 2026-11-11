import * as cupcakeModel from '../models/cupcake.model.js';
import { AppError } from '../utils/AppError.js';
import { getPublicUrl } from './storage.service.js';
import { storeToday } from './storeCalendar.service.js';

export const MAX_QUANTITY_PER_ITEM = 50;
export const MAX_CART_ITEMS = 30;

export const CartItemStatus = Object.freeze({
  OK: 'OK',
  UNAVAILABLE: 'UNAVAILABLE',
  SOLD_OUT: 'SOLD_OUT',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
});

/** Soma quantidades de itens repetidos, preservando a ordem de inclusão. */
export function mergeItems(items) {
  const merged = new Map();
  for (const { cupcakeId, quantity } of items) {
    merged.set(cupcakeId, (merged.get(cupcakeId) ?? 0) + quantity);
  }
  return [...merged].map(([cupcakeId, quantity]) => ({ cupcakeId, quantity }));
}

function evaluateLine({ cupcakeId, quantity }, cupcake) {
  if (!cupcake || !cupcake.isActive || cupcake.deletedAt) {
    return {
      cupcakeId,
      name: cupcake?.name ?? null,
      flavor: cupcake?.flavor ?? null,
      imageUrl: getPublicUrl(cupcake?.imagePath),
      unitPriceCents: null,
      quantity,
      availableQuantity: 0,
      subtotalCents: 0,
      status: CartItemStatus.UNAVAILABLE,
    };
  }

  const availableQuantity = cupcake.dailyStocks[0]?.quantity ?? 0;
  let status = CartItemStatus.OK;
  if (availableQuantity <= 0) status = CartItemStatus.SOLD_OUT;
  else if (quantity > availableQuantity) status = CartItemStatus.INSUFFICIENT_STOCK;
  if (quantity > MAX_QUANTITY_PER_ITEM) status = CartItemStatus.INSUFFICIENT_STOCK;

  return {
    cupcakeId,
    name: cupcake.name,
    flavor: cupcake.flavor,
    imageUrl: getPublicUrl(cupcake.imagePath),
    // Preço SEMPRE do banco (o front-end não define valores).
    unitPriceCents: cupcake.priceCents,
    quantity,
    availableQuantity: Math.min(availableQuantity, MAX_QUANTITY_PER_ITEM),
    subtotalCents: status === CartItemStatus.OK ? cupcake.priceCents * quantity : 0,
    status,
  };
}

/**
 * Avalia um carrinho com preços e estoque atuais (US07 RN#01, US08 RN#02).
 * Não reserva estoque: a baixa ocorre na confirmação do pagamento.
 *
 * @param {Array<{ cupcakeId: string, quantity: number }>} items
 */
export async function evaluateCart(items, { db } = {}) {
  const merged = mergeItems(items);
  if (merged.length > MAX_CART_ITEMS) {
    throw AppError.unprocessable(
      `O carrinho pode ter no máximo ${MAX_CART_ITEMS} cupcakes diferentes.`,
      'CART_TOO_LARGE',
    );
  }

  const { date, dateOnly } = storeToday();
  const cupcakes = await cupcakeModel.findForCart(
    merged.map((item) => item.cupcakeId),
    date,
    db,
  );
  const byId = new Map(cupcakes.map((cupcake) => [cupcake.id, cupcake]));

  const lines = merged.map((item) => evaluateLine(item, byId.get(item.cupcakeId)));
  const subtotalCents = lines.reduce((sum, line) => sum + line.subtotalCents, 0);
  const issues = lines
    .filter((line) => line.status !== CartItemStatus.OK)
    .map(({ cupcakeId, name, status, quantity, availableQuantity }) => ({
      cupcakeId,
      name,
      status,
      requestedQuantity: quantity,
      availableQuantity,
    }));

  return {
    stockDate: dateOnly,
    items: lines,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotalCents,
    issues,
    canCheckout: issues.length === 0 && subtotalCents > 0,
  };
}
