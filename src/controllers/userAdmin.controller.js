import * as userAdminService from '../services/userAdmin.service.js';
import { toAdminUserResponse } from '../views/adminUser.view.js';

export async function list(req, res) {
  const { items, meta } = await userAdminService.listUsers(req.validated.query);
  res.json({ data: items.map(toAdminUserResponse), meta });
}

export async function get(req, res) {
  const user = await userAdminService.getUser(req.validated.params.userId);
  res.json({ data: toAdminUserResponse(user) });
}

export async function changeRole(req, res) {
  const user = await userAdminService.changeRole(
    req.user,
    req.validated.params.userId,
    req.validated.body.role,
  );
  res.json({ data: toAdminUserResponse(user) });
}
