import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from '../docs/openapi.js';

/** Documentação interativa (Swagger UI) e especificação OpenAPI em JSON. */
const router = Router();

router.get('/api/docs/openapi.json', (_req, res) => {
  res.json(openApiSpec);
});

router.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'Cupqy API — Documentação',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  }),
);

export default router;
