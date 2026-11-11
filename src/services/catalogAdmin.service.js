import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import * as categoryModel from '../models/category.model.js';
import * as cupcakeModel from '../models/cupcake.model.js';
import * as dietaryTagModel from '../models/dietaryTag.model.js';
import { AppError } from '../utils/AppError.js';
import { buildPageMeta, toSkipTake } from '../utils/pagination.js';
import { slugify } from '../utils/text.js';
import { removeObjects } from './storage.service.js';
import { storeToday } from './storeCalendar.service.js';

const cupcakeNotFound = () => AppError.notFound('Cupcake não encontrado.', 'CUPCAKE_NOT_FOUND');
const categoryNotFound = () => AppError.notFound('Categoria não encontrada.', 'CATEGORY_NOT_FOUND');
const dietaryTagNotFound = () =>
  AppError.notFound('Restrição alimentar não encontrada.', 'DIETARY_TAG_NOT_FOUND');

function isUniqueViolation(error) {
  return error?.code === 'P2002';
}

function isForeignKeyViolation(error) {
  return error?.code === 'P2003';
}

// ---------------------------------------------------------------------------
// Cupcakes (US15)
// ---------------------------------------------------------------------------

/** Garante que categoria e restrições informadas existem antes de gravar. */
async function assertReferences({ categoryId, dietaryTagIds }, db) {
  if (categoryId) {
    const category = await categoryModel.findById(categoryId, db);
    if (!category) {
      throw AppError.unprocessable('A categoria informada não existe.', 'CATEGORY_NOT_FOUND');
    }
  }
  if (dietaryTagIds?.length) {
    const unique = [...new Set(dietaryTagIds)];
    const tags = await dietaryTagModel.findManyByIds(unique, db);
    if (tags.length !== unique.length) {
      throw AppError.unprocessable(
        'Uma ou mais restrições alimentares informadas não existem.',
        'DIETARY_TAG_NOT_FOUND',
      );
    }
  }
}

/** Lista todos os cupcakes (ativos e inativos; excluídos logicamente ficam de fora). */
export async function listCupcakes(query) {
  const { date } = storeToday();
  const where = cupcakeModel.buildCatalogWhere({
    publicOnly: false,
    search: query.search,
    categories: query.category,
    status: query.status,
  });
  const { items, total } = await cupcakeModel.findMany(where, {
    ...toSkipTake(query),
    sort: query.sort,
    stockDate: date,
  });
  return { items, meta: buildPageMeta(query, total) };
}

export async function getCupcake(cupcakeId) {
  const cupcake = await cupcakeModel.findById(cupcakeId, storeToday().date);
  if (!cupcake || cupcake.deletedAt) throw cupcakeNotFound();
  return cupcake;
}

export async function createCupcake(input) {
  const { dietaryTagIds = [], ...data } = input;
  const { date } = storeToday();

  return prisma.$transaction(async (tx) => {
    await assertReferences({ categoryId: data.categoryId, dietaryTagIds }, tx);
    return cupcakeModel.create(
      {
        ...data,
        dietaryTags: {
          create: [...new Set(dietaryTagIds)].map((dietaryTagId) => ({ dietaryTagId })),
        },
      },
      date,
      tx,
    );
  });
}

export async function updateCupcake(cupcakeId, input) {
  const { dietaryTagIds, ...data } = input;
  const { date } = storeToday();

  return prisma.$transaction(async (tx) => {
    const existing = await cupcakeModel.findById(cupcakeId, date, tx);
    if (!existing || existing.deletedAt) throw cupcakeNotFound();

    await assertReferences({ categoryId: data.categoryId, dietaryTagIds }, tx);
    if (dietaryTagIds) {
      await cupcakeModel.replaceDietaryTags(cupcakeId, [...new Set(dietaryTagIds)], tx);
    }
    return cupcakeModel.update(cupcakeId, data, date, tx);
  });
}

/**
 * Exclui um cupcake (US15 — RN#01).
 * - Já vendido: exclusão lógica (some do catálogo, preserva o histórico de pedidos).
 * - Nunca vendido: remoção física, incluindo a imagem no Storage.
 *
 * @returns {Promise<{ id: string, deletion: 'soft' | 'hard' }>}
 */
export async function deleteCupcake(cupcakeId) {
  const cupcake = await cupcakeModel.findById(cupcakeId, storeToday().date);
  if (!cupcake || cupcake.deletedAt) throw cupcakeNotFound();

  const sales = await cupcakeModel.countOrderItems(cupcakeId);
  if (sales === 0) {
    try {
      await cupcakeModel.hardDelete(cupcakeId);
      await removeObjects([cupcake.imagePath]);
      logger.info({ cupcakeId }, 'Cupcake removido fisicamente (nunca vendido)');
      return { id: cupcakeId, deletion: 'hard' };
    } catch (error) {
      // Uma venda pode ter ocorrido entre a verificação e a exclusão (FK RESTRICT).
      if (!isForeignKeyViolation(error)) throw error;
    }
  }

  await cupcakeModel.softDelete(cupcakeId);
  logger.info({ cupcakeId }, 'Cupcake inativado (exclusão lógica)');
  return { id: cupcakeId, deletion: 'soft' };
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export function listCategories() {
  return categoryModel.listAll();
}

async function saveCategory(operation, name) {
  try {
    return await operation();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict(
        `Já existe uma categoria chamada "${name}".`,
        'CATEGORY_ALREADY_EXISTS',
      );
    }
    throw error;
  }
}

export function createCategory({ name, description }) {
  return saveCategory(() => categoryModel.create({ name, slug: slugify(name), description }), name);
}

export async function updateCategory(categoryId, { name, description }) {
  const category = await categoryModel.findById(categoryId);
  if (!category) throw categoryNotFound();

  const data = { description };
  if (name) Object.assign(data, { name, slug: slugify(name) });
  return saveCategory(() => categoryModel.update(categoryId, data), name);
}

export async function deleteCategory(categoryId) {
  const category = await categoryModel.findById(categoryId);
  if (!category) throw categoryNotFound();

  const inUse = await categoryModel.countCupcakes(categoryId);
  if (inUse > 0) {
    throw AppError.conflict(
      'Esta categoria possui cupcakes vinculados. Altere a categoria deles antes de excluí-la.',
      'CATEGORY_IN_USE',
      { cupcakes: inUse },
    );
  }
  await categoryModel.remove(categoryId);
}

// ---------------------------------------------------------------------------
// Restrições alimentares
// ---------------------------------------------------------------------------

export function listDietaryTags() {
  return dietaryTagModel.listAll();
}

async function saveDietaryTag(operation, name) {
  try {
    return await operation();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict(
        `Já existe uma restrição chamada "${name}".`,
        'DIETARY_TAG_ALREADY_EXISTS',
      );
    }
    throw error;
  }
}

export function createDietaryTag({ name }) {
  return saveDietaryTag(() => dietaryTagModel.create({ name, slug: slugify(name) }), name);
}

export async function updateDietaryTag(dietaryTagId, { name }) {
  const tag = await dietaryTagModel.findById(dietaryTagId);
  if (!tag) throw dietaryTagNotFound();
  return saveDietaryTag(
    () => dietaryTagModel.update(dietaryTagId, { name, slug: slugify(name) }),
    name,
  );
}

/** Remove a restrição e seus vínculos com cupcakes. */
export async function deleteDietaryTag(dietaryTagId) {
  const tag = await dietaryTagModel.findById(dietaryTagId);
  if (!tag) throw dietaryTagNotFound();
  await dietaryTagModel.remove(dietaryTagId);
}
