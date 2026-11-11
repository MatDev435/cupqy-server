import * as categoryModel from '../models/category.model.js';
import * as cupcakeModel from '../models/cupcake.model.js';
import * as dietaryTagModel from '../models/dietaryTag.model.js';
import { AppError } from '../utils/AppError.js';
import { buildPageMeta, toSkipTake } from '../utils/pagination.js';
import { storeToday } from './storeCalendar.service.js';

/**
 * Catálogo público (US06).
 * RN#01: apenas cupcakes ativos e com estoque no dia (includeSoldOut=true exibe os esgotados).
 * RN#02: busca por nome parcial e sem diferenciar maiúsculas/minúsculas.
 */
export async function listCupcakes(query) {
  const { date } = storeToday();
  const where = cupcakeModel.buildCatalogWhere({
    publicOnly: true,
    search: query.search,
    categories: query.category,
    flavors: query.flavor,
    dietaryTags: query.dietaryTags,
    inStockOnly: !query.includeSoldOut,
    stockDate: date,
  });

  const { items, total } = await cupcakeModel.findMany(where, {
    ...toSkipTake(query),
    sort: query.sort,
    stockDate: date,
  });

  return { items, meta: buildPageMeta(query, total) };
}

/** Detalhes de um cupcake ativo, com o estoque disponível hoje (US07). */
export async function getCupcake(id) {
  const { date } = storeToday();
  const cupcake = await cupcakeModel.findById(id, date);
  if (!cupcake || !cupcake.isActive || cupcake.deletedAt) {
    throw AppError.notFound('Cupcake não encontrado.', 'CUPCAKE_NOT_FOUND');
  }
  return cupcake;
}

export function listFlavors() {
  return cupcakeModel.listActiveFlavors();
}

export function listCategories() {
  return categoryModel.listAll();
}

export function listDietaryTags() {
  return dietaryTagModel.listAll();
}
