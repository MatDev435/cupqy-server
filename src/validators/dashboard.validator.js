import { z } from './zod.js';

export const dashboardQuery = z.object({
  period: z.enum(['today', 'week', 'month']).default('today'),
});
