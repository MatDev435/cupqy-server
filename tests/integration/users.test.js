import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';

const app = createApp();

const addressInput = {
  label: 'Casa',
  zipCode: '01310-100',
  street: 'Av. Paulista',
  number: '1000',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
};

describe('Perfil e endereços (/api/v1/users/me)', () => {
  let customer;

  beforeEach(async () => {
    await resetDatabase();
    customer = await createUser({ fullName: 'Ana Souza' });
  });

  const api = (method, path) =>
    request(app)[method](`/api/v1/users/me${path}`).set('Authorization', customer.authHeader);

  describe('perfil', () => {
    it('exige autenticação', async () => {
      const response = await request(app).get('/api/v1/users/me');
      expect(response.status).toBe(401);
    });

    it('retorna o perfil com papel e permissões', async () => {
      const response = await api('get', '');

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: customer.id,
        email: customer.email,
        fullName: 'Ana Souza',
        role: 'CUSTOMER',
      });
      expect(response.body.data.permissions).toContain('orders:create');
      expect(response.body.data.permissions).not.toContain('kitchen:access');
    });

    it('atualiza nome e telefone', async () => {
      const response = await api('patch', '').send({
        fullName: 'Ana P. Souza',
        phone: '(11) 98888-7777',
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ fullName: 'Ana P. Souza', phone: '11988887777' });
    });

    it('não permite alterar o próprio papel ou e-mail', async () => {
      const response = await api('patch', '').send({ role: 'ADMIN', email: 'x@y.com' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      const profile = await prisma.profile.findUnique({ where: { id: customer.id } });
      expect(profile.role).toBe('CUSTOMER');
    });
  });

  describe('endereços', () => {
    it('cria o primeiro endereço como padrão e lista', async () => {
      const created = await api('post', '/addresses').send(addressInput);

      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ zipCode: '01310100', isDefault: true });

      const list = await api('get', '/addresses');
      expect(list.body.data).toHaveLength(1);
    });

    it('mantém um único endereço padrão', async () => {
      await api('post', '/addresses').send(addressInput);
      const second = await api('post', '/addresses').send({
        ...addressInput,
        label: 'Trabalho',
        isDefault: true,
      });

      const list = await api('get', '/addresses');
      const defaults = list.body.data.filter((address) => address.isDefault);

      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(second.body.data.id);
      expect(list.body.data[0].id).toBe(second.body.data.id);
    });

    it('atualiza o endereço e invalida as coordenadas quando a localização muda', async () => {
      const created = await api('post', '/addresses').send(addressInput);
      await prisma.address.update({
        where: { id: created.body.data.id },
        data: { latitude: -23.56, longitude: -46.65 },
      });

      const labelOnly = await api('patch', `/addresses/${created.body.data.id}`).send({
        label: 'Apto',
      });
      expect(labelOnly.status).toBe(200);
      let stored = await prisma.address.findUnique({ where: { id: created.body.data.id } });
      expect(stored.latitude).toBe(-23.56);

      await api('patch', `/addresses/${created.body.data.id}`).send({ number: '2000' });
      stored = await prisma.address.findUnique({ where: { id: created.body.data.id } });
      expect(stored).toMatchObject({ number: '2000', latitude: null, longitude: null });
    });

    it('promove outro endereço a padrão quando o padrão é removido', async () => {
      const first = await api('post', '/addresses').send(addressInput);
      const second = await api('post', '/addresses').send({ ...addressInput, label: 'Trabalho' });

      const removed = await api('delete', `/addresses/${first.body.data.id}`);
      expect(removed.status).toBe(204);

      const remaining = await api('get', `/addresses/${second.body.data.id}`);
      expect(remaining.body.data.isDefault).toBe(true);
    });

    it('limita a quantidade de endereços por usuário', async () => {
      await prisma.address.createMany({
        data: Array.from({ length: 10 }, (_, index) => ({
          userId: customer.id,
          zipCode: '01310100',
          street: 'Rua',
          number: String(index),
          neighborhood: 'Centro',
          city: 'São Paulo',
          state: 'SP',
        })),
      });

      const response = await api('post', '/addresses').send(addressInput);
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('ADDRESS_LIMIT_REACHED');
    });

    it('não expõe nem altera endereços de outro usuário', async () => {
      const created = await api('post', '/addresses').send(addressInput);
      const intruder = await createUser();
      const asIntruder = (method) => {
        const agent = request(app);
        const url = `/api/v1/users/me/addresses/${created.body.data.id}`;
        return agent[method](url).set('Authorization', intruder.authHeader);
      };

      expect((await asIntruder('get')).status).toBe(404);
      expect((await asIntruder('patch').send({ number: '1' })).status).toBe(404);
      expect((await asIntruder('delete')).status).toBe(404);
      expect(await prisma.address.count({ where: { userId: customer.id } })).toBe(1);
    });

    it('valida os dados e o identificador', async () => {
      const invalid = await api('post', '/addresses').send({ ...addressInput, zipCode: '1' });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.details).toEqual([
        { path: 'zipCode', message: 'CEP deve conter 8 dígitos.' },
      ]);

      const badId = await api('get', '/addresses/nao-e-uuid');
      expect(badId.status).toBe(400);
    });
  });
});
