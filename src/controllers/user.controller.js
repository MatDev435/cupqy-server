import * as userService from '../services/user.service.js';
import { toProfileResponse } from '../views/profile.view.js';

export async function getMe(req, res) {
  const profile = await userService.getProfile(req.user.id);
  res.json({ data: toProfileResponse(profile) });
}

export async function updateMe(req, res) {
  const profile = await userService.updateProfile(req.user.id, req.validated.body);
  res.json({ data: toProfileResponse(profile) });
}
