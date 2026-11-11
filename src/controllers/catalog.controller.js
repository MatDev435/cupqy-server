import * as catalogService from '../services/catalog.service.js';
import {
  toCategoryResponse,
  toCupcakeDetail,
  toCupcakeSummary,
  toDietaryTagResponse,
} from '../views/catalog.view.js';

export async function listCupcakes(req, res) {
  const { items, meta } = await catalogService.listCupcakes(req.validated.query);
  res.json({ data: items.map(toCupcakeSummary), meta });
}

export async function getCupcake(req, res) {
  const cupcake = await catalogService.getCupcake(req.validated.params.cupcakeId);
  res.json({ data: toCupcakeDetail(cupcake) });
}

export async function listFlavors(_req, res) {
  res.json({ data: await catalogService.listFlavors() });
}

export async function listCategories(_req, res) {
  const categories = await catalogService.listCategories();
  res.json({ data: categories.map(toCategoryResponse) });
}

export async function listDietaryTags(_req, res) {
  const tags = await catalogService.listDietaryTags();
  res.json({ data: tags.map(toDietaryTagResponse) });
}
