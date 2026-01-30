export type UserRole = 'owner' | 'admin' | 'manager' | 'cashier' | 'kitchen' | 'inventory';

export type Permission = 
  | 'pos.view'
  | 'pos.sell'
  | 'pos.void'
  | 'products.view'
  | 'products.view_prices'
  | 'products.edit'
  | 'products.create'
  | 'products.delete'
  | 'inventory.view'
  | 'inventory.adjust'
  | 'inventory.full'
  | 'purchasing.view'
  | 'purchasing.create'
  | 'purchasing.edit'
  | 'purchasing.delete'
  | 'customers.view'
  | 'customers.create'
  | 'customers.edit'
  | 'customers.delete'
  | 'loyalty.view'
  | 'loyalty.apply'
  | 'loyalty.manage'
  | 'reports.view_operational'
  | 'reports.view_all'
  | 'reports.view_stock'
  | 'sales_history.view_own'
  | 'sales_history.view_all'
  | 'settings.view'
  | 'settings.edit_operational'
  | 'settings.edit_all'
  | 'users.view'
  | 'users.manage'
  | 'tables.view'
  | 'tables.manage'
  | 'kitchen.view'
  | 'kitchen.manage';

const rolePermissions: Record<UserRole, Permission[]> = {
  owner: [
    'pos.view', 'pos.sell', 'pos.void',
    'products.view', 'products.view_prices', 'products.edit', 'products.create', 'products.delete',
    'inventory.view', 'inventory.adjust', 'inventory.full',
    'purchasing.view', 'purchasing.create', 'purchasing.edit', 'purchasing.delete',
    'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
    'loyalty.view', 'loyalty.apply', 'loyalty.manage',
    'reports.view_operational', 'reports.view_all', 'reports.view_stock',
    'sales_history.view_own', 'sales_history.view_all',
    'settings.view', 'settings.edit_operational', 'settings.edit_all',
    'users.view', 'users.manage',
    'tables.view', 'tables.manage',
    'kitchen.view', 'kitchen.manage',
  ],
  admin: [
    'pos.view', 'pos.sell', 'pos.void',
    'products.view', 'products.view_prices', 'products.edit', 'products.create', 'products.delete',
    'inventory.view', 'inventory.adjust', 'inventory.full',
    'purchasing.view', 'purchasing.create', 'purchasing.edit', 'purchasing.delete',
    'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
    'loyalty.view', 'loyalty.apply', 'loyalty.manage',
    'reports.view_operational', 'reports.view_all', 'reports.view_stock',
    'sales_history.view_own', 'sales_history.view_all',
    'settings.view', 'settings.edit_operational',
    'users.view', 'users.manage',
    'tables.view', 'tables.manage',
    'kitchen.view', 'kitchen.manage',
  ],
  manager: [
    'pos.view', 'pos.sell', 'pos.void',
    'products.view', 'products.view_prices', 'products.edit',
    'inventory.view', 'inventory.adjust',
    'purchasing.view', 'purchasing.create', 'purchasing.edit',
    'customers.view', 'customers.create', 'customers.edit',
    'loyalty.view',
    'reports.view_operational',
    'sales_history.view_own', 'sales_history.view_all',
    'tables.view', 'tables.manage',
    'kitchen.view', 'kitchen.manage',
  ],
  cashier: [
    'pos.view', 'pos.sell',
    'products.view', 'products.view_prices',
    'inventory.view',
    'customers.view', 'customers.create',
    'loyalty.view', 'loyalty.apply',
    'sales_history.view_own',
  ],
  kitchen: [
    'products.view',
    'inventory.view',
    'kitchen.view', 'kitchen.manage',
  ],
  inventory: [
    'products.view', 'products.view_prices', 'products.edit', 'products.create', 'products.delete',
    'inventory.view', 'inventory.adjust', 'inventory.full',
    'purchasing.view', 'purchasing.create', 'purchasing.edit', 'purchasing.delete',
    'reports.view_stock',
  ],
};

export function hasPermission(role: UserRole | string | undefined, permission: Permission): boolean {
  if (!role) return false;
  const permissions = rolePermissions[role as UserRole];
  if (!permissions) return false;
  return permissions.includes(permission);
}

export function hasAnyPermission(role: UserRole | string | undefined, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

export function hasAllPermissions(role: UserRole | string | undefined, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(role, p));
}

export function canAccessPage(role: UserRole | string | undefined, page: string): boolean {
  if (!role) return false;
  
  const pagePermissions: Record<string, Permission[]> = {
    pos: ['pos.view'],
    products: ['products.view'],
    inventory: ['inventory.view'],
    ingredients: ['inventory.view'],
    recipes: ['inventory.view'],
    alerts: ['inventory.view'],
    purchasing: ['purchasing.view'],
    customers: ['customers.view'],
    'loyalty-rewards': ['loyalty.view', 'loyalty.manage'],
    reports: ['reports.view_operational', 'reports.view_all', 'reports.view_stock'],
    'sales-history': ['sales_history.view_own', 'sales_history.view_all'],
    settings: ['settings.view', 'settings.edit_operational', 'settings.edit_all'],
    tables: ['tables.view'],
    kitchen: ['kitchen.view'],
  };
  
  const required = pagePermissions[page];
  if (!required) return true;
  
  return hasAnyPermission(role, required);
}

export function getRoleLabel(role: UserRole | string): string {
  const labels: Record<string, string> = {
    owner: 'Propietario',
    admin: 'Administrador',
    manager: 'Supervisor',
    cashier: 'Cajero',
    kitchen: 'Cocina',
    inventory: 'Inventario',
  };
  return labels[role] || role;
}

export function getRoleDescription(role: UserRole | string): string {
  const descriptions: Record<string, string> = {
    owner: 'Control total del sistema',
    admin: 'Administra la operación',
    manager: 'Controla operación diaria',
    cashier: 'Solo vende',
    kitchen: 'Solo ve y gestiona comandas',
    inventory: 'Maneja inventario y compras',
  };
  return descriptions[role] || '';
}

export const allRoles: UserRole[] = ['owner', 'admin', 'manager', 'cashier', 'kitchen', 'inventory'];
export const tenantRoles: UserRole[] = ['admin', 'manager', 'cashier', 'kitchen', 'inventory'];

import { useAuth } from '@/lib/auth-context';

export function usePermissions() {
  const { user } = useAuth();
  const role = user?.role as UserRole | undefined;

  return {
    role,
    can: (permission: Permission) => hasPermission(role, permission),
    canAny: (permissions: Permission[]) => hasAnyPermission(role, permissions),
    canAll: (permissions: Permission[]) => hasAllPermissions(role, permissions),
    canAccessPage: (page: string) => canAccessPage(role, page),
    isOwner: role === 'owner',
    isAdmin: role === 'admin' || role === 'owner',
    isManager: role === 'manager' || role === 'admin' || role === 'owner',
  };
}
