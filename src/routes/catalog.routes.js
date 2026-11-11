import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import * as catalogController from '../controllers/catalog.controller.js';
import { cupcakeParams, listCupcakesQuery } from '../validators/catalog.validator.js';

/** Catálogo público: visitantes e clientes autenticados (US06 e US07). */
const router = Router();

router.get('/categories', catalogController.listCategories);
router.get('/dietary-tags', catalogController.listDietaryTags);
router.get('/cupcakes', validate({ query: listCupcakesQuery }), catalogController.listCupcakes);
router.get('/cupcakes/flavors', catalogController.listFlavors);
router.get(
  '/cupcakes/:cupcakeId',
  validate({ params: cupcakeParams }),
  catalogController.getCupcake,
);

export default router;
