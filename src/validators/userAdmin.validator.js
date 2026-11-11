import { z } from './zod.js';
import { booleanQuery, idParams, paginationQuery } from './common.js';

const role = z.enum(['CUSTOMER', 'BAKER', 'ADMIN'], { error: 'Papel inválido.' });

export const listUsersQuery = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  role: role.optional(),
  includeDeleted: booleanQuery().default(false),
  ...paginationQuery,
});

export const userParams = idParams('userId');

export const changeRoleBody = z.strictObject({ role });
