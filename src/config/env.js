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
  API_DOCS_ENABLED: booleanish.default(true),

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
  STORE_NAME: z.string().min(1).default('Cupqy'),
  STORE_ADDRESS: z.string().min(1).default('Rua Augusta, 1500 - Consolação, São Paulo - SP'),
  STORE_LATITUDE: z.coerce.number().min(-90).max(90).default(-23.5558),
  STORE_LONGITUDE: z.coerce.number().min(-180).max(180).default(-46.6622),
  STORE_PREPARATION_MINUTES: z.coerce.number().int().min(0).max(600).default(30),

  // Frete (US09)
  DELIVERY_BASE_FEE_CENTS: z.coerce.number().int().min(0).default(500),
  DELIVERY_FEE_PER_KM_CENTS: z.coerce.number().int().min(0).default(150),
  DELIVERY_MAX_DISTANCE_KM: z.coerce.number().positive().max(200).default(15),
  DELIVERY_ROUTE_FACTOR: z.coerce.number().min(1).max(3).default(1.3),
  DELIVERY_AVERAGE_SPEED_KMH: z.coerce.number().positive().max(120).default(25),

  // Front-end e URL pública da API (retornos e webhooks do Mercado Pago)
  FRONTEND_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:5173'),
  FRONTEND_ORDER_PATH: z
    .string()
    .regex(/^\/.*:orderId/, 'Deve começar com "/" e conter ":orderId"')
    .default('/pedidos/:orderId'),
  API_PUBLIC_URL: z.url({ protocol: /^https?$/ }).optional(),

  // Mercado Pago Checkout Pro
  MERCADOPAGO_ACCESS_TOKEN: z.string().min(10).optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().min(10).optional(),
  MERCADOPAGO_SANDBOX: booleanish.default(true),
  MERCADOPAGO_STATEMENT_DESCRIPTOR: z.string().max(22).default('CUPQY'),
  MERCADOPAGO_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),

  // Pedidos
  PAYMENT_EXPIRATION_MINUTES: z.coerce.number().int().min(30).max(1440).default(30),
  MAX_PENDING_ORDERS_PER_USER: z.coerce.number().int().min(1).max(50).default(5),

  // Jobs em segundo plano
  JOBS_ENABLED: booleanish.optional(),
  EXPIRE_ORDERS_INTERVAL_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),

  // APIs externas de CEP e geocodificação
  EXTERNAL_HTTP_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(4000),
  GEOCODING_USER_AGENT: z.string().min(3).default('cupqy-server/1.0'),

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
      docsEnabled: env.API_DOCS_ENABLED,
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
      name: env.STORE_NAME,
      address: env.STORE_ADDRESS,
      latitude: env.STORE_LATITUDE,
      longitude: env.STORE_LONGITUDE,
      preparationMinutes: env.STORE_PREPARATION_MINUTES,
      timeZone: env.STORE_TIMEZONE,
      lowStockThreshold: env.LOW_STOCK_THRESHOLD,
    },
    delivery: {
      baseFeeCents: env.DELIVERY_BASE_FEE_CENTS,
      feePerKmCents: env.DELIVERY_FEE_PER_KM_CENTS,
      maxDistanceKm: env.DELIVERY_MAX_DISTANCE_KM,
      routeFactor: env.DELIVERY_ROUTE_FACTOR,
      averageSpeedKmh: env.DELIVERY_AVERAGE_SPEED_KMH,
    },
    frontend: {
      url: env.FRONTEND_URL.replace(/\/$/, ''),
      orderPath: env.FRONTEND_ORDER_PATH,
    },
    api: {
      publicUrl: env.API_PUBLIC_URL?.replace(/\/$/, ''),
    },
    mercadoPago: {
      accessToken: env.MERCADOPAGO_ACCESS_TOKEN,
      webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET,
      sandbox: env.MERCADOPAGO_SANDBOX,
      statementDescriptor: env.MERCADOPAGO_STATEMENT_DESCRIPTOR,
      timeoutMs: env.MERCADOPAGO_TIMEOUT_MS,
    },
    orders: {
      paymentExpirationMinutes: env.PAYMENT_EXPIRATION_MINUTES,
      maxPendingPerUser: env.MAX_PENDING_ORDERS_PER_USER,
    },
    jobs: {
      enabled: env.JOBS_ENABLED ?? env.NODE_ENV !== 'test',
      expireOrdersIntervalMs: env.EXPIRE_ORDERS_INTERVAL_SECONDS * 1000,
    },
    externalApis: {
      timeoutMs: env.EXTERNAL_HTTP_TIMEOUT_MS,
      geocodingUserAgent: env.GEOCODING_USER_AGENT,
    },
    rateLimit: {
      enabled: env.RATE_LIMIT_ENABLED,
      windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
      max: env.RATE_LIMIT_MAX,
    },
  };
}

export const config = parseEnv(process.env);
