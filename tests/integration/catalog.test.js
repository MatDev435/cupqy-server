import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma, resetDatabase } from '../helpers/db.js';
import {
  createCategory,
  createCupcake,
  createDietaryTag,
  setStock,
  today,
} from '../helpers/factories.js';
import { addDays } from '../../src/utils/dates.js';

const app = createApp();
const get = (path) => request(app).get(`/api/v1${path}`);
const names = (response) => response.body.data.map((cupcake) => cupcake.name);

describe('Catálogo público', () => {
  let classics;
  let fruity;
  let lactoseFree;
  let vegan;

  beforeEach(async () => {
    await resetDatabase();
    classics = await createCategory('Clássicos');
    fruity = await createCategory('Frutados');
    lactoseFree = await createDietaryTag('Sem Lactose');
    vegan = await createDietaryTag('Vegano');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('GET /cupcakes', () => {
    it('lista apenas cupcakes ativos e com estoque hoje (US06 RN#01)', async () => {
      await createCupcake({ name: 'Disponível' });
      await createCupcake({ name: 'Inativo', isActive: false });
      await createCupcake({ name: 'Excluído', deletedAt: new Date() });
      await createCupcake({ name: 'Esgotado', stock: 0 });
      await createCupcake({ name: 'Sem estoque definido', stock: null });
      const yesterdayOnly = await createCupcake({ name: 'Estoque só de ontem', stock: null });
      await setStock(yesterdayOnly.id, 30, addDays(today(), -1));

      const response = await get('/cupcakes');

      expect(response.status).toBe(200);
      expect(names(response)).toEqual(['Disponível']);
      expect(response.body.data[0].stock).toEqual({ available: 10, soldOut: false });
    });

    it('inclui os esgotados quando solicitado, sinalizando "soldOut"', async () => {
      await createCupcake({ name: 'Disponível' });
      await createCupcake({ name: 'Esgotado', stock: 0 });

      const response = await get('/cupcakes?includeSoldOut=true');

      expect(names(response)).toEqual(['Disponível', 'Esgotado']);
      expect(response.body.data[1].stock).toEqual({ available: 0, soldOut: true });
    });

    it('busca por nome parcial sem diferenciar maiúsculas (US06 RN#02)', async () => {
      await createCupcake({ name: 'Chocolate Belga' });
      await createCupcake({ name: 'Baunilha' });

      expect(names(await get('/cupcakes?search=CHOCO'))).toEqual(['Chocolate Belga']);
      expect(names(await get('/cupcakes?search=belg'))).toEqual(['Chocolate Belga']);
      expect((await get('/cupcakes?search=morango')).body.data).toEqual([]);
    });

    it('filtra por categoria, sabor e restrições alimentares (todas as selecionadas)', async () => {
      await createCupcake({ name: 'Choco Vegano', category: classics, tags: [vegan, lactoseFree] });
      await createCupcake({
        name: 'Limão',
        flavor: 'Limão',
        category: fruity,
        tags: [lactoseFree],
      });
      await createCupcake({ name: 'Baunilha', flavor: 'Baunilha', category: classics });

      expect(names(await get('/cupcakes?category=frutados'))).toEqual(['Limão']);
      expect(names(await get('/cupcakes?flavor=chocolate'))).toEqual(['Choco Vegano']);
      expect(names(await get('/cupcakes?flavor=Limão,Baunilha'))).toEqual(['Baunilha', 'Limão']);
      expect(names(await get('/cupcakes?dietaryTags=sem-lactose'))).toEqual([
        'Choco Vegano',
        'Limão',
      ]);
      expect(names(await get('/cupcakes?dietaryTags=sem-lactose&dietaryTags=vegano'))).toEqual([
        'Choco Vegano',
      ]);
      expect(names(await get('/cupcakes?category=classicos&dietaryTags=vegano'))).toEqual([
        'Choco Vegano',
      ]);
    });

    it('ordena por preço e pagina os resultados', async () => {
      await createCupcake({ name: 'Médio', priceCents: 1000 });
      await createCupcake({ name: 'Barato', priceCents: 500 });
      await createCupcake({ name: 'Caro', priceCents: 1500 });

      expect(names(await get('/cupcakes?sort=price_asc'))).toEqual(['Barato', 'Médio', 'Caro']);
      expect(names(await get('/cupcakes?sort=price_desc'))).toEqual(['Caro', 'Médio', 'Barato']);

      const page = await get('/cupcakes?pageSize=2&page=2');
      expect(names(page)).toEqual(['Médio']);
      expect(page.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    });

    it('retorna dados do card: preço em centavos, categoria, restrições e URL pública da imagem', async () => {
      await createCupcake({
        name: 'Red Velvet',
        priceCents: 1290,
        category: classics,
        tags: [lactoseFree],
        imagePath: 'cupcakes/abc/foto 1.webp',
      });

      const [card] = (await get('/cupcakes')).body.data;

      expect(card).toMatchObject({
        name: 'Red Velvet',
        priceCents: 1290,
        category: { name: 'Clássicos', slug: 'classicos' },
        dietaryTags: [{ name: 'Sem Lactose', slug: 'sem-lactose' }],
        imageUrl:
          'http://127.0.0.1:1/supabase-not-used-in-tests/storage/v1/object/public/cupcake-images/cupcakes/abc/foto%201.webp',
      });
    });

    it('usa o dia do fuso horário da loja, não o UTC do servidor', async () => {
      // 01:30 UTC de 12/11 ainda é 22:30 de 11/11 em São Paulo.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-12T01:30:00Z'));
      const cupcake = await createCupcake({ name: 'Noturno', stock: null });
      await setStock(cupcake.id, 5, '2026-11-11');

      expect(names(await get('/cupcakes'))).toEqual(['Noturno']);

      vi.setSystemTime(new Date('2026-11-12T03:30:00Z')); // 00:30 de 12/11 em São Paulo
      expect(names(await get('/cupcakes'))).toEqual([]);
    });

    it('valida os parâmetros de consulta', async () => {
      expect((await get('/cupcakes?sort=popular')).status).toBe(400);
      expect((await get('/cupcakes?pageSize=0')).status).toBe(400);
      expect((await get('/cupcakes?category=Inválido!')).status).toBe(400);
    });
  });

  describe('GET /cupcakes/:id', () => {
    it('retorna detalhes, ingredientes, tabela nutricional e estoque do dia (US07)', async () => {
      const cupcake = await createCupcake({
        name: 'Chocolate',
        stock: 3,
        nutritionalInfo: { calories: 320, sugarsGrams: 26 },
        tags: [vegan],
      });

      const response = await get(`/cupcakes/${cupcake.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: cupcake.id,
        ingredients: 'Farinha, ovos, açúcar, cacau.',
        weightGrams: 80,
        size: 'Médio (7 cm)',
        nutritionalInfo: { calories: 320, sugarsGrams: 26 },
        dietaryTags: [{ slug: 'vegano' }],
        stock: { available: 3, soldOut: false },
      });
    });

    it('exibe cupcakes esgotados (para a etiqueta "Esgotado" — US07 RN#02)', async () => {
      const cupcake = await createCupcake({ stock: 0 });
      const response = await get(`/cupcakes/${cupcake.id}`);
      expect(response.body.data.stock).toEqual({ available: 0, soldOut: true });
    });

    it('não expõe cupcakes inativos ou excluídos', async () => {
      const inactive = await createCupcake({ isActive: false });
      const deleted = await createCupcake({ deletedAt: new Date() });

      expect((await get(`/cupcakes/${inactive.id}`)).status).toBe(404);
      expect((await get(`/cupcakes/${deleted.id}`)).status).toBe(404);
      expect((await get(`/cupcakes/${crypto.randomUUID()}`)).body.error.code).toBe(
        'CUPCAKE_NOT_FOUND',
      );
      expect((await get('/cupcakes/123')).status).toBe(400);
    });
  });

  describe('listas auxiliares', () => {
    it('lista sabores distintos dos cupcakes ativos', async () => {
      await createCupcake({ flavor: 'Chocolate' });
      await createCupcake({ flavor: 'Chocolate', stock: 0 });
      await createCupcake({ flavor: 'Baunilha' });
      await createCupcake({ flavor: 'Pistache', isActive: false });

      expect((await get('/cupcakes/flavors')).body.data).toEqual(['Baunilha', 'Chocolate']);
    });

    it('lista categorias e restrições alimentares em ordem alfabética', async () => {
      const categories = await get('/categories');
      const tags = await get('/dietary-tags');

      expect(categories.body.data.map((category) => category.slug)).toEqual([
        'classicos',
        'frutados',
      ]);
      expect(tags.body.data.map((tag) => tag.name)).toEqual(['Sem Lactose', 'Vegano']);
      expect(await prisma.category.count()).toBe(2);
    });
  });
});
