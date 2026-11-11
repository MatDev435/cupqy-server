import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';
import { fakeAuth } from '../helpers/fakeSupabase.js';

const app = createApp();
const PASSWORD = 'SenhaForte123';

async function createOrder(userId, status) {
  return prisma.order.create({
    data: {
      userId,
      status,
      fulfillmentType: 'DELIVERY',
      subtotalCents: 2000,
      deliveryFeeCents: 700,
      totalCents: 2700,
      notes: 'Portão azul, falar com a Ana',
      deliveryAddress: {
        zipCode: '01310100',
        street: 'Av. Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
      },
    },
  });
}

describe('Exclusão de conta (DELETE /api/v1/users/me)', () => {
  let customer;

  beforeEach(async () => {
    await resetDatabase();
    customer = await createUser({ fullName: 'Ana Souza', password: PASSWORD });
    await prisma.profile.update({ where: { id: customer.id }, data: { phone: '11988887777' } });
    await prisma.address.create({
      data: {
        userId: customer.id,
        zipCode: '01310100',
        street: 'Av. Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
      },
    });
  });

  const deleteAccount = (body) =>
    request(app).delete('/api/v1/users/me').set('Authorization', customer.authHeader).send(body);

  it('exclui a conta, anonimiza os dados pessoais e preserva o histórico financeiro', async () => {
    const order = await createOrder(customer.id, 'COMPLETED');

    const response = await deleteAccount({ password: PASSWORD });

    expect(response.status).toBe(204);
    expect(fakeAuth.isDeleted(customer.id)).toBe(true);

    const profile = await prisma.profile.findUnique({ where: { id: customer.id } });
    expect(profile).toMatchObject({ email: null, fullName: null, phone: null });
    expect(profile.deletedAt).toBeInstanceOf(Date);
    expect(await prisma.address.count({ where: { userId: customer.id } })).toBe(0);

    const storedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(storedOrder).toMatchObject({
      notes: null,
      deliveryAddress: { city: 'São Paulo', state: 'SP' },
      totalCents: 2700,
      status: 'COMPLETED',
    });
  });

  it('impede novos acessos após a exclusão', async () => {
    await deleteAccount({ password: PASSWORD }).expect(204);

    const response = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', customer.authHeader);
    expect(response.status).toBe(401);
  });

  it('exige a senha atual correta (US04 — CA#03)', async () => {
    const response = await deleteAccount({ password: 'errada' });

    expect(response.status).toBe(422);
    expect(response.body.error).toEqual({
      code: 'INVALID_PASSWORD',
      message: 'Senha incorreta. Não foi possível prosseguir com a exclusão.',
    });
    expect(fakeAuth.isDeleted(customer.id)).toBe(false);
  });

  it('valida a presença da senha', async () => {
    const response = await deleteAccount({});
    expect(response.status).toBe(400);
  });

  it.each(['AWAITING_PAYMENT', 'IN_PREPARATION', 'OUT_FOR_DELIVERY'])(
    'bloqueia a exclusão com pedido em andamento (%s) — US04 RN#01',
    async (status) => {
      await createOrder(customer.id, status);

      const response = await deleteAccount({ password: PASSWORD });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ACTIVE_ORDERS_PENDING');
      expect(fakeAuth.isDeleted(customer.id)).toBe(false);
      const profile = await prisma.profile.findUnique({ where: { id: customer.id } });
      expect(profile.fullName).toBe('Ana Souza');
    },
  );

  it('permite excluir quando todos os pedidos estão concluídos ou cancelados', async () => {
    await createOrder(customer.id, 'CANCELLED');
    await createOrder(customer.id, 'COMPLETED');

    await deleteAccount({ password: PASSWORD }).expect(204);
  });

  it('não altera nada se o Supabase Auth falhar ao excluir o usuário', async () => {
    fakeAuth.failNextDeletion();

    const response = await deleteAccount({ password: PASSWORD });

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('ACCOUNT_DELETION_FAILED');
    const profile = await prisma.profile.findUnique({ where: { id: customer.id } });
    expect(profile).toMatchObject({ fullName: 'Ana Souza', deletedAt: null });
    expect(await prisma.address.count({ where: { userId: customer.id } })).toBe(1);
  });
});
