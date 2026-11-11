import pino from 'pino';
import { config } from './env.js';

function prettyTransportIfAvailable() {
  if (!config.isDevelopment) return undefined;
  try {
    import.meta.resolve('pino-pretty');
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname,service,env',
      },
    };
  } catch {
    return undefined;
  }
}

/**
 * Logger estruturado (JSON em produção). Dados sensíveis são mascarados.
 */
export const logger = pino({
  level: config.logLevel,
  base: { service: 'cupqy-server', env: config.env },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-signature"]',
      '*.password',
      '*.accessToken',
      '*.token',
      '*.access_token',
    ],
    censor: '[REDACTED]',
  },
  transport: prettyTransportIfAvailable(),
});
