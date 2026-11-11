import { describe, expect, it, vi } from 'vitest';
import { mergeItems } from '../../../src/services/cart.service.js';

vi.mock('../../../src/config/prisma.js', () => ({ prisma: {} }));

describe('cart.service — mergeItems', () => {
  it('soma quantidades de itens repetidos mantendo a ordem', () => {
    expect(
      mergeItems([
        { cupcakeId: 'b', quantity: 1 },
        { cupcakeId: 'a', quantity: 2 },
        { cupcakeId: 'b', quantity: 3 },
      ]),
    ).toEqual([
      { cupcakeId: 'b', quantity: 4 },
      { cupcakeId: 'a', quantity: 2 },
    ]);
  });
});
