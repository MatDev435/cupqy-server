/**
 * Utilitários de data no fuso horário da loja.
 *
 * O estoque é DIÁRIO e o dashboard filtra por "hoje/semana/mês" — sempre no horário local da
 * loja (ex.: America/Sao_Paulo), independentemente do fuso do servidor (o Render usa UTC).
 * Datas "puras" (sem horário) são representadas como strings YYYY-MM-DD e, no banco,
 * como colunas DATE (Date em UTC à meia-noite no Prisma).
 */

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  );
}

/** Data local (YYYY-MM-DD) de um instante no fuso informado. */
export function toLocalDateString(date, timeZone) {
  const { year, month, day } = getParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isValidDateOnly(value) {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Converte YYYY-MM-DD para o Date usado pelo Prisma em colunas DATE. */
export function dateOnlyToDate(value) {
  if (!isValidDateOnly(value)) throw new RangeError(`Data inválida: ${value}`);
  return new Date(`${value}T00:00:00.000Z`);
}

/** Converte um Date de coluna DATE de volta para YYYY-MM-DD. */
export function dateToDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

/** Diferença (ms) entre o horário local do fuso e UTC em um instante. */
function getTimeZoneOffsetMs(date, timeZone) {
  const { year, month, day, hour, minute, second } = getParts(date, timeZone);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instante (UTC) correspondente à meia-noite local de uma data YYYY-MM-DD no fuso. */
export function startOfLocalDay(dateOnly, timeZone) {
  const utcMidnight = dateOnlyToDate(dateOnly).getTime();
  let instant = utcMidnight - getTimeZoneOffsetMs(new Date(utcMidnight), timeZone);
  // Recalcula para cobrir mudanças de horário de verão próximas da meia-noite.
  instant = utcMidnight - getTimeZoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** Soma dias a uma data YYYY-MM-DD. */
export function addDays(dateOnly, days) {
  const date = dateOnlyToDate(dateOnly);
  date.setUTCDate(date.getUTCDate() + days);
  return dateToDateOnly(date);
}

/**
 * Intervalo [from, to) de um período no fuso da loja.
 * - today: dia atual
 * - week: semana atual (segunda a domingo)
 * - month: mês atual
 *
 * @param {'today' | 'week' | 'month'} period
 */
export function getPeriodRange(period, timeZone, now = new Date()) {
  const today = toLocalDateString(now, timeZone);
  let startDate;
  let endDate;

  if (period === 'today') {
    startDate = today;
    endDate = addDays(today, 1);
  } else if (period === 'week') {
    const weekday = dateOnlyToDate(today).getUTCDay(); // 0 = domingo
    const daysSinceMonday = (weekday + 6) % 7;
    startDate = addDays(today, -daysSinceMonday);
    endDate = addDays(startDate, 7);
  } else if (period === 'month') {
    startDate = `${today.slice(0, 7)}-01`;
    const next = dateOnlyToDate(startDate);
    next.setUTCMonth(next.getUTCMonth() + 1);
    endDate = dateToDateOnly(next);
  } else {
    throw new RangeError(`Período inválido: ${period}`);
  }

  return {
    startDate,
    endDate,
    from: startOfLocalDay(startDate, timeZone),
    to: startOfLocalDay(endDate, timeZone),
  };
}
