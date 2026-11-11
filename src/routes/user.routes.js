import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { createRateLimiter } from '../middlewares/rateLimit.js';
import { Permissions } from '../config/permissions.js';
import * as userController from '../controllers/user.controller.js';
import * as addressController from '../controllers/address.controller.js';
import { updateProfileBody } from '../validators/user.validator.js';
import { deleteAccountBody } from '../validators/account.validator.js';
import {
  addressParams,
  createAddressBody,
  updateAddressBody,
} from '../validators/address.validator.js';

const router = Router();

// Protege a reconfirmação de senha contra tentativas repetidas.
const accountDeletionLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: 'Muitas tentativas de exclusão de conta. Aguarde alguns minutos.',
});

router.use(authenticate, authorize(Permissions.PROFILE_MANAGE_OWN));

router.get('/me', userController.getMe);
router.patch('/me', validate({ body: updateProfileBody }), userController.updateMe);
router.delete(
  '/me',
  accountDeletionLimiter,
  validate({ body: deleteAccountBody }),
  userController.deleteMe,
);

router.get('/me/addresses', addressController.list);
router.post('/me/addresses', validate({ body: createAddressBody }), addressController.create);
router.get('/me/addresses/:addressId', validate({ params: addressParams }), addressController.get);
router.patch(
  '/me/addresses/:addressId',
  validate({ params: addressParams, body: updateAddressBody }),
  addressController.update,
);
router.delete(
  '/me/addresses/:addressId',
  validate({ params: addressParams }),
  addressController.remove,
);

export default router;
