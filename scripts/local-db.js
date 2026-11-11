/**
 * Banco PostgreSQL local opcional para desenvolvimento sem Supabase.
 * Uso: npm run db:local  (mantém o processo aberto; Ctrl+C para encerrar)
 *
 * Depois, use no .env:
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/cupqy
 */
import { resolve } from 'node:path';
import { startEmbeddedPostgres } from './lib/embedded-postgres.js';

const PORT = Number(process.env.LOCAL_DB_PORT ?? 54329);
const DATABASE = 'cupqy';

const { pg, urlFor } = await startEmbeddedPostgres({
  dataDir: resolve('.tmp/local-db'),
  port: PORT,
  persistent: true,
});

try {
  await pg.createDatabase(DATABASE);
} catch {
  // O banco já existe (dados persistidos em .tmp/local-db).
}

console.log(`PostgreSQL local pronto: ${urlFor(DATABASE)}`);

async function stop() {
  await pg.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
