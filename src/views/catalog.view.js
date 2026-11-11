import { getPublicUrl } from '../services/storage.service.js';

export function toCategoryResponse(category) {
  if (!category) return null;
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
  };
}

export function toDietaryTagResponse(tag) {
  return { id: tag.id, name: tag.name, slug: tag.slug };
}

/** Estoque do dia carregado junto com o cupcake (dailyStocks filtrado pela data). */
export function toStockResponse(cupcake) {
  const available = cupcake.dailyStocks?.[0]?.quantity ?? 0;
  return { available, soldOut: available <= 0 };
}

/** Card do catálogo (US06 — CA#01: foto, nome, preço e categoria). */
export function toCupcakeSummary(cupcake) {
  return {
    id: cupcake.id,
    name: cupcake.name,
    description: cupcake.description,
    flavor: cupcake.flavor,
    priceCents: cupcake.priceCents,
    imageUrl: getPublicUrl(cupcake.imagePath),
    category: cupcake.category
      ? { id: cupcake.category.id, name: cupcake.category.name, slug: cupcake.category.slug }
      : null,
    dietaryTags: (cupcake.dietaryTags ?? []).map((link) => toDietaryTagResponse(link.dietaryTag)),
    stock: toStockResponse(cupcake),
  };
}

/** Página do produto (US07 — CA#02: ingredientes, peso, tamanho, tabela nutricional...). */
export function toCupcakeDetail(cupcake) {
  return {
    ...toCupcakeSummary(cupcake),
    ingredients: cupcake.ingredients,
    weightGrams: cupcake.weightGrams,
    size: cupcake.size,
    nutritionalInfo: cupcake.nutritionalInfo,
  };
}

/** Visão administrativa: inclui status, caminho da imagem e datas. */
export function toAdminCupcake(cupcake) {
  return {
    ...toCupcakeDetail(cupcake),
    isActive: cupcake.isActive,
    imagePath: cupcake.imagePath,
    createdAt: cupcake.createdAt,
    updatedAt: cupcake.updatedAt,
  };
}
