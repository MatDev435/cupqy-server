/**
 * Valida params, query e body com schemas Zod antes do controller.
 * Os dados validados (e normalizados) ficam em req.validated = { params, query, body }.
 * Erros de validação são convertidos em 400 VALIDATION_ERROR pelo errorHandler.
 *
 * @param {{ params?: import('zod').ZodType, query?: import('zod').ZodType, body?: import('zod').ZodType }} schemas
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.validated = {
      params: schemas.params ? schemas.params.parse(req.params) : req.params,
      query: schemas.query ? schemas.query.parse(req.query) : req.query,
      body: schemas.body ? schemas.body.parse(req.body ?? {}) : req.body,
    };
    next();
  };
}
