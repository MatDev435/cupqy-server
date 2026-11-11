import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from './env.js';
import { logger } from './logger.js';

function buildPoolConfig() {
  const poolConfig = {
    connectionString: config.database.url,
    max: config.database.poolMax,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  };

  // Certificado da CA do Supabase (Database Settings → SSL) para validar o TLS.
  if (config.database.sslCa) {
    poolConfig.ssl = { ca: config.database.sslCa, rejectUnauthorized: true };
  }

  return poolConfig;
}

/**
 * Cliente Prisma único da aplicação, conectado via driver adapter do node-postgres.
 * A conexão é aberta sob demanda (na primeira consulta).
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg(buildPoolConfig()),
  log: [
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ],
});

prisma.$on('warn', (event) => logger.warn({ prisma: event }, 'Aviso do Prisma'));
prisma.$on('error', (event) => logger.error({ prisma: event }, 'Erro do Prisma'));

export async function checkDatabaseConnection() {
  await prisma.$queryRaw`SELECT 1`;
}

export function disconnectDatabase() {
  return prisma.$disconnect();
}
