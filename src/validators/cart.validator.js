import { z } from './zod.js';
import { uuid } from './common.js';
import { MAX_CART_ITEMS, MAX_QUANTITY_PER_ITEM } from '../services/cart.service.js';

export const cartItems = z
  .array(
    z.strictObject({
      cupcakeId: uuid(),
      quantity: z
        .number()
        .int('A quantidade deve ser um número inteiro.')
        .min(1, 'A quantidade mínima é 1.')
        .max(MAX_QUANTITY_PER_ITEM, `A quantidade máxima por item é ${MAX_QUANTITY_PER_ITEM}.`),
    }),
  )
  .min(1, 'O carrinho está vazio.')
  .max(MAX_CART_ITEMS * 2);

export const validateCartBody = z.strictObject({ items: cartItems });
