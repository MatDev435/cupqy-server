import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authService from '../../../src/services/auth.service.js';
import * as profileModel from '../../../src/models/profile.model.js';
import { supabaseAdmin } from '../../../src/config/supabase.js';

vi.mock('../../../src/config/supabase.js', () => ({
  supabaseAdmin: { auth: { getUser: vi.fn() } },
}));
vi.mock('../../../src/models/profile.model.js');

const TOKEN = 'aaa.bbb.ccc';
const authUser = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  email: 'cliente@cupqy.test',
  user_metadata: { full_name: '  Ana   Souza ', phone: '(11) 98888-7777', role: 'ADMIN' },
};

describe('auth.service', () => {
  describe('extractBearerToken', () => {
    it.each([
      ['Bearer abc.def.ghi', 'abc.def.ghi'],
      ['bearer abc.def.ghi', 'abc.def.ghi'],
      ['Basic abc', null],
      ['Bearer', null],
      ['Bearer a b', null],
      [undefined, null],
    ])('"%s" → %s', (header, expected) => {
      expect(authService.extractBearerToken(header)).toBe(expected);
    });
  });

  describe('verifyAccessToken', () => {
    it('rejeita tokens malformados sem consultar o Supabase', async () => {
      await expect(authService.verifyAccessToken('nao-e-um-jwt')).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_TOKEN',
      });
      expect(supabaseAdmin.auth.getUser).not.toHaveBeenCalled();
    });

    it('retorna o usuário quando o Supabase valida o token', async () => {
      supabaseAdmin.auth.getUser.mockResolvedValue({ data: { user: authUser }, error: null });
      await expect(authService.verifyAccessToken(TOKEN)).resolves.toBe(authUser);
      expect(supabaseAdmin.auth.getUser).toHaveBeenCalledWith(TOKEN);
    });

    it('responde 401 para token expirado, revogado ou inválido', async () => {
      supabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new AuthApiError('invalid JWT', 403, 'bad_jwt'),
      });
      await expect(authService.verifyAccessToken(TOKEN)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('responde 503 quando o Supabase Auth está indisponível', async () => {
      supabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new AuthRetryableFetchError('fetch failed', 0),
      });
      await expect(authService.verifyAccessToken(TOKEN)).rejects.toMatchObject({
        statusCode: 503,
        code: 'AUTH_UNAVAILABLE',
      });
    });

    it('responde 503 quando a chamada ao Supabase lança exceção', async () => {
      supabaseAdmin.auth.getUser.mockRejectedValue(new Error('network'));
      await expect(authService.verifyAccessToken(TOKEN)).rejects.toMatchObject({ statusCode: 503 });
    });
  });

  describe('ensureProfile', () => {
    beforeEach(() => {
      profileModel.create.mockImplementation(async (data) => ({ ...data, deletedAt: null }));
      profileModel.update.mockImplementation(async (id, data) => ({ id, ...data }));
    });

    it('cria o perfil como CUSTOMER, ignorando o papel informado nos metadados', async () => {
      profileModel.findById.mockResolvedValue(null);

      const profile = await authService.ensureProfile(authUser);

      expect(profileModel.create).toHaveBeenCalledWith({
        id: authUser.id,
        email: 'cliente@cupqy.test',
        fullName: 'Ana Souza',
        phone: '11988887777',
        role: 'CUSTOMER',
      });
      expect(profile.role).toBe('CUSTOMER');
    });

    it('sincroniza o e-mail quando o usuário o alterou no Supabase Auth', async () => {
      profileModel.findById.mockResolvedValue({
        id: authUser.id,
        email: 'antigo@cupqy.test',
        deletedAt: null,
      });

      await authService.ensureProfile(authUser);

      expect(profileModel.update).toHaveBeenCalledWith(authUser.id, {
        email: 'cliente@cupqy.test',
      });
    });

    it('não altera perfis existentes quando nada mudou', async () => {
      const existing = { id: authUser.id, email: authUser.email, deletedAt: null };
      profileModel.findById.mockResolvedValue(existing);

      await expect(authService.ensureProfile(authUser)).resolves.toBe(existing);
      expect(profileModel.update).not.toHaveBeenCalled();
    });

    it('trata a criação concorrente do mesmo perfil', async () => {
      const existing = { id: authUser.id, role: 'CUSTOMER', deletedAt: null };
      profileModel.findById.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
      profileModel.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

      await expect(authService.ensureProfile(authUser)).resolves.toBe(existing);
    });
  });

  describe('authenticateRequest', () => {
    it('retorna o contexto com o papel lido do banco', async () => {
      supabaseAdmin.auth.getUser.mockResolvedValue({ data: { user: authUser }, error: null });
      profileModel.findById.mockResolvedValue({
        id: authUser.id,
        email: authUser.email,
        role: 'BAKER',
        deletedAt: null,
      });

      const context = await authService.authenticateRequest(TOKEN);

      expect(context).toMatchObject({ id: authUser.id, email: authUser.email, role: 'BAKER' });
    });

    it('bloqueia contas encerradas', async () => {
      supabaseAdmin.auth.getUser.mockResolvedValue({ data: { user: authUser }, error: null });
      profileModel.findById.mockResolvedValue({ id: authUser.id, deletedAt: new Date() });

      await expect(authService.authenticateRequest(TOKEN)).rejects.toMatchObject({
        statusCode: 403,
        code: 'ACCOUNT_DELETED',
      });
    });
  });
});
