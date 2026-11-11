import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Reaproveita o X-Request-Id recebido (quando válido) para rastrear a requisição
 * entre front-end, proxy do Render e logs; caso contrário gera um novo.
 */
export function resolveRequestId(req, res) {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

export const requestLogger = pinoHttp({
  logger,
  genReqId: resolveRequestId,
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.originalUrl ?? req.url} ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.originalUrl ?? req.url} ${res.statusCode}`,
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
});
