import { Router } from 'express';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { Permissions } from '../../config/permissions.js';
import * as userAdminController from '../../controllers/userAdmin.controller.js';
import {
  changeRoleBody,
  listUsersQuery,
  userParams,
} from '../../validators/userAdmin.validator.js';

const router = Router();

router.use(authorize(Permissions.USERS_MANAGE));

router.get('/', validate({ query: listUsersQuery }), userAdminController.list);
router.get('/:userId', validate({ params: userParams }), userAdminController.get);
router.patch(
  '/:userId/role',
  validate({ params: userParams, body: changeRoleBody }),
  userAdminController.changeRole,
);

export default router;
