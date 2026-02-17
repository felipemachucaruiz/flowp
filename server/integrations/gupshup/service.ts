import crypto from "crypto";
import { db } from "../../db";
import {
  tenantWhatsappIntegrations,
  whatsappMessageLogs,
  tenantWhatsappSubscriptions,
  whatsappPackages,
  tenantAddons,
  addonDefinitions,
  tenants,
  platformConfig,
  whatsappTemplateTriggers,
  whatsappTemplates,
  PAID_ADDONS,
} from "@shared/schema";
import { eq, and, or, desc, sql, inArray } from "drizzle-orm";

function getEncryptionKey(): string {
  const key = process.env.WHATSAPP_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!key) {
    throw new Error("WHATSAPP_ENCRYPTION_KEY or SESSION_SECRET required for secure credential storage");
  }
  return key;
}

export function encrypt(text: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(getEncryptionKey(), salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${salt.toString("hex")}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");
  if (parts.length === 2) {
    const [ivHex, encrypted] = parts;
    const legacyKey = crypto.scryptSync(getEncryptionKey(), "salt", 32);
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", legacyKey, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }
  const [saltHex, ivHex, authTagHex, encrypted] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const key = crypto.scryptSync(getEncryptionKey(), salt, 32);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function getWhatsappConfig(tenantId: string) {
  const config = await db.query.tenantWhatsappIntegrations.findFirst({
    where: eq(tenantWhatsappIntegrations.tenantId, tenantId),
  });
  return config;
}

export async function ensureWhatsappConfig(tenantId: string) {
  let config = await db.query.tenantWhatsappIntegrations.findFirst({
    where: eq(tenantWhatsappIntegrations.tenantId, tenantId),
  });
  if (!config) {
    const [created] = await db.insert(tenantWhatsappIntegrations).values({
      tenantId,
      enabled: true,
    }).returning();
    config = created;
  }
  return config;
}

export async function getDecryptedApiKey(tenantId: string): Promise<string | null> {
  const config = await getWhatsappConfig(tenantId);
  if (!config?.gupshupApiKeyEncrypted) return null;
  try {
    return decrypt(config.gupshupApiKeyEncrypted);
  } catch {
    return null;
  }
}

export async function getGlobalGupshupCredentials(): Promise<{
  apiKey: string;
  appName: string;
  senderPhone: string;
  enabled: boolean;
} | null> {
  try {
    const keys = ["gupshup_api_key", "gupshup_app_name", "gupshup_sender_phone", "whatsapp_global_enabled"];
    const configs = await db.select()
      .from(platformConfig)
      .where(inArray(platformConfig.key, keys));

    const configMap: Record<string, any> = {};
    for (const c of configs) {
      configMap[c.key] = c;
    }

    const apiKeyRow = configMap["gupshup_api_key"];
    if (!apiKeyRow?.encryptedValue) return null;

    const enabled = configMap["whatsapp_global_enabled"]?.value === "true";
    if (!enabled) return null;

    const apiKey = decrypt(apiKeyRow.encryptedValue);
    return {
      apiKey,
      appName: configMap["gupshup_app_name"]?.value || "",
      senderPhone: configMap["gupshup_sender_phone"]?.value || "",
      enabled,
    };
  } catch {
    return null;
  }
}

async function gupshupSendMessage(apiKey: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams(params);
  const response = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
    method: "POST",
    headers: {
      "apikey": apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  return response.json();
}

let cachedPartnerToken: { token: string; expiresAt: number } | null = null;

export type PartnerTokenResult =
  | { status: "ok"; token: string }
  | { status: "not_configured" }
  | { status: "auth_failed"; error: string };

export async function getPartnerToken(): Promise<PartnerTokenResult> {
  if (cachedPartnerToken && Date.now() < cachedPartnerToken.expiresAt) {
    return { status: "ok", token: cachedPartnerToken.token };
  }

  try {
    const keys = ["gupshup_partner_email", "gupshup_partner_secret"];
    const configs = await db.select()
      .from(platformConfig)
      .where(inArray(platformConfig.key, keys));

    const configMap: Record<string, any> = {};
    for (const c of configs) {
      configMap[c.key] = c;
    }

    const emailRow = configMap["gupshup_partner_email"];
    const secretRow = configMap["gupshup_partner_secret"];
    if (!emailRow?.value || !secretRow?.encryptedValue) {
      return { status: "not_configured" };
    }

    const email = emailRow.value;
    const secret = decrypt(secretRow.encryptedValue);

    const body = new URLSearchParams({ email, password: secret });
    const response = await fetch("https://partner.gupshup.io/partner/account/login", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      return { status: "auth_failed", error: `Partner login failed (HTTP ${response.status}): ${text.substring(0, 200)}` };
    }

    const data = await response.json();
    if (!data.token) {
      return { status: "auth_failed", error: "Partner login returned no token" };
    }

    cachedPartnerToken = {
      token: data.token,
      expiresAt: Date.now() + 23 * 60 * 60 * 1000,
    };
    return { status: "ok", token: data.token };
  } catch (error: any) {
    return { status: "auth_failed", error: `Partner login error: ${error.message}` };
  }
}

export async function getGupshupAppId(): Promise<string | null> {
  const config = await db.query.platformConfig.findFirst({
    where: eq(platformConfig.key, "gupshup_app_id"),
  });
  return config?.value || null;
}

export function clearPartnerTokenCache() {
  cachedPartnerToken = null;
}

function extractErrorMessage(error: any): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error.message && typeof error.message === "string") return error.message;
  if (error.statusCode && error.error) {
    const innerError = error.error;
    if (typeof innerError === "string") return `HTTP ${error.statusCode}: ${innerError}`;
    if (innerError.message) return `HTTP ${error.statusCode}: ${innerError.message}`;
    return `HTTP ${error.statusCode}: ${JSON.stringify(innerError)}`;
  }
  return JSON.stringify(error);
}

export async function getActiveSubscription(tenantId: string) {
  return db.query.tenantWhatsappSubscriptions.findFirst({
    where: and(
      eq(tenantWhatsappSubscriptions.tenantId, tenantId),
      eq(tenantWhatsappSubscriptions.status, "active")
    ),
  });
}

export async function validateQuota(tenantId: string): Promise<{ allowed: boolean; remaining: number; error?: string }> {
  const sub = await getActiveSubscription(tenantId);
  if (!sub) {
    return { allowed: false, remaining: 0, error: "No active WhatsApp package subscription" };
  }
  if (sub.expiresAt && new Date(sub.expiresAt) < new Date()) {
    await db.update(tenantWhatsappSubscriptions)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(tenantWhatsappSubscriptions.id, sub.id));
    return { allowed: false, remaining: 0, error: "WhatsApp package has expired" };
  }
  const remaining = sub.messageLimit - (sub.messagesUsed || 0);
  if (remaining <= 0) {
    await db.update(tenantWhatsappSubscriptions)
      .set({ status: "exhausted", updatedAt: new Date() })
      .where(eq(tenantWhatsappSubscriptions.id, sub.id));
    return { allowed: false, remaining: 0, error: "Message quota exhausted. Please upgrade your package." };
  }
  return { allowed: true, remaining };
}

export async function deductMessage(tenantId: string): Promise<boolean> {
  const sub = await getActiveSubscription(tenantId);
  if (!sub) return false;
  await db.update(tenantWhatsappSubscriptions)
    .set({
      messagesUsed: sql`${tenantWhatsappSubscriptions.messagesUsed} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(tenantWhatsappSubscriptions.id, sub.id));
  return true;
}

export async function sendTemplateMessage(
  tenantId: string,
  destinationPhone: string,
  templateId: string,
  templateParams: string[],
  messageType: "receipt" | "alert" | "manual" | "command" | "auto_reply" = "manual"
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const globalCreds = await getGlobalGupshupCredentials();
  if (!globalCreds) {
    return { success: false, error: "Global WhatsApp service not configured or disabled" };
  }

  const tenantConfig = await getWhatsappConfig(tenantId);
  if (!tenantConfig?.enabled) {
    return { success: false, error: "WhatsApp not enabled for this tenant" };
  }

  const quota = await validateQuota(tenantId);
  if (!quota.allowed) {
    return { success: false, error: quota.error };
  }

  const [logEntry] = await db.insert(whatsappMessageLogs).values({
    tenantId,
    direction: "outbound",
    phone: destinationPhone,
    messageType,
    templateId,
    status: "queued",
  }).returning();

  try {
    console.log(`[whatsapp] Sending template "${templateId}" to ${destinationPhone} with params:`, templateParams);
    const body = new URLSearchParams();
    body.append("channel", "whatsapp");
    body.append("source", globalCreds.senderPhone);
    body.append("destination", destinationPhone);
    body.append("src.name", globalCreds.appName);
    body.append("template", JSON.stringify({ id: templateId, params: templateParams }));

    const response = await fetch("https://api.gupshup.io/wa/api/v1/template/msg", {
      method: "POST",
      headers: {
        "apikey": globalCreds.apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = await response.json();
    console.log(`[whatsapp] Template send response:`, JSON.stringify(data));

    if (data && (data.status === "submitted" || data.messageId)) {
      await deductMessage(tenantId);
      await db.update(whatsappMessageLogs)
        .set({ status: "sent", providerMessageId: data.messageId, updatedAt: new Date() })
        .where(eq(whatsappMessageLogs.id, logEntry.id));
      await db.update(tenantWhatsappIntegrations)
        .set({ errorCount: 0, lastError: null, updatedAt: new Date() })
        .where(eq(tenantWhatsappIntegrations.tenantId, tenantId));
      return { success: true, messageId: data.messageId };
    } else {
      const errorMsg = data?.message || JSON.stringify(data);
      await db.update(whatsappMessageLogs)
        .set({ status: "failed", errorMessage: errorMsg, updatedAt: new Date() })
        .where(eq(whatsappMessageLogs.id, logEntry.id));
      await db.update(tenantWhatsappIntegrations)
        .set({
          errorCount: sql`${tenantWhatsappIntegrations.errorCount} + 1`,
          lastError: errorMsg,
          updatedAt: new Date(),
        })
        .where(eq(tenantWhatsappIntegrations.tenantId, tenantId));
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    const errMsg = extractErrorMessage(error);
    await db.update(whatsappMessageLogs)
      .set({ status: "failed", errorMessage: errMsg, updatedAt: new Date() })
      .where(eq(whatsappMessageLogs.id, logEntry.id));
    return { success: false, error: errMsg };
  }
}

export async function sendSessionMessage(
  tenantId: string,
  destinationPhone: string,
  messageText: string,
  messageType: "receipt" | "alert" | "manual" | "command" | "auto_reply" = "auto_reply"
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const globalCreds = await getGlobalGupshupCredentials();
  if (!globalCreds) {
    return { success: false, error: "Global WhatsApp service not configured or disabled" };
  }

  const tenantConfig = await getWhatsappConfig(tenantId);
  if (!tenantConfig?.enabled) {
    return { success: false, error: "WhatsApp not enabled for this tenant" };
  }

  const quota = await validateQuota(tenantId);
  if (!quota.allowed) {
    return { success: false, error: quota.error };
  }

  const [logEntry] = await db.insert(whatsappMessageLogs).values({
    tenantId,
    direction: "outbound",
    phone: destinationPhone,
    messageType,
    messageBody: messageText,
    status: "queued",
  }).returning();

  try {
    console.log(`[whatsapp] Sending text to ${destinationPhone} from ${globalCreds.senderPhone} (app: ${globalCreds.appName})`);
    const data = await gupshupSendMessage(globalCreds.apiKey, {
      channel: "whatsapp",
      source: globalCreds.senderPhone,
      destination: destinationPhone,
      "src.name": globalCreds.appName,
      message: JSON.stringify({ isHSM: "false", type: "text", text: messageText }),
    });

    console.log(`[whatsapp] Gupshup response:`, JSON.stringify(data));

    if (data && (data.status === "submitted" || data.messageId)) {
      await deductMessage(tenantId);
      await db.update(whatsappMessageLogs)
        .set({ status: "sent", providerMessageId: data.messageId, updatedAt: new Date() })
        .where(eq(whatsappMessageLogs.id, logEntry.id));
      return { success: true, messageId: data.messageId };
    } else {
      const errorMsg = data?.message || JSON.stringify(data);
      console.error(`[whatsapp] Send failed:`, errorMsg);
      await db.update(whatsappMessageLogs)
        .set({ status: "failed", errorMessage: errorMsg, updatedAt: new Date() })
        .where(eq(whatsappMessageLogs.id, logEntry.id));
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    const errMsg = extractErrorMessage(error);
    console.error(`[whatsapp] Send exception:`, errMsg);
    await db.update(whatsappMessageLogs)
      .set({ status: "failed", errorMessage: errMsg, updatedAt: new Date() })
      .where(eq(whatsappMessageLogs.id, logEntry.id));
    return { success: false, error: errMsg };
  }
}

export async function testConnection(tenantId: string): Promise<{ success: boolean; error?: string }> {
  const globalCreds = await getGlobalGupshupCredentials();
  if (!globalCreds) {
    return { success: false, error: "Global WhatsApp service not configured or disabled" };
  }

  try {
    const data = await gupshupSendMessage(globalCreds.apiKey, {
      channel: "whatsapp",
      source: globalCreds.senderPhone,
      destination: globalCreds.senderPhone,
      "src.name": globalCreds.appName,
      message: JSON.stringify({ isHSM: "false", type: "text", text: "Flowp connection test" }),
    });
    if (data && (data.status === "submitted" || data.messageId)) {
      return { success: true };
    }
    return { success: false, error: data?.message || "Connection test failed" };
  } catch (error: any) {
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function requireWhatsappAddon(tenantId: string): Promise<{ allowed: boolean; error?: string; code?: string }> {
  const addon = await db.query.tenantAddons.findFirst({
    where: and(
      eq(tenantAddons.tenantId, tenantId),
      eq(tenantAddons.addonType, PAID_ADDONS.WHATSAPP_NOTIFICATIONS),
      or(
        eq(tenantAddons.status, "active"),
        eq(tenantAddons.status, "trial")
      )
    ),
  });

  if (addon) {
    if (addon.status === "trial" && addon.trialEndsAt && new Date(addon.trialEndsAt) < new Date()) {
      return { allowed: false, error: "Your WhatsApp integration trial has expired. Please upgrade to continue.", code: "TRIAL_EXPIRED" };
    }
    return { allowed: true };
  }

  const [tenant, addonDef] = await Promise.all([
    db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { subscriptionTier: true },
    }),
    db.query.addonDefinitions.findFirst({
      where: eq(addonDefinitions.addonKey, PAID_ADDONS.WHATSAPP_NOTIFICATIONS),
      columns: { includedInTiers: true },
    }),
  ]);

  if (tenant && addonDef?.includedInTiers?.includes(tenant.subscriptionTier || "basic")) {
    return { allowed: true };
  }

  return { allowed: false, error: "WhatsApp notifications requires a paid add-on subscription", code: "ADDON_REQUIRED" };
}

export async function sendDocumentMessage(
  tenantId: string,
  destinationPhone: string,
  documentUrl: string,
  filename: string,
  caption: string,
  messageType: "receipt" | "alert" | "manual" = "receipt"
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const globalCreds = await getGlobalGupshupCredentials();
  if (!globalCreds) {
    return { success: false, error: "Global WhatsApp service not configured or disabled" };
  }

  const tenantConfig = await getWhatsappConfig(tenantId);
  if (!tenantConfig?.enabled) {
    return { success: false, error: "WhatsApp not enabled for this tenant" };
  }

  const quota = await validateQuota(tenantId);
  if (!quota.allowed) {
    return { success: false, error: quota.error };
  }

  const [logEntry] = await db.insert(whatsappMessageLogs).values({
    tenantId,
    direction: "outbound",
    phone: destinationPhone,
    messageType,
    messageBody: `[PDF: ${filename}] ${caption}`,
    status: "queued",
  }).returning();

  try {
    console.log(`[whatsapp] Sending document to ${destinationPhone}: ${documentUrl}`);
    const data = await gupshupSendMessage(globalCreds.apiKey, {
      channel: "whatsapp",
      source: globalCreds.senderPhone,
      destination: destinationPhone,
      "src.name": globalCreds.appName,
      message: JSON.stringify({ type: "file", url: documentUrl, filename, caption }),
    });

    console.log(`[whatsapp] Gupshup doc response:`, JSON.stringify(data));

    if (data && (data.status === "submitted" || data.messageId)) {
      await deductMessage(tenantId);
      await db.update(whatsappMessageLogs)
        .set({ status: "sent", providerMessageId: data.messageId, updatedAt: new Date() })
        .where(eq(whatsappMessageLogs.id, logEntry.id));
      return { success: true, messageId: data.messageId };
    } else {
      const errorMsg = data?.message || JSON.stringify(data);
      console.error(`[whatsapp] Doc send failed:`, errorMsg);
      await db.update(whatsappMessageLogs)
        .set({ status: "failed", errorMessage: errorMsg, updatedAt: new Date() })
        .where(eq(whatsappMessageLogs.id, logEntry.id));
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    const errMsg = extractErrorMessage(error);
    console.error(`[whatsapp] Doc send exception:`, errMsg);
    await db.update(whatsappMessageLogs)
      .set({ status: "failed", errorMessage: errMsg, updatedAt: new Date() })
      .where(eq(whatsappMessageLogs.id, logEntry.id));
    return { success: false, error: errMsg };
  }
}

async function getTriggeredTemplate(tenantId: string, event: string): Promise<{ templateName: string; gupshupTemplateId: string; bodyText: string } | null> {
  try {
    const [trigger] = await db.select()
      .from(whatsappTemplateTriggers)
      .where(and(
        eq(whatsappTemplateTriggers.tenantId, tenantId),
        eq(whatsappTemplateTriggers.event, event as any),
        eq(whatsappTemplateTriggers.enabled, true),
      ))
      .limit(1);
    if (!trigger) return null;

    const [template] = await db.select()
      .from(whatsappTemplates)
      .where(and(
        eq(whatsappTemplates.id, trigger.templateId),
        eq(whatsappTemplates.status, "approved"),
      ))
      .limit(1);
    if (!template || !template.gupshupTemplateId) return null;

    return {
      templateName: template.name,
      gupshupTemplateId: template.gupshupTemplateId,
      bodyText: template.bodyText,
    };
  } catch {
    return null;
  }
}

export async function sendReceiptNotification(
  tenantId: string,
  customerPhone: string,
  orderNumber: string,
  total: string,
  companyName: string,
  currency: string = "COP",
  pointsEarned: number = 0,
  receiptPdfUrl?: string,
  customerName?: string
): Promise<void> {
  try {
    const addonCheck = await requireWhatsappAddon(tenantId);
    if (!addonCheck.allowed) return;

    const config = await getWhatsappConfig(tenantId);
    if (!config?.enabled) return;

    const notifyPrefs = config.notifyOnSale;
    if (notifyPrefs === false) return;

    const formattedTotal = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(parseFloat(total));

    const triggeredTemplate = await getTriggeredTemplate(tenantId, "sale_completed");
    if (triggeredTemplate) {
      console.log(`[whatsapp] Using approved template "${triggeredTemplate.templateName}" (ID: ${triggeredTemplate.gupshupTemplateId}) for sale_completed`);
      const templateParams = [
        customerName || "Cliente",
        orderNumber,
        formattedTotal,
        companyName,
        pointsEarned > 0 ? `+${pointsEarned.toLocaleString()}` : "0",
      ];
      const result = await sendTemplateMessage(
        tenantId,
        customerPhone,
        triggeredTemplate.gupshupTemplateId,
        templateParams,
        "receipt"
      );
      if (!result.success) {
        console.error(`[whatsapp] Template message failed for tenant ${tenantId}: ${result.error}`);
      }

      if (receiptPdfUrl) {
        const docResult = await sendDocumentMessage(
          tenantId,
          customerPhone,
          receiptPdfUrl,
          `Recibo_${orderNumber}.pdf`,
          `Recibo #${orderNumber}`,
          "receipt"
        );
        if (!docResult.success) {
          console.warn(`[whatsapp] PDF attachment after template failed for tenant ${tenantId}: ${docResult.error}`);
        }
      }
      return;
    }

    console.warn(`[whatsapp] No approved template trigger for sale_completed, falling back to session message`);
    let message = `*${companyName}* - Recibo de compra\n\nOrden: #${orderNumber}\nTotal: ${formattedTotal}`;
    if (pointsEarned > 0) {
      message += `\n\nPuntos ganados: +${pointsEarned.toLocaleString()}`;
    }
    message += `\n\nGracias por su compra.`;

    if (receiptPdfUrl) {
      const docResult = await sendDocumentMessage(
        tenantId,
        customerPhone,
        receiptPdfUrl,
        `Recibo_${orderNumber}.pdf`,
        message,
        "receipt"
      );
      if (!docResult.success) {
        console.warn(`[whatsapp] Document send failed for tenant ${tenantId}, falling back to text: ${docResult.error}`);
        const textResult = await sendSessionMessage(tenantId, customerPhone, message, "receipt");
        if (!textResult.success) {
          console.error(`[whatsapp] Text fallback also failed for tenant ${tenantId}: ${textResult.error}`);
        }
      }
    } else {
      const result = await sendSessionMessage(tenantId, customerPhone, message, "receipt");
      if (!result.success) {
        console.error(`[whatsapp] Session message failed for tenant ${tenantId}: ${result.error}`);
      }
    }
  } catch (err) {
    console.error(`[whatsapp] Failed to send receipt notification for tenant ${tenantId}:`, err);
  }
}

export async function sendLowStockNotification(
  tenantId: string,
  ownerPhone: string,
  productName: string,
  currentStock: number,
  threshold: number,
  sku?: string
): Promise<void> {
  try {
    const addonCheck = await requireWhatsappAddon(tenantId);
    if (!addonCheck.allowed) return;

    const config = await getWhatsappConfig(tenantId);
    if (!config?.enabled) return;

    const notifyPrefs = config.notifyOnLowStock;
    if (notifyPrefs === false) return;

    let message = `ALERTA: Stock bajo\n\nProducto: ${productName}`;
    if (sku) message += `\nSKU: ${sku}`;
    message += `\nStock actual: ${currentStock}\nMinimo: ${threshold}`;
    message += `\n\nPor favor reponga inventario.`;

    await sendSessionMessage(tenantId, ownerPhone, message, "alert");
  } catch (err) {
    console.error(`[whatsapp] Failed to send low stock notification for tenant ${tenantId}:`, err);
  }
}

export async function processDeliveryStatus(payload: any): Promise<void> {
  const { messageId, eventType } = payload;
  if (!messageId) return;

  let status: "sent" | "delivered" | "read" | "failed" = "sent";
  if (eventType === "DELIVERED" || eventType === "delivered") status = "delivered";
  else if (eventType === "READ" || eventType === "read") status = "read";
  else if (eventType === "FAILED" || eventType === "failed") status = "failed";
  else if (eventType === "SENT" || eventType === "sent") status = "sent";

  await db.update(whatsappMessageLogs)
    .set({ status, updatedAt: new Date() })
    .where(eq(whatsappMessageLogs.providerMessageId, messageId));
}
