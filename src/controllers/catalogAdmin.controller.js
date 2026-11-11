import * as catalogAdminService from '../services/catalogAdmin.service.js';
import * as cupcakeImageService from '../services/cupcakeImage.service.js';
import { toAdminCupcake, toCategoryResponse, toDietaryTagResponse } from '../views/catalog.view.js';

// Cupcakes
export async function listCupcakes(req, res) {
  const { items, meta } = await catalogAdminService.listCupcakes(req.validated.query);
  res.json({ data: items.map(toAdminCupcake), meta });
}

export async function getCupcake(req, res) {
  const cupcake = await catalogAdminService.getCupcake(req.validated.params.cupcakeId);
  res.json({ data: toAdminCupcake(cupcake) });
}

export async function createCupcake(req, res) {
  const cupcake = await catalogAdminService.createCupcake(req.validated.body);
  res.status(201).json({ data: toAdminCupcake(cupcake) });
}

export async function updateCupcake(req, res) {
  const cupcake = await catalogAdminService.updateCupcake(
    req.validated.params.cupcakeId,
    req.validated.body,
  );
  res.json({ data: toAdminCupcake(cupcake) });
}

export async function deleteCupcake(req, res) {
  const result = await catalogAdminService.deleteCupcake(req.validated.params.cupcakeId);
  res.json({ data: result });
}

// Imagens (Supabase Storage)
export async function requestImageUpload(req, res) {
  const upload = await cupcakeImageService.requestImageUpload(
    req.validated.params.cupcakeId,
    req.validated.body,
  );
  res.status(201).json({ data: upload });
}

export async function attachImage(req, res) {
  const cupcake = await cupcakeImageService.attachImage(
    req.validated.params.cupcakeId,
    req.validated.body.path,
  );
  res.json({ data: toAdminCupcake(cupcake) });
}

export async function removeImage(req, res) {
  const cupcake = await cupcakeImageService.removeImage(req.validated.params.cupcakeId);
  res.json({ data: toAdminCupcake(cupcake) });
}

// Categorias
export async function listCategories(_req, res) {
  const categories = await catalogAdminService.listCategories();
  res.json({ data: categories.map(toCategoryResponse) });
}

export async function createCategory(req, res) {
  const category = await catalogAdminService.createCategory(req.validated.body);
  res.status(201).json({ data: toCategoryResponse(category) });
}

export async function updateCategory(req, res) {
  const category = await catalogAdminService.updateCategory(
    req.validated.params.categoryId,
    req.validated.body,
  );
  res.json({ data: toCategoryResponse(category) });
}

export async function deleteCategory(req, res) {
  await catalogAdminService.deleteCategory(req.validated.params.categoryId);
  res.status(204).end();
}

// Restrições alimentares
export async function listDietaryTags(_req, res) {
  const tags = await catalogAdminService.listDietaryTags();
  res.json({ data: tags.map(toDietaryTagResponse) });
}

export async function createDietaryTag(req, res) {
  const tag = await catalogAdminService.createDietaryTag(req.validated.body);
  res.status(201).json({ data: toDietaryTagResponse(tag) });
}

export async function updateDietaryTag(req, res) {
  const tag = await catalogAdminService.updateDietaryTag(
    req.validated.params.dietaryTagId,
    req.validated.body,
  );
  res.json({ data: toDietaryTagResponse(tag) });
}

export async function deleteDietaryTag(req, res) {
  await catalogAdminService.deleteDietaryTag(req.validated.params.dietaryTagId);
  res.status(204).end();
}
