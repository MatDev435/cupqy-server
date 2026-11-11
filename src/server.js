import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { disconnectDatabase } from './config/prisma.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

/** Recursos liberados no encerramento (na ordem). */
const shutdownHooks = [disconnectDatabase];

const app = createApp();

const server = app.listen(config.server.port, (error) => {
  if (error) {
    logger.fatal({ err: error }, 'Falha ao iniciar o servidor');
    process.exit(1);
  }
  logger.info(`Cupqy API ouvindo na porta ${config.server.port} (${config.env})`);
});

// Mantém conexões keep-alive abertas por mais tempo que o balanceador do Render.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

let shuttingDown = false;

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Encerrando servidor...');

  const forceExit = setTimeout(() => {
    logger.error('Tempo de encerramento excedido; finalizando à força.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(async () => {
    for (const hook of shutdownHooks) {
      try {
        await hook();
      } catch (error) {
        logger.error({ err: error }, 'Erro ao liberar recurso no encerramento');
      }
    }
    logger.info('Servidor encerrado.');
    process.exit(exitCode);
  });
  server.closeIdleConnections();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Promise rejeitada sem tratamento');
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Exceção não capturada');
  shutdown('uncaughtException', 1);
});
