import * as authService from '../services/auth.service.js';
import { AppError } from '../utils/AppError.js';

async function attachUser(req, token) {
  req.user = await authService.authenticateRequest(token);
  req.log = req.log?.child({ userId: req.user.id }) ?? req.log;
}

/**
 * Exige um Access Token válido do Supabase Auth no cabeçalho Authorization.
 * Disponibiliza o usuário autenticado em req.user ({ id, email, role, profile }).
 */
export async function authenticate(req, _res, next) {
  const token = authService.extractBearerToken(req.headers.authorization);
  if (!token) {
    throw AppError.unauthorized('Faça login para continuar.', 'MISSING_TOKEN');
  }
  await attachUser(req, token);
  next();
}
