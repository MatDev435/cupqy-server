import * as healthService from '../services/health.service.js';

export function liveness(_req, res) {
  res.json(healthService.getLiveness());
}

export async function readiness(_req, res) {
  const result = await healthService.getReadiness();
  res.status(result.status === 'ok' ? 200 : 503).json(result);
}
