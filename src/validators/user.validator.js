import { z } from './zod.js';
import { atLeastOneField, phone, requiredText } from './common.js';

export const updateProfileBody = atLeastOneField(
  z.strictObject({
    fullName: requiredText(120, 2).optional(),
    phone: phone().nullable().optional(),
  }),
);
