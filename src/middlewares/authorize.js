import { hasPermission } from '../config/permissions.js';
import { AppError } from '../utils/AppError.js';

/**
 * Exige que o usuário autenticado tenha TODAS as permissões informadas.
 * Deve ser usado depois do middleware authenticate.
 *
 * @param {...string} permissions Valores de Permissions (config/permissions.js)
 */
export function authorize(...permissions) {
  return (req, _res, next) => {
    if (!req.user)
      return next(AppError.unauthorized('Faça login para continuar.', 'MISSING_TOKEN'));

    const allowed = permissions.every((permission) => hasPermission(req.user.role, permission));
    if (!allowed) return next(AppError.forbidden());

    return next();
  };
}

/** Exige que o usuário tenha um dos papéis informados. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user)
      return next(AppError.unauthorized('Faça login para continuar.', 'MISSING_TOKEN'));
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    return next();
  };
}
