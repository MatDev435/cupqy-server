import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { openApiSpec } from '../../src/docs/openapi.js';

const app = createApp();
const SAMPLE_UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('Documentação OpenAPI/Swagger', () => {
  it('serve a especificação OpenAPI 3.1 em JSON', async () => {
    const response = await request(app).get('/api/docs/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      openapi: '3.1.0',
      info: { title: 'Cupqy API' },
      components: { securitySchemes: { bearerAuth: { scheme: 'bearer' } } },
    });
  });

  it('serve o Swagger UI', async () => {
    const response = await request(app).get('/api/docs/');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('swagger-ui');
  });

  it('gera os schemas de entrada a partir dos validators', () => {
    const checkout =
      openApiSpec.paths['/api/v1/orders'].post.requestBody.content['application/json'];
    expect(checkout.schema.oneOf).toHaveLength(2);
    expect(JSON.stringify(checkout.schema)).toContain('fulfillmentType');
  });

  it('toda operação tem tag, resumo e respostas', () => {
    for (const [path, methods] of Object.entries(openApiSpec.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        expect(operation.tags, `${method} ${path}`).toHaveLength(1);
        expect(operation.summary, `${method} ${path}`).toBeTruthy();
        expect(Object.keys(operation.responses).length, `${method} ${path}`).toBeGreaterThan(0);
      }
    }
  });

  it('toda rota documentada existe na API', async () => {
    const missing = [];

    for (const [path, methods] of Object.entries(openApiSpec.paths)) {
      const url = path.replace(/\{cep\}/, '01310100').replace(/\{[^}]+\}/g, SAMPLE_UUID);
      for (const method of Object.keys(methods)) {
        const agent = request(app);
        const response = await agent[method](url).send({});
        if (response.body?.error?.code === 'ROUTE_NOT_FOUND')
          missing.push(`${method.toUpperCase()} ${path}`);
      }
    }

    expect(missing).toEqual([]);
  });
});
