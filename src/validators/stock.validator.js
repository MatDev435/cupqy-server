import { z } from './zod.js';
import { idParams, uuid } from './common.js';
import { isValidDateOnly } from '../utils/dates.js';

const dateOnly = () =>
  z.string().refine(isValidDateOnly, 'Data inválida. Use o formato AAAA-MM-DD.');

const quantity = () =>
  z.number().int('A quantidade deve ser um número inteiro.').min(0).max(10_000);

export const stockDateQuery = z.object({ date: dateOnly().optional() });

export const setStockBody = z.strictObject({
  date: dateOnly().optional(),
  items: z
    .array(z.strictObject({ cupcakeId: uuid(), quantity: quantity() }))
    .min(1)
    .max(200),
});

export const setSingleStockBody = z.strictObject({
  date: dateOnly().optional(),
  quantity: quantity(),
});

export const stockParams = idParams('cupcakeId');
