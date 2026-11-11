import { z } from './zod.js';
import { booleanQuery, csvList, idParams, paginationQuery, slug } from './common.js';

export const listCupcakesQuery = z.object({
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
  category: csvList(slug()),
  flavor: csvList(z.string().max(60)),
  dietaryTags: csvList(slug()),
  includeSoldOut: booleanQuery().default(false),
  sort: z.enum(['name', 'price_asc', 'price_desc']).default('name'),
  ...paginationQuery,
});

export const cupcakeParams = idParams('cupcakeId');
