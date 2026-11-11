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

function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),

  // HTTP
  CORS_ORIGINS: commaSeparatedList.default(['http://localhost:5173']),
  TRUST_PROXY: z.string().default('1'),
  FORCE_HTTPS: booleanish.optional(),
  JSON_BODY_LIMIT: z.string().default('100kb'),

  // Banco de dados (Supabase PostgreSQL)
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  DATABASE_SSL_CA: z.string().optional(),

  // Supabase (Auth e Storage)
  SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_STORAGE_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'Nome de bucket inválido')
    .default('cupcake-images'),

  // Loja
  STORE_TIMEZONE: z
    .string()
    .refine(isValidTimeZone, 'Fuso horário IANA inválido')
    .default('America/Sao_Paulo'),
  LOW_STOCK_THRESHOLD: z.coerce.number().int().min(1).max(1000).default(5),

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
    database: {
      url: env.DATABASE_URL,
      poolMax: env.DATABASE_POOL_MAX,
      sslCa: env.DATABASE_SSL_CA?.replace(/\\n/g, '\n'),
    },
    supabase: {
      url: env.SUPABASE_URL.replace(/\/$/, ''),
      anonKey: env.SUPABASE_ANON_KEY,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      storageBucket: env.SUPABASE_STORAGE_BUCKET,
    },
    store: {
      timeZone: env.STORE_TIMEZONE,
      lowStockThreshold: env.LOW_STOCK_THRESHOLD,
    },
    rateLimit: {
      enabled: env.RATE_LIMIT_ENABLED,
      windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
      max: env.RATE_LIMIT_MAX,
    },
  };
}

export const config = parseEnv(process.env);
