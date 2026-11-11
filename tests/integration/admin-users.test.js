import { execFileSync } from 'node:child_process';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';

const app = createApp();

describe('Gestão de usuários (/api/v1/admin/users)', () => {
  let admin;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createUser({ role: 'ADMIN', fullName: 'Dona da Loja', email: 'dona@cupqy.test' });
  });

  const asAdmin = (method, path) => {
    const agent = request(app);
    return agent[method](`/api/v1/admin/users${path}`).set('Authorization', admin.authHeader);
  };

  it('restringe o acesso a administradores', async () => {
    const customer = await createUser();
    const baker = await createUser({ role: 'BAKER' });

    for (const user of [customer, baker]) {
      const response = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', user.authHeader);
      expect(response.status).toBe(403);
    }
    expect((await request(app).get('/api/v1/admin/users')).status).toBe(401);
  });

  it('lista usuários com paginação, busca e filtro por papel', async () => {
    await createUser({ fullName: 'Carlos Confeiteiro', role: 'BAKER', email: 'carlos@cupqy.test' });
    await createUser({ fullName: 'Bia Cliente', email: 'bia@cupqy.test' });
    const removed = await createUser({ fullName: 'Conta Removida' });
    await prisma.profile.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });

    const all = await asAdmin('get', '?pageSize=2');
    expect(all.status).toBe(200);
    expect(all.body.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });

    const byName = await asAdmin('get', '?search=carlos');
    expect(byName.body.data.map((user) => user.email)).toEqual(['carlos@cupqy.test']);

    const byEmail = await asAdmin('get', '?search=BIA@');
    expect(byEmail.body.data).toHaveLength(1);

    const bakers = await asAdmin('get', '?role=BAKER');
    expect(bakers.body.data.map((user) => user.fullName)).toEqual(['Carlos Confeiteiro']);

    const withDeleted = await asAdmin('get', '?includeDeleted=true');
    expect(withDeleted.body.meta.total).toBe(4);
  });

  it('altera o papel de um usuário e o novo papel vale imediatamente', async () => {
    const customer = await createUser();

    const response = await asAdmin('patch', `/${customer.id}/role`).send({ role: 'BAKER' });

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe('BAKER');

    const me = await request(app).get('/api/v1/users/me').set('Authorization', customer.authHeader);
    expect(me.body.data.permissions).toContain('kitchen:access');
  });

  it('impede o administrador de alterar o próprio papel', async () => {
    const response = await asAdmin('patch', `/${admin.id}/role`).send({ role: 'CUSTOMER' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('CANNOT_CHANGE_OWN_ROLE');
  });

  it('nunca deixa o sistema sem administrador, mesmo com rebaixamentos simultâneos', async () => {
    const secondAdmin = await createUser({ role: 'ADMIN' });

    const [first, second] = await Promise.all([
      request(app)
        .patch(`/api/v1/admin/users/${secondAdmin.id}/role`)
        .set('Authorization', admin.authHeader)
        .send({ role: 'CUSTOMER' }),
      request(app)
        .patch(`/api/v1/admin/users/${admin.id}/role`)
        .set('Authorization', secondAdmin.authHeader)
        .send({ role: 'CUSTOMER' }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 422]);
    expect([first.body, second.body].find((body) => body.error)?.error.code).toBe('LAST_ADMIN');
    expect(await prisma.profile.count({ where: { role: 'ADMIN' } })).toBe(1);
  });

  it('valida papel, identificador e contas encerradas', async () => {
    const customer = await createUser();

    expect((await asAdmin('patch', `/${customer.id}/role`).send({ role: 'ROOT' })).status).toBe(
      400,
    );
    expect(
      (await asAdmin('patch', `/${crypto.randomUUID()}/role`).send({ role: 'BAKER' })).status,
    ).toBe(404);

    await prisma.profile.update({ where: { id: customer.id }, data: { deletedAt: new Date() } });
    const deleted = await asAdmin('patch', `/${customer.id}/role`).send({ role: 'BAKER' });
    expect(deleted.status).toBe(422);
    expect(deleted.body.error.code).toBe('USER_DELETED');
  });

  it('script admin:promote define o papel pelo e-mail', async () => {
    const future = await createUser({ email: 'Futuro.Admin@cupqy.test' });

    const output = execFileSync('node', ['scripts/promote-admin.js', 'futuro.admin@cupqy.test'], {
      env: { ...process.env },
      encoding: 'utf8',
    });

    expect(output).toContain('ADMIN');
    const profile = await prisma.profile.findUnique({ where: { id: future.id } });
    expect(profile.role).toBe('ADMIN');
  });
});
