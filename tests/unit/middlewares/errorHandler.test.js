import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { errorHandler, normalizeError } from '../../../src/middlewares/errorHandler.js';
import { AppError } from '../../../src/utils/AppError.js';

function createResponse() {
  const res = { headersSent: false };
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.end = vi.fn(() => res);
  return res;
}

describe('normalizeError', () => {
  it('mantém AppError como está', () => {
    const error = AppError.conflict('Conflito.', 'X');
    expect(normalizeError(error)).toBe(error);
  });

  it('converte ZodError em 400 com detalhes por campo', () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 10 });
    const error = normalizeError(result.error);

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual([{ path: 'name', message: expect.any(String) }]);
  });

  it('converte erros do body-parser', () => {
    expect(normalizeError({ type: 'entity.parse.failed' }).code).toBe('INVALID_JSON');
    expect(normalizeError({ type: 'entity.too.large' }).statusCode).toBe(413);
  });

  it('converte erros conhecidos do Prisma', () => {
    const prismaError = (code) =>
      Object.assign(new Error('x'), { name: 'PrismaClientKnownRequestError', code });

    expect(normalizeError(prismaError('P2002')).statusCode).toBe(409);
    expect(normalizeError(prismaError('P2025')).statusCode).toBe(404);
    expect(normalizeError(prismaError('P2003')).code).toBe('FOREIGN_KEY_VIOLATION');
  });

  it('esconde detalhes de erros inesperados', () => {
    const error = normalizeError(new Error('senha do banco: 123'));

    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('Erro interno do servidor.');
  });
});

describe('errorHandler', () => {
  const log = { error: vi.fn(), debug: vi.fn() };

  it('responde no formato padrão com requestId', () => {
    const res = createResponse();
    errorHandler(
      AppError.notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND'),
      { id: 'req-1', log },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'ORDER_NOT_FOUND', message: 'Pedido não encontrado.' },
      requestId: 'req-1',
    });
  });

  it('registra erros 500 no log', () => {
    const res = createResponse();
    errorHandler(new Error('boom'), { id: 'req-2', log }, res);

    expect(log.error).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('apenas encerra a resposta quando os headers já foram enviados', () => {
    const res = createResponse();
    res.headersSent = true;
    errorHandler(new Error('boom'), { log }, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledOnce();
  });
});
