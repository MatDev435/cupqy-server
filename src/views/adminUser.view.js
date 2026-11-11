export function toAdminUserResponse(profile) {
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    phone: profile.phone,
    role: profile.role,
    deleted: profile.deletedAt !== null,
    deletedAt: profile.deletedAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}
