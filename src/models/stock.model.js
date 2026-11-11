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
