import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIntervalJob } from '../../../src/jobs/scheduler.js';

vi.mock('../../../src/config/prisma.js', () => ({ prisma: {} }));

describe('createIntervalJob', () => {
  afterEach(() => vi.useRealTimers());

  it('executa periodicamente e para quando solicitado', async () => {
    vi.useFakeTimers();
    const task = vi.fn().mockResolvedValue();
    const job = createIntervalJob('teste', task, 1000);

    job.start();
    await vi.advanceTimersByTimeAsync(3000);
    job.stop();
    await vi.advanceTimersByTimeAsync(3000);

    expect(task).toHaveBeenCalledTimes(3);
  });

  it('não sobrepõe execuções lentas', async () => {
    let finish;
    const task = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    const job = createIntervalJob('lento', task, 1000);

    const first = job.run();
    await job.run();
    expect(task).toHaveBeenCalledTimes(1);
    expect(job.isRunning()).toBe(true);

    finish();
    await first;
    expect(job.isRunning()).toBe(false);
  });

  it('registra erros sem interromper as próximas execuções', async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error('falhou')).mockResolvedValue();
    const job = createIntervalJob('instavel', task, 1000);

    await job.run();
    await job.run();

    expect(task).toHaveBeenCalledTimes(2);
  });
});
