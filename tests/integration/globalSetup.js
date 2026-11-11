import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getFreePort, startEmbeddedPostgres } from '../../scripts/lib/embedded-postgres.js';

const PRISMA_BIN = resolve('node_modules/.bin/prisma');

export function migrate(databaseUrl) {
  execFileSync(PRISMA_BIN, ['migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    stdio: 'pipe',
  });
}

function withDatabase(url, database) {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/**
 * Sobe um PostgreSQL real (embedded-postgres) e aplica as migrations antes dos testes de integração.
 * Para usar um servidor já existente (ex.: serviço do CI), defina TEST_DATABASE_URL.
 */
export default async function setup({ provide }) {
  let databaseUrl = process.env.TEST_DATABASE_URL;
  let teardown = async () => {};

  if (!databaseUrl) {
    mkdirSync(resolve('.tmp'), { recursive: true });
    const dataDir = mkdtempSync(join(resolve('.tmp'), 'pg-test-'));
    const port = await getFreePort();
    const { pg, urlFor } = await startEmbeddedPostgres({ dataDir, port });
    await pg.createDatabase('cupqy_test');
    databaseUrl = urlFor('cupqy_test');

    teardown = async () => {
      await pg.stop();
      rmSync(dataDir, { recursive: true, force: true });
    };
  }

  migrate(databaseUrl);

  provide('databaseUrl', databaseUrl);
  provide('maintenanceDatabaseUrl', withDatabase(databaseUrl, 'postgres'));

  return teardown;
}
