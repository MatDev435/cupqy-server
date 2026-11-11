import { prisma } from '../../src/config/prisma.js';

const TABLES = [
  'order_status_history',
  'payments',
  'order_items',
  'orders',
  'daily_stock',
  'cupcake_dietary_tags',
  'cupcakes',
  'dietary_tags',
  'categories',
  'addresses',
  'profiles',
];

/** Limpa todas as tabelas do domínio e reinicia as sequências (número do pedido volta a 1001). */
export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

export { prisma };
