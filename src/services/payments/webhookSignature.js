import { createHmac, timingSafeEqual } from 'node:crypto';

/** Extrai ts e v1 do cabeçalho x-signature ("ts=1704908010,v1=618c8534..."). */
export function parseSignatureHeader(header) {
  if (typeof header !== 'string') return null;
  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const [key, ...value] = part.trim().split('=');
      return [key, value.join('=')];
    }),
  );
  return parts.ts && parts.v1 ? { ts: parts.ts, v1: parts.v1 } : null;
}

/**
 * Manifesto assinado pelo Mercado Pago: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
 * Valores ausentes são omitidos; ids alfanuméricos são usados em minúsculas.
 */
export function buildManifest({ dataId, requestId, ts }) {
  let manifest = '';
  if (dataId) manifest += `id:${String(dataId).toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  return manifest;
}

/**
 * Valida a assinatura HMAC-SHA256 do webhook do Mercado Pago (comparação em tempo constante).
 * @returns {boolean}
 */
export function verifyWebhookSignature({ signatureHeader, requestId, dataId, secret }) {
  const signature = parseSignatureHeader(signatureHeader);
  if (!signature || !secret) return false;

  const expected = createHmac('sha256', secret)
    .update(buildManifest({ dataId, requestId, ts: signature.ts }))
    .digest('hex');

  const received = Buffer.from(signature.v1, 'utf8');
  const computed = Buffer.from(expected, 'utf8');
  return received.length === computed.length && timingSafeEqual(received, computed);
}
