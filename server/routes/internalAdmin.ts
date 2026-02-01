import { Router, Request, Response } from "express";
import { internalAuth, requireRole, verifyInternalUser, createInternalUser } from "../middleware/internalAuth";
import * as ebillingService from "../services/internal-admin/ebillingService";
import * as documentOpsService from "../services/internal-admin/documentOpsService";
import * as integrationService from "../services/internal-admin/integrationService";
import { db } from "../db";
import { tenants, tenantEbillingSubscriptions, tenantIntegrationsMatias, internalUsers, internalAuditLogs, platformConfig } from "@shared/schema";
import { eq, like, or, desc, and } from "drizzle-orm";
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
    const { email, name, password, role, adminSecret } = req.body;
    
    if (adminSecret !== process.env.INTERNAL_ADMIN_SECRET) {
      return res.status(403).json({ error: "Invalid admin secret" });
    }

    const user = await createInternalUser({ email, name, password, role });
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
    const result = await integrationService.testConnection(tenantId, req.internalUser!.id);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

internalAdminRouter.post("/tenants/:tenantId/ebilling/integration/update", requireRole(["superadmin"]), async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;
    const result = await integrationService.updateIntegrationConfig(tenantId, req.body, req.internalUser!.id);
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
        eq(platformConfig.key, "matias_client_id"),
        eq(platformConfig.key, "matias_client_secret"),
        eq(platformConfig.key, "matias_enabled"),
        eq(platformConfig.key, "matias_skip_ssl")
      )
    );

    const configMap: Record<string, string> = {};
    for (const c of configs) {
      if (c.key === "matias_client_secret" && c.encryptedValue) {
        configMap[c.key] = c.encryptedValue;
      } else {
        configMap[c.key] = c.value || "";
      }
    }

    const config = {
      baseUrl: configMap.matias_base_url || "https://api.matias.com",
      clientId: configMap.matias_client_id || "",
      hasClientSecret: !!configMap.matias_client_secret,
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
    const { baseUrl, clientId, clientSecret, isEnabled, skipSSL } = req.body;
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

    await upsertConfig("matias_base_url", baseUrl || "https://api.matias.com");
    await upsertConfig("matias_client_id", clientId || "");
    if (clientSecret) {
      await upsertConfig("matias_client_secret", clientSecret, true);
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
        eq(platformConfig.key, "matias_client_id"),
        eq(platformConfig.key, "matias_client_secret"),
        eq(platformConfig.key, "matias_skip_ssl")
      )
    );

    const configMap: Record<string, string> = {};
    for (const c of configs) {
      if (c.key === "matias_client_secret" && c.encryptedValue) {
        try {
          configMap[c.key] = decrypt(c.encryptedValue);
        } catch {
          configMap[c.key] = "";
        }
      } else {
        configMap[c.key] = c.value || "";
      }
    }

    const baseUrl = configMap.matias_base_url || "https://api.matias.com";
    const clientId = configMap.matias_client_id;
    const clientSecret = configMap.matias_client_secret;
    const skipSSL = configMap.matias_skip_ssl === "true";

    if (!clientId || !clientSecret) {
      return res.json({ 
        success: false, 
        message: "Client ID and Client Secret are required to test connection."
      });
    }

    try {
      const tokenUrl = `${baseUrl}/oauth/token`;
      console.log(`[MATIAS] Testing connection to: ${tokenUrl} (skipSSL: ${skipSSL})`);
      
      const postData = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }).toString();

      const makeRequest = (): Promise<{ ok: boolean; status: number; data: string }> => {
        return new Promise((resolve, reject) => {
          const url = new URL(tokenUrl);
          const options: https.RequestOptions = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
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
        console.log(`[MATIAS] Connection successful`);
        res.json({ 
          success: true, 
          message: `Connection successful! Token obtained.`
        });
      } else {
        console.log(`[MATIAS] Connection failed: ${response.status} - ${response.data}`);
        res.json({ 
          success: false, 
          message: `API returned ${response.status}: ${response.data.substring(0, 200)}`
        });
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
