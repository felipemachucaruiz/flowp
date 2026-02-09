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
  PAID_ADDONS,
} from "@shared/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";

const GUPSHUP_TEMPLATE_URL = "https://api.gupshup.io/sm/api/v1/template/msg";
const GUPSHUP_SESSION_URL = "https://api.gupshup.io/sm/api/v1/msg";

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
  return db.query.tenantWhatsappIntegrations.findFirst({
    where: eq(tenantWhatsappIntegrations.tenantId, tenantId),
  });
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
      .where(sql`${platformConfig.key} = ANY(${keys})`);

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
    const body = new URLSearchParams({
      source: globalCreds.senderPhone,
      destination: destinationPhone,
      template: JSON.stringify({ id: templateId, params: templateParams }),
    });

    const response = await fetch(GUPSHUP_TEMPLATE_URL, {
      method: "POST",
      headers: {
        "apikey": globalCreds.apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = await response.json();

    if (response.ok && data.status === "submitted") {
      await deductMessage(tenantId);
      await db.update(whatsappMessageLogs)
        .set({ status: "sent", providerMessageId: data.messageId, updatedAt: new Date() })
        .where(eq(whatsappMessageLogs.id, logEntry.id));
      await db.update(tenantWhatsappIntegrations)
        .set({ errorCount: 0, lastError: null, updatedAt: new Date() })
        .where(eq(tenantWhatsappIntegrations.tenantId, tenantId));
      return { success: true, messageId: data.messageId };
    } else {
      const errorMsg = data.message || JSON.stringify(data);
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
    await db.update(whatsappMessageLogs)
      .set({ status: "failed", errorMessage: error.message, updatedAt: new Date() })
      .where(eq(whatsappMessageLogs.id, logEntry.id));
    return { success: false, error: error.message };
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
    const body = new URLSearchParams({
      channel: "whatsapp",
      source: globalCreds.senderPhone,
      destination: destinationPhone,
      "src.name": globalCreds.appName,
      message: JSON.stringify({ type: "text", text: messageText }),
    });

    const response = await fetch(GUPSHUP_SESSION_URL, {
      method: "POST",
      headers: {
        "apikey": globalCreds.apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = await response.json();

    if (response.ok && data.status === "submitted") {
      await deductMessage(tenantId);
      await db.update(whatsappMessageLogs)
        .set({ status: "sent", providerMessageId: data.messageId, updatedAt: new Date() })
        .where(eq(whatsappMessageLogs.id, logEntry.id));
      return { success: true, messageId: data.messageId };
    } else {
      const errorMsg = data.message || JSON.stringify(data);
      await db.update(whatsappMessageLogs)
        .set({ status: "failed", errorMessage: errorMsg, updatedAt: new Date() })
        .where(eq(whatsappMessageLogs.id, logEntry.id));
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    await db.update(whatsappMessageLogs)
      .set({ status: "failed", errorMessage: error.message, updatedAt: new Date() })
      .where(eq(whatsappMessageLogs.id, logEntry.id));
    return { success: false, error: error.message };
  }
}

export async function testConnection(tenantId: string): Promise<{ success: boolean; error?: string }> {
  const globalCreds = await getGlobalGupshupCredentials();
  if (!globalCreds) {
    return { success: false, error: "Global WhatsApp service not configured or disabled" };
  }

  try {
    const response = await fetch("https://api.gupshup.io/sm/api/v1/wallet/balance", {
      headers: { "apikey": globalCreds.apiKey },
    });
    const data = await response.json();
    if (response.ok) {
      return { success: true };
    }
    return { success: false, error: data.message || "Connection test failed" };
  } catch (error: any) {
    return { success: false, error: error.message };
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

export async function sendReceiptNotification(
  tenantId: string,
  customerPhone: string,
  orderNumber: string,
  total: string,
  companyName: string,
  currency: string = "COP"
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

    const message = `${companyName} - Recibo de compra\n\nOrden: #${orderNumber}\nTotal: ${formattedTotal}\n\nGracias por su compra.`;
    await sendSessionMessage(tenantId, customerPhone, message, "receipt");
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
