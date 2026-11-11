import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { createRateLimiter } from '../../../src/middlewares/rateLimit.js';
import { enforceHttps } from '../../../src/middlewares/enforceHttps.js';
import { errorHandler } from '../../../src/middlewares/errorHandler.js';

const app = createApp();

describe('Aplicação Express', () => {
  it('GET /health responde com status ok', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'cupqy-server' });
  });

  it('GET /health/ready responde ok quando todas as dependências estão disponíveis', async () => {
    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('retorna 404 padronizado para rotas inexistentes', async () => {
    const response = await request(app).get('/api/v1/nao-existe');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(response.body.requestId).toEqual(expect.any(String));
  });

  it('retorna 400 quando o corpo JSON é inválido', async () => {
    const response = await request(app)
      .post('/api/v1')
      .set('Content-Type', 'application/json')
      .send('{"invalido":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('reaproveita um X-Request-Id válido e gera um novo quando ausente', async () => {
    const withId = await request(app).get('/health').set('X-Request-Id', 'front-req-12345');
    const withoutId = await request(app).get('/health');

    expect(withId.headers['x-request-id']).toBe('front-req-12345');
    expect(withoutId.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('aplica cabeçalhos de segurança e esconde o X-Powered-By', async () => {
    const response = await request(app).get('/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('envia cabeçalhos CORS apenas para origens permitidas', async () => {
    const allowed = await request(app).get('/api/v1').set('Origin', 'http://localhost:5173');
    const denied = await request(app).get('/api/v1').set('Origin', 'https://malicioso.com');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('createRateLimiter', () => {
  it('responde 429 no formato padrão ao exceder o limite', async () => {
    const limitedApp = express();
    limitedApp.use(createRateLimiter({ windowMs: 60_000, limit: 2, isEnabled: () => true }));
    limitedApp.get('/', (_req, res) => res.json({ ok: true }));
    limitedApp.use(errorHandler);

    await request(limitedApp).get('/').expect(200);
    await request(limitedApp).get('/').expect(200);
    const response = await request(limitedApp).get('/');

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('não limita quando desabilitado', async () => {
    const limitedApp = express();
    limitedApp.use(createRateLimiter({ windowMs: 60_000, limit: 1, isEnabled: () => false }));
    limitedApp.get('/', (_req, res) => res.json({ ok: true }));

    await request(limitedApp).get('/').expect(200);
    await request(limitedApp).get('/').expect(200);
  });
});

describe('enforceHttps', () => {
  function buildApp(enabled) {
    const httpsApp = express();
    httpsApp.use(enforceHttps(enabled));
    httpsApp.get('/health', (_req, res) => res.json({ ok: true }));
    httpsApp.all('/recurso', (_req, res) => res.json({ ok: true }));
    httpsApp.use(errorHandler);
    return httpsApp;
  }

  it('redireciona GET e bloqueia escrita via HTTP quando habilitado', async () => {
    const httpsApp = buildApp(true);

    const get = await request(httpsApp).get('/recurso');
    const post = await request(httpsApp).post('/recurso');

    expect(get.status).toBe(308);
    expect(get.headers.location).toMatch(/^https:\/\//);
    expect(post.status).toBe(403);
    expect(post.body.error.code).toBe('HTTPS_REQUIRED');
  });

  it('mantém o health check acessível via HTTP para o Render', async () => {
    await request(buildApp(true)).get('/health').expect(200);
  });

  it('não interfere quando desabilitado', async () => {
    await request(buildApp(false)).post('/recurso').expect(200);
  });
});
