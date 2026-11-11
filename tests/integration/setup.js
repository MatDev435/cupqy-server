import { afterAll, beforeEach, inject, vi } from 'vitest';
import { fakeAuth } from '../helpers/fakeSupabase.js';

// Aponta a aplicação para o banco de teste ANTES de qualquer módulo de src/ ser importado.
process.env.DATABASE_URL = inject('databaseUrl');

// Supabase (Auth/Storage) é sempre simulado: nenhum teste acessa serviços externos.
vi.mock('../../src/config/supabase.js', () => import('../helpers/fakeSupabase.js'));

beforeEach(() => {
  fakeAuth.reset();
});

afterAll(async () => {
  const { prisma } = await import('../../src/config/prisma.js');
  await prisma.$disconnect();
});
