import { z } from './zod.js';
import { idParams, optionalText } from './common.js';
import { KITCHEN_STATUSES } from '../services/orderStatus.js';

export const kitchenOrdersQuery = z.object({
  status: z.enum(KITCHEN_STATUSES).optional(),
  fulfillmentType: z.enum(['DELIVERY', 'PICKUP']).optional(),
});

export const advanceOrderBody = z.strictObject({
  expectedStatus: z.enum(KITCHEN_STATUSES).optional(),
  courierName: optionalText(120),
});

export const kitchenOrderParams = idParams('orderId');
