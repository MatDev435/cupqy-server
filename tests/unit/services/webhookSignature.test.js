import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildManifest,
  parseSignatureHeader,
  verifyWebhookSignature,
} from '../../../src/services/payments/webhookSignature.js';
import { mapPaymentStatus } from '../../../src/services/payment.service.js';
import { vi } from 'vitest';

vi.mock('../../../src/config/prisma.js', () => ({ prisma: {} }));

const SECRET = 'segredo-do-webhook';

function sign(manifest, secret = SECRET) {
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

describe('assinatura do webhook do Mercado Pago', () => {
  const ts = '1704908010';
  const requestId = 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e';
  const manifest = `id:123456;request-id:${requestId};ts:${ts};`;

  it('interpreta o cabeçalho x-signature', () => {
    expect(parseSignatureHeader(`ts=${ts}, v1=abc123`)).toEqual({ ts, v1: 'abc123' });
    expect(parseSignatureHeader('v1=abc')).toBeNull();
    expect(parseSignatureHeader(undefined)).toBeNull();
  });

  it('monta o manifesto omitindo partes ausentes e usando id em minúsculas', () => {
    expect(buildManifest({ dataId: '123456', requestId, ts })).toBe(manifest);
    expect(buildManifest({ dataId: 'ABC9', ts })).toBe(`id:abc9;ts:${ts};`);
  });

  it('aceita assinatura válida', () => {
    expect(
      verifyWebhookSignature({
        signatureHeader: `ts=${ts},v1=${sign(manifest)}`,
        requestId,
        dataId: '123456',
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it('rejeita assinatura de outro segredo, id adulterado ou cabeçalho ausente', () => {
    const forged = `ts=${ts},v1=${sign(manifest, 'outro-segredo')}`;
    const valid = `ts=${ts},v1=${sign(manifest)}`;

    expect(
      verifyWebhookSignature({
        signatureHeader: forged,
        requestId,
        dataId: '123456',
        secret: SECRET,
      }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        signatureHeader: valid,
        requestId,
        dataId: '999999',
        secret: SECRET,
      }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        signatureHeader: `ts=${ts},v1=curta`,
        requestId,
        dataId: '1',
        secret: SECRET,
      }),
    ).toBe(false);
    expect(verifyWebhookSignature({ signatureHeader: undefined, secret: SECRET })).toBe(false);
    expect(verifyWebhookSignature({ signatureHeader: valid, requestId, dataId: '123456' })).toBe(
      false,
    );
  });

  it('mapeia os status do Mercado Pago', () => {
    expect(mapPaymentStatus('approved')).toBe('APPROVED');
    expect(mapPaymentStatus('in_process')).toBe('IN_PROCESS');
    expect(mapPaymentStatus('charged_back')).toBe('CHARGED_BACK');
    expect(mapPaymentStatus('desconhecido')).toBe('PENDING');
  });
});
