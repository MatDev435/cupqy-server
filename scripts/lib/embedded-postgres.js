import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';

/** Encontra uma porta TCP livre na máquina local. */
export function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * Inicia um PostgreSQL real a partir dos binários do pacote embedded-postgres
 * (sem Docker). Usado nos testes de integração e no banco local opcional.
 *
 * O locale "C" + UTF8 é usado por ser portável (algumas distros não têm en_US.UTF-8).
 */
export async function startEmbeddedPostgres({ dataDir, port, persistent = false }) {
  mkdirSync(dataDir, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: 'postgres',
    password: 'postgres',
    persistent,
    initdbFlags: ['--locale=C', '--encoding=UTF8', '--lc-messages=C'],
    onLog: () => {},
    onError: () => {},
  });

  if (!existsSync(join(dataDir, 'PG_VERSION'))) {
    await pg.initialise();
  }
  await pg.start();

  return {
    pg,
    port,
    urlFor: (database) => `postgresql://postgres:postgres@127.0.0.1:${port}/${database}`,
  };
}
