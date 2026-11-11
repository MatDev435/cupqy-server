import { prisma } from '../config/prisma.js';

/** Faturamento e quantidade de pedidos CONCLUÍDOS no período (US16 — RN#01). */
export async function completedTotals({ from, to }, db = prisma) {
  const result = await db.order.aggregate({
    where: { status: 'COMPLETED', completedAt: { gte: from, lt: to } },
    _sum: { totalCents: true },
    _count: { _all: true },
  });
  return { revenueCents: result._sum.totalCents ?? 0, orders: result._count._all };
}

export async function revenueByFulfillment({ from, to }, db = prisma) {
  const rows = await db.order.groupBy({
    by: ['fulfillmentType'],
    where: { status: 'COMPLETED', completedAt: { gte: from, lt: to } },
    _sum: { totalCents: true },
  });
  return Object.fromEntries(rows.map((row) => [row.fulfillmentType, row._sum.totalCents ?? 0]));
}

/** Pedidos pagos no período que ainda estão em andamento (ainda não contam como faturamento). */
export async function inProgressTotals({ from, to, statuses }, db = prisma) {
  const result = await db.order.aggregate({
    where: { status: { in: statuses }, paidAt: { gte: from, lt: to } },
    _sum: { totalCents: true },
    _count: { _all: true },
  });
  return { orders: result._count._all, amountCents: result._sum.totalCents ?? 0 };
}

export function countCancelled({ from, to }, db = prisma) {
  return db.order.count({ where: { status: 'CANCELLED', cancelledAt: { gte: from, lt: to } } });
}

export async function ordersByStatus({ from, to }, db = prisma) {
  const rows = await db.order.groupBy({
    by: ['status'],
    where: { createdAt: { gte: from, lt: to } },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
}

/** Série diária (no fuso da loja) de faturamento e pedidos concluídos. */
export async function dailyRevenue({ from, to, timeZone }, db = prisma) {
  const rows = await db.$queryRaw`
    SELECT to_char((completed_at AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS date,
           COALESCE(SUM(total_cents), 0)::bigint AS "revenueCents",
           COUNT(*)::int AS "completedOrders"
      FROM orders
     WHERE status = 'COMPLETED' AND completed_at >= ${from} AND completed_at < ${to}
     GROUP BY 1
     ORDER BY 1`;
  return rows.map((row) => ({ ...row, revenueCents: Number(row.revenueCents) }));
}

/** Cupcakes mais vendidos (pedidos concluídos no período). */
export async function topCupcakes({ from, to, limit }, db = prisma) {
  const rows = await db.$queryRaw`
    SELECT oi.cupcake_id::text AS "cupcakeId",
           MAX(oi.cupcake_name) AS name,
           SUM(oi.quantity)::int AS quantity,
           SUM(oi.subtotal_cents)::bigint AS "revenueCents"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
     WHERE o.status = 'COMPLETED' AND o.completed_at >= ${from} AND o.completed_at < ${to}
     GROUP BY oi.cupcake_id
     ORDER BY quantity DESC, "revenueCents" DESC
     LIMIT ${limit}`;
  return rows.map((row) => ({ ...row, revenueCents: Number(row.revenueCents) }));
}
