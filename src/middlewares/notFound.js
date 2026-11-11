import { AppError } from '../utils/AppError.js';

export function notFoundHandler(req, _res, next) {
  next(AppError.notFound(`Rota ${req.method} ${req.path} não encontrada.`, 'ROUTE_NOT_FOUND'));
}
