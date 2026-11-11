import { config } from '../config/env.js';
import { dateOnlyToDate, toLocalDateString } from '../utils/dates.js';

/**
 * "Hoje" no fuso horário da loja (o estoque é diário).
 * @returns {{ dateOnly: string, date: Date }} date = valor usado em colunas DATE do Prisma
 */
export function storeToday(now = new Date()) {
  const dateOnly = toLocalDateString(now, config.store.timeZone);
  return { dateOnly, date: dateOnlyToDate(dateOnly) };
}
