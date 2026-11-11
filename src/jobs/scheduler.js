import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { expireUnpaidOrders } from './expireOrders.job.js';

/**
 * Executa uma tarefa periodicamente sem sobreposição (se uma execução demorar mais que o
 * intervalo, a próxima é pulada). Erros são registrados e não derrubam o processo.
 */
export function createIntervalJob(name, task, intervalMs) {
  let running = false;
  let timer = null;

  async function run() {
    if (running) return;
    running = true;
    try {
      await task();
    } catch (error) {
      logger.error({ err: error, job: name }, 'Falha na execução do job');
    } finally {
      running = false;
    }
  }

  return {
    name,
    run,
    start() {
      timer = setInterval(run, intervalMs);
      timer.unref();
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    isRunning: () => running,
  };
}

const jobs = [
  createIntervalJob(
    'expire-unpaid-orders',
    async () => {
      const result = await expireUnpaidOrders();
      if (result.checked > 0)
        logger.info({ job: 'expire-unpaid-orders', ...result }, 'Job executado');
    },
    config.jobs.expireOrdersIntervalMs,
  ),
];

export function startJobs() {
  if (!config.jobs.enabled) return;
  for (const job of jobs) job.start();
  logger.info({ jobs: jobs.map((job) => job.name) }, 'Jobs em segundo plano iniciados');
}

export function stopJobs() {
  for (const job of jobs) job.stop();
}
