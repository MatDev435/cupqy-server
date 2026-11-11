import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Configuração da CLI do Prisma (migrations, generate, seed).
 *
 * As migrations usam DIRECT_URL (conexão de sessão do Supabase, porta 5432) quando definida,
 * pois o pooler em modo transação (porta 6543) não suporta todos os comandos de DDL.
 * Em tempo de execução a API usa DATABASE_URL (ver src/config/prisma.js).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.js',
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || '',
  },
});
