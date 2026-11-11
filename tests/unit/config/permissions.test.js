import { describe, expect, it } from 'vitest';
import {
  Permissions,
  Roles,
  hasPermission,
  isStaff,
  permissionsForRole,
} from '../../../src/config/permissions.js';

describe('RBAC (config/permissions)', () => {
  it('cliente gerencia o próprio perfil e pedidos, mas não acessa cozinha ou administração', () => {
    expect(hasPermission(Roles.CUSTOMER, Permissions.ORDERS_CREATE)).toBe(true);
    expect(hasPermission(Roles.CUSTOMER, Permissions.ORDERS_READ_OWN)).toBe(true);
    expect(hasPermission(Roles.CUSTOMER, Permissions.KITCHEN_ACCESS)).toBe(false);
    expect(hasPermission(Roles.CUSTOMER, Permissions.CATALOG_MANAGE)).toBe(false);
    expect(hasPermission(Roles.CUSTOMER, Permissions.ORDERS_READ_ANY)).toBe(false);
  });

  it('confeiteiro acessa a cozinha, mas não produtos, estoque ou finanças', () => {
    expect(hasPermission(Roles.BAKER, Permissions.KITCHEN_ACCESS)).toBe(true);
    expect(hasPermission(Roles.BAKER, Permissions.ORDERS_READ_ANY)).toBe(true);
    expect(hasPermission(Roles.BAKER, Permissions.CATALOG_MANAGE)).toBe(false);
    expect(hasPermission(Roles.BAKER, Permissions.STOCK_MANAGE)).toBe(false);
    expect(hasPermission(Roles.BAKER, Permissions.FINANCE_READ)).toBe(false);
  });

  it('administrador possui todas as permissões', () => {
    expect(permissionsForRole(Roles.ADMIN)).toEqual(Object.values(Permissions));
  });

  it('nega papéis e permissões desconhecidos', () => {
    expect(hasPermission('SUPERUSER', Permissions.ORDERS_CREATE)).toBe(false);
    expect(hasPermission(Roles.ADMIN, 'permissao:inexistente')).toBe(false);
  });

  it('identifica a equipe da loja', () => {
    expect(isStaff(Roles.BAKER)).toBe(true);
    expect(isStaff(Roles.ADMIN)).toBe(true);
    expect(isStaff(Roles.CUSTOMER)).toBe(false);
  });
});
