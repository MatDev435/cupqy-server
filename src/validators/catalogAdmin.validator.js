import { z } from './zod.js';
import { IMAGE_MAX_SIZE_BYTES, IMAGE_TYPES } from '../config/images.js';
import {
  atLeastOneField,
  csvList,
  idParams,
  optionalText,
  paginationQuery,
  requiredText,
  slug,
  uuid,
} from './common.js';

const nonNegative = () => z.number().min(0).max(100_000);

/** Tabela nutricional por unidade (todos os campos opcionais). */
export const nutritionalInfo = z
  .strictObject({
    servingSizeGrams: nonNegative().optional(),
    calories: nonNegative().optional(),
    carbohydratesGrams: nonNegative().optional(),
    proteinsGrams: nonNegative().optional(),
    totalFatGrams: nonNegative().optional(),
    saturatedFatGrams: nonNegative().optional(),
    transFatGrams: nonNegative().optional(),
    fiberGrams: nonNegative().optional(),
    sugarsGrams: nonNegative().optional(),
    sodiumMg: nonNegative().optional(),
  })
  .nullable();

/** Preço em centavos: inteiro e maior que zero (US15 — RN#02). */
const priceCents = z
  .number()
  .int('O preço deve ser informado em centavos (inteiro).')
  .positive('O preço deve ser maior que zero.')
  .max(1_000_000);

const cupcakeFields = {
  name: requiredText(100, 2),
  description: requiredText(1000),
  flavor: requiredText(60),
  ingredients: requiredText(1000),
  weightGrams: z.number().int().positive().max(5000).nullish(),
  size: optionalText(60),
  nutritionalInfo: nutritionalInfo.optional(),
  priceCents,
  categoryId: uuid().nullish(),
  dietaryTagIds: z.array(uuid()).max(20).optional(),
  isActive: z.boolean().optional(),
};

export const createCupcakeBody = z.strictObject(cupcakeFields);

export const updateCupcakeBody = atLeastOneField(
  z.strictObject({
    name: cupcakeFields.name.optional(),
    description: cupcakeFields.description.optional(),
    flavor: cupcakeFields.flavor.optional(),
    ingredients: cupcakeFields.ingredients.optional(),
    weightGrams: cupcakeFields.weightGrams,
    size: cupcakeFields.size,
    nutritionalInfo: cupcakeFields.nutritionalInfo,
    priceCents: priceCents.optional(),
    categoryId: cupcakeFields.categoryId,
    dietaryTagIds: cupcakeFields.dietaryTagIds,
    isActive: cupcakeFields.isActive,
  }),
);

export const listAdminCupcakesQuery = z.object({
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  category: csvList(slug()),
  sort: z.enum(['name', 'price_asc', 'price_desc', 'newest']).default('name'),
  ...paginationQuery,
});

export const cupcakeParams = idParams('cupcakeId');

export const categoryBody = z.strictObject({
  name: requiredText(60, 2),
  description: optionalText(255),
});

export const updateCategoryBody = atLeastOneField(
  z.strictObject({
    name: categoryBody.shape.name.optional(),
    description: categoryBody.shape.description,
  }),
);

export const categoryParams = idParams('categoryId');

export const dietaryTagBody = z.strictObject({ name: requiredText(60, 2) });

export const dietaryTagParams = idParams('dietaryTagId');

export const imageUploadBody = z.strictObject({
  contentType: z.enum(Object.keys(IMAGE_TYPES), {
    error: 'Formato não suportado. Envie JPG, PNG ou WebP.',
  }),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(IMAGE_MAX_SIZE_BYTES, 'A imagem deve ter no máximo 5 MB.'),
});

export const attachImageBody = z.strictObject({
  path: z.string().trim().min(1).max(255),
});
