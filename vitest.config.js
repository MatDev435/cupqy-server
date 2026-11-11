import { defineConfig } from 'vitest/config';

/**
 * Variáveis de ambiente fictícias usadas em TODOS os testes.
 * Nenhum teste depende de serviços externos reais (Supabase, Mercado Pago, APIs de CEP).
 */
const testEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'http://localhost:5173',
  RATE_LIMIT_ENABLED: 'false',
  // Testes unitários nunca conectam; os de integração sobrescrevem com o banco embutido.
  DATABASE_URL: 'postgresql://unit:unit@127.0.0.1:1/unit_tests_do_not_connect',
  SUPABASE_URL: 'http://127.0.0.1:1/supabase-not-used-in-tests',
  SUPABASE_ANON_KEY: 'test-anon-key-not-a-real-secret',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-a-real-secret',
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
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.js'],
          globalSetup: ['tests/integration/globalSetup.js'],
          setupFiles: ['tests/integration/setup.js'],
          // Os arquivos compartilham o mesmo banco: execução sequencial evita interferência.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
