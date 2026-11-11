import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';
import { createCategory, createCupcake, createDietaryTag } from '../helpers/factories.js';
import { fakeStorage } from '../helpers/fakeSupabase.js';

const app = createApp();

const newCupcake = (overrides = {}) => ({
  name: 'Pistache',
  description: 'Massa de pistache com ganache branca.',
  flavor: 'Pistache',
  ingredients: 'Farinha, pistache, chocolate branco.',
  weightGrams: 85,
  size: 'Médio (7 cm)',
  priceCents: 1290,
  nutritionalInfo: { calories: 310, sugarsGrams: 22 },
  ...overrides,
});

async function sellCupcake(cupcake) {
  const buyer = await createUser();
  await prisma.order.create({
    data: {
      userId: buyer.id,
      fulfillmentType: 'PICKUP',
      status: 'COMPLETED',
      subtotalCents: cupcake.priceCents,
      totalCents: cupcake.priceCents,
      items: {
        create: {
          cupcakeId: cupcake.id,
          cupcakeName: cupcake.name,
          unitPriceCents: cupcake.priceCents,
          quantity: 1,
          subtotalCents: cupcake.priceCents,
        },
      },
    },
  });
}

describe('Gestão do catálogo (/api/v1/admin)', () => {
  let admin;
  let category;
  let vegan;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createUser({ role: 'ADMIN' });
    category = await createCategory('Especiais');
    vegan = await createDietaryTag('Vegano');
  });

  const asAdmin = (method, path) => {
    const agent = request(app);
    return agent[method](`/api/v1/admin${path}`).set('Authorization', admin.authHeader);
  };

  it('restringe o gerenciamento a administradores (US15 RNF#01)', async () => {
    const baker = await createUser({ role: 'BAKER' });
    const response = await request(app)
      .post('/api/v1/admin/cupcakes')
      .set('Authorization', baker.authHeader)
      .send(newCupcake());

    expect(response.status).toBe(403);
    expect(await prisma.cupcake.count()).toBe(0);
  });

  describe('cupcakes', () => {
    it('cadastra cupcake com categoria e restrições', async () => {
      const response = await asAdmin('post', '/cupcakes').send(
        newCupcake({ categoryId: category.id, dietaryTagIds: [vegan.id, vegan.id] }),
      );

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        name: 'Pistache',
        priceCents: 1290,
        isActive: true,
        category: { slug: 'especiais' },
        dietaryTags: [{ slug: 'vegano' }],
        nutritionalInfo: { calories: 310, sugarsGrams: 22 },
        stock: { available: 0, soldOut: true },
        imageUrl: null,
      });
    });

    it('rejeita preço zerado, negativo ou fracionado (US15 RN#02)', async () => {
      for (const priceCents of [0, -100, 10.5]) {
        const response = await asAdmin('post', '/cupcakes').send(newCupcake({ priceCents }));
        expect(response.status).toBe(400);
      }
    });

    it('rejeita categoria ou restrição inexistentes', async () => {
      const badCategory = await asAdmin('post', '/cupcakes').send(
        newCupcake({ categoryId: crypto.randomUUID() }),
      );
      const badTag = await asAdmin('post', '/cupcakes').send(
        newCupcake({ dietaryTagIds: [crypto.randomUUID()] }),
      );

      expect(badCategory.status).toBe(422);
      expect(badCategory.body.error.code).toBe('CATEGORY_NOT_FOUND');
      expect(badTag.body.error.code).toBe('DIETARY_TAG_NOT_FOUND');
    });

    it('edita dados, status e substitui as restrições', async () => {
      const lactoseFree = await createDietaryTag('Sem Lactose');
      const cupcake = await createCupcake({ tags: [vegan] });

      const response = await asAdmin('patch', `/cupcakes/${cupcake.id}`).send({
        priceCents: 1490,
        isActive: false,
        dietaryTagIds: [lactoseFree.id],
        categoryId: null,
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        priceCents: 1490,
        isActive: false,
        category: null,
        dietaryTags: [{ slug: 'sem-lactose' }],
      });
    });

    it('lista ativos e inativos para o admin, mas inativos somem do catálogo público', async () => {
      await createCupcake({ name: 'Ativo' });
      await createCupcake({ name: 'Inativo', isActive: false });

      const adminList = await asAdmin('get', '/cupcakes');
      const inactiveOnly = await asAdmin('get', '/cupcakes?status=inactive');
      const publicList = await request(app).get('/api/v1/cupcakes');

      expect(adminList.body.data.map((c) => c.name)).toEqual(['Ativo', 'Inativo']);
      expect(inactiveOnly.body.data.map((c) => c.name)).toEqual(['Inativo']);
      expect(publicList.body.data.map((c) => c.name)).toEqual(['Ativo']);
    });

    it('remove fisicamente um cupcake nunca vendido, incluindo a imagem', async () => {
      const cupcake = await createCupcake({ imagePath: `cupcakes/x/foto.webp` });
      fakeStorage.put('cupcake-images', 'cupcakes/x/foto.webp');

      const response = await asAdmin('delete', `/cupcakes/${cupcake.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ id: cupcake.id, deletion: 'hard' });
      expect(await prisma.cupcake.findUnique({ where: { id: cupcake.id } })).toBeNull();
      expect(fakeStorage.removed()).toEqual(['cupcakes/x/foto.webp']);
    });

    it('apenas inativa um cupcake já vendido, preservando o histórico (US15 RN#01)', async () => {
      const cupcake = await createCupcake({ imagePath: 'cupcakes/y/foto.webp' });
      await sellCupcake(cupcake);

      const response = await asAdmin('delete', `/cupcakes/${cupcake.id}`);

      expect(response.body.data).toEqual({ id: cupcake.id, deletion: 'soft' });
      const stored = await prisma.cupcake.findUnique({ where: { id: cupcake.id } });
      expect(stored).toMatchObject({ isActive: false, imagePath: 'cupcakes/y/foto.webp' });
      expect(stored.deletedAt).toBeInstanceOf(Date);
      expect(fakeStorage.removed()).toEqual([]);

      expect((await asAdmin('get', `/cupcakes/${cupcake.id}`)).status).toBe(404);
      expect((await asAdmin('get', '/cupcakes')).body.data).toEqual([]);
      expect((await request(app).get(`/api/v1/cupcakes/${cupcake.id}`)).status).toBe(404);
    });

    it('não permite editar ou excluir novamente um cupcake excluído', async () => {
      const cupcake = await createCupcake({ deletedAt: new Date() });

      expect(
        (await asAdmin('patch', `/cupcakes/${cupcake.id}`).send({ priceCents: 100 })).status,
      ).toBe(404);
      expect((await asAdmin('delete', `/cupcakes/${cupcake.id}`)).status).toBe(404);
    });
  });

  describe('categorias e restrições', () => {
    it('cria, edita e remove categorias gerando o slug automaticamente', async () => {
      const created = await asAdmin('post', '/categories').send({ name: 'Edição de Natal' });
      expect(created.status).toBe(201);
      expect(created.body.data.slug).toBe('edicao-de-natal');

      const updated = await asAdmin('patch', `/categories/${created.body.data.id}`).send({
        name: 'Natal 2026',
        description: 'Sabores natalinos',
      });
      expect(updated.body.data).toMatchObject({
        slug: 'natal-2026',
        description: 'Sabores natalinos',
      });

      expect((await asAdmin('delete', `/categories/${created.body.data.id}`)).status).toBe(204);
    });

    it('impede categorias duplicadas', async () => {
      const response = await asAdmin('post', '/categories').send({ name: 'Especiais' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CATEGORY_ALREADY_EXISTS');
    });

    it('impede excluir categoria com cupcakes vinculados', async () => {
      await createCupcake({ category });

      const response = await asAdmin('delete', `/categories/${category.id}`);

      expect(response.status).toBe(409);
      expect(response.body.error).toMatchObject({
        code: 'CATEGORY_IN_USE',
        details: { cupcakes: 1 },
      });
    });

    it('gerencia restrições alimentares e desvincula ao excluir', async () => {
      const cupcake = await createCupcake({ tags: [vegan] });

      const created = await asAdmin('post', '/dietary-tags').send({ name: 'Sem Açúcar' });
      expect(created.body.data.slug).toBe('sem-acucar');

      expect((await asAdmin('post', '/dietary-tags').send({ name: 'Vegano' })).status).toBe(409);
      expect((await asAdmin('delete', `/dietary-tags/${vegan.id}`)).status).toBe(204);
      expect(await prisma.cupcakeDietaryTag.count({ where: { cupcakeId: cupcake.id } })).toBe(0);
    });
  });
});
