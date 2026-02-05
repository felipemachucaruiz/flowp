import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { 
  tenants, users, locations, registers, 
  electronicDocuments, supportTickets, ticketComments,
  subscriptions, invoices, auditLogs, orders, tenantIntegrationsMatias,
  matiasDocumentQueue, matiasDocumentFiles,
  addonDefinitions, tenantAddons
} from "@shared/schema";
import { eq, desc, sql, and, count, sum, gte, like, or, ilike, asc } from "drizzle-orm";
import { requireTenant, requirePermission, enforceTenantIsolation } from "../middleware/rbac";

const router = Router();

router.use(requireTenant);
router.use(enforceTenantIsolation);

router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [orderStats] = await db
      .select({
        todayCount: sql<number>`COUNT(*) FILTER (WHERE created_at >= ${today})`,
        todayTotal: sql<string>`COALESCE(SUM(total) FILTER (WHERE created_at >= ${today}), 0)`,
      })
      .from(orders)
      .where(eq(orders.tenantId, tenantId));

    const [docStats] = await db
      .select({
        pending: sql<number>`COUNT(*) FILTER (WHERE status = 'pending')`,
        error: sql<number>`COUNT(*) FILTER (WHERE status = 'error' OR status = 'rejected')`,
      })
      .from(electronicDocuments)
      .where(eq(electronicDocuments.tenantId, tenantId));

    const [ticketStats] = await db
      .select({
        open: sql<number>`COUNT(*) FILTER (WHERE status = 'open' OR status = 'in_progress')`,
      })
      .from(supportTickets)
      .where(eq(supportTickets.tenantId, tenantId));

    res.json({
      orders: {
        todayCount: orderStats?.todayCount || 0,
        todayTotal: orderStats?.todayTotal || "0",
      },
      electronicBilling: {
        pending: docStats?.pending || 0,
        errors: docStats?.error || 0,
      },
      support: {
        openTickets: ticketStats?.open || 0,
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

router.get("/profile", async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    res.json({
      id: tenant.id,
      name: tenant.name,
      type: tenant.type,
      status: tenant.status,
      logo: tenant.logo,
      address: tenant.address,
      phone: tenant.phone,
      currency: tenant.currency,
      taxRate: tenant.taxRate,
      language: tenant.language,
      timezone: tenant.timezone,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Failed to get profile" });
  }
});

router.patch("/profile", async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const { name, logo, address, phone, currency, taxRate, language, timezone } = req.body;

    const [updated] = await db
      .update(tenants)
      .set({ name, logo, address, phone, currency, taxRate, language, timezone })
      .where(eq(tenants.id, tenantId))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

router.get("/locations", requirePermission("settings.locations:manage"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const locs = await db.select().from(locations).where(eq(locations.tenantId, tenantId));
    res.json(locs);
  } catch (error) {
    console.error("List locations error:", error);
    res.status(500).json({ error: "Failed to list locations" });
  }
});

router.post("/locations", requirePermission("settings.locations:manage"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const { name, address, city, country, timezone, isDefault } = req.body;

    const [location] = await db
      .insert(locations)
      .values({ tenantId, name, address, city, country, timezone, isDefault })
      .returning();

    res.status(201).json(location);
  } catch (error) {
    console.error("Create location error:", error);
    res.status(500).json({ error: "Failed to create location" });
  }
});

router.get("/registers", requirePermission("settings.registers:manage"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const regs = await db.select().from(registers).where(eq(registers.tenantId, tenantId));
    res.json(regs);
  } catch (error) {
    console.error("List registers error:", error);
    res.status(500).json({ error: "Failed to list registers" });
  }
});

router.get("/users", requirePermission("settings.users:manage"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const tenantUsers = await db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.tenantId, tenantId));

    res.json(tenantUsers);
  } catch (error) {
    console.error("List users error:", error);
    res.status(500).json({ error: "Failed to list users" });
  }
});

router.get("/documents", requirePermission("electronic_billing:read"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const docs = await db
      .select()
      .from(electronicDocuments)
      .where(eq(electronicDocuments.tenantId, tenantId))
      .orderBy(desc(electronicDocuments.createdAt))
      .limit(100);

    res.json(docs);
  } catch (error) {
    console.error("List documents error:", error);
    res.status(500).json({ error: "Failed to list documents" });
  }
});

router.get("/documents/:id", requirePermission("electronic_billing:read"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const [doc] = await db
      .select()
      .from(electronicDocuments)
      .where(and(
        eq(electronicDocuments.id, req.params.id),
        eq(electronicDocuments.tenantId, tenantId)
      ));

    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json(doc);
  } catch (error) {
    console.error("Get document error:", error);
    res.status(500).json({ error: "Failed to get document" });
  }
});

router.get("/subscription", requirePermission("billing.subscriptions:read"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    res.json(subscription || null);
  } catch (error) {
    console.error("Get subscription error:", error);
    res.status(500).json({ error: "Failed to get subscription" });
  }
});

router.get("/invoices", requirePermission("billing.invoices:read"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const invs = await db
      .select()
      .from(invoices)
      .where(eq(invoices.tenantId, tenantId))
      .orderBy(desc(invoices.issuedAt));

    res.json(invs);
  } catch (error) {
    console.error("List invoices error:", error);
    res.status(500).json({ error: "Failed to list invoices" });
  }
});

router.get("/tickets", requirePermission("support.tickets:read"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const tickets = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.tenantId, tenantId))
      .orderBy(desc(supportTickets.createdAt));

    res.json(tickets);
  } catch (error) {
    console.error("List tickets error:", error);
    res.status(500).json({ error: "Failed to list tickets" });
  }
});

router.post("/tickets", requirePermission("support.tickets:manage"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const { subject, description, priority, category } = req.body;

    const [ticket] = await db
      .insert(supportTickets)
      .values({
        tenantId,
        createdBy: req.portalSession!.userId,
        subject,
        description,
        priority: priority || "medium",
        category,
      })
      .returning();

    res.status(201).json(ticket);
  } catch (error) {
    console.error("Create ticket error:", error);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

router.get("/tickets/:id", requirePermission("support.tickets:read"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const [ticket] = await db
      .select()
      .from(supportTickets)
      .where(and(
        eq(supportTickets.id, req.params.id),
        eq(supportTickets.tenantId, tenantId)
      ));

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const comments = await db
      .select()
      .from(ticketComments)
      .where(and(
        eq(ticketComments.ticketId, ticket.id),
        eq(ticketComments.isInternal, false)
      ))
      .orderBy(ticketComments.createdAt);

    res.json({ ...ticket, comments });
  } catch (error) {
    console.error("Get ticket error:", error);
    res.status(500).json({ error: "Failed to get ticket" });
  }
});

router.post("/tickets/:id/comments", requirePermission("support.tickets:manage"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const [ticket] = await db
      .select()
      .from(supportTickets)
      .where(and(
        eq(supportTickets.id, req.params.id),
        eq(supportTickets.tenantId, tenantId)
      ));

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const { content } = req.body;

    const [comment] = await db
      .insert(ticketComments)
      .values({
        ticketId: ticket.id,
        userId: req.portalSession!.userId,
        content,
        isInternal: false,
      })
      .returning();

    res.status(201).json(comment);
  } catch (error) {
    console.error("Add comment error:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

// E-Billing Configuration
router.get("/ebilling-config", requirePermission('manage_settings'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const config = await db.query.tenantIntegrationsMatias.findFirst({
      where: eq(tenantIntegrationsMatias.tenantId, tenantId),
    });

    if (!config) {
      return res.json({
        isEnabled: false,
        resolutionNumber: "",
        prefix: "",
        startingNumber: null,
        endingNumber: null,
        currentNumber: null,
        autoSubmitSales: true,
      });
    }

    res.json({
      isEnabled: config.isEnabled ?? false,
      resolutionNumber: config.defaultResolutionNumber || "",
      prefix: config.defaultPrefix || "",
      startingNumber: config.startingNumber,
      endingNumber: config.endingNumber,
      currentNumber: config.currentNumber,
      autoSubmitSales: config.autoSubmitSales ?? true,
    });
  } catch (error) {
    console.error("Get e-billing config error:", error);
    res.status(500).json({ error: "Failed to get e-billing configuration" });
  }
});

router.put("/ebilling-config", requirePermission('manage_settings'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const { isEnabled, resolutionNumber, prefix, startingNumber, endingNumber, autoSubmitSales } = req.body;

    const existingConfig = await db.query.tenantIntegrationsMatias.findFirst({
      where: eq(tenantIntegrationsMatias.tenantId, tenantId),
    });

    const now = new Date();
    
    if (existingConfig) {
      const updateData: Record<string, any> = {
        isEnabled: isEnabled ?? false,
        defaultResolutionNumber: resolutionNumber || null,
        defaultPrefix: prefix || null,
        startingNumber: startingNumber || null,
        endingNumber: endingNumber || null,
        autoSubmitSales: autoSubmitSales ?? true,
        updatedAt: now,
      };

      // Initialize currentNumber if it's not set and we have a starting number
      if (!existingConfig.currentNumber && startingNumber) {
        updateData.currentNumber = startingNumber;
      }

      await db
        .update(tenantIntegrationsMatias)
        .set(updateData)
        .where(eq(tenantIntegrationsMatias.tenantId, tenantId));
    } else {
      // Create new config with placeholder values for required fields
      await db.insert(tenantIntegrationsMatias).values({
        tenantId,
        baseUrl: "https://api-v2.matias-api.com/api/ubl2.1",
        email: "pending@setup.com",
        passwordEncrypted: "",
        isEnabled: isEnabled ?? false,
        defaultResolutionNumber: resolutionNumber || null,
        defaultPrefix: prefix || null,
        startingNumber: startingNumber || null,
        endingNumber: endingNumber || null,
        currentNumber: startingNumber || null,
        autoSubmitSales: autoSubmitSales ?? true,
        createdAt: now,
        updatedAt: now,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Update e-billing config error:", error);
    res.status(500).json({ error: "Failed to update e-billing configuration" });
  }
});

// E-Billing Documents - Tenant can view their own documents (requires settings.view permission)
router.get("/ebilling/documents", requirePermission("settings.view"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const { status, kind, query, limit = "50", offset = "0" } = req.query;

    let conditions = [eq(matiasDocumentQueue.tenantId, tenantId)];

    if (status && typeof status === "string") {
      conditions.push(sql`${matiasDocumentQueue.status} = ${status}`);
    }

    if (kind && typeof kind === "string") {
      conditions.push(sql`${matiasDocumentQueue.kind} = ${kind}`);
    }

    if (query && typeof query === "string") {
      conditions.push(
        or(
          ilike(matiasDocumentQueue.orderNumber, `%${query}%`),
          sql`CAST(${matiasDocumentQueue.documentNumber} AS TEXT) LIKE ${`%${query}%`}`
        ) as any
      );
    }

    const documents = await db
      .select()
      .from(matiasDocumentQueue)
      .where(and(...conditions))
      .orderBy(desc(matiasDocumentQueue.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    const [{ total }] = await db
      .select({ total: count() })
      .from(matiasDocumentQueue)
      .where(and(...conditions));

    // Get stats
    const [stats] = await db
      .select({
        total: count(),
        accepted: sql<number>`COUNT(*) FILTER (WHERE status = 'ACCEPTED')`,
        pending: sql<number>`COUNT(*) FILTER (WHERE status = 'PENDING' OR status = 'SENT')`,
        rejected: sql<number>`COUNT(*) FILTER (WHERE status = 'REJECTED')`,
        failed: sql<number>`COUNT(*) FILTER (WHERE status = 'FAILED')`,
      })
      .from(matiasDocumentQueue)
      .where(eq(matiasDocumentQueue.tenantId, tenantId));

    res.json({
      documents,
      total,
      stats: {
        total: stats?.total || 0,
        accepted: stats?.accepted || 0,
        pending: stats?.pending || 0,
        rejected: stats?.rejected || 0,
        failed: stats?.failed || 0,
      },
    });
  } catch (error) {
    console.error("Get e-billing documents error:", error);
    res.status(500).json({ error: "Failed to get documents" });
  }
});

router.get("/ebilling/documents/:id", requirePermission("settings.view"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const { id } = req.params;

    const [document] = await db
      .select()
      .from(matiasDocumentQueue)
      .where(and(
        eq(matiasDocumentQueue.id, id),
        eq(matiasDocumentQueue.tenantId, tenantId)
      ));

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Get attached files
    const files = await db
      .select()
      .from(matiasDocumentFiles)
      .where(eq(matiasDocumentFiles.documentId, id));

    res.json({ ...document, files });
  } catch (error) {
    console.error("Get document detail error:", error);
    res.status(500).json({ error: "Failed to get document" });
  }
});

router.get("/ebilling/status", requirePermission("settings.view"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    const config = await db.query.tenantIntegrationsMatias.findFirst({
      where: eq(tenantIntegrationsMatias.tenantId, tenantId),
    });

    const isConfigured = config?.isEnabled && config?.email && config?.passwordEncrypted;

    // Get monthly stats
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [monthlyStats] = await db
      .select({
        total: count(),
        accepted: sql<number>`COUNT(*) FILTER (WHERE status = 'ACCEPTED')`,
      })
      .from(matiasDocumentQueue)
      .where(and(
        eq(matiasDocumentQueue.tenantId, tenantId),
        gte(matiasDocumentQueue.createdAt, startOfMonth)
      ));

    const successRate = monthlyStats?.total && monthlyStats.total > 0
      ? Math.round((monthlyStats.accepted / monthlyStats.total) * 100) + "%"
      : "N/A";

    res.json({
      configured: !!isConfigured,
      documentsThisMonth: monthlyStats?.total || 0,
      acceptedThisMonth: monthlyStats?.accepted || 0,
      successRate,
      resolution: config?.defaultResolutionNumber || null,
      prefix: config?.defaultPrefix || null,
      currentNumber: config?.currentNumber || null,
      endingNumber: config?.endingNumber || null,
    });
  } catch (error) {
    console.error("Get e-billing status error:", error);
    res.status(500).json({ error: "Failed to get status" });
  }
});

// ==========================================
// CUSTOMER ADD-ONS MANAGEMENT
// ==========================================

// Helper middleware to check if user is owner (uses portalSession)
const requireOwnerRole = (req: Request, res: Response, next: Function) => {
  if (!req.portalSession) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (!req.portalSession.roles.includes("owner")) {
    return res.status(403).json({ error: "Owner access required" });
  }
  next();
};

// Zod schema for add-on activation
const activateAddonSchema = z.object({
  withTrial: z.boolean().optional().default(false),
});

// Validate addon key format
const addonKeySchema = z.string().regex(/^[a-z0-9_]+$/, "Invalid add-on key format");

// Get available add-ons and tenant's active add-ons (owner only)
router.get("/addons", requireOwnerRole, async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }

    // Get tenant info for subscription tier
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    
    // Get all available add-ons (active ones)
    const availableAddons = await db.query.addonDefinitions.findMany({
      where: eq(addonDefinitions.isActive, true),
      orderBy: [asc(addonDefinitions.sortOrder)],
    });
    
    // Get tenant's active add-ons
    const activeAddons = await db.query.tenantAddons.findMany({
      where: eq(tenantAddons.tenantId, tenantId),
    });

    res.json({ 
      availableAddons, 
      activeAddons,
      subscriptionTier: tenant?.subscriptionTier || "basic",
    });
  } catch (error: any) {
    console.error("Get addons error:", error);
    res.status(500).json({ error: "Failed to get add-ons" });
  }
});

// Activate an add-on (owner only, with optional trial)
router.post("/addons/:addonKey", requireOwnerRole, async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    const { addonKey } = req.params;
    
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }
    
    // Validate addonKey format with Zod
    const keyResult = addonKeySchema.safeParse(addonKey);
    if (!keyResult.success) {
      return res.status(400).json({ error: "Invalid add-on key format" });
    }
    
    // Validate request body with Zod
    const bodyResult = activateAddonSchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }
    const { withTrial } = bodyResult.data;

    // Get add-on definition
    const addonDef = await db.query.addonDefinitions.findFirst({
      where: eq(addonDefinitions.addonKey, addonKey),
    });

    if (!addonDef || !addonDef.isActive) {
      return res.status(404).json({ error: "Add-on not found" });
    }

    // Check if already activated
    const existing = await db.query.tenantAddons.findFirst({
      where: and(
        eq(tenantAddons.tenantId, tenantId),
        eq(tenantAddons.addonType, addonKey)
      ),
    });

    if (existing && existing.status !== "cancelled" && existing.status !== "expired") {
      return res.status(400).json({ error: "Add-on already active" });
    }

    // Check if included in tenant's subscription tier
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    const tierInclusion = addonDef.includedInTiers || [];
    const isIncludedInTier = tierInclusion.includes(tenant?.subscriptionTier || "");

    // Determine status and trial end date
    let status: "active" | "trial" = "active";
    let trialEndsAt: Date | null = null;
    let trialUsedAt: Date | null = null;

    // Check if trial was already used (prevent trial abuse)
    const trialAlreadyUsed = existing?.trialUsedAt != null;

    if (withTrial && addonDef.trialDays > 0 && !isIncludedInTier && !trialAlreadyUsed) {
      status = "trial";
      trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + addonDef.trialDays);
      trialUsedAt = new Date();
    } else if (withTrial && trialAlreadyUsed) {
      // User requested trial but already used it - activate without trial
      status = "active";
    }

    if (existing) {
      // Reactivate cancelled/expired addon
      const updateData: any = {
        status,
        trialEndsAt,
        monthlyPrice: isIncludedInTier ? 0 : addonDef.monthlyPrice,
        cancelledAt: null,
        billingCycleStart: new Date(),
        updatedAt: new Date(),
      };
      // Only set trialUsedAt if this is a new trial
      if (trialUsedAt && !existing.trialUsedAt) {
        updateData.trialUsedAt = trialUsedAt;
      }
      
      await db.update(tenantAddons)
        .set(updateData)
        .where(eq(tenantAddons.id, existing.id));
    } else {
      // Create new addon subscription
      await db.insert(tenantAddons).values({
        tenantId,
        addonType: addonKey,
        status,
        trialEndsAt,
        trialUsedAt,
        monthlyPrice: isIncludedInTier ? 0 : addonDef.monthlyPrice,
        billingCycleStart: new Date(),
      });
    }

    res.json({ success: true, message: "Add-on activated" });
  } catch (error: any) {
    console.error("Activate addon error:", error);
    res.status(500).json({ error: "Failed to activate add-on" });
  }
});

// Cancel an add-on (owner only)
router.delete("/addons/:addonKey", requireOwnerRole, async (req: Request, res: Response) => {
  try {
    const tenantId = req.targetTenantId;
    const { addonKey } = req.params;
    
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID required" });
    }
    
    // Validate addonKey format with Zod
    const keyResult = addonKeySchema.safeParse(addonKey);
    if (!keyResult.success) {
      return res.status(400).json({ error: "Invalid add-on key format" });
    }

    const addon = await db.query.tenantAddons.findFirst({
      where: and(
        eq(tenantAddons.tenantId, tenantId),
        eq(tenantAddons.addonType, addonKey)
      ),
    });

    if (!addon) {
      return res.status(404).json({ error: "Add-on not found" });
    }

    await db.update(tenantAddons)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenantAddons.id, addon.id));

    res.json({ success: true, message: "Add-on cancelled" });
  } catch (error: any) {
    console.error("Cancel addon error:", error);
    res.status(500).json({ error: "Failed to cancel add-on" });
  }
});

export default router;
