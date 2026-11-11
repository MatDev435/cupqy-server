import { afterAll, inject } from 'vitest';

// Aponta a aplicação para o banco de teste ANTES de qualquer módulo de src/ ser importado.
process.env.DATABASE_URL = inject('databaseUrl');

afterAll(async () => {
  const { prisma } = await import('../../src/config/prisma.js');
  await prisma.$disconnect();
});
