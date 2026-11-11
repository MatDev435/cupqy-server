import { Router } from 'express';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { createRateLimiter } from '../../middlewares/rateLimit.js';
import { Permissions } from '../../config/permissions.js';
import * as controller from '../../controllers/catalogAdmin.controller.js';
import {
  categoryBody,
  categoryParams,
  createCupcakeBody,
  cupcakeParams,
  dietaryTagBody,
  dietaryTagParams,
  attachImageBody,
  imageUploadBody,
  listAdminCupcakesQuery,
  updateCategoryBody,
  updateCupcakeBody,
} from '../../validators/catalogAdmin.validator.js';

/** Gerenciamento do catálogo (US15) — somente administradores. */
const router = Router();

const uploadUrlLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: 'Muitas solicitações de upload. Aguarde alguns minutos.',
});

router.use(authorize(Permissions.CATALOG_MANAGE));

router.get('/cupcakes', validate({ query: listAdminCupcakesQuery }), controller.listCupcakes);
router.post('/cupcakes', validate({ body: createCupcakeBody }), controller.createCupcake);
router.get('/cupcakes/:cupcakeId', validate({ params: cupcakeParams }), controller.getCupcake);
router.patch(
  '/cupcakes/:cupcakeId',
  validate({ params: cupcakeParams, body: updateCupcakeBody }),
  controller.updateCupcake,
);
router.delete(
  '/cupcakes/:cupcakeId',
  validate({ params: cupcakeParams }),
  controller.deleteCupcake,
);

// Imagem: 1) URL assinada → 2) upload direto ao Storage pelo front-end → 3) confirmação
router.post(
  '/cupcakes/:cupcakeId/image/upload-url',
  uploadUrlLimiter,
  validate({ params: cupcakeParams, body: imageUploadBody }),
  controller.requestImageUpload,
);
router.put(
  '/cupcakes/:cupcakeId/image',
  validate({ params: cupcakeParams, body: attachImageBody }),
  controller.attachImage,
);
router.delete(
  '/cupcakes/:cupcakeId/image',
  validate({ params: cupcakeParams }),
  controller.removeImage,
);

router.get('/categories', controller.listCategories);
router.post('/categories', validate({ body: categoryBody }), controller.createCategory);
router.patch(
  '/categories/:categoryId',
  validate({ params: categoryParams, body: updateCategoryBody }),
  controller.updateCategory,
);
router.delete(
  '/categories/:categoryId',
  validate({ params: categoryParams }),
  controller.deleteCategory,
);

router.get('/dietary-tags', controller.listDietaryTags);
router.post('/dietary-tags', validate({ body: dietaryTagBody }), controller.createDietaryTag);
router.patch(
  '/dietary-tags/:dietaryTagId',
  validate({ params: dietaryTagParams, body: dietaryTagBody }),
  controller.updateDietaryTag,
);
router.delete(
  '/dietary-tags/:dietaryTagId',
  validate({ params: dietaryTagParams }),
  controller.deleteDietaryTag,
);

export default router;
