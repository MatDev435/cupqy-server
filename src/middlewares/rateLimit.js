import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/**
 * Chave do limitador: usuário autenticado (quando houver) ou IP.
 * O ipKeyGenerator agrupa endereços IPv6 por sub-rede, evitando burlas.
 */
export function userOrIpKey(req) {
  return req.user?.id ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`;
}

/**
 * Cria um limitador de requisições com resposta padronizada (429).
 *
 * @param {object} options
 * @param {number} options.windowMs Janela de tempo em milissegundos
 * @param {number} options.limit Máximo de requisições por janela
 * @param {string} [options.message] Mensagem exibida ao cliente
 * @param {(req: import('express').Request) => string} [options.keyGenerator]
 * @param {() => boolean} [options.isEnabled] Permite desligar em testes/ambientes locais
 */
export function createRateLimiter({
  windowMs,
  limit,
  message,
  keyGenerator = userOrIpKey,
  isEnabled = () => config.rateLimit.enabled,
}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator,
    skip: () => !isEnabled(),
    handler: (_req, _res, next) => next(AppError.tooManyRequests(message)),
  });
}

/** Limite geral aplicado a toda a API. */
export const globalRateLimiter = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.max,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip)}`,
});
