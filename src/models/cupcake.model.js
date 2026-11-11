import { prisma } from '../config/prisma.js';

/** Relações carregadas junto com o cupcake, incluindo o estoque de uma data. */
export function cupcakeInclude(stockDate) {
  return {
    category: true,
    dietaryTags: { include: { dietaryTag: true }, orderBy: { dietaryTag: { name: 'asc' } } },
    dailyStocks: { where: { date: stockDate }, take: 1 },
  };
}

const SORTS = {
  name: [{ name: 'asc' }],
  price_asc: [{ priceCents: 'asc' }, { name: 'asc' }],
  price_desc: [{ priceCents: 'desc' }, { name: 'asc' }],
  newest: [{ createdAt: 'desc' }],
};

/**
 * Monta o filtro do catálogo.
 * @param {object} filters
 * @param {boolean} filters.publicOnly Apenas ativos e não excluídos
 * @param {boolean} [filters.inStockOnly] Apenas com estoque > 0 na data
 */
export function buildCatalogWhere({
  publicOnly,
  search,
  categories,
  flavors,
  dietaryTags,
  inStockOnly,
  stockDate,
  status,
}) {
  const and = [];

  if (publicOnly) and.push({ isActive: true, deletedAt: null });
  else and.push({ deletedAt: null });

  if (status === 'active') and.push({ isActive: true });
  if (status === 'inactive') and.push({ isActive: false });

  if (search) and.push({ name: { contains: search, mode: 'insensitive' } });
  if (categories?.length) and.push({ category: { slug: { in: categories } } });
  if (flavors?.length) {
    and.push({
      OR: flavors.map((flavor) => ({ flavor: { equals: flavor, mode: 'insensitive' } })),
    });
  }
  for (const slug of dietaryTags ?? []) {
    and.push({ dietaryTags: { some: { dietaryTag: { slug } } } });
  }
  if (inStockOnly) {
    and.push({ dailyStocks: { some: { date: stockDate, quantity: { gt: 0 } } } });
  }

  return { AND: and };
}

export async function findMany(where, { skip, take, sort = 'name', stockDate }, db = prisma) {
  const [items, total] = await Promise.all([
    db.cupcake.findMany({
      where,
      include: cupcakeInclude(stockDate),
      orderBy: SORTS[sort] ?? SORTS.name,
      skip,
      take,
    }),
    db.cupcake.count({ where }),
  ]);
  return { items, total };
}

export function findById(id, stockDate, db = prisma) {
  return db.cupcake.findUnique({ where: { id }, include: cupcakeInclude(stockDate) });
}

export async function listActiveFlavors(db = prisma) {
  const rows = await db.cupcake.findMany({
    where: { isActive: true, deletedAt: null },
    distinct: ['flavor'],
    select: { flavor: true },
    orderBy: { flavor: 'asc' },
  });
  return rows.map((row) => row.flavor);
}

export function create(data, stockDate, db = prisma) {
  return db.cupcake.create({ data, include: cupcakeInclude(stockDate) });
}

export function update(id, data, stockDate, db = prisma) {
  return db.cupcake.update({ where: { id }, data, include: cupcakeInclude(stockDate) });
}

/** Substitui o conjunto de restrições alimentares do cupcake (use dentro de uma transação). */
export async function replaceDietaryTags(cupcakeId, dietaryTagIds, db = prisma) {
  await db.cupcakeDietaryTag.deleteMany({ where: { cupcakeId } });
  if (dietaryTagIds.length > 0) {
    await db.cupcakeDietaryTag.createMany({
      data: dietaryTagIds.map((dietaryTagId) => ({ cupcakeId, dietaryTagId })),
    });
  }
}

export function countOrderItems(cupcakeId, db = prisma) {
  return db.orderItem.count({ where: { cupcakeId } });
}

export function hardDelete(id, db = prisma) {
  return db.cupcake.delete({ where: { id } });
}

export function softDelete(id, db = prisma) {
  return db.cupcake.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

/** Cupcakes de um carrinho com o estoque da data (sem filtrar status; a regra fica no serviço). */
export function findForCart(ids, stockDate, db = prisma) {
  return db.cupcake.findMany({
    where: { id: { in: ids } },
    include: { dailyStocks: { where: { date: stockDate }, take: 1 } },
  });
}
