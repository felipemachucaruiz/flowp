import { Router, Request, Response, NextFunction } from "express";
import { db } from "../../db";
import {
  tenantWhatsappIntegrations,
  whatsappMessageLogs,
  whatsappConversations,
  whatsappChatMessages,
  tenantWhatsappSubscriptions,
  whatsappPackages,
  tenantAddons,
  whatsappTemplates,
  whatsappTemplateTriggers,
  PAID_ADDONS,
} from "@shared/schema";
import { eq, and, desc, asc, sql, ilike, or } from "drizzle-orm";
import {
  encrypt,
  getWhatsappConfig,
  ensureWhatsappConfig,
  testConnection,
  sendTemplateMessage,
  sendSessionMessage,
  requireWhatsappAddon,
  validateQuota,
  deductMessage,
  processDeliveryStatus,
  getActiveSubscription,
  getGlobalGupshupCredentials,
  getEffectiveGupshupCredentials,
  getPartnerToken,
  getProfileApiKey,
  getGupshupAppId,
} from "./service";
import { broadcastToTenant } from "../../routes";

export const whatsappRouter = Router();

async function whatsappAddonGate(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }
  try {
    const check = await requireWhatsappAddon(tenantId);
    if (!check.allowed) {
      return res.status(403).json({ error: check.error, code: check.code });
    }
    next();
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to verify add-on subscription" });
  }
}

whatsappRouter.get("/addon-status", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.json({ hasAddon: false });
  }
  try {
    const check = await requireWhatsappAddon(tenantId);
    if (check.allowed) {
      await ensureWhatsappConfig(tenantId);
    }
    return res.json({ hasAddon: check.allowed });
  } catch {
    return res.json({ hasAddon: false });
  }
});

whatsappRouter.get("/config", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const config = await ensureWhatsappConfig(tenantId);
    if (!config) {
      return res.json({ configured: false });
    }
    return res.json({
      configured: true,
      enabled: config.enabled,
      gupshupAppName: config.gupshupAppName,
      senderPhone: config.senderPhone,
      hasApiKey: !!config.gupshupApiKeyEncrypted,
      approvedTemplates: config.approvedTemplates,
      notifyOnSale: config.notifyOnSale,
      notifyOnLowStock: config.notifyOnLowStock,
      notifyDailySummary: config.notifyDailySummary,
      businessHours: config.businessHours,
      supportInfo: config.supportInfo,
      lastError: config.lastError,
      errorCount: config.errorCount,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.post("/config", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const {
      gupshupApiKey,
      gupshupAppName,
      senderPhone,
      enabled,
      approvedTemplates,
      notifyOnSale,
      notifyOnLowStock,
      notifyDailySummary,
      businessHours,
      supportInfo,
    } = req.body;

    const existing = await getWhatsappConfig(tenantId);

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (gupshupApiKey !== undefined && gupshupApiKey !== "") {
      updateData.gupshupApiKeyEncrypted = encrypt(gupshupApiKey);
    }
    if (gupshupAppName !== undefined) updateData.gupshupAppName = gupshupAppName;
    if (senderPhone !== undefined) updateData.senderPhone = senderPhone;
    if (enabled !== undefined) updateData.enabled = enabled;
    if (approvedTemplates !== undefined) updateData.approvedTemplates = approvedTemplates;
    if (notifyOnSale !== undefined) updateData.notifyOnSale = notifyOnSale;
    if (notifyOnLowStock !== undefined) updateData.notifyOnLowStock = notifyOnLowStock;
    if (notifyDailySummary !== undefined) updateData.notifyDailySummary = notifyDailySummary;
    if (businessHours !== undefined) updateData.businessHours = businessHours;
    if (supportInfo !== undefined) updateData.supportInfo = supportInfo;

    if (existing) {
      await db.update(tenantWhatsappIntegrations)
        .set(updateData)
        .where(eq(tenantWhatsappIntegrations.tenantId, tenantId));
    } else {
      await db.insert(tenantWhatsappIntegrations).values({
        tenantId,
        ...updateData,
      });
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.post("/test-connection", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const result = await testConnection(tenantId);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

whatsappRouter.get("/usage", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const subscription = await getActiveSubscription(tenantId);
    const totalSent = await db.select({ count: sql<number>`count(*)` })
      .from(whatsappMessageLogs)
      .where(and(
        eq(whatsappMessageLogs.tenantId, tenantId),
        eq(whatsappMessageLogs.direction, "outbound")
      ));

    let packageInfo = null;
    if (subscription?.packageId) {
      packageInfo = await db.query.whatsappPackages.findFirst({
        where: eq(whatsappPackages.id, subscription.packageId),
      });
    }

    return res.json({
      subscription: subscription ? {
        id: subscription.id,
        messagesUsed: subscription.messagesUsed,
        messageLimit: subscription.messageLimit,
        remaining: subscription.messageLimit - (subscription.messagesUsed || 0),
        status: subscription.status,
        renewalDate: subscription.renewalDate,
        expiresAt: subscription.expiresAt,
      } : null,
      package: packageInfo ? {
        name: packageInfo.name,
        messageLimit: packageInfo.messageLimit,
        price: packageInfo.price,
      } : null,
      totalMessagesSent: totalSent[0]?.count || 0,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.get("/packages", whatsappAddonGate, async (req: Request, res: Response) => {
  try {
    const packages = await db.query.whatsappPackages.findMany({
      where: eq(whatsappPackages.active, true),
      orderBy: [whatsappPackages.sortOrder],
    });
    return res.json(packages);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.post("/subscribe", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const { packageId } = req.body;
    if (!packageId) {
      return res.status(400).json({ error: "Package ID required" });
    }

    const pkg = await db.query.whatsappPackages.findFirst({
      where: eq(whatsappPackages.id, packageId),
    });
    if (!pkg || !pkg.active) {
      return res.status(404).json({ error: "Package not found or inactive" });
    }

    const existingActive = await getActiveSubscription(tenantId);
    if (existingActive) {
      return res.status(400).json({ error: "You already have an active subscription. Wait for it to be used up or cancel it first." });
    }

    const renewalDate = new Date();
    renewalDate.setMonth(renewalDate.getMonth() + 1);

    const [sub] = await db.insert(tenantWhatsappSubscriptions).values({
      tenantId,
      packageId,
      messagesUsed: 0,
      messageLimit: pkg.messageLimit,
      status: "active",
      renewalDate,
    }).returning();

    return res.json({ success: true, subscription: sub });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.post("/send-receipt", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const { customerPhone, customerName, receiptUrl, totalAmount, currency, templateId } = req.body;
    if (!customerPhone || !templateId) {
      return res.status(400).json({ error: "customerPhone and templateId are required" });
    }

    const params = [
      customerName || "Customer",
      totalAmount?.toString() || "0",
      currency || "COP",
      receiptUrl || "",
    ];

    const result = await sendTemplateMessage(tenantId, customerPhone, templateId, params, "receipt");
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.post("/send-message", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const { phone, message, templateId, templateParams, type } = req.body;
    if (!phone) {
      return res.status(400).json({ error: "Phone number required" });
    }

    let result;
    if (templateId) {
      result = await sendTemplateMessage(tenantId, phone, templateId, templateParams || [], type || "manual");
    } else if (message) {
      result = await sendSessionMessage(tenantId, phone, message, type || "manual");
    } else {
      return res.status(400).json({ error: "Either message or templateId required" });
    }

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.get("/logs", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const logs = await db.select()
      .from(whatsappMessageLogs)
      .where(eq(whatsappMessageLogs.tenantId, tenantId))
      .orderBy(desc(whatsappMessageLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(whatsappMessageLogs)
      .where(eq(whatsappMessageLogs.tenantId, tenantId));

    return res.json({ logs, total: countResult?.count || 0 });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==========================================
// TEMPLATE MANAGEMENT ROUTES
// ==========================================

whatsappRouter.get("/templates", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const templates = await db.select()
      .from(whatsappTemplates)
      .where(eq(whatsappTemplates.tenantId, tenantId))
      .orderBy(desc(whatsappTemplates.createdAt));
    return res.json(templates);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.post("/templates", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const { name, category, language, headerText, bodyText, footerText, buttons, variablesSample } = req.body;
    if (!name || !bodyText) {
      return res.status(400).json({ error: "Name and body text are required" });
    }

    const [template] = await db.insert(whatsappTemplates).values({
      tenantId,
      name: name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
      category: category || "utility",
      language: language || "es",
      headerText: headerText || null,
      bodyText,
      footerText: footerText || null,
      buttons: buttons || [],
      variablesSample: variablesSample || {},
      status: "draft",
    }).returning();

    return res.json(template);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.put("/templates/:id", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  const templateId = req.params.id;
  try {
    const existing = await db.query.whatsappTemplates.findFirst({
      where: and(eq(whatsappTemplates.id, templateId), eq(whatsappTemplates.tenantId, tenantId)),
    });
    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }
    if (existing.status === "pending") {
      return res.status(400).json({ error: "Cannot edit a template that is pending approval" });
    }

    const { name, category, language, headerText, bodyText, footerText, buttons, variablesSample } = req.body;
    const updateData: any = { updatedAt: new Date() };

    if (name !== undefined) updateData.name = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (category !== undefined) updateData.category = category;
    if (language !== undefined) updateData.language = language;
    if (headerText !== undefined) updateData.headerText = headerText;
    if (bodyText !== undefined) updateData.bodyText = bodyText;
    if (footerText !== undefined) updateData.footerText = footerText;
    if (buttons !== undefined) updateData.buttons = buttons;
    if (variablesSample !== undefined) updateData.variablesSample = variablesSample;

    if (existing.status === "approved" || existing.status === "rejected") {
      updateData.status = "draft";
      updateData.gupshupTemplateId = null;
      updateData.rejectionReason = null;
    }

    const [updated] = await db.update(whatsappTemplates)
      .set(updateData)
      .where(and(eq(whatsappTemplates.id, templateId), eq(whatsappTemplates.tenantId, tenantId)))
      .returning();

    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.delete("/templates/:id", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  const templateId = req.params.id;
  try {
    const existing = await db.query.whatsappTemplates.findFirst({
      where: and(eq(whatsappTemplates.id, templateId), eq(whatsappTemplates.tenantId, tenantId)),
    });
    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }

    await db.delete(whatsappTemplates)
      .where(and(eq(whatsappTemplates.id, templateId), eq(whatsappTemplates.tenantId, tenantId)));

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.post("/templates/:id/submit", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  const templateId = req.params.id;
  try {
    const template = await db.query.whatsappTemplates.findFirst({
      where: and(eq(whatsappTemplates.id, templateId), eq(whatsappTemplates.tenantId, tenantId)),
    });
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    if (template.status === "pending") {
      return res.status(400).json({ error: "Template is already pending approval" });
    }

    const tokenResult = await getPartnerToken();
    const appId = await getGupshupAppId();
    if (tokenResult.status === "not_configured" || !appId) {
      return res.status(400).json({ error: "Partner API credentials not configured. Please configure Partner Email, Client Secret, and App ID in the admin panel." });
    }
    if (tokenResult.status === "auth_failed") {
      return res.status(400).json({ error: `Partner API authentication failed: ${tokenResult.error}` });
    }
    const partnerToken = tokenResult.token;

    const templatePayload: any = {
      elementName: template.name,
      languageCode: template.language,
      category: template.category.toUpperCase(),
      templateType: "TEXT",
      content: template.bodyText,
      vertical: template.category === "utility" ? "account update" : "marketing",
      appId,
      allowTemplateCategoryChange: "false",
      enableSample: "true",
    };

    if (template.headerText) {
      templatePayload.header = template.headerText;
    }
    if (template.footerText) {
      templatePayload.footer = template.footerText;
    }
    if (template.buttons && (template.buttons as any[]).length > 0) {
      templatePayload.buttons = JSON.stringify(template.buttons);
    }

    if (template.variablesSample && Object.keys(template.variablesSample as Record<string, string>).length > 0) {
      const sampleValues = Object.values(template.variablesSample as Record<string, string>);
      templatePayload.example = sampleValues.join(",");
    }

    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(templatePayload)) {
      body.append(key, String(value));
    }

    const response = await fetch(
      `https://partner.gupshup.io/partner/app/${encodeURIComponent(appId)}/templates`,
      {
        method: "POST",
        headers: {
          "Authorization": partnerToken,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }
    );

    const data = await response.json();

    if (response.ok && (data.status === "success" || data.template)) {
      const gupshupId = data.template?.id || data.id || template.name;
      await db.update(whatsappTemplates)
        .set({
          status: "pending",
          gupshupTemplateId: String(gupshupId),
          rejectionReason: null,
          updatedAt: new Date(),
        })
        .where(eq(whatsappTemplates.id, templateId));

      return res.json({ success: true, gupshupTemplateId: gupshupId });
    } else {
      const errorMsg = typeof data === "string" ? data : (data.message || JSON.stringify(data));
      return res.status(400).json({ error: `Gupshup rejected: ${errorMsg}` });
    }
  } catch (error: any) {
    const msg = error?.message || (typeof error === "object" ? JSON.stringify(error) : String(error));
    return res.status(500).json({ error: msg });
  }
});

whatsappRouter.post("/templates/sync-from-gupshup", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const appId = await getGupshupAppId();
    if (!appId) {
      return res.status(400).json({ error: "Gupshup App ID not configured. Configure it in admin settings." });
    }

    const profileKey = await getProfileApiKey();
    if (!profileKey) {
      return res.status(400).json({ error: "Gupshup Profile API Key not configured. Add it in admin WhatsApp settings." });
    }

    const response = await fetch(
      `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/template`,
      {
        headers: { "apikey": profileKey },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(400).json({ error: `Failed to fetch templates from Gupshup: ${text.substring(0, 200)}` });
    }

    const data = await response.json();
    const gupshupTemplates: Array<{
      elementName: string; id: string; status: string; category?: string;
      languageCode?: string; meta?: string; data?: string; templateType?: string;
    }> = data.templates || data || [];

    const approvedRemote = gupshupTemplates.filter(
      (g) => g.status?.toLowerCase() === "approved" || g.status?.toUpperCase() === "APPROVED"
    );

    const existingTemplates = await db.select()
      .from(whatsappTemplates)
      .where(eq(whatsappTemplates.tenantId, tenantId));

    let imported = 0;
    let updated = 0;

    for (const remote of approvedRemote) {
      if (!remote.elementName || !remote.id) continue;

      const existing = existingTemplates.find(
        (e) => e.gupshupTemplateId === remote.id || e.name === remote.elementName
      );

      let bodyText = remote.elementName;
      try {
        if (remote.data && typeof remote.data === "string") {
          bodyText = remote.data;
        } else if (remote.meta) {
          const metaObj = typeof remote.meta === "string" ? JSON.parse(remote.meta) : remote.meta;
          if (metaObj.example) bodyText = metaObj.example;
        }
      } catch {}

      if (existing) {
        await db.update(whatsappTemplates)
          .set({
            status: "approved",
            gupshupTemplateId: remote.id,
            category: (remote.category?.toLowerCase() as any) || existing.category,
            language: remote.languageCode || existing.language,
            bodyText,
            updatedAt: new Date(),
          })
          .where(eq(whatsappTemplates.id, existing.id));
        updated++;
      } else {
        await db.insert(whatsappTemplates).values({
          tenantId,
          name: remote.elementName,
          category: (remote.category?.toLowerCase() as any) || "utility",
          language: remote.languageCode || "es",
          headerText: null,
          bodyText,
          footerText: null,
          buttons: [],
          variablesSample: {},
          gupshupTemplateId: remote.id,
          status: "approved",
        });
        imported++;
      }
    }

    return res.json({ success: true, imported, updated, total: approvedRemote.length });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==========================================
// TRIGGER MAPPING ROUTES
// ==========================================

whatsappRouter.get("/triggers", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const triggers = await db.select()
      .from(whatsappTemplateTriggers)
      .where(eq(whatsappTemplateTriggers.tenantId, tenantId))
      .orderBy(whatsappTemplateTriggers.event);
    return res.json(triggers);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.post("/triggers", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const { templateId, event, variableMapping } = req.body;
    if (!templateId || !event) {
      return res.status(400).json({ error: "templateId and event are required" });
    }

    const template = await db.query.whatsappTemplates.findFirst({
      where: and(eq(whatsappTemplates.id, templateId), eq(whatsappTemplates.tenantId, tenantId)),
    });
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    if (template.status !== "approved") {
      return res.status(400).json({ error: "Only approved templates can be assigned to triggers" });
    }

    const existing = await db.query.whatsappTemplateTriggers.findFirst({
      where: and(
        eq(whatsappTemplateTriggers.tenantId, tenantId),
        eq(whatsappTemplateTriggers.event, event)
      ),
    });

    if (existing) {
      const [updated] = await db.update(whatsappTemplateTriggers)
        .set({ templateId, variableMapping: variableMapping || {}, updatedAt: new Date() })
        .where(eq(whatsappTemplateTriggers.id, existing.id))
        .returning();
      return res.json(updated);
    }

    const [trigger] = await db.insert(whatsappTemplateTriggers).values({
      tenantId,
      templateId,
      event,
      variableMapping: variableMapping || {},
    }).returning();

    return res.json(trigger);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.put("/triggers/:id", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  const triggerId = req.params.id;
  try {
    const existing = await db.query.whatsappTemplateTriggers.findFirst({
      where: and(eq(whatsappTemplateTriggers.id, triggerId), eq(whatsappTemplateTriggers.tenantId, tenantId)),
    });
    if (!existing) {
      return res.status(404).json({ error: "Trigger not found" });
    }

    const { templateId, enabled, variableMapping } = req.body;
    const updateData: any = { updatedAt: new Date() };

    if (templateId !== undefined) {
      const template = await db.query.whatsappTemplates.findFirst({
        where: and(eq(whatsappTemplates.id, templateId), eq(whatsappTemplates.tenantId, tenantId)),
      });
      if (!template || template.status !== "approved") {
        return res.status(400).json({ error: "Only approved templates can be assigned to triggers" });
      }
      updateData.templateId = templateId;
    }
    if (enabled !== undefined) updateData.enabled = enabled;
    if (variableMapping !== undefined) updateData.variableMapping = variableMapping;

    const [updated] = await db.update(whatsappTemplateTriggers)
      .set(updateData)
      .where(and(eq(whatsappTemplateTriggers.id, triggerId), eq(whatsappTemplateTriggers.tenantId, tenantId)))
      .returning();

    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.delete("/triggers/:id", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  const triggerId = req.params.id;
  try {
    const existing = await db.query.whatsappTemplateTriggers.findFirst({
      where: and(eq(whatsappTemplateTriggers.id, triggerId), eq(whatsappTemplateTriggers.tenantId, tenantId)),
    });
    if (!existing) {
      return res.status(404).json({ error: "Trigger not found" });
    }

    await db.delete(whatsappTemplateTriggers)
      .where(and(eq(whatsappTemplateTriggers.id, triggerId), eq(whatsappTemplateTriggers.tenantId, tenantId)));

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==========================================
// HELPER: Get or create conversation for a phone
// ==========================================
async function getOrCreateConversation(tenantId: string, phone: string, customerName?: string) {
  let conversation = await db.query.whatsappConversations.findFirst({
    where: and(
      eq(whatsappConversations.tenantId, tenantId),
      eq(whatsappConversations.customerPhone, phone)
    ),
  });

  if (!conversation) {
    const [created] = await db.insert(whatsappConversations).values({
      tenantId,
      customerPhone: phone,
      customerName: customerName || null,
      unreadCount: 0,
      isActive: true,
    }).returning();
    conversation = created;
  } else if (customerName && !conversation.customerName) {
    await db.update(whatsappConversations)
      .set({ customerName, updatedAt: new Date() })
      .where(eq(whatsappConversations.id, conversation.id));
    conversation.customerName = customerName;
  }
  return conversation;
}

function detectContentType(payload: any): { contentType: string; body?: string; mediaUrl?: string; mediaMimeType?: string; mediaFilename?: string; caption?: string } {
  const msgPayload = payload.payload || payload;
  const type = (msgPayload.type || "text").toLowerCase();

  if (type === "image" || type === "file" || type === "document" || type === "video" || type === "audio" || type === "sticker") {
    const contentType = type === "file" ? "document" : type;
    return {
      contentType,
      mediaUrl: msgPayload.url || msgPayload.mediaUrl || "",
      mediaMimeType: msgPayload.contentType || msgPayload.mimeType || "",
      mediaFilename: msgPayload.filename || msgPayload.name || "",
      caption: msgPayload.caption || msgPayload.text || "",
      body: msgPayload.caption || msgPayload.text || `[${contentType}]`,
    };
  }

  if (type === "location") {
    return {
      contentType: "location",
      body: `📍 ${msgPayload.latitude || ""},${msgPayload.longitude || ""}`,
    };
  }

  if (type === "contact") {
    const name = msgPayload.name || (msgPayload.contacts?.[0]?.name?.formatted_name) || "Contact";
    return { contentType: "contact", body: `👤 ${name}` };
  }

  return { contentType: "text", body: msgPayload.text || payload.text || "" };
}

// ==========================================
// WEBHOOK (updated for two-way chat)
// ==========================================
whatsappRouter.post("/webhook", async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    console.log("[WhatsApp Webhook] Received event:", JSON.stringify(payload).substring(0, 500));

    if (payload.type === "message-event") {
      const eventPayload = payload.payload || payload;
      const innerPayload = eventPayload.payload || {};
      console.log("[WhatsApp Webhook] Delivery event:", eventPayload.type, "| gsId:", eventPayload.gsId, "| id:", eventPayload.id);
      await processDeliveryStatus({ ...eventPayload, errorCode: innerPayload.code, reason: innerPayload.reason });

      const msgId = eventPayload.gsId || eventPayload.id || eventPayload.messageId;
      if (msgId) {
        const evtType = (eventPayload.type || "").toLowerCase();
        let chatStatus: "sent" | "delivered" | "read" | "failed" = "sent";
        if (evtType === "delivered") chatStatus = "delivered";
        else if (evtType === "read") chatStatus = "read";
        else if (evtType === "failed") chatStatus = "failed";

        await db.update(whatsappChatMessages)
          .set({ status: chatStatus })
          .where(eq(whatsappChatMessages.providerMessageId, msgId));
      }
      return res.status(200).json({ status: "ok" });
    }

    if (payload.type === "message") {
      const inbound = payload.payload || payload;
      const senderPhone = inbound.source || inbound.sender?.phone;
      const senderName = inbound.sender?.name || inbound.senderName || null;

      if (!senderPhone) {
        return res.status(200).json({ status: "ok" });
      }

      const destinationPhone = payload.destination || inbound.destination || "";
      const appName = payload.app || "";

      console.log(`[WhatsApp Webhook] Inbound from ${senderPhone}, destination: "${destinationPhone}", app: "${appName}"`);

      let config = null;

      if (destinationPhone) {
        config = await db.query.tenantWhatsappIntegrations.findFirst({
          where: eq(tenantWhatsappIntegrations.senderPhone, destinationPhone),
        });
        if (!config) {
          const cleanedDest = destinationPhone.replace(/^\+/, "");
          config = await db.query.tenantWhatsappIntegrations.findFirst({
            where: eq(tenantWhatsappIntegrations.senderPhone, cleanedDest),
          });
        }
      }

      if (!config && appName) {
        config = await db.query.tenantWhatsappIntegrations.findFirst({
          where: eq(tenantWhatsappIntegrations.gupshupAppName, appName),
        });
      }

      if (!config) {
        const allConfigs = await db.select().from(tenantWhatsappIntegrations).where(eq(tenantWhatsappIntegrations.enabled, true));
        if (allConfigs.length === 1) {
          config = allConfigs[0];
          console.log(`[WhatsApp Webhook] Fallback: single active tenant config found for tenant ${config.tenantId}`);
        }
      }

      if (!config) {
        console.warn(`[WhatsApp Webhook] No tenant found for destination="${destinationPhone}" app="${appName}"`);
        return res.status(200).json({ status: "ok" });
      }

      const detected = detectContentType(inbound);
      const messageText = detected.body || "";

      await db.insert(whatsappMessageLogs).values({
        tenantId: config.tenantId,
        direction: "inbound",
        phone: senderPhone,
        messageType: "command",
        messageBody: messageText,
        status: "delivered",
      });

      const conversation = await getOrCreateConversation(config.tenantId, senderPhone, senderName || undefined);

      const [chatMsg] = await db.insert(whatsappChatMessages).values({
        conversationId: conversation.id,
        tenantId: config.tenantId,
        direction: "inbound",
        contentType: detected.contentType as any,
        body: detected.body || null,
        mediaUrl: detected.mediaUrl || null,
        mediaMimeType: detected.mediaMimeType || null,
        mediaFilename: detected.mediaFilename || null,
        caption: detected.caption || null,
        senderPhone,
        senderName,
        providerMessageId: inbound.id || inbound.messageId || null,
        status: "delivered",
      }).returning();

      const previewText = detected.contentType === "text"
        ? (messageText.substring(0, 100))
        : `[${detected.contentType}] ${(detected.caption || "").substring(0, 80)}`;

      await db.update(whatsappConversations)
        .set({
          lastMessageAt: new Date(),
          lastMessagePreview: previewText,
          unreadCount: sql`${whatsappConversations.unreadCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(whatsappConversations.id, conversation.id));

      broadcastToTenant(config.tenantId, {
        type: "whatsapp_message",
        conversationId: conversation.id,
        message: chatMsg,
      });

      const command = messageText.trim().toUpperCase();
      let replyText = "";

      if (command === "RECIBO") {
        replyText = "Por favor envía el número de tu factura para consultar el recibo.";
      } else if (command === "HORARIO") {
        replyText = config.businessHours || "Nuestro horario de atención: Lun-Vie 8:00-18:00, Sáb 9:00-13:00";
      } else if (command === "AYUDA") {
        replyText = config.supportInfo || "Para soporte contacta a nuestro equipo. Escribe RECIBO para consultar facturas o HORARIO para ver nuestro horario.";
      }

      if (replyText) {
        await sendSessionMessage(config.tenantId, senderPhone, replyText, "auto_reply");

        const [autoMsg] = await db.insert(whatsappChatMessages).values({
          conversationId: conversation.id,
          tenantId: config.tenantId,
          direction: "outbound",
          contentType: "text",
          body: replyText,
          senderName: "Bot",
          status: "sent",
        }).returning();

        await db.update(whatsappConversations)
          .set({
            lastMessageAt: new Date(),
            lastMessagePreview: replyText.substring(0, 100),
            updatedAt: new Date(),
          })
          .where(eq(whatsappConversations.id, conversation.id));

        broadcastToTenant(config.tenantId, {
          type: "whatsapp_message",
          conversationId: conversation.id,
          message: autoMsg,
        });
      }

      return res.status(200).json({ status: "ok" });
    }

    return res.status(200).json({ status: "ok" });
  } catch (error: any) {
    console.error("[WhatsApp Webhook] Error:", error);
    return res.status(200).json({ status: "ok" });
  }
});

// ==========================================
// BUSINESS PROFILE ROUTES
// ==========================================

whatsappRouter.get("/profile", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const creds = await getEffectiveGupshupCredentials(tenantId);
    if (!creds) {
      return res.status(400).json({ error: "WhatsApp service not configured" });
    }

    if (!creds.appId) {
      return res.status(400).json({ error: "Gupshup App ID not configured" });
    }

    const response = await fetch(`https://api.gupshup.io/wa/app/${creds.appId}/settings`, {
      method: "GET",
      headers: {
        "apikey": creds.apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[whatsapp] Profile fetch failed: ${response.status} ${text}`);
      return res.status(response.status).json({ error: "Failed to fetch profile" });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    console.error(`[whatsapp] Profile error:`, error.message);
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.put("/profile", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const creds = await getEffectiveGupshupCredentials(tenantId);
    if (!creds) {
      return res.status(400).json({ error: "WhatsApp service not configured" });
    }

    if (!creds.appId) {
      return res.status(400).json({ error: "Gupshup App ID not configured" });
    }

    const apiKey = creds.apiKey;
    const { about, description, address, email, vertical, websites } = req.body;

    const profileData: Record<string, any> = {};
    if (about !== undefined) profileData.about = about;
    if (description !== undefined) profileData.description = description;
    if (address !== undefined) profileData.address = address;
    if (email !== undefined) profileData.email = email;
    if (vertical !== undefined) profileData.vertical = vertical;
    if (websites !== undefined) profileData.websites = websites;

    const response = await fetch(`https://api.gupshup.io/wa/app/${creds.appId}/settings`, {
      method: "PUT",
      headers: {
        "apikey": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(profileData),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[whatsapp] Profile update failed: ${response.status} ${text}`);
      return res.status(response.status).json({ error: "Failed to update profile" });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    console.error(`[whatsapp] Profile update error:`, error.message);
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.get("/profile/photo", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const creds = await getEffectiveGupshupCredentials(tenantId);
    if (!creds) {
      return res.status(400).json({ error: "WhatsApp service not configured" });
    }
    if (!creds.appId) {
      return res.status(400).json({ error: "Gupshup App ID not configured" });
    }

    const response = await fetch(`https://api.gupshup.io/wa/app/${creds.appId}/business/profile/photo`, {
      method: "GET",
      headers: { "apikey": creds.apiKey },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[whatsapp] Profile photo fetch failed: ${response.status} ${text}`);
      return res.status(response.status).json({ error: "Failed to fetch profile photo" });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    console.error(`[whatsapp] Profile photo error:`, error.message);
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.put("/profile/photo", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const creds = await getEffectiveGupshupCredentials(tenantId);
    if (!creds) {
      return res.status(400).json({ error: "WhatsApp service not configured" });
    }
    if (!creds.appId) {
      return res.status(400).json({ error: "Gupshup App ID not configured" });
    }

    const multer = (await import("multer")).default;
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

    await new Promise<void>((resolve, reject) => {
      upload.single("image")(req, res, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    const FormData = (await import("form-data")).default;
    const formData = new FormData();
    formData.append("image", file.buffer, {
      filename: file.originalname || "profile.jpg",
      contentType: file.mimetype || "image/jpeg",
    });

    const response = await fetch(`https://api.gupshup.io/wa/app/${creds.appId}/business/profile/photo`, {
      method: "PUT",
      headers: {
        "apikey": creds.apiKey,
        ...formData.getHeaders(),
      },
      body: formData as any,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[whatsapp] Profile photo upload failed: ${response.status} ${text}`);
      return res.status(response.status).json({ error: "Failed to upload profile photo" });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    console.error(`[whatsapp] Profile photo upload error:`, error.message);
    return res.status(500).json({ error: error.message });
  }
});

// ==========================================
// CHAT ROUTES
// ==========================================

whatsappRouter.get("/chat/conversations", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const search = req.query.search as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    let whereClause = eq(whatsappConversations.tenantId, tenantId);

    if (search) {
      whereClause = and(
        whereClause,
        or(
          ilike(whatsappConversations.customerPhone, `%${search}%`),
          ilike(whatsappConversations.customerName, `%${search}%`)
        )
      ) as any;
    }

    const conversations = await db.select()
      .from(whatsappConversations)
      .where(whereClause)
      .orderBy(desc(whatsappConversations.lastMessageAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(whatsappConversations)
      .where(eq(whatsappConversations.tenantId, tenantId));

    return res.json({ conversations, total: countResult?.count || 0 });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.get("/chat/conversations/:id/messages", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  const conversationId = req.params.id;
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const before = req.query.before as string;

    let whereClause = and(
      eq(whatsappChatMessages.conversationId, conversationId),
      eq(whatsappChatMessages.tenantId, tenantId)
    );

    const messages = await db.select()
      .from(whatsappChatMessages)
      .where(whereClause as any)
      .orderBy(desc(whatsappChatMessages.createdAt))
      .limit(limit);

    return res.json(messages.reverse());
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.post("/chat/conversations/:id/read", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  const conversationId = req.params.id;
  try {
    await db.update(whatsappConversations)
      .set({ unreadCount: 0, updatedAt: new Date() })
      .where(and(
        eq(whatsappConversations.id, conversationId),
        eq(whatsappConversations.tenantId, tenantId)
      ));
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.post("/chat/send", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const { conversationId, contentType, body, mediaUrl, mediaMimeType, mediaFilename, caption, senderName } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: "conversationId required" });
    }

    const conversation = await db.query.whatsappConversations.findFirst({
      where: and(
        eq(whatsappConversations.id, conversationId),
        eq(whatsappConversations.tenantId, tenantId)
      ),
    });
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const creds = await getEffectiveGupshupCredentials(tenantId);
    if (!creds) {
      return res.status(400).json({ error: "WhatsApp service not configured" });
    }

    const config = await getWhatsappConfig(tenantId);
    if (!config?.enabled) {
      return res.status(400).json({ error: "WhatsApp not enabled for this tenant" });
    }

    const quota = await validateQuota(tenantId);
    if (!quota.allowed) {
      return res.status(403).json({ error: quota.error });
    }

    const msgType = contentType || "text";
    let gupshupMessage: any;
    let previewText = "";

    if (msgType === "text") {
      gupshupMessage = { isHSM: "false", type: "text", text: body };
      previewText = (body || "").substring(0, 100);
    } else if (msgType === "image") {
      gupshupMessage = { type: "image", originalUrl: mediaUrl, caption: caption || "" };
      previewText = `[image] ${(caption || "").substring(0, 80)}`;
    } else if (msgType === "video") {
      gupshupMessage = { type: "video", url: mediaUrl, caption: caption || "" };
      previewText = `[video] ${(caption || "").substring(0, 80)}`;
    } else if (msgType === "audio") {
      gupshupMessage = { type: "audio", url: mediaUrl };
      previewText = "[audio]";
    } else if (msgType === "document") {
      gupshupMessage = { type: "file", url: mediaUrl, filename: mediaFilename || "document", caption: caption || "" };
      previewText = `[document] ${mediaFilename || ""}`;
    } else if (msgType === "sticker") {
      gupshupMessage = { type: "sticker", url: mediaUrl };
      previewText = "[sticker]";
    } else {
      return res.status(400).json({ error: `Unsupported content type: ${msgType}` });
    }

    const response = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
      method: "POST",
      headers: {
        "apikey": creds.apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        channel: "whatsapp",
        source: creds.senderPhone,
        destination: conversation.customerPhone,
        "src.name": creds.appName,
        message: JSON.stringify(gupshupMessage),
      }).toString(),
    });

    const data = await response.json();

    if (data && (data.status === "submitted" || data.messageId)) {
      await deductMessage(tenantId);

      const [chatMsg] = await db.insert(whatsappChatMessages).values({
        conversationId,
        tenantId,
        direction: "outbound",
        contentType: msgType as any,
        body: body || caption || null,
        mediaUrl: mediaUrl || null,
        mediaMimeType: mediaMimeType || null,
        mediaFilename: mediaFilename || null,
        caption: caption || null,
        senderName: senderName || null,
        providerMessageId: data.messageId || null,
        status: "sent",
      }).returning();

      await db.update(whatsappConversations)
        .set({
          lastMessageAt: new Date(),
          lastMessagePreview: previewText,
          updatedAt: new Date(),
        })
        .where(eq(whatsappConversations.id, conversationId));

      await db.insert(whatsappMessageLogs).values({
        tenantId,
        direction: "outbound",
        phone: conversation.customerPhone,
        messageType: "manual",
        messageBody: previewText,
        providerMessageId: data.messageId || null,
        status: "sent",
      });

      broadcastToTenant(tenantId, {
        type: "whatsapp_message",
        conversationId,
        message: chatMsg,
      });

      return res.json({ success: true, message: chatMsg });
    } else {
      const errorMsg = data?.message || JSON.stringify(data);
      return res.status(400).json({ error: errorMsg });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.post("/chat/new-conversation", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const { customerPhone, customerName } = req.body;
    if (!customerPhone) {
      return res.status(400).json({ error: "customerPhone required" });
    }

    const conversation = await getOrCreateConversation(tenantId, customerPhone, customerName);
    return res.json(conversation);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==========================================
// WHATSAPP BUSINESS PROFILE MANAGEMENT
// ==========================================

whatsappRouter.get("/profile", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const profileKey = await getProfileApiKey();
    const appId = await getGupshupAppId();
    if (!profileKey || !appId) {
      return res.status(400).json({ error: "Profile API not configured" });
    }

    const config = await getWhatsappConfig(tenantId);
    if (!config?.senderPhone) {
      return res.status(400).json({ error: "WhatsApp phone number not configured for this tenant" });
    }

    const response = await fetch(
      `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/phone/${encodeURIComponent(config.senderPhone)}/profile`,
      { headers: { "apikey": profileKey } }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(400).json({ error: `Failed to fetch profile: ${text.substring(0, 200)}` });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.put("/profile", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const profileKey = await getProfileApiKey();
    const appId = await getGupshupAppId();
    if (!profileKey || !appId) {
      return res.status(400).json({ error: "Profile API not configured" });
    }

    const config = await getWhatsappConfig(tenantId);
    if (!config?.senderPhone) {
      return res.status(400).json({ error: "WhatsApp phone number not configured for this tenant" });
    }

    const { about, address, description, email, vertical, websites, profilePicUrl } = req.body;

    const profileData: any = {};
    if (about !== undefined) profileData.about = about;
    if (address !== undefined) profileData.address = address;
    if (description !== undefined) profileData.description = description;
    if (email !== undefined) profileData.email = email;
    if (vertical !== undefined) profileData.vertical = vertical;
    if (websites !== undefined) profileData.websites = websites;

    if (Object.keys(profileData).length > 0) {
      const response = await fetch(
        `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/phone/${encodeURIComponent(config.senderPhone)}/profile`,
        {
          method: "POST",
          headers: {
            "apikey": profileKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(profileData),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        return res.status(400).json({ error: `Failed to update profile: ${text.substring(0, 200)}` });
      }
    }

    if (profilePicUrl) {
      const picResponse = await fetch(
        `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/phone/${encodeURIComponent(config.senderPhone)}/profile/photo`,
        {
          method: "POST",
          headers: {
            "apikey": profileKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: profilePicUrl }),
        }
      );

      if (!picResponse.ok) {
        const text = await picResponse.text();
        return res.json({ success: true, warning: `Profile updated but photo failed: ${text.substring(0, 200)}` });
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
