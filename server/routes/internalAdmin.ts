import { Router, Request, Response } from "express";
import { internalAuth, requireRole, verifyInternalUser, createInternalUser } from "../middleware/internalAuth";
import * as ebillingService from "../services/internal-admin/ebillingService";
import * as documentOpsService from "../services/internal-admin/documentOpsService";
import * as integrationService from "../services/internal-admin/integrationService";
import { encrypt as gupshupEncrypt, decrypt as gupshupDecrypt, createGupshupClient } from "../integrations/gupshup/service";
import { encrypt as shopifyEncrypt, decrypt as shopifyDecrypt } from "../integrations/shopify/shopifyClient";
import { db } from "../db";
import { tenants, tenantEbillingSubscriptions, tenantIntegrationsMatias, internalUsers, internalAuditLogs, platformConfig, users, tenantAddons, PAID_ADDONS, addonDefinitions, tenantSubscriptions, subscriptionPlans, whatsappPackages, tenantWhatsappSubscriptions, whatsappMessageLogs, tenantWhatsappIntegrations } from "@shared/schema";
import bcrypt from "bcryptjs";
import { eq, like, or, desc, and, sql, inArray } from "drizzle-orm";
import crypto from "crypto";
import https from "https";

const ENCRYPTION_KEY = process.env.SESSION_SECRET || "default-encryption-key-32-chars!";

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export const internalAdminRouter = Router();

internalAdminRouter.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await verifyInternalUser(email, password);
    
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.post("/auth/register", async (req: Request, res: Response) => {
  try {
    const { email, name, password, role } = req.body;
    
    // Only allow registration when NO admin users exist (first-time setup)
    const existingAdmins = await db.query.internalUsers.findMany();
    if (existingAdmins.length > 0) {
      return res.status(403).json({ error: "Registration is disabled. Admin users already exist." });
    }

    const user = await createInternalUser({ email, name, password, role: "superadmin" });
    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.use(internalAuth);

internalAdminRouter.get("/stats", requireRole(["superadmin", "supportagent", "billingops"]), async (req: Request, res: Response) => {
  try {
    const allTenants = await db.query.tenants.findMany();
    const packages = await ebillingService.listPackages();
    
    const tenantStats = {
      total: allTenants.length,
      active: allTenants.filter(t => t.status === "active").length,
      trial: allTenants.filter(t => t.status === "trial").length,
      pastDue: allTenants.filter(t => t.status === "past_due").length,
      suspended: allTenants.filter(t => t.status === "suspended").length,
    };

    res.json({
      tenants: tenantStats,
      documents: { thisMonth: 0, accepted: 0 },
      packages: { active: packages.filter(p => p.isActive).length },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.get("/tenants", requireRole(["superadmin", "supportagent", "billingops"]), async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query;
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          like(tenants.name, `%${search}%`),
          like(tenants.id, `%${search}%`),
        )
      );
    }
    if (status) {
      conditions.push(eq(tenants.status, status as any));
    }

    const tenantList = await db.query.tenants.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(tenants.createdAt)],
      limit: 100,
    });

    const tenantsWithBilling = await Promise.all(
      tenantList.map(async (tenant) => {
        const subscription = await ebillingService.getTenantSubscription(tenant.id);
        const usage = await ebillingService.getTenantUsage(tenant.id);
        const integration = await integrationService.getIntegrationStatus(tenant.id);
        
        return {
          ...tenant,
          ebillingSubscription: subscription,
          ebillingUsage: usage,
          integrationStatus: integration.status,
        };
      })
    );

    res.json({ success: true, tenants: tenantsWithBilling });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.get("/tenants/:tenantId/overview", requireRole(["superadmin", "supportagent", "billingops"]), async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    });

    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [subscription, usage, integration, alerts, recentDocs] = await Promise.all([
      ebillingService.getTenantSubscription(tenantId),
      ebillingService.getTenantUsage(tenantId),
      integrationService.getIntegrationStatus(tenantId),
      ebillingService.listAlerts({ tenantId, limit: 10 }),
      documentOpsService.listDocuments({ tenantId, limit: 10 }),
    ]);

    res.json({
      success: true,
      tenant,
      subscription,
      usage,
      integration,
      alerts,
      recentDocuments: recentDocs.documents,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.get("/tenants/:tenantId/ebilling/integration", requireRole(["superadmin", "supportagent", "billingops"]), async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;
    const status = await integrationService.getIntegrationStatus(tenantId);
    res.json({ success: true, integration: status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.post("/tenants/:tenantId/ebilling/integration/test", requireRole(["superadmin", "supportagent"]), async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;
    const result = await integrationService.testConnection(tenantId, req.internalUser?.id);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

internalAdminRouter.post("/tenants/:tenantId/ebilling/integration/update", requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;
    const data = {
      ...req.body,
      startingNumber: req.body.startingNumber ? parseInt(req.body.startingNumber, 10) : null,
      endingNumber: req.body.endingNumber ? parseInt(req.body.endingNumber, 10) : null,
    };
    const result = await integrationService.updateIntegrationConfig(tenantId, data, req.internalUser?.id);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.get("/ebilling/documents", requireRole(["superadmin", "supportagent", "billingops"]), async (req: Request, res: Response) => {
  try {
    const { tenantId, kind, status, from, to, query, limit, offset } = req.query;
    
    const result = await documentOpsService.listDocuments({
      tenantId: tenantId as string,
      kind: kind as string,
      status: status as string,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
      query: query as string,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.get("/ebilling/documents/:id", requireRole(["superadmin", "supportagent"]), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const document = await documentOpsService.getDocumentDetails(id);
    
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json({ success: true, document });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.post("/ebilling/documents/:id/retry", requireRole(["superadmin", "supportagent"]), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const document = await documentOpsService.retryDocument(id, req.internalUser!.id);
    res.json({ success: true, document });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.get("/ebilling/documents/:id/pdf", requireRole(["superadmin", "supportagent"]), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await documentOpsService.downloadDocumentPdf(id);
    
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename=document-${id}.pdf`);
    res.send(result.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.get("/ebilling/documents/:id/attached", requireRole(["superadmin", "supportagent"]), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await documentOpsService.downloadDocumentAttached(id);
    
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename=document-${id}.zip`);
    res.send(result.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.get("/ebilling/packages", requireRole(["superadmin", "supportagent", "billingops"]), async (req: Request, res: Response) => {
  try {
    const packages = await ebillingService.listPackages();
    res.json({ success: true, packages });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.post("/ebilling/packages", requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const pkg = await ebillingService.createPackage(req.body);
    res.json({ success: true, package: pkg });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.patch("/ebilling/packages/:id", requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const pkg = await ebillingService.updatePackage(id, req.body);
    res.json({ success: true, package: pkg });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.get("/tenants/:tenantId/ebilling/subscription", requireRole(["superadmin", "supportagent", "billingops"]), async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;
    const subscription = await ebillingService.getTenantSubscription(tenantId);
    const usage = await ebillingService.getTenantUsage(tenantId);
    res.json({ success: true, subscription, usage });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.post("/tenants/:tenantId/ebilling/subscription/assign", requireRole(["superadmin", "billingops"]), async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;
    const { packageId, overagePolicy, overagePricePerDocUsdCents } = req.body;
    
    const subscription = await ebillingService.assignPackageToTenant({
      tenantId,
      packageId,
      overagePolicy,
      overagePricePerDocUsdCents,
      actorInternalUserId: req.internalUser!.id,
    });

    res.json({ success: true, subscription });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.post("/tenants/:tenantId/ebilling/credits", requireRole(["superadmin", "billingops"]), async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;
    const { deltaDocuments, reason } = req.body;
    
    const credit = await ebillingService.applyCredit({
      tenantId,
      deltaDocuments,
      reason,
      actorInternalUserId: req.internalUser!.id,
    });

    res.json({ success: true, credit });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.get("/tenants/:tenantId/ebilling/usage", requireRole(["superadmin", "supportagent", "billingops"]), async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;
    const { period } = req.query;
    
    const periodStart = period ? new Date(`${period}-01`) : undefined;
    const usage = await ebillingService.getTenantUsage(tenantId, periodStart);
    
    res.json({ success: true, usage });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.get("/ebilling/alerts", requireRole(["superadmin", "supportagent", "billingops"]), async (req: Request, res: Response) => {
  try {
    const { tenantId, type, ack } = req.query;
    
    const alerts = await ebillingService.listAlerts({
      tenantId: tenantId as string,
      type: type as string,
      isAcknowledged: ack === "true" ? true : ack === "false" ? false : undefined,
    });

    res.json({ success: true, alerts });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.post("/ebilling/alerts/:id/ack", requireRole(["superadmin", "supportagent"]), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const alert = await ebillingService.acknowledgeAlert(id, req.internalUser!.id);
    res.json({ success: true, alert });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.get("/audit", requireRole(["superadmin", "billingops"]), async (req: Request, res: Response) => {
  try {
    const { tenantId, action, from, to } = req.query;
    
    const logs = await ebillingService.listAuditLogs({
      tenantId: tenantId as string,
      actionType: action as string,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
    });

    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.post("/tenants/:tenantId/suspend", requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;
    const { reason } = req.body;

    await db
      .update(tenants)
      .set({
        status: "suspended",
        suspendedAt: new Date(),
        suspendedReason: reason,
      })
      .where(eq(tenants.id, tenantId));

    await db.insert(internalAuditLogs).values({
      actorInternalUserId: req.internalUser!.id,
      actionType: "TENANT_SUSPEND",
      tenantId,
      entityType: "tenant",
      entityId: tenantId,
      metadata: { reason },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.post("/tenants/:tenantId/unsuspend", requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;

    await db
      .update(tenants)
      .set({
        status: "active",
        suspendedAt: null,
        suspendedReason: null,
      })
      .where(eq(tenants.id, tenantId));

    await db.insert(internalAuditLogs).values({
      actorInternalUserId: req.internalUser!.id,
      actionType: "TENANT_UNSUSPEND",
      tenantId,
      entityType: "tenant",
      entityId: tenantId,
      metadata: {},
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update tenant (status, feature flags)
internalAdminRouter.patch("/tenants/:tenantId", requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;
    const { status, featureFlags } = req.body;
    console.log("[PATCH /tenants/:tenantId] Request body:", JSON.stringify(req.body));
    console.log("[PATCH /tenants/:tenantId] tenantId:", tenantId, "status:", status, "featureFlags:", featureFlags);

    // Validate tenant exists
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    });
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const updateData: any = {};
    if (status) updateData.status = status;
    if (featureFlags !== undefined) updateData.featureFlags = featureFlags;

    if (Object.keys(updateData).length > 0) {
      await db.update(tenants).set(updateData).where(eq(tenants.id, tenantId));
    }

    // Log audit only if we have a valid user ID
    if (req.internalUser?.id) {
      await db.insert(internalAuditLogs).values({
        actorInternalUserId: req.internalUser.id,
        actionType: "TENANT_UPDATE",
        tenantId,
        entityType: "tenant",
        entityId: tenantId,
        metadata: updateData,
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("[PATCH /tenants/:tenantId] Error:", error);
    res.status(500).json({ error: error.message || "Unknown error", details: String(error) });
  }
});

// Get tenant users
internalAdminRouter.get("/tenants/:tenantId/users", requireRole(["superadmin", "supportagent"]), async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;
    
    const tenantUsers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
      role: users.role,
    }).from(users).where(eq(users.tenantId, tenantId));

    res.json(tenantUsers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Reset user password
internalAdminRouter.post("/tenants/:tenantId/users/:userId/reset-password", requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const { tenantId, userId } = req.params;
    const { newPassword } = req.body;

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await db.update(users).set({ password: hashedPassword }).where(
      and(eq(users.id, userId), eq(users.tenantId, tenantId))
    );

    await db.insert(internalAuditLogs).values({
      actorInternalUserId: req.internalUser!.id,
      actionType: "TENANT_UPDATE" as const,
      tenantId,
      entityType: "user",
      entityId: userId,
      metadata: { action: "password_reset" },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.get("/ebilling/stats", requireRole(["superadmin", "billingops"]), async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    const stats = await documentOpsService.getDocumentStats(tenantId as string);
    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.get("/audit", requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const { action, limit = "50", offset = "0" } = req.query;
    const conditions = [];

    if (action) {
      conditions.push(eq(internalAuditLogs.actionType, action as any));
    }

    const logs = await db.query.internalAuditLogs.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: desc(internalAuditLogs.createdAt),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    res.json({ success: true, logs, total: logs.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Global MATIAS Configuration - Platform-wide API credentials
internalAdminRouter.get("/matias/config", requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const configs = await db.select().from(platformConfig).where(
      or(
        eq(platformConfig.key, "matias_base_url"),
        eq(platformConfig.key, "matias_email"),
        eq(platformConfig.key, "matias_password"),
        eq(platformConfig.key, "matias_enabled"),
        eq(platformConfig.key, "matias_skip_ssl")
      )
    );

    const configMap: Record<string, string> = {};
    for (const c of configs) {
      if (c.key === "matias_password" && c.encryptedValue) {
        configMap[c.key] = c.encryptedValue;
      } else {
        configMap[c.key] = c.value || "";
      }
    }

    const config = {
      baseUrl: configMap.matias_base_url || "https://api-v2.matias-api.com",
      email: configMap.matias_email || "",
      hasPassword: !!configMap.matias_password,
      isEnabled: configMap.matias_enabled === "true",
      skipSSL: configMap.matias_skip_ssl === "true",
    };

    res.json({ success: true, config });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.post("/matias/config", requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const { baseUrl, email, password, isEnabled, skipSSL } = req.body;
    const userId = (req as any).user?.userId;

    const upsertConfig = async (key: string, value: string | null, isEncrypted = false) => {
      const existing = await db.select().from(platformConfig).where(eq(platformConfig.key, key));
      const now = new Date();
      
      if (existing.length > 0) {
        await db.update(platformConfig)
          .set({
            value: isEncrypted ? null : value,
            encryptedValue: isEncrypted && value ? encrypt(value) : null,
            updatedBy: userId,
            updatedAt: now,
          })
          .where(eq(platformConfig.key, key));
      } else {
        await db.insert(platformConfig).values({
          key,
          value: isEncrypted ? null : value,
          encryptedValue: isEncrypted && value ? encrypt(value) : null,
          updatedBy: userId,
          createdAt: now,
          updatedAt: now,
        });
      }
    };

    await upsertConfig("matias_base_url", baseUrl || "https://api-v2.matias-api.com");
    await upsertConfig("matias_email", email || "");
    if (password) {
      await upsertConfig("matias_password", password, true);
    }
    await upsertConfig("matias_enabled", isEnabled ? "true" : "false");
    await upsertConfig("matias_skip_ssl", skipSSL ? "true" : "false");

    res.json({ 
      success: true, 
      message: "Configuration saved successfully."
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.post("/matias/test-connection", requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const configs = await db.select().from(platformConfig).where(
      or(
        eq(platformConfig.key, "matias_base_url"),
        eq(platformConfig.key, "matias_email"),
        eq(platformConfig.key, "matias_password"),
        eq(platformConfig.key, "matias_skip_ssl")
      )
    );

    const configMap: Record<string, string> = {};
    for (const c of configs) {
      if (c.key === "matias_password" && c.encryptedValue) {
        try {
          configMap[c.key] = decrypt(c.encryptedValue);
        } catch {
          configMap[c.key] = "";
        }
      } else {
        configMap[c.key] = c.value || "";
      }
    }

    const email = configMap.matias_email;
    const password = configMap.matias_password;
    const skipSSL = configMap.matias_skip_ssl === "true";

    if (!email || !password) {
      return res.json({ 
        success: false, 
        message: "Email and Password are required to test connection."
      });
    }

    try {
      // MATIAS v2 uses separate auth URL for login
      const authBaseUrl = "https://auth-v2.matias-api.com";
      const loginUrl = `${authBaseUrl}/auth/login`;
      console.log(`[MATIAS] Testing connection to: ${loginUrl} (skipSSL: ${skipSSL})`);
      
      const postData = JSON.stringify({
        email: email,
        password: password,
        remember_me: 0
      });

      const makeRequest = (): Promise<{ ok: boolean; status: number; data: string }> => {
        return new Promise((resolve, reject) => {
          const url = new URL(loginUrl);
          const options: https.RequestOptions = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "Content-Length": Buffer.byteLength(postData),
            },
            rejectUnauthorized: !skipSSL,
          };

          const req = https.request(options, (response) => {
            let data = "";
            response.on("data", (chunk) => { data += chunk; });
            response.on("end", () => {
              resolve({
                ok: response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300,
                status: response.statusCode || 0,
                data,
              });
            });
          });

          req.on("error", (error) => reject(error));
          req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error("Request timeout"));
          });
          req.write(postData);
          req.end();
        });
      };

      const response = await makeRequest();

      if (response.ok) {
        try {
          const jsonData = JSON.parse(response.data);
          if (jsonData.success && jsonData.access_token) {
            console.log(`[MATIAS] Connection successful - user: ${jsonData.user?.name || email}`);
            res.json({ 
              success: true, 
              message: `Connection successful! Logged in as ${jsonData.user?.name || email}`
            });
          } else {
            res.json({ 
              success: false, 
              message: jsonData.message || "Authentication failed"
            });
          }
        } catch {
          res.json({ 
            success: true, 
            message: `Connection successful! Response received.`
          });
        }
      } else {
        console.log(`[MATIAS] Connection failed: ${response.status} - ${response.data}`);
        try {
          const errorData = JSON.parse(response.data);
          res.json({ 
            success: false, 
            message: errorData.message || `API returned ${response.status}`
          });
        } catch {
          res.json({ 
            success: false, 
            message: `API returned ${response.status}: ${response.data.substring(0, 200)}`
          });
        }
      }
    } catch (fetchError: any) {
      console.error(`[MATIAS] Fetch error:`, fetchError);
      let errorMessage = fetchError.message || "Unknown error";
      if (fetchError.code) {
        errorMessage += ` (${fetchError.code})`;
      }
      res.json({ 
        success: false, 
        message: `Connection failed: ${errorMessage}`
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message, success: false });
  }
});

// ==========================================
// TENANT ADD-ONS MANAGEMENT
// ==========================================

// Get all add-ons for a tenant
internalAdminRouter.get("/tenants/:tenantId/addons", internalAuth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    
    const addons = await db.query.tenantAddons.findMany({
      where: eq(tenantAddons.tenantId, tenantId),
    });
    
    res.json({ addons, availableAddons: Object.values(PAID_ADDONS) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Add or update an add-on for a tenant
internalAdminRouter.post("/tenants/:tenantId/addons", internalAuth, requireRole(["superadmin", "billingops"]), async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    const { addonType, status, monthlyPrice, trialEndsAt } = req.body;
    
    if (!addonType || !Object.values(PAID_ADDONS).includes(addonType)) {
      return res.status(400).json({ error: "Invalid addon type" });
    }
    
    // Check if addon already exists
    const existing = await db.query.tenantAddons.findFirst({
      where: and(
        eq(tenantAddons.tenantId, tenantId),
        eq(tenantAddons.addonType, addonType)
      ),
    });
    
    if (existing) {
      // Update existing
      await db.update(tenantAddons)
        .set({
          status: status || "active",
          monthlyPrice,
          trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null,
          updatedAt: new Date(),
        })
        .where(eq(tenantAddons.id, existing.id));
      
      res.json({ success: true, message: "Add-on updated" });
    } else {
      // Create new
      await db.insert(tenantAddons).values({
        tenantId,
        addonType,
        status: status || "active",
        monthlyPrice,
        trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null,
        billingCycleStart: new Date(),
      });
      
      res.json({ success: true, message: "Add-on activated" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel an add-on
internalAdminRouter.delete("/tenants/:tenantId/addons/:addonType", internalAuth, requireRole(["superadmin", "billingops"]), async (req: Request, res: Response) => {
  try {
    const { tenantId, addonType } = req.params;
    
    const addon = await db.query.tenantAddons.findFirst({
      where: and(
        eq(tenantAddons.tenantId, tenantId),
        eq(tenantAddons.addonType, addonType)
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
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ADD-ON STORE CONFIGURATION
// ==========================================

// Get all addon definitions
internalAdminRouter.get("/addon-store", internalAuth, async (req: Request, res: Response) => {
  try {
    const addons = await db.query.addonDefinitions.findMany({
      orderBy: [desc(addonDefinitions.sortOrder)],
    });
    
    // Get subscription tiers for reference
    const tiers = await db.query.subscriptionPlans.findMany({
      where: eq(subscriptionPlans.isActive, true),
    });
    
    res.json({ 
      addons, 
      tiers: tiers.map(t => ({ id: t.id, name: t.name, tier: t.tier }))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single addon definition
internalAdminRouter.get("/addon-store/:addonKey", internalAuth, async (req: Request, res: Response) => {
  try {
    const { addonKey } = req.params;
    
    const addon = await db.query.addonDefinitions.findFirst({
      where: eq(addonDefinitions.addonKey, addonKey),
    });
    
    if (!addon) {
      return res.status(404).json({ error: "Add-on not found" });
    }
    
    res.json(addon);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create addon definition
internalAdminRouter.post("/addon-store", internalAuth, requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const { 
      addonKey, name, description, icon, logoUrl, category,
      monthlyPrice, yearlyPrice, trialDays,
      includedInTiers, enabledFeatures, isActive, sortOrder
    } = req.body;
    
    if (!addonKey || !name) {
      return res.status(400).json({ error: "Add-on key and name are required" });
    }
    
    // Check if key already exists
    const existing = await db.query.addonDefinitions.findFirst({
      where: eq(addonDefinitions.addonKey, addonKey),
    });
    
    if (existing) {
      return res.status(400).json({ error: "Add-on key already exists" });
    }
    
    const [newAddon] = await db.insert(addonDefinitions).values({
      addonKey,
      name,
      description,
      icon,
      logoUrl,
      category: category || "integration",
      monthlyPrice: monthlyPrice || 0,
      yearlyPrice,
      trialDays: trialDays || 0,
      includedInTiers: includedInTiers || [],
      enabledFeatures: enabledFeatures || [],
      isActive: isActive !== false,
      sortOrder: sortOrder || 0,
    }).returning();
    
    res.json({ success: true, addon: newAddon });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update addon definition
internalAdminRouter.patch("/addon-store/:addonKey", internalAuth, requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const { addonKey } = req.params;
    const updates = req.body;
    
    const existing = await db.query.addonDefinitions.findFirst({
      where: eq(addonDefinitions.addonKey, addonKey),
    });
    
    if (!existing) {
      return res.status(404).json({ error: "Add-on not found" });
    }
    
    await db.update(addonDefinitions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(addonDefinitions.id, existing.id));
    
    res.json({ success: true, message: "Add-on updated" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete addon definition (soft delete - sets isActive to false)
internalAdminRouter.delete("/addon-store/:addonKey", internalAuth, requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const { addonKey } = req.params;
    
    const existing = await db.query.addonDefinitions.findFirst({
      where: eq(addonDefinitions.addonKey, addonKey),
    });
    
    if (!existing) {
      return res.status(404).json({ error: "Add-on not found" });
    }
    
    await db.delete(addonDefinitions)
      .where(eq(addonDefinitions.id, existing.id));
    
    res.json({ success: true, message: "Add-on deleted" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// WhatsApp Package Management (Admin)
// ==========================================

internalAdminRouter.get("/whatsapp/packages", internalAuth, async (req: Request, res: Response) => {
  try {
    const packages = await db.query.whatsappPackages.findMany({
      orderBy: [whatsappPackages.sortOrder],
    });
    res.json(packages);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.post("/whatsapp/packages", internalAuth, requireRole(["superadmin", "billingops"]), async (req: Request, res: Response) => {
  try {
    const { name, messageLimit, price, active, sortOrder } = req.body;
    if (!name || !messageLimit || price === undefined) {
      return res.status(400).json({ error: "name, messageLimit, and price are required" });
    }
    const [pkg] = await db.insert(whatsappPackages).values({
      name,
      messageLimit,
      price,
      active: active !== false,
      sortOrder: sortOrder || 0,
    }).returning();
    res.json(pkg);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.patch("/whatsapp/packages/:id", internalAuth, requireRole(["superadmin", "billingops"]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, messageLimit, price, active, sortOrder } = req.body;
    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (messageLimit !== undefined) updateData.messageLimit = messageLimit;
    if (price !== undefined) updateData.price = price;
    if (active !== undefined) updateData.active = active;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    await db.update(whatsappPackages)
      .set(updateData)
      .where(eq(whatsappPackages.id, id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.delete("/whatsapp/packages/:id", internalAuth, requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.delete(whatsappPackages)
      .where(eq(whatsappPackages.id, id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.get("/whatsapp/usage", internalAuth, async (req: Request, res: Response) => {
  try {
    const subscriptions = await db.select({
      tenantId: tenantWhatsappSubscriptions.tenantId,
      businessName: tenants.businessName,
      messagesUsed: tenantWhatsappSubscriptions.messagesUsed,
      messageLimit: tenantWhatsappSubscriptions.messageLimit,
      status: tenantWhatsappSubscriptions.status,
      packageId: tenantWhatsappSubscriptions.packageId,
    })
    .from(tenantWhatsappSubscriptions)
    .leftJoin(tenants, eq(tenantWhatsappSubscriptions.tenantId, tenants.id))
    .orderBy(desc(tenantWhatsappSubscriptions.createdAt));

    const tenantConfigs = await db.select({
      tenantId: tenantWhatsappIntegrations.tenantId,
      businessName: tenants.businessName,
      enabled: tenantWhatsappIntegrations.enabled,
      senderPhone: tenantWhatsappIntegrations.senderPhone,
      gupshupAppName: tenantWhatsappIntegrations.gupshupAppName,
    }).from(tenantWhatsappIntegrations)
    .leftJoin(tenants, eq(tenantWhatsappIntegrations.tenantId, tenants.id));

    const totalMessages = await db.select({ count: sql<number>`count(*)` })
      .from(whatsappMessageLogs);

    res.json({
      subscriptions,
      tenantConfigs,
      totalMessages: totalMessages[0]?.count || 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.get("/whatsapp/global-config", internalAuth, async (req: Request, res: Response) => {
  try {
    const keys = ["gupshup_api_key", "gupshup_app_name", "gupshup_sender_phone", "whatsapp_global_enabled"];
    const configs = await db.select()
      .from(platformConfig)
      .where(inArray(platformConfig.key, keys));

    const configMap: Record<string, string | null> = {};
    for (const c of configs) {
      if (c.key === "gupshup_api_key") {
        configMap[c.key] = c.encryptedValue ? "configured" : null;
      } else {
        configMap[c.key] = c.value;
      }
    }

    res.json({
      hasApiKey: configMap["gupshup_api_key"] === "configured",
      appName: configMap["gupshup_app_name"] || "",
      senderPhone: configMap["gupshup_sender_phone"] || "",
      enabled: configMap["whatsapp_global_enabled"] === "true",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.post("/whatsapp/global-config", internalAuth, requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const { gupshupApiKey, appName, senderPhone, enabled } = req.body;

    const upsertConfig = async (key: string, value?: string, encryptedValue?: string) => {
      const existing = await db.query.platformConfig.findFirst({
        where: eq(platformConfig.key, key),
      });
      if (existing) {
        const updateData: any = { updatedAt: new Date() };
        if (value !== undefined) updateData.value = value;
        if (encryptedValue !== undefined) updateData.encryptedValue = encryptedValue;
        await db.update(platformConfig).set(updateData).where(eq(platformConfig.key, key));
      } else {
        await db.insert(platformConfig).values({
          key,
          value: value || null,
          encryptedValue: encryptedValue || null,
          description: `Global WhatsApp config: ${key}`,
        });
      }
    };

    if (gupshupApiKey) {
      const trimmedKey = gupshupApiKey.trim();
      await upsertConfig("gupshup_api_key", null, gupshupEncrypt(trimmedKey));
    }
    if (appName !== undefined) {
      await upsertConfig("gupshup_app_name", appName);
    }
    if (senderPhone !== undefined) {
      await upsertConfig("gupshup_sender_phone", senderPhone);
    }
    if (enabled !== undefined) {
      await upsertConfig("whatsapp_global_enabled", String(enabled));
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.post("/whatsapp/test-global-connection", internalAuth, requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const apiKeyConfig = await db.query.platformConfig.findFirst({
      where: eq(platformConfig.key, "gupshup_api_key"),
    });
    if (!apiKeyConfig?.encryptedValue) {
      return res.json({ success: false, error: "No API key configured" });
    }

    const apiKey = gupshupDecrypt(apiKeyConfig.encryptedValue).trim();

    const appNameConfig = await db.query.platformConfig.findFirst({
      where: eq(platformConfig.key, "gupshup_app_name"),
    });
    const appName = (appNameConfig?.value || "").trim();

    const response = await fetch(`https://api.gupshup.io/sm/api/v1/users/${encodeURIComponent(appName)}`, {
      headers: {
        "apikey": apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (response.ok) {
      return res.json({ success: true, appName });
    }

    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      return res.json({ success: false, error: "Invalid API key - authentication failed. Verify your key and app name in the Gupshup dashboard." });
    }
    let errorDetail = text;
    try {
      const parsed = JSON.parse(text);
      errorDetail = parsed.message || parsed.error || text;
    } catch {}
    if (typeof errorDetail === "object") errorDetail = JSON.stringify(errorDetail);
    return res.json({ success: false, error: `HTTP ${response.status}: ${errorDetail}` });
  } catch (error: any) {
    const msg = typeof error === "object" && error !== null
      ? (error.message || (error.error ? (typeof error.error === "string" ? error.error : JSON.stringify(error.error)) : JSON.stringify(error)))
      : String(error);
    res.json({ success: false, error: msg });
  }
});

internalAdminRouter.get("/shopify/global-config", internalAuth, requireRole(["superadmin", "billingops"]), async (req: Request, res: Response) => {
  try {
    const keys = ["shopify_client_id", "shopify_client_secret", "shopify_oauth_enabled"];
    const configs = await db.select()
      .from(platformConfig)
      .where(inArray(platformConfig.key, keys));

    const configMap: Record<string, string | null> = {};
    for (const c of configs) {
      if (c.key === "shopify_client_id" || c.key === "shopify_client_secret") {
        configMap[c.key] = c.encryptedValue ? "configured" : null;
      } else {
        configMap[c.key] = c.value;
      }
    }

    res.json({
      hasClientId: configMap["shopify_client_id"] === "configured",
      hasClientSecret: configMap["shopify_client_secret"] === "configured",
      enabled: configMap["shopify_oauth_enabled"] === "true",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

internalAdminRouter.post("/shopify/global-config", internalAuth, requireRole(["superadmin", "billingops"]), async (req: Request, res: Response) => {
  try {
    const { clientId, clientSecret, enabled } = req.body;

    const upsertConfig = async (key: string, value?: string, encryptedValue?: string) => {
      const existing = await db.query.platformConfig.findFirst({
        where: eq(platformConfig.key, key),
      });
      if (existing) {
        const updateData: any = { updatedAt: new Date() };
        if (value !== undefined) updateData.value = value;
        if (encryptedValue !== undefined) updateData.encryptedValue = encryptedValue;
        await db.update(platformConfig).set(updateData).where(eq(platformConfig.key, key));
      } else {
        await db.insert(platformConfig).values({
          key,
          value: value || null,
          encryptedValue: encryptedValue || null,
          description: `Global Shopify config: ${key}`,
        });
      }
    };

    if (clientId) {
      await upsertConfig("shopify_client_id", null, shopifyEncrypt(clientId));
    }
    if (clientSecret) {
      await upsertConfig("shopify_client_secret", null, shopifyEncrypt(clientSecret));
    }
    if (enabled !== undefined) {
      await upsertConfig("shopify_oauth_enabled", String(enabled));
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
