import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  tenants, users, portalRoles, userPortalRoles, 
  locations, registers, electronicDocuments, supportTickets,
  subscriptions, subscriptionPlans, invoices, matiasDocumentQueue
} from "@shared/schema";
import { eq, desc, sql, and, count } from "drizzle-orm";
import { requireInternal, requirePermission, enforceTenantIsolation } from "../middleware/rbac";
import { z } from "zod";

const VALID_TENANT_STATUSES = ["trial", "active", "past_due", "suspended", "cancelled"] as const;

const updateTenantSchema = z.object({
  status: z.enum(VALID_TENANT_STATUSES).optional(),
  featureFlags: z.array(z.string()).optional(),
});

const router = Router();

router.use(requireInternal);
router.use(enforceTenantIsolation);

router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const [tenantStats] = await db
      .select({
        total: count(),
        active: sql<number>`COUNT(*) FILTER (WHERE status = 'active')`,
        trial: sql<number>`COUNT(*) FILTER (WHERE status = 'trial')`,
        suspended: sql<number>`COUNT(*) FILTER (WHERE status = 'suspended')`,
      })
      .from(tenants);

    // Query MATIAS document queue for global e-billing stats across all tenants
    const [docStats] = await db
      .select({
        total: count(),
        pending: sql<number>`COUNT(*) FILTER (WHERE status = 'PENDING')`,
        accepted: sql<number>`COUNT(*) FILTER (WHERE status = 'SENT')`,
        rejected: sql<number>`COUNT(*) FILTER (WHERE status = 'REJECTED')`,
        error: sql<number>`COUNT(*) FILTER (WHERE status = 'ERROR')`,
      })
      .from(matiasDocumentQueue);

    const [ticketStats] = await db
      .select({
        open: sql<number>`COUNT(*) FILTER (WHERE status = 'open')`,
        inProgress: sql<number>`COUNT(*) FILTER (WHERE status = 'in_progress')`,
        pending: sql<number>`COUNT(*) FILTER (WHERE status = 'pending')`,
      })
      .from(supportTickets);

    res.json({
      tenants: tenantStats,
      electronicBilling: docStats,
      support: ticketStats,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

router.get("/tenants", requirePermission("tenants:read"), async (req: Request, res: Response) => {
  try {
    const { status, type, search, limit = "50", offset = "0" } = req.query;
    
    let query = db.select().from(tenants).orderBy(desc(tenants.createdAt));
    
    const results = await query.limit(parseInt(limit as string)).offset(parseInt(offset as string));
    res.json(results);
  } catch (error) {
    console.error("List tenants error:", error);
    res.status(500).json({ error: "Failed to list tenants" });
  }
});

router.get("/tenants/:id", requirePermission("tenants:read"), async (req: Request, res: Response) => {
  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.params.id));
    
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const locationCount = await db.select({ count: count() }).from(locations).where(eq(locations.tenantId, tenant.id));
    const registerCount = await db.select({ count: count() }).from(registers).where(eq(registers.tenantId, tenant.id));
    const userCount = await db.select({ count: count() }).from(users).where(eq(users.tenantId, tenant.id));

    res.json({
      ...tenant,
      stats: {
        locations: locationCount[0]?.count || 0,
        registers: registerCount[0]?.count || 0,
        users: userCount[0]?.count || 0,
      },
    });
  } catch (error) {
    console.error("Get tenant error:", error);
    res.status(500).json({ error: "Failed to get tenant" });
  }
});

router.post("/tenants/:id/suspend", requirePermission("tenants:suspend"), async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    
    const [updated] = await db
      .update(tenants)
      .set({
        status: "suspended",
        suspendedAt: new Date(),
        suspendedReason: reason,
      })
      .where(eq(tenants.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Suspend tenant error:", error);
    res.status(500).json({ error: "Failed to suspend tenant" });
  }
});

router.post("/tenants/:id/unsuspend", requirePermission("tenants:suspend"), async (req: Request, res: Response) => {
  try {
    const [updated] = await db
      .update(tenants)
      .set({
        status: "active",
        suspendedAt: null,
        suspendedReason: null,
      })
      .where(eq(tenants.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Unsuspend tenant error:", error);
    res.status(500).json({ error: "Failed to unsuspend tenant" });
  }
});

// Update tenant (status, featureFlags)
router.patch("/tenants/:id", requirePermission("tenants:update"), async (req: Request, res: Response) => {
  try {
    const parseResult = updateTenantSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "Invalid request data", 
        details: parseResult.error.format() 
      });
    }

    const { status, featureFlags } = parseResult.data;
    
    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (featureFlags !== undefined) updateData.featureFlags = featureFlags;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const [updated] = await db
      .update(tenants)
      .set(updateData)
      .where(eq(tenants.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Update tenant error:", error);
    res.status(500).json({ error: "Failed to update tenant" });
  }
});

// Reset password for tenant user
router.post("/tenants/:tenantId/users/:userId/reset-password", requirePermission("users:update"), async (req: Request, res: Response) => {
  try {
    const { tenantId, userId } = req.params;
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Verify user belongs to tenant
    const [user] = await db.select().from(users).where(
      and(eq(users.id, userId), eq(users.tenantId, tenantId))
    );
    
    if (!user) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }

    const bcrypt = await import("bcrypt");
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, userId));

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

router.get("/tenants/:id/users", requirePermission("users:read"), async (req: Request, res: Response) => {
  try {
    const tenantUsers = await db
      .select()
      .from(users)
      .where(eq(users.tenantId, req.params.id))
      .orderBy(desc(users.createdAt));

    res.json(tenantUsers);
  } catch (error) {
    console.error("List tenant users error:", error);
    res.status(500).json({ error: "Failed to list users" });
  }
});

router.get("/documents", requirePermission("electronic_billing:read"), async (req: Request, res: Response) => {
  try {
    const { tenantId, status, limit = "50", offset = "0" } = req.query;
    
    const docs = await db
      .select()
      .from(electronicDocuments)
      .orderBy(desc(electronicDocuments.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    res.json(docs);
  } catch (error) {
    console.error("List documents error:", error);
    res.status(500).json({ error: "Failed to list documents" });
  }
});

router.get("/documents/:id", requirePermission("electronic_billing:read"), async (req: Request, res: Response) => {
  try {
    const [doc] = await db
      .select()
      .from(electronicDocuments)
      .where(eq(electronicDocuments.id, req.params.id));

    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json(doc);
  } catch (error) {
    console.error("Get document error:", error);
    res.status(500).json({ error: "Failed to get document" });
  }
});

router.post("/documents/:id/retry", requirePermission("electronic_billing:retry"), async (req: Request, res: Response) => {
  try {
    const [updated] = await db
      .update(electronicDocuments)
      .set({
        status: "pending",
        retryCount: sql`retry_count + 1`,
        lastRetryAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(electronicDocuments.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Retry document error:", error);
    res.status(500).json({ error: "Failed to retry document" });
  }
});

router.get("/tickets", requirePermission("support.tickets:read"), async (req: Request, res: Response) => {
  try {
    const tickets = await db
      .select()
      .from(supportTickets)
      .orderBy(desc(supportTickets.createdAt))
      .limit(50);

    res.json(tickets);
  } catch (error) {
    console.error("List tickets error:", error);
    res.status(500).json({ error: "Failed to list tickets" });
  }
});

router.get("/plans", requirePermission("billing.plans:read"), async (req: Request, res: Response) => {
  try {
    const plans = await db.select().from(subscriptionPlans).orderBy(subscriptionPlans.sortOrder);
    res.json(plans);
  } catch (error) {
    console.error("List plans error:", error);
    res.status(500).json({ error: "Failed to list plans" });
  }
});

router.post("/plans", requirePermission("billing.plans:manage"), async (req: Request, res: Response) => {
  try {
    const { name, tier, businessType, priceMonthly, priceYearly, currency, maxLocations, maxRegisters, maxUsers, maxWarehouses, maxProducts, maxDianDocuments, maxTables, maxRecipes, features, isActive, sortOrder } = req.body;

    if (!name || priceMonthly === undefined) {
      return res.status(400).json({ error: "Name and monthly price are required" });
    }

    const [newPlan] = await db
      .insert(subscriptionPlans)
      .values({
        name,
        tier: tier || "basic",
        businessType: businessType || "retail",
        priceMonthly: priceMonthly.toString(),
        priceYearly: priceYearly ? priceYearly.toString() : null,
        currency: currency || "USD",
        maxLocations: maxLocations || 1,
        maxRegisters: maxRegisters || 1,
        maxUsers: maxUsers || 1,
        maxWarehouses: maxWarehouses ?? 1,
        maxProducts: maxProducts ?? 100,
        maxDianDocuments: maxDianDocuments ?? 200,
        maxTables: maxTables ?? 0,
        maxRecipes: maxRecipes ?? 0,
        features: features || [],
        isActive: isActive !== false,
        sortOrder: sortOrder || 0,
      })
      .returning();

    res.status(201).json(newPlan);
  } catch (error) {
    console.error("Create plan error:", error);
    res.status(500).json({ error: "Failed to create plan" });
  }
});

router.put("/plans/:id", requirePermission("billing.plans:manage"), async (req: Request, res: Response) => {
  try {
    const { name, tier, businessType, priceMonthly, priceYearly, currency, maxLocations, maxRegisters, maxUsers, maxWarehouses, maxProducts, maxDianDocuments, maxTables, maxRecipes, features, isActive, sortOrder } = req.body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (tier !== undefined) updateData.tier = tier;
    if (businessType !== undefined) updateData.businessType = businessType;
    if (priceMonthly !== undefined) updateData.priceMonthly = priceMonthly.toString();
    if (priceYearly !== undefined) updateData.priceYearly = priceYearly ? priceYearly.toString() : null;
    if (currency !== undefined) updateData.currency = currency;
    if (maxLocations !== undefined) updateData.maxLocations = maxLocations;
    if (maxRegisters !== undefined) updateData.maxRegisters = maxRegisters;
    if (maxUsers !== undefined) updateData.maxUsers = maxUsers;
    if (maxWarehouses !== undefined) updateData.maxWarehouses = maxWarehouses;
    if (maxProducts !== undefined) updateData.maxProducts = maxProducts;
    if (maxDianDocuments !== undefined) updateData.maxDianDocuments = maxDianDocuments;
    if (maxTables !== undefined) updateData.maxTables = maxTables;
    if (maxRecipes !== undefined) updateData.maxRecipes = maxRecipes;
    if (features !== undefined) updateData.features = features;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    const [updated] = await db
      .update(subscriptionPlans)
      .set(updateData)
      .where(eq(subscriptionPlans.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Plan not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Update plan error:", error);
    res.status(500).json({ error: "Failed to update plan" });
  }
});

router.delete("/plans/:id", requirePermission("billing.plans:manage"), async (req: Request, res: Response) => {
  try {
    const existingSubs = await db
      .select({ count: count() })
      .from(subscriptions)
      .where(eq(subscriptions.planId, req.params.id));

    if (existingSubs[0]?.count > 0) {
      return res.status(400).json({ error: "Cannot delete plan with active subscriptions" });
    }

    const [deleted] = await db
      .delete(subscriptionPlans)
      .where(eq(subscriptionPlans.id, req.params.id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Plan not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Delete plan error:", error);
    res.status(500).json({ error: "Failed to delete plan" });
  }
});

// Assign subscription to tenant
router.post("/tenants/:tenantId/subscription", requirePermission("billing.subscriptions:manage"), async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    const { planId, billingPeriod = "monthly" } = req.body;

    if (!planId) {
      return res.status(400).json({ error: "Plan ID is required" });
    }

    // Check if tenant exists
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Check if plan exists
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    // Check if tenant already has an active subscription
    const existingSub = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.status, "active")));

    if (existingSub.length > 0) {
      // Update the existing subscription
      const [updated] = await db
        .update(subscriptions)
        .set({
          planId,
          billingPeriod,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + (billingPeriod === "yearly" ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000)),
        })
        .where(eq(subscriptions.id, existingSub[0].id))
        .returning();

      return res.json(updated);
    }

    // Create new subscription
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + (billingPeriod === "yearly" ? 12 : 1));

    const [newSub] = await db
      .insert(subscriptions)
      .values({
        tenantId,
        planId,
        billingPeriod,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
      })
      .returning();

    res.status(201).json(newSub);
  } catch (error) {
    console.error("Assign subscription error:", error);
    res.status(500).json({ error: "Failed to assign subscription" });
  }
});

// Get tenant subscription
router.get("/tenants/:tenantId/subscription", requirePermission("tenants:read"), async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    if (!subscription) {
      return res.json(null);
    }

    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, subscription.planId));

    res.json({ ...subscription, plan });
  } catch (error) {
    console.error("Get tenant subscription error:", error);
    res.status(500).json({ error: "Failed to get tenant subscription" });
  }
});

router.get("/roles", async (req: Request, res: Response) => {
  try {
    const roles = await db.select().from(portalRoles);
    res.json(roles);
  } catch (error) {
    console.error("List roles error:", error);
    res.status(500).json({ error: "Failed to list roles" });
  }
});

router.get("/portal-roles", async (req: Request, res: Response) => {
  try {
    const roles = await db.select().from(portalRoles);
    res.json(roles);
  } catch (error) {
    console.error("List portal roles error:", error);
    res.status(500).json({ error: "Failed to list portal roles" });
  }
});

router.get("/portal-users", requirePermission("users:read"), async (req: Request, res: Response) => {
  try {
    const portalUsers = await db
      .select()
      .from(users)
      .where(eq(users.isInternal, true))
      .orderBy(desc(users.createdAt));

    res.json(portalUsers);
  } catch (error) {
    console.error("List portal users error:", error);
    res.status(500).json({ error: "Failed to list portal users" });
  }
});

router.post("/portal-users", requirePermission("users:create"), async (req: Request, res: Response) => {
  try {
    const { username, password, name, email, phone, portalRole } = req.body;

    if (!username || !password || !name || !email) {
      return res.status(400).json({ error: "Username, password, name, and email are required" });
    }

    const existingUser = await db.select().from(users).where(eq(users.username, username));
    if (existingUser.length > 0) {
      return res.status(400).json({ error: "Username already exists" });
    }

    const bcrypt = await import("bcrypt");
    const hashedPassword = await bcrypt.hash(password, 10);

    const [newUser] = await db
      .insert(users)
      .values({
        tenantId: null,
        username,
        password: hashedPassword,
        name,
        email,
        phone: phone || null,
        role: "admin",
        isActive: true,
        isInternal: true,
      })
      .returning();

    if (portalRole) {
      await db.insert(userPortalRoles).values({
        userId: newUser.id,
        roleId: portalRole,
      });
    }

    res.status(201).json({ ...newUser, password: undefined });
  } catch (error) {
    console.error("Create portal user error:", error);
    res.status(500).json({ error: "Failed to create portal user" });
  }
});

export default router;
