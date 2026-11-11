import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { authenticate } from '../../src/middlewares/authenticate.js';
import { authorize } from '../../src/middlewares/authorize.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { Permissions } from '../../src/config/permissions.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { createUser, issueTokenForNewAuthUser } from '../helpers/auth.js';
import { fakeAuth } from '../helpers/fakeSupabase.js';

const app = express();
app.get('/me', authenticate, (req, res) => res.json({ id: req.user.id, role: req.user.role }));
app.get('/cozinha', authenticate, authorize(Permissions.KITCHEN_ACCESS), (_req, res) =>
  res.json({ ok: true }),
);
app.use(errorHandler);

describe('Autenticação com Supabase Auth + perfis no PostgreSQL', () => {
  beforeEach(resetDatabase);

  it('cria o perfil no primeiro acesso de um usuário recém-cadastrado', async () => {
    const { user, token } = issueTokenForNewAuthUser();

    const response = await request(app).get('/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: user.id, role: 'CUSTOMER' });
    const profile = await prisma.profile.findUnique({ where: { id: user.id } });
    expect(profile).toMatchObject({
      email: user.email,
      fullName: 'Maria da Silva',
      phone: '11912345678',
      role: 'CUSTOMER',
    });
  });

  it('suporta requisições simultâneas no primeiro acesso sem duplicar o perfil', async () => {
    const { user, token } = issueTokenForNewAuthUser();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).get('/me').set('Authorization', `Bearer ${token}`),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await prisma.profile.count({ where: { id: user.id } })).toBe(1);
  });

  it('usa o papel armazenado no banco para autorizar rotas', async () => {
    const customer = await createUser({ role: 'CUSTOMER' });
    const baker = await createUser({ role: 'BAKER' });

    await request(app).get('/cozinha').set('Authorization', customer.authHeader).expect(403);
    await request(app).get('/cozinha').set('Authorization', baker.authHeader).expect(200);
  });

  it('rejeita tokens revogados (logout no Supabase)', async () => {
    const customer = await createUser();
    fakeAuth.revoke(customer.token);

    const response = await request(app).get('/me').set('Authorization', customer.authHeader);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });

  it('bloqueia contas encerradas mesmo com token ainda válido', async () => {
    const customer = await createUser();
    await prisma.profile.update({ where: { id: customer.id }, data: { deletedAt: new Date() } });

    const response = await request(app).get('/me').set('Authorization', customer.authHeader);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_DELETED');
  });

  it('responde 503 quando o Supabase Auth está fora do ar', async () => {
    const customer = await createUser();
    fakeAuth.simulateOutage();

    const response = await request(app).get('/me').set('Authorization', customer.authHeader);

    expect(response.status).toBe(503);
  });
});
