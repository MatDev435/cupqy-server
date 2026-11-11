import { defineConfig } from 'vitest/config';

/**
 * Variáveis de ambiente fictícias usadas em TODOS os testes.
 * Nenhum teste depende de serviços externos reais (Supabase, Mercado Pago, APIs de CEP).
 */
const testEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
};

export default defineConfig({
  test: {
    env: testEnv,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/server.js', 'src/docs/**'],
      reporter: ['text', 'html'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.js'],
        },
      },
    ],
  },
});
