import pkg from '../../package.json' with { type: 'json' };
import { checkDatabaseConnection } from '../config/prisma.js';

/** Dependências verificadas pelo endpoint de prontidão. */
const readinessChecks = [{ name: 'database', check: checkDatabaseConnection }];

export function getLiveness() {
  return {
    status: 'ok',
    service: pkg.name,
    version: pkg.version,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

export async function getReadiness() {
  const results = await Promise.all(
    readinessChecks.map(async ({ name, check }) => {
      try {
        await check();
        return { name, status: 'ok' };
      } catch {
        return { name, status: 'error' };
      }
    }),
  );

  const healthy = results.every((result) => result.status === 'ok');
  return { status: healthy ? 'ok' : 'error', checks: results };
}
