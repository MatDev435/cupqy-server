import { z } from './zod.js';

export const deleteAccountBody = z.strictObject({
  password: z.string().min(1, 'Informe sua senha atual para confirmar a exclusão.').max(200),
});
