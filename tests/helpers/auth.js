import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/config/prisma.js';
import { fakeAuth } from './fakeSupabase.js';

let sequence = 0;

/**
 * Cria um usuário de teste (perfil no banco + token aceito pelo fake do Supabase Auth).
 * @param {{ role?: 'CUSTOMER' | 'BAKER' | 'ADMIN', email?: string, fullName?: string, password?: string }} [options]
 */
export async function createUser({ role = 'CUSTOMER', email, fullName, password } = {}) {
  sequence += 1;
  const id = randomUUID();
  const userEmail = email ?? `usuario${sequence}@cupqy.test`;
  const name = fullName ?? `Usuário ${sequence}`;

  await prisma.profile.create({ data: { id, email: userEmail, fullName: name, role } });

  const token = fakeAuth.issueToken({ id, email: userEmail, user_metadata: { full_name: name } });
  if (password) fakeAuth.setPassword(userEmail, password);

  return { id, email: userEmail, fullName: name, role, token, authHeader: `Bearer ${token}` };
}

/** Token de um usuário que existe no Supabase Auth mas ainda não tem perfil local. */
export function issueTokenForNewAuthUser(overrides = {}) {
  const user = {
    id: randomUUID(),
    email: `novo${(sequence += 1)}@cupqy.test`,
    user_metadata: { full_name: '  Maria   da Silva ', phone: '(11) 91234-5678' },
    ...overrides,
  };
  return { user, token: fakeAuth.issueToken(user) };
}
