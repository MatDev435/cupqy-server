import * as profileModel from '../models/profile.model.js';

export async function getProfile(userId) {
  return profileModel.findById(userId);
}

/** Atualiza dados pessoais. O e-mail é alterado pelo front-end via Supabase Auth. */
export async function updateProfile(userId, data) {
  return profileModel.update(userId, data);
}
