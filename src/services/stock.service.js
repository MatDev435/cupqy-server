import { config } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import * as stockModel from '../models/stock.model.js';
import { AppError } from '../utils/AppError.js';
import { dateOnlyToDate } from '../utils/dates.js';
import { storeToday } from './storeCalendar.service.js';

/** Resolve a data do estoque: padrão hoje; datas passadas não podem ser alteradas. */
function resolveDate(dateOnly, { allowPast }) {
  const today = storeToday().dateOnly;
  const target = dateOnly ?? today;
  if (!allowPast && target < today) {
    throw AppError.unprocessable(
      'Não é possível alterar o estoque de dias anteriores.',
      'PAST_STOCK_DATE',
    );
  }
  return { dateOnly: target, date: dateOnlyToDate(target) };
}

export function classifyStock(quantity, threshold = config.store.lowStockThreshold) {
  return {
    soldOut: quantity <= 0,
    lowStock: quantity > 0 && quantity < threshold,
  };
}

/** Painel de estoque do dia (US17 — CA#01/CA#03). */
export async function getStockOverview(dateOnly) {
  const { dateOnly: target, date } = resolveDate(dateOnly, { allowPast: true });
  const cupcakes = await stockModel.listCupcakesWithStock(date);
  const threshold = config.store.lowStockThreshold;

  const items = cupcakes.map((cupcake) => {
    const stock = cupcake.dailyStocks[0];
    const quantity = stock?.quantity ?? 0;
    return {
      cupcake,
      quantity,
      isSet: Boolean(stock),
      updatedAt: stock?.updatedAt ?? null,
      ...classifyStock(quantity, threshold),
    };
  });

  const active = items.filter((item) => item.cupcake.isActive);
  return {
    date: target,
    lowStockThreshold: threshold,
    items,
    summary: {
      activeCupcakes: active.length,
      totalUnits: active.reduce((sum, item) => sum + item.quantity, 0),
      lowStock: active.filter((item) => item.lowStock).length,
      soldOut: active.filter((item) => item.soldOut).length,
      notSet: active.filter((item) => !item.isSet).length,
    },
  };
}

/** Alertas de estoque baixo ou esgotado entre os cupcakes ativos. */
export async function getStockAlerts(dateOnly) {
  const overview = await getStockOverview(dateOnly);
  return {
    ...overview,
    items: overview.items.filter(
      (item) => item.cupcake.isActive && (item.lowStock || item.soldOut),
    ),
  };
}

/**
 * Define a quantidade disponível de vários cupcakes de uma vez (US17 — CA#02).
 * Operação atômica: ou todos os itens são gravados, ou nenhum.
 */
export async function setStock({ date: dateOnly, items }) {
  const { dateOnly: target, date } = resolveDate(dateOnly, { allowPast: false });
  const ids = [...new Set(items.map((item) => item.cupcakeId))];
  if (ids.length !== items.length) {
    throw AppError.badRequest('Cada cupcake deve aparecer apenas uma vez.', 'DUPLICATE_CUPCAKE');
  }

  await prisma.$transaction(async (tx) => {
    const existing = await stockModel.findCupcakesByIds(ids, tx);
    if (existing.length !== ids.length) {
      const found = new Set(existing.map((cupcake) => cupcake.id));
      throw AppError.unprocessable('Cupcake não encontrado.', 'CUPCAKE_NOT_FOUND', {
        cupcakeIds: ids.filter((id) => !found.has(id)),
      });
    }
    for (const item of items) {
      await stockModel.upsert(item.cupcakeId, date, item.quantity, tx);
    }
  });

  return getStockOverview(target);
}
