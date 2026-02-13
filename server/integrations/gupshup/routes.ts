import { Router, Request, Response, NextFunction } from "express";
import { db } from "../../db";
import {
  tenantWhatsappIntegrations,
  whatsappMessageLogs,
  tenantWhatsappSubscriptions,
  whatsappPackages,
  tenantAddons,
  whatsappTemplates,
  whatsappTemplateTriggers,
  PAID_ADDONS,
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  encrypt,
  getWhatsappConfig,
  testConnection,
  sendTemplateMessage,
  sendSessionMessage,
  requireWhatsappAddon,
  validateQuota,
  processDeliveryStatus,
  getActiveSubscription,
  getGlobalGupshupCredentials,
} from "./service";

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
    return res.json({ hasAddon: check.allowed });
  } catch {
    return res.json({ hasAddon: false });
  }
});

whatsappRouter.get("/config", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const config = await getWhatsappConfig(tenantId);
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

    const globalCreds = await getGlobalGupshupCredentials();
    if (!globalCreds) {
      return res.status(400).json({ error: "Global WhatsApp service not configured" });
    }

    const templatePayload: any = {
      elementName: template.name,
      languageCode: template.language,
      category: template.category.toUpperCase(),
      templateType: "TEXT",
      body: template.bodyText,
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
      `https://api.gupshup.io/wa/app/${globalCreds.appName}/template`,
      {
        method: "POST",
        headers: {
          "apikey": globalCreds.apiKey,
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
      const errorMsg = data.message || JSON.stringify(data);
      return res.status(400).json({ error: `Gupshup rejected: ${errorMsg}` });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

whatsappRouter.post("/templates/sync-status", whatsappAddonGate, async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  try {
    const globalCreds = await getGlobalGupshupCredentials();
    if (!globalCreds) {
      return res.status(400).json({ error: "Global WhatsApp service not configured" });
    }

    const response = await fetch(
      `https://api.gupshup.io/wa/app/${globalCreds.appName}/template`,
      {
        headers: { "apikey": globalCreds.apiKey },
      }
    );

    if (!response.ok) {
      return res.status(400).json({ error: "Failed to fetch templates from Gupshup" });
    }

    const data = await response.json();
    const gupshupTemplates: Array<{ elementName: string; id: string; status: string; reason?: string }> =
      data.templates || data || [];

    const pendingTemplates = await db.select()
      .from(whatsappTemplates)
      .where(and(
        eq(whatsappTemplates.tenantId, tenantId),
        eq(whatsappTemplates.status, "pending")
      ));

    let updated = 0;
    for (const local of pendingTemplates) {
      const match = gupshupTemplates.find(
        (g) => g.elementName === local.name || g.id === local.gupshupTemplateId
      );
      if (!match) continue;

      const gStatus = match.status?.toLowerCase();
      if (gStatus === "approved") {
        await db.update(whatsappTemplates)
          .set({ status: "approved", gupshupTemplateId: match.id, updatedAt: new Date() })
          .where(eq(whatsappTemplates.id, local.id));
        updated++;
      } else if (gStatus === "rejected" || gStatus === "disabled") {
        await db.update(whatsappTemplates)
          .set({ status: "rejected", rejectionReason: match.reason || "Rejected by WhatsApp", updatedAt: new Date() })
          .where(eq(whatsappTemplates.id, local.id));
        updated++;
      }
    }

    return res.json({ success: true, updatedCount: updated });
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

whatsappRouter.post("/webhook", async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    if (payload.type === "message-event") {
      await processDeliveryStatus(payload.payload || payload);
      return res.status(200).json({ status: "ok" });
    }

    if (payload.type === "message") {
      const inbound = payload.payload || payload;
      const senderPhone = inbound.source || inbound.sender?.phone;
      const messageText = inbound.payload?.text || inbound.text || "";

      if (!senderPhone) {
        return res.status(200).json({ status: "ok" });
      }

      const config = await db.query.tenantWhatsappIntegrations.findFirst({
        where: eq(tenantWhatsappIntegrations.senderPhone, inbound.destination || ""),
      });

      if (!config) {
        return res.status(200).json({ status: "ok" });
      }

      await db.insert(whatsappMessageLogs).values({
        tenantId: config.tenantId,
        direction: "inbound",
        phone: senderPhone,
        messageType: "command",
        messageBody: messageText,
        status: "delivered",
      });

      const command = messageText.trim().toUpperCase();
      let replyText = "";

      if (command === "RECIBO") {
        replyText = "Por favor envía el número de tu factura para consultar el recibo.";
      } else if (command === "HORARIO") {
        replyText = config.businessHours || "Nuestro horario de atención: Lun-Vie 8:00-18:00, Sáb 9:00-13:00";
      } else if (command === "AYUDA") {
        replyText = config.supportInfo || "Para soporte contacta a nuestro equipo. Escribe RECIBO para consultar facturas o HORARIO para ver nuestro horario.";
      } else {
        replyText = "No entendí tu mensaje. Escribe:\n- RECIBO para consultar facturas\n- HORARIO para ver nuestro horario\n- AYUDA para información de soporte";
      }

      if (replyText) {
        await sendSessionMessage(config.tenantId, senderPhone, replyText, "auto_reply");
      }

      return res.status(200).json({ status: "ok" });
    }

    return res.status(200).json({ status: "ok" });
  } catch (error: any) {
    console.error("[WhatsApp Webhook] Error:", error);
    return res.status(200).json({ status: "ok" });
  }
});
