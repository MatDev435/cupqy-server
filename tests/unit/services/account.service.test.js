import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { verifyPassword } from '../../../src/services/account.service.js';
import { createSupabasePublicClient } from '../../../src/config/supabase.js';

vi.mock('../../../src/config/supabase.js', () => ({
  supabaseAdmin: { auth: { admin: { deleteUser: vi.fn() } } },
  createSupabasePublicClient: vi.fn(),
}));
vi.mock('../../../src/config/prisma.js', () => ({ prisma: {} }));

function mockSignIn(implementation) {
  const signInWithPassword = vi.fn(implementation);
  vi.mocked(createSupabasePublicClient).mockReturnValue({ auth: { signInWithPassword } });
  return signInWithPassword;
}

describe('account.service — verifyPassword', () => {
  it('aceita a senha correta', async () => {
    const signIn = mockSignIn(async () => ({ data: {}, error: null }));

    await expect(verifyPassword('a@cupqy.test', 'certa')).resolves.toBeUndefined();
    expect(signIn).toHaveBeenCalledWith({ email: 'a@cupqy.test', password: 'certa' });
  });

  it('rejeita senha incorreta com 422 (não 401, para não encerrar a sessão no front-end)', async () => {
    mockSignIn(async () => ({
      data: {},
      error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    }));

    await expect(verifyPassword('a@cupqy.test', 'errada')).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVALID_PASSWORD',
    });
  });

  it('responde 503 quando o Supabase Auth está indisponível', async () => {
    mockSignIn(async () => ({ data: {}, error: new AuthRetryableFetchError('fetch failed', 0) }));
    await expect(verifyPassword('a@cupqy.test', 'x')).rejects.toMatchObject({ statusCode: 503 });

    mockSignIn(async () => {
      throw new Error('network');
    });
    await expect(verifyPassword('a@cupqy.test', 'x')).rejects.toMatchObject({ statusCode: 503 });
  });

  it('não consulta o Supabase quando o usuário não tem e-mail', async () => {
    const signIn = mockSignIn(async () => ({ data: {}, error: null }));

    await expect(verifyPassword(null, 'x')).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
    expect(signIn).not.toHaveBeenCalled();
  });
});
