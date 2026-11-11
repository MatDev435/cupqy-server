import express from 'express';
import helmet from 'helmet';
import { config } from './config/env.js';
import { requestLogger } from './middlewares/requestLogger.js';
import { corsMiddleware } from './middlewares/cors.js';
import { enforceHttps } from './middlewares/enforceHttps.js';
import { globalRateLimiter } from './middlewares/rateLimit.js';
import { notFoundHandler } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import healthRoutes from './routes/health.routes.js';
import apiRoutes from './routes/index.js';

/**
 * Cria a aplicação Express (sem abrir porta), permitindo testes com Supertest.
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.server.trustProxy);

  app.use(requestLogger);
  app.use(helmet());
  app.use(corsMiddleware(config.cors.origins));
  app.use(enforceHttps(config.server.forceHttps));
  app.use(globalRateLimiter);
  app.use(express.json({ limit: config.server.jsonBodyLimit }));

  app.use(healthRoutes);
  app.use('/api/v1', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
