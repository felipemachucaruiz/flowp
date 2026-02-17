import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { users, userPortalRoles, portalRoles, rolePermissions, portalPermissions, internalUsers } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

// Role-based permissions mapping for regular tenant users
const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [
    'pos.view', 'pos.process_sale', 'pos.apply_discounts', 'pos.void_items', 'pos.hold_orders', 'pos.open_drawer',
    'products.view', 'products.create', 'products.edit', 'products.delete',
    'inventory.view', 'inventory.adjust', 'inventory.receive',
    'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
    'orders.view', 'orders.refund',
    'reports.view', 'reports.export',
    'settings.view', 'settings.edit_operational', 'settings.edit_all',
    'users.view', 'users.create', 'users.edit', 'users.delete',
    'restaurant.view', 'restaurant.manage_tables', 'restaurant.manage_floor',
  ],
  admin: [
    'pos.view', 'pos.process_sale', 'pos.apply_discounts', 'pos.void_items', 'pos.hold_orders', 'pos.open_drawer',
    'products.view', 'products.create', 'products.edit', 'products.delete',
    'inventory.view', 'inventory.adjust', 'inventory.receive',
    'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
    'orders.view', 'orders.refund',
    'reports.view', 'reports.export',
    'settings.view', 'settings.edit_operational',
    'users.view', 'users.create', 'users.edit',
    'restaurant.view', 'restaurant.manage_tables', 'restaurant.manage_floor',
  ],
  manager: [
    'pos.view', 'pos.process_sale', 'pos.apply_discounts', 'pos.void_items', 'pos.hold_orders', 'pos.open_drawer',
    'products.view', 'products.create', 'products.edit',
    'inventory.view', 'inventory.adjust', 'inventory.receive',
    'customers.view', 'customers.create', 'customers.edit',
    'orders.view', 'orders.refund',
    'reports.view',
    'settings.view',
    'restaurant.view', 'restaurant.manage_tables',
  ],
  cashier: [
    'pos.view', 'pos.process_sale', 'pos.apply_discounts', 'pos.hold_orders',
    'products.view',
    'customers.view', 'customers.create',
    'orders.view',
    'restaurant.view',
  ],
  kitchen: [
    'restaurant.view',
  ],
  inventory: [
    'products.view',
    'inventory.view', 'inventory.adjust', 'inventory.receive',
  ],
};

export interface PortalSession {
  userId: string;
  tenantId: string | null;
  isInternal: boolean;
  roles: string[];
  permissions: string[];
  impersonation?: {
    sessionId: string;
    targetTenantId: string;
    targetUserId?: string;
    mode: "read_only" | "write";
  };
}

declare global {
  namespace Express {
    interface Request {
      portalSession?: PortalSession;
      targetTenantId?: string;
    }
  }
}

export async function loadPortalSession(req: Request, res: Response, next: NextFunction) {
  // Get user from header (frontend sends x-user-id after login)
  const userId = req.headers["x-user-id"] as string;
  
  if (!userId) {
    return next();
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    
    if (!user) {
      const [internalUser] = await db.select().from(internalUsers).where(eq(internalUsers.id, userId));
      if (internalUser && internalUser.isActive) {
        const internalRole = (internalUser.role || 'superadmin').toLowerCase();
        let allPerms: string[] = [];
        if (internalRole === 'superadmin') {
          const allPermRows = await db.select({ resource: portalPermissions.resource, action: portalPermissions.action }).from(portalPermissions);
          allPerms = allPermRows.map(p => `${p.resource}:${p.action}`);
        } else {
          const roleName = internalRole === 'billingops' ? 'BillingOps' : internalRole === 'supportagent' ? 'SupportAgent' : 'SuperAdmin';
          const [role] = await db.select().from(portalRoles).where(eq(portalRoles.name, roleName));
          if (role) {
            const perms = await db.select({ resource: portalPermissions.resource, action: portalPermissions.action })
              .from(rolePermissions).innerJoin(portalPermissions, eq(rolePermissions.permissionId, portalPermissions.id))
              .where(eq(rolePermissions.roleId, role.id));
            allPerms = perms.map(p => `${p.resource}:${p.action}`);
          }
        }
        req.portalSession = {
          userId: internalUser.id,
          tenantId: null,
          isInternal: true,
          roles: [internalRole === 'superadmin' ? 'SuperAdmin' : internalRole === 'billingops' ? 'BillingOps' : 'SupportAgent'],
          permissions: allPerms,
        };
      }
      return next();
    }

    const userRoles = await db
      .select({
        roleName: portalRoles.name,
        roleId: portalRoles.id,
        roleType: portalRoles.type,
        tenantId: userPortalRoles.tenantId,
      })
      .from(userPortalRoles)
      .innerJoin(portalRoles, eq(userPortalRoles.roleId, portalRoles.id))
      .where(eq(userPortalRoles.userId, userId));

    const roleIds = userRoles.map(r => r.roleId);
    
    let permissions: string[] = [];
    if (roleIds.length > 0) {
      const perms = await db
        .select({
          resource: portalPermissions.resource,
          action: portalPermissions.action,
        })
        .from(rolePermissions)
        .innerJoin(portalPermissions, eq(rolePermissions.permissionId, portalPermissions.id))
        .where(inArray(rolePermissions.roleId, roleIds));
      
      permissions = perms.map(p => `${p.resource}:${p.action}`);
    }

    if (user.role && ROLE_PERMISSIONS[user.role]) {
      permissions = [...permissions, ...ROLE_PERMISSIONS[user.role]];
    }

    req.portalSession = {
      userId: user.id,
      tenantId: user.tenantId || null,
      isInternal: user.isInternal || false,
      roles: [...userRoles.map(r => r.roleName), user.role || ''].filter(Boolean),
      permissions: Array.from(new Set(permissions)),
    };

    next();
  } catch (error) {
    console.error("Error loading portal session:", error);
    next();
  }
}

export function requireInternal(req: Request, res: Response, next: NextFunction) {
  if (!req.portalSession?.isInternal) {
    return res.status(403).json({ error: "Access denied: Internal admin required" });
  }
  next();
}

export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.portalSession?.tenantId && !req.portalSession?.isInternal) {
    return res.status(403).json({ error: "Access denied: Tenant access required" });
  }
  next();
}

export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.portalSession) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const hasPermission = requiredPermissions.some(perm => 
      req.portalSession!.permissions.includes(perm)
    );

    if (!hasPermission) {
      return res.status(403).json({ 
        error: "Access denied: Insufficient permissions",
        required: requiredPermissions,
      });
    }

    next();
  };
}

export function enforceTenantIsolation(req: Request, res: Response, next: NextFunction) {
  if (!req.portalSession) {
    return next();
  }

  if (req.portalSession.isInternal) {
    const queryTenantId = req.query.tenantId;
    req.targetTenantId = req.params.tenantId || (typeof queryTenantId === 'string' ? queryTenantId : undefined);
  } else {
    req.targetTenantId = req.portalSession.tenantId || undefined;
    
    if (req.params.tenantId && req.params.tenantId !== req.targetTenantId) {
      return res.status(403).json({ error: "Access denied: Cannot access other tenants" });
    }
  }

  next();
}

export function hasPermission(session: PortalSession | undefined, permission: string): boolean {
  if (!session) return false;
  return session.permissions.includes(permission);
}

export function hasRole(session: PortalSession | undefined, role: string): boolean {
  if (!session) return false;
  return session.roles.includes(role);
}
