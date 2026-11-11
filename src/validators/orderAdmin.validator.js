import { z } from './zod.js';
import { csvList, idParams, optionalText, paginationQuery } from './common.js';
import { isValidDateOnly } from '../utils/dates.js';
import { OrderStatus } from '../services/orderStatus.js';

const dateOnly = () =>
  z.string().refine(isValidDateOnly, 'Data inválida. Use o formato AAAA-MM-DD.');

export const listAdminOrdersQuery = z
  .object({
    status: csvList(z.enum(Object.values(OrderStatus))),
    fulfillmentType: z.enum(['DELIVERY', 'PICKUP']).optional(),
    from: dateOnly().optional(),
    to: dateOnly().optional(),
    orderNumber: z.coerce.number().int().positive().optional(),
    ...paginationQuery,
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    error: 'A data inicial deve ser anterior ou igual à final.',
    path: ['from'],
  });

export const adminCancelOrderBody = z.strictObject({ reason: optionalText(200) });

export const adminOrderParams = idParams('orderId');
