import { Router, Request, Response, NextFunction } from "express";
import { db } from "../../db";
import {
  tenantWhatsappIntegrations,
  whatsappMessageLogs,
  tenantWhatsappSubscriptions,
  whatsappPackages,
  tenantAddons,
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
