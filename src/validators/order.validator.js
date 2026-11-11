import { z } from './zod.js';
import { idParams, optionalText, paginationQuery } from './common.js';
import { cartItems } from './cart.validator.js';
import {
  ADDRESS_CHOICE_ERROR,
  deliverySelection,
  exactlyOneAddress,
  pickupSelection,
} from './shipping.validator.js';

const checkoutFields = {
  items: cartItems,
  notes: optionalText(500),
  saveAddress: z.boolean().optional(),
};

export const createOrderBody = z
  .discriminatedUnion('fulfillmentType', [
    z.strictObject({ ...pickupSelection, ...checkoutFields }),
    z.strictObject({ ...deliverySelection, ...checkoutFields }),
  ])
  .refine(exactlyOneAddress, ADDRESS_CHOICE_ERROR)
  .refine((data) => !data.saveAddress || Boolean(data.address), {
    error: 'saveAddress só se aplica a um novo endereço de entrega.',
    path: ['saveAddress'],
  });

export const listOrdersQuery = z.object({
  scope: z.enum(['active', 'history', 'all']).default('all'),
  ...paginationQuery,
});

export const orderParams = idParams('orderId');
