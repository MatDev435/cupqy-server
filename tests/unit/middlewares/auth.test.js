import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { authenticate } from '../../../src/middlewares/authenticate.js';
import { authorize, requireRole } from '../../../src/middlewares/authorize.js';
import { errorHandler } from '../../../src/middlewares/errorHandler.js';
import { Permissions } from '../../../src/config/permissions.js';
import * as authService from '../../../src/services/auth.service.js';
import { AppError } from '../../../src/utils/AppError.js';

vi.mock('../../../src/services/auth.service.js', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, authenticateRequest: vi.fn() };
});

function buildApp(...middlewares) {
  const app = express();
  app.get('/protegido', ...middlewares, (req, res) => res.json({ user: req.user ?? null }));
  app.use(errorHandler);
  return app;
}

const asRole = (role) => ({ id: 'user-1', email: 'u@cupqy.test', role, profile: {} });

describe('middleware authenticate', () => {
  it('responde 401 sem cabeçalho Authorization', async () => {
    const response = await request(buildApp(authenticate)).get('/protegido');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('MISSING_TOKEN');
  });

  it('responde 401 com esquema diferente de Bearer', async () => {
    const response = await request(buildApp(authenticate))
      .get('/protegido')
      .set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(response.status).toBe(401);
  });

  it('disponibiliza o usuário autenticado em req.user', async () => {
    vi.mocked(authService.authenticateRequest).mockResolvedValue(asRole('CUSTOMER'));

    const response = await request(buildApp(authenticate))
      .get('/protegido')
      .set('Authorization', 'Bearer a.b.c');

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ id: 'user-1', role: 'CUSTOMER' });
    expect(authService.authenticateRequest).toHaveBeenCalledWith('a.b.c');
  });

  it('propaga erros de autenticação (ex.: token inválido)', async () => {
    vi.mocked(authService.authenticateRequest).mockRejectedValue(
      AppError.unauthorized('Sessão inválida.', 'INVALID_TOKEN'),
    );

    const response = await request(buildApp(authenticate))
      .get('/protegido')
      .set('Authorization', 'Bearer a.b.c');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });
});

describe('middlewares de autorização', () => {
  const withUser = (role) => (req, _res, next) => {
    req.user = asRole(role);
    next();
  };

  it('authorize permite quando o papel possui a permissão', async () => {
    await request(buildApp(withUser('BAKER'), authorize(Permissions.KITCHEN_ACCESS)))
      .get('/protegido')
      .expect(200);
  });

  it('authorize responde 403 quando falta permissão', async () => {
    const response = await request(
      buildApp(withUser('CUSTOMER'), authorize(Permissions.KITCHEN_ACCESS)),
    ).get('/protegido');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('authorize exige todas as permissões informadas', async () => {
    await request(
      buildApp(
        withUser('BAKER'),
        authorize(Permissions.KITCHEN_ACCESS, Permissions.CATALOG_MANAGE),
      ),
    )
      .get('/protegido')
      .expect(403);
  });

  it('authorize responde 401 quando usado sem autenticação', async () => {
    await request(buildApp(authorize(Permissions.ORDERS_CREATE)))
      .get('/protegido')
      .expect(401);
  });

  it('requireRole aceita apenas os papéis listados', async () => {
    await request(buildApp(withUser('ADMIN'), requireRole('ADMIN')))
      .get('/protegido')
      .expect(200);
    await request(buildApp(withUser('BAKER'), requireRole('ADMIN')))
      .get('/protegido')
      .expect(403);
    await request(buildApp(requireRole('ADMIN')))
      .get('/protegido')
      .expect(401);
  });
});
