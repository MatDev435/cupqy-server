import * as userService from '../services/user.service.js';
import * as accountService from '../services/account.service.js';
import { toProfileResponse } from '../views/profile.view.js';

export async function getMe(req, res) {
  const profile = await userService.getProfile(req.user.id);
  res.json({ data: toProfileResponse(profile) });
}

export async function updateMe(req, res) {
  const profile = await userService.updateProfile(req.user.id, req.validated.body);
  res.json({ data: toProfileResponse(profile) });
}

export async function deleteMe(req, res) {
  await accountService.deleteAccount(req.user, req.validated.body.password);
  res.status(204).end();
}
