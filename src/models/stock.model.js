import { prisma } from '../config/prisma.js';

/** Cupcakes gerenciáveis (não excluídos) com o estoque da data. */
export function listCupcakesWithStock(date, db = prisma) {
  return db.cupcake.findMany({
    where: { deletedAt: null },
    include: { dailyStocks: { where: { date }, take: 1 } },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
}

export function findCupcakesByIds(ids, db = prisma) {
  return db.cupcake.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } });
}

export function upsert(cupcakeId, date, quantity, db = prisma) {
  return db.dailyStock.upsert({
    where: { cupcakeId_date: { cupcakeId, date } },
    update: { quantity },
    create: { cupcakeId, date, quantity },
  });
}

/** Estoque disponível por cupcake em uma data (Map cupcakeId → quantidade). */
export async function getAvailability(cupcakeIds, date, db = prisma) {
  const rows = await db.dailyStock.findMany({
    where: { cupcakeId: { in: cupcakeIds }, date },
    select: { cupcakeId: true, quantity: true },
  });
  return new Map(rows.map((row) => [row.cupcakeId, row.quantity]));
}

/**
 * Bloqueia (FOR UPDATE) as linhas de estoque dos cupcakes em uma data, sempre na mesma ordem
 * (evita deadlocks entre compras simultâneas). Retorna Map cupcakeId → quantidade.
 */
export async function lockForUpdate(cupcakeIds, dateOnly, db) {
  const rows = await db.$queryRaw`
    SELECT cupcake_id::text AS "cupcakeId", quantity
      FROM daily_stock
     WHERE date = ${dateOnly}::date
       AND cupcake_id = ANY(${cupcakeIds}::uuid[])
     ORDER BY cupcake_id
       FOR UPDATE`;
  return new Map(rows.map((row) => [row.cupcakeId, row.quantity]));
}

/**
 * Baixa condicional: só subtrai se houver quantidade suficiente.
 * Retorna true se a baixa aconteceu.
 */
export async function decrement(cupcakeId, date, quantity, db) {
  const { count } = await db.dailyStock.updateMany({
    where: { cupcakeId, date, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } },
  });
  return count === 1;
}

/** Devolve unidades ao estoque de uma data (ex.: pedido pago cancelado no mesmo dia). */
export function increment(cupcakeId, date, quantity, db) {
  return db.dailyStock.upsert({
    where: { cupcakeId_date: { cupcakeId, date } },
    update: { quantity: { increment: quantity } },
    create: { cupcakeId, date, quantity },
  });
}
