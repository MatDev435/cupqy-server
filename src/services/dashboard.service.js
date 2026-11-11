import { config } from '../config/env.js';
import * as dashboardModel from '../models/dashboard.model.js';
import { addDays, getPeriodRange, toLocalDateString } from '../utils/dates.js';
import { KITCHEN_STATUSES, OrderStatus } from './orderStatus.js';

/** Preenche os dias sem vendas com zero, até hoje (ou até o fim do período, se já passou). */
function fillDailySeries(rows, { startDate, endDate }, today) {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const lastDate = today < endDate ? today : addDays(endDate, -1);
  const series = [];
  for (let date = startDate; date <= lastDate; date = addDays(date, 1)) {
    series.push(byDate.get(date) ?? { date, revenueCents: 0, completedOrders: 0 });
  }
  return series;
}

/**
 * Painel financeiro (US16): faturamento e pedidos fechados no período (hoje, semana ou mês),
 * calculados por agregações no banco.
 * @param {'today' | 'week' | 'month'} period
 */
export async function getDashboard(period, now = new Date()) {
  const timeZone = config.store.timeZone;
  const range = getPeriodRange(period, timeZone, now);
  const window = { from: range.from, to: range.to };

  const [completed, byFulfillment, inProgress, cancelledOrders, byStatus, daily, top] =
    await Promise.all([
      dashboardModel.completedTotals(window),
      dashboardModel.revenueByFulfillment(window),
      dashboardModel.inProgressTotals({ ...window, statuses: KITCHEN_STATUSES }),
      dashboardModel.countCancelled(window),
      dashboardModel.ordersByStatus(window),
      dashboardModel.dailyRevenue({ ...window, timeZone }),
      dashboardModel.topCupcakes({ ...window, limit: 5 }),
    ]);

  return {
    period,
    timeZone,
    range: {
      startDate: range.startDate,
      endDate: addDays(range.endDate, -1),
      from: range.from,
      to: range.to,
    },
    revenueCents: completed.revenueCents,
    completedOrders: completed.orders,
    averageTicketCents: completed.orders
      ? Math.round(completed.revenueCents / completed.orders)
      : 0,
    revenueByFulfillment: { DELIVERY: 0, PICKUP: 0, ...byFulfillment },
    inProgress,
    cancelledOrders,
    ordersByStatus: Object.fromEntries(
      Object.values(OrderStatus).map((status) => [status, byStatus[status] ?? 0]),
    ),
    daily: fillDailySeries(daily, range, toLocalDateString(now, timeZone)),
    topCupcakes: top,
    generatedAt: now,
  };
}
