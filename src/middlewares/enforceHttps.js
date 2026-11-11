import { AppError } from '../utils/AppError.js';

const EXEMPT_PATHS = new Set(['/health', '/health/ready']);

/**
 * Em produção, exige HTTPS (o Render termina o TLS e informa o protocolo original
 * via X-Forwarded-Proto, interpretado pelo Express graças ao "trust proxy").
 * O health check é isento porque o Render o executa internamente via HTTP.
 */
export function enforceHttps(enabled) {
  return (req, res, next) => {
    if (!enabled || req.secure || EXEMPT_PATHS.has(req.path)) return next();

    if (req.method === 'GET' || req.method === 'HEAD') {
      return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
    }
    return next(AppError.forbidden('Utilize HTTPS para acessar a API.', 'HTTPS_REQUIRED'));
  };
}
