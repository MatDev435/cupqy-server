import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';
import { logger } from '../config/logger.js';

const PRISMA_ERRORS = {
  P2002: () =>
    AppError.conflict('Já existe um registro com estes dados.', 'UNIQUE_CONSTRAINT_VIOLATION'),
  P2003: () =>
    AppError.conflict(
      'Operação viola a integridade referencial dos dados.',
      'FOREIGN_KEY_VIOLATION',
    ),
  P2025: () => AppError.notFound('Registro não encontrado.'),
};

export function formatZodIssues(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Converte qualquer erro em um AppError com resposta segura para o cliente.
 * Erros inesperados viram 500 genérico (detalhes ficam apenas nos logs).
 */
export function normalizeError(err) {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    return AppError.badRequest('Dados inválidos.', 'VALIDATION_ERROR', formatZodIssues(err));
  }

  // Erros do body-parser (express.json)
  if (err?.type === 'entity.parse.failed') {
    return AppError.badRequest('O corpo da requisição não é um JSON válido.', 'INVALID_JSON');
  }
  if (err?.type === 'entity.too.large') {
    return new AppError(
      413,
      'PAYLOAD_TOO_LARGE',
      'O corpo da requisição excede o tamanho permitido.',
    );
  }

  // Erros conhecidos do Prisma (sem acoplar o handler ao pacote)
  if (err?.name === 'PrismaClientKnownRequestError' && PRISMA_ERRORS[err.code]) {
    return PRISMA_ERRORS[err.code]();
  }

  return new AppError(500, 'INTERNAL_ERROR', 'Erro interno do servidor.');
}

// A aridade 4 é obrigatória: é assim que o Express identifica um error handler.
export function errorHandler(err, req, res, _next) {
  const appError = normalizeError(err);
  const log = req.log ?? logger;

  if (appError.statusCode >= 500) {
    log.error({ err }, 'Erro não tratado');
  } else {
    log.debug({ code: appError.code, message: appError.message }, 'Erro de requisição');
  }

  if (res.headersSent) {
    res.end();
    return;
  }

  const body = { error: { code: appError.code, message: appError.message } };
  if (appError.details !== undefined) body.error.details = appError.details;
  if (req.id) body.requestId = req.id;

  res.status(appError.statusCode).json(body);
}
