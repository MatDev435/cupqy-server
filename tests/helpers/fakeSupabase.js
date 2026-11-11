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
  storageObjects: new Map(),
  removedObjects: [],
};

const base64url = (value) => Buffer.from(value).toString('base64url');

export const fakeAuth = {
  reset() {
    state.tokens.clear();
    state.passwords.clear();
    state.deletedUsers.clear();
    state.authOutage = false;
    state.failNextDeletion = false;
    state.storageObjects.clear();
    state.removedObjects.length = 0;
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

export const fakeStorage = {
  /** Simula um arquivo já enviado ao bucket. */
  put(bucket, path, metadata = { size: 1024, mimetype: 'image/webp' }) {
    state.storageObjects.set(`${bucket}/${path}`, metadata);
  },
  has(bucket, path) {
    return state.storageObjects.has(`${bucket}/${path}`);
  },
  removed() {
    return [...state.removedObjects];
  },
};

function storageBucket(bucket) {
  return {
    async createSignedUploadUrl(path) {
      const token = `upload-token-${randomUUID()}`;
      return {
        data: {
          path,
          token,
          signedUrl: `https://storage.test/object/upload/sign/${bucket}/${path}?token=${token}`,
        },
        error: null,
      };
    },
    async info(path) {
      const metadata = state.storageObjects.get(`${bucket}/${path}`);
      if (!metadata) {
        return {
          data: null,
          error: Object.assign(new Error('Object not found'), { status: 400, statusCode: '404' }),
        };
      }
      return {
        data: { name: path, size: metadata.size, contentType: metadata.mimetype },
        error: null,
      };
    },
    async remove(paths) {
      for (const path of paths) {
        state.storageObjects.delete(`${bucket}/${path}`);
        state.removedObjects.push(path);
      }
      return { data: paths.map((name) => ({ name })), error: null };
    },
  };
}

export const supabaseAdmin = {
  storage: {
    from: (bucket) => storageBucket(bucket),
  },
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
