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

/**
 * O Prisma grava DateTime sem fuso: a sessão do banco precisa estar em UTC
 * (configurado pela migration database_timezone_utc). Registra um alerta caso contrário.
 */
export async function warnIfDatabaseTimezoneIsNotUtc() {
  try {
    const [{ timezone }] = await prisma.$queryRaw`SELECT current_setting('TimeZone') AS timezone`;
    if (!['UTC', 'Etc/UTC', 'GMT'].includes(timezone)) {
      logger.warn(
        { timezone },
        'O TimeZone da sessão do banco não é UTC; datas gravadas pelo Prisma ficarão deslocadas',
      );
    }
  } catch (error) {
    logger.warn({ err: error }, 'Não foi possível verificar o fuso horário do banco');
  }
}

export async function checkDatabaseConnection() {
  await prisma.$queryRaw`SELECT 1`;
}

export function disconnectDatabase() {
  return prisma.$disconnect();
}
