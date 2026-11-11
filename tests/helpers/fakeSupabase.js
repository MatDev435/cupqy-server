/**
 * Substituto em memória do cliente Supabase usado nos testes de integração.
 * Reproduz o formato de resposta do supabase-js ({ data, error }) e usa as classes de erro reais.
 */
import { randomUUID } from 'node:crypto';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

const state = {
  tokens: new Map(),
  passwords: new Map(),
  deletedUsers: new Set(),
  authOutage: false,
  failNextDeletion: false,
};

const base64url = (value) => Buffer.from(value).toString('base64url');

export const fakeAuth = {
  reset() {
    state.tokens.clear();
    state.passwords.clear();
    state.deletedUsers.clear();
    state.authOutage = false;
    state.failNextDeletion = false;
  },

  failNextDeletion() {
    state.failNextDeletion = true;
  },

  /** Emite um "Access Token" com formato de JWT para o usuário informado. */
  issueToken(user) {
    const token = [
      base64url(JSON.stringify({ alg: 'ES256', typ: 'JWT' })),
      base64url(JSON.stringify({ sub: user.id, email: user.email })),
      base64url(randomUUID()),
    ].join('.');
    state.tokens.set(token, user);
    return token;
  },

  revoke(token) {
    state.tokens.delete(token);
  },

  setPassword(email, password) {
    state.passwords.set(email, password);
  },

  isDeleted(userId) {
    return state.deletedUsers.has(userId);
  },

  simulateOutage(enabled = true) {
    state.authOutage = enabled;
  },
};

export const supabaseAdmin = {
  auth: {
    async getUser(token) {
      if (state.authOutage) {
        return { data: { user: null }, error: new AuthRetryableFetchError('fetch failed', 0) };
      }
      const user = state.tokens.get(token);
      if (!user || state.deletedUsers.has(user.id)) {
        return {
          data: { user: null },
          error: new AuthApiError('invalid JWT', 403, 'bad_jwt'),
        };
      }
      return { data: { user }, error: null };
    },
    admin: {
      async deleteUser(userId) {
        if (state.failNextDeletion) {
          state.failNextDeletion = false;
          return {
            data: { user: null },
            error: new AuthApiError('Database error', 500, undefined),
          };
        }
        state.deletedUsers.add(userId);
        return { data: { user: null }, error: null };
      },
    },
  },
};

export function createSupabasePublicClient() {
  return {
    auth: {
      async signInWithPassword({ email, password }) {
        if (state.authOutage) {
          return { data: {}, error: new AuthRetryableFetchError('fetch failed', 0) };
        }
        if (state.passwords.get(email) !== password) {
          return {
            data: {},
            error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
          };
        }
        return { data: { session: { access_token: 'x' } }, error: null };
      },
    },
  };
}
