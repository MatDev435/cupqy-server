import { prisma } from '../../src/config/prisma.js';
import { storeToday } from '../../src/services/storeCalendar.service.js';
import { dateOnlyToDate } from '../../src/utils/dates.js';
import { slugify } from '../../src/utils/text.js';

let sequence = 0;
const next = () => (sequence += 1);

export function today() {
  return storeToday().dateOnly;
}

export async function createCategory(name = `Categoria ${next()}`) {
  return prisma.category.create({ data: { name, slug: slugify(name) } });
}

export async function createDietaryTag(name = `Restrição ${next()}`) {
  return prisma.dietaryTag.create({ data: { name, slug: slugify(name) } });
}

/** Define o estoque de um cupcake em uma data (padrão: hoje no fuso da loja). */
export async function setStock(cupcakeId, quantity, dateOnly = today()) {
  const date = dateOnlyToDate(dateOnly);
  return prisma.dailyStock.upsert({
    where: { cupcakeId_date: { cupcakeId, date } },
    update: { quantity },
    create: { cupcakeId, date, quantity },
  });
}

/**
 * Cria um cupcake. Por padrão com 10 unidades em estoque hoje (stock: null não cria estoque).
 * @param {object} [overrides]
 */
export async function createCupcake({ stock = 10, tags = [], category, ...overrides } = {}) {
  const cupcake = await prisma.cupcake.create({
    data: {
      name: `Cupcake ${next()}`,
      description: 'Massa fofinha com cobertura cremosa.',
      flavor: 'Chocolate',
      ingredients: 'Farinha, ovos, açúcar, cacau.',
      weightGrams: 80,
      size: 'Médio (7 cm)',
      priceCents: 990,
      categoryId: category?.id,
      dietaryTags: { create: tags.map((tag) => ({ dietaryTagId: tag.id })) },
      ...overrides,
    },
  });
  if (stock !== null) await setStock(cupcake.id, stock);
  return cupcake;
}
