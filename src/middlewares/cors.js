import cors from 'cors';

function escapeRegex(value) {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Converte uma origem configurada em uma função de verificação.
 * Aceita origens exatas, "*" (qualquer origem) e curingas como
 * "https://cupqy-*.vercel.app" (úteis para previews da Vercel).
 */
export function toOriginMatcher(pattern) {
  if (pattern === '*') return () => true;
  if (!pattern.includes('*')) {
    const normalized = pattern.replace(/\/$/, '');
    return (origin) => origin === normalized;
  }
  const regex = new RegExp(`^${pattern.split('*').map(escapeRegex).join('[a-z0-9-]+')}$`, 'i');
  return (origin) => regex.test(origin);
}

export function buildCorsOptions(origins) {
  const matchers = origins.map(toOriginMatcher);

  return {
    origin(origin, callback) {
      // Requisições sem Origin (curl, servidor-servidor, webhooks) não passam por CORS.
      if (!origin) return callback(null, true);
      return callback(
        null,
        matchers.some((matches) => matches(origin)),
      );
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
    credentials: false,
    maxAge: 600,
  };
}

export function corsMiddleware(origins) {
  return cors(buildCorsOptions(origins));
}
