/**
 * Erro de aplicação com status HTTP e código estável, consumido pelo
 * middleware central de erros. A mensagem é exibível ao usuário final.
 */
export class AppError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} code Código estável em inglês (ex.: ORDER_NOT_FOUND)
   * @param {string} message Mensagem amigável em português
   * @param {unknown} [details]
   */
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, code = 'BAD_REQUEST', details) {
    return new AppError(400, code, message, details);
  }

  static unauthorized(message = 'Autenticação necessária.', code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }

  static forbidden(
    message = 'Você não tem permissão para realizar esta ação.',
    code = 'FORBIDDEN',
  ) {
    return new AppError(403, code, message);
  }

  static notFound(message = 'Recurso não encontrado.', code = 'NOT_FOUND') {
    return new AppError(404, code, message);
  }

  static conflict(message, code = 'CONFLICT', details) {
    return new AppError(409, code, message, details);
  }

  static unprocessable(message, code = 'UNPROCESSABLE_ENTITY', details) {
    return new AppError(422, code, message, details);
  }

  static tooManyRequests(message = 'Muitas requisições. Tente novamente em alguns minutos.') {
    return new AppError(429, 'TOO_MANY_REQUESTS', message);
  }

  static badGateway(message, code = 'BAD_GATEWAY') {
    return new AppError(502, code, message);
  }

  static serviceUnavailable(message, code = 'SERVICE_UNAVAILABLE') {
    return new AppError(503, code, message);
  }
}
