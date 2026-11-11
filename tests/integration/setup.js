import { afterAll, afterEach, beforeEach, inject, vi } from 'vitest';
import { fakeAuth } from '../helpers/fakeSupabase.js';
import { blockedFetch } from '../helpers/fakeHttp.js';
import { fakeMercadoPago } from '../helpers/fakeMercadoPago.js';

// Aponta a aplicação para o banco de teste ANTES de qualquer módulo de src/ ser importado.
process.env.DATABASE_URL = inject('databaseUrl');

// Supabase (Auth/Storage) é sempre simulado: nenhum teste acessa serviços externos.
vi.mock('../../src/config/supabase.js', () => import('../helpers/fakeSupabase.js'));
// Mercado Pago é sempre simulado: nenhum pagamento real é criado nos testes.
vi.mock(
  '../../src/services/payments/mercadoPago.gateway.js',
  () => import('../helpers/fakeMercadoPago.js'),
);

beforeEach(() => {
  fakeAuth.reset();
  fakeMercadoPago.reset();
  // APIs externas (CEP, geocodificação, Mercado Pago) nunca são acessadas de verdade.
  vi.stubGlobal('fetch', blockedFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  const { prisma } = await import('../../src/config/prisma.js');
  await prisma.$disconnect();
});
