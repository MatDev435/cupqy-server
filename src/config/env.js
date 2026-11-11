import { z } from 'zod';

// Em testes as variáveis vêm do vitest.config.js; nunca carregamos um .env real.
if (process.env.NODE_ENV !== 'test') {
  const dotenv = await import('dotenv');
  dotenv.config({ quiet: true });
}

const booleanish = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((value) => ['true', '1', 'yes'].includes(value));

const commaSeparatedList = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),

  // HTTP
  CORS_ORIGINS: commaSeparatedList.default(['http://localhost:5173']),
  TRUST_PROXY: z.string().default('1'),
  FORCE_HTTPS: booleanish.optional(),
  JSON_BODY_LIMIT: z.string().default('100kb'),

  // Rate limiting
  RATE_LIMIT_ENABLED: booleanish.default(true),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
});

function parseTrustProxy(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

/**
 * Valida e normaliza as variáveis de ambiente.
 * Lança um erro listando apenas os NOMES das variáveis inválidas (nunca os valores).
 *
 * @param {Record<string, string | undefined>} rawEnv
 */
export function parseEnv(rawEnv) {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${problems}`);
  }

  const env = result.data;
  const isProduction = env.NODE_ENV === 'production';

  return {
    env: env.NODE_ENV,
    isProduction,
    isTest: env.NODE_ENV === 'test',
    isDevelopment: env.NODE_ENV === 'development',
    logLevel:
      env.LOG_LEVEL ?? (isProduction ? 'info' : env.NODE_ENV === 'test' ? 'silent' : 'debug'),
    server: {
      port: env.PORT,
      trustProxy: parseTrustProxy(env.TRUST_PROXY),
      forceHttps: env.FORCE_HTTPS ?? isProduction,
      jsonBodyLimit: env.JSON_BODY_LIMIT,
    },
    cors: {
      origins: env.CORS_ORIGINS,
    },
    rateLimit: {
      enabled: env.RATE_LIMIT_ENABLED,
      windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
      max: env.RATE_LIMIT_MAX,
    },
  };
}

export const config = parseEnv(process.env);
