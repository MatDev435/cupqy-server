import { permissionsForRole } from '../config/permissions.js';

export function toProfileResponse(profile) {
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    phone: profile.phone,
    role: profile.role,
    permissions: permissionsForRole(profile.role),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}
