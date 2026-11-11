import { describe, expect, it } from 'vitest';
import { flowFor, isFinal, nextKitchenStatus } from '../../../src/services/orderStatus.js';

describe('orderStatus — fluxo logístico (US14 RN#01)', () => {
  it('delivery: Em Preparo → Aguardando Entregador → Em Rota → Concluído', () => {
    expect(nextKitchenStatus('DELIVERY', 'IN_PREPARATION')).toBe('AWAITING_COURIER');
    expect(nextKitchenStatus('DELIVERY', 'AWAITING_COURIER')).toBe('OUT_FOR_DELIVERY');
    expect(nextKitchenStatus('DELIVERY', 'OUT_FOR_DELIVERY')).toBe('COMPLETED');
  });

  it('retirada: Em Preparo → Aguardando Retirada → Concluído', () => {
    expect(nextKitchenStatus('PICKUP', 'IN_PREPARATION')).toBe('AWAITING_PICKUP');
    expect(nextKitchenStatus('PICKUP', 'AWAITING_PICKUP')).toBe('COMPLETED');
  });

  it('a cozinha não confirma pagamentos nem avança pedidos finalizados', () => {
    expect(nextKitchenStatus('PICKUP', 'AWAITING_PAYMENT')).toBeNull();
    expect(nextKitchenStatus('DELIVERY', 'COMPLETED')).toBeNull();
    expect(nextKitchenStatus('DELIVERY', 'CANCELLED')).toBeNull();
  });

  it('não permite pular para status de outro tipo de entrega', () => {
    expect(nextKitchenStatus('PICKUP', 'AWAITING_COURIER')).toBeNull();
    expect(flowFor('PICKUP')).not.toContain('OUT_FOR_DELIVERY');
  });

  it('identifica status finais', () => {
    expect(isFinal('COMPLETED')).toBe(true);
    expect(isFinal('CANCELLED')).toBe(true);
    expect(isFinal('IN_PREPARATION')).toBe(false);
  });
});
