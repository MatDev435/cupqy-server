/**
 * Controle de acesso baseado em papéis (RBAC).
 *
 * O papel do usuário é lido do banco (tabela profiles) a cada requisição autenticada —
 * nunca de dados enviados pelo front-end ou de metadados editáveis do Supabase Auth.
 */

export const Roles = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  BAKER: 'BAKER',
  ADMIN: 'ADMIN',
});

export const Permissions = Object.freeze({
  PROFILE_MANAGE_OWN: 'profile:manage-own',
  ORDERS_CREATE: 'orders:create',
  ORDERS_READ_OWN: 'orders:read-own',
  ORDERS_READ_ANY: 'orders:read-any',
  KITCHEN_ACCESS: 'kitchen:access',
  CATALOG_MANAGE: 'catalog:manage',
  STOCK_MANAGE: 'stock:manage',
  ORDERS_MANAGE: 'orders:manage',
  FINANCE_READ: 'finance:read',
  USERS_MANAGE: 'users:manage',
});

const ALL = [Roles.CUSTOMER, Roles.BAKER, Roles.ADMIN];
const STAFF = [Roles.BAKER, Roles.ADMIN];
const ADMIN_ONLY = [Roles.ADMIN];

/** Papéis autorizados por permissão. */
const PERMISSION_ROLES = Object.freeze({
  [Permissions.PROFILE_MANAGE_OWN]: ALL,
  [Permissions.ORDERS_CREATE]: ALL,
  [Permissions.ORDERS_READ_OWN]: ALL,
  [Permissions.ORDERS_READ_ANY]: STAFF,
  [Permissions.KITCHEN_ACCESS]: STAFF,
  [Permissions.CATALOG_MANAGE]: ADMIN_ONLY,
  [Permissions.STOCK_MANAGE]: ADMIN_ONLY,
  [Permissions.ORDERS_MANAGE]: ADMIN_ONLY,
  [Permissions.FINANCE_READ]: ADMIN_ONLY,
  [Permissions.USERS_MANAGE]: ADMIN_ONLY,
});

export function hasPermission(role, permission) {
  return PERMISSION_ROLES[permission]?.includes(role) ?? false;
}

export function permissionsForRole(role) {
  return Object.values(Permissions).filter((permission) => hasPermission(role, permission));
}

export function isStaff(role) {
  return STAFF.includes(role);
}
