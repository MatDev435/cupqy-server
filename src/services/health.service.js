import pkg from '../../package.json' with { type: 'json' };

/** @type {Array<{ name: string, check: () => Promise<void> }>} */
const readinessChecks = [];

/** Registra uma dependência verificada pelo endpoint de prontidão (ex.: banco). */
export function registerReadinessCheck(name, check) {
  readinessChecks.push({ name, check });
}

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
