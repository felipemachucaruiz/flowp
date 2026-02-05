import { db } from "../../db";
import { tenantShopifyIntegrations, shopifyProductMap, shopifySyncLogs, products } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import type {
  ShopifyProduct,
  ShopifyProductsResponse,
  ShopifyLocationsResponse,
  ShopifyLocation,
  ShopifyVariant,
  ShopifyWebhooksResponse,
  ShopifyWebhook,
  ShopifyInventoryLevel,
} from "./types";

const SHOPIFY_API_VERSION = "2024-01";

function getEncryptionKey(): string {
  const key = process.env.SHOPIFY_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!key) {
    throw new Error("SHOPIFY_ENCRYPTION_KEY or SESSION_SECRET required for secure credential storage");
  }
  return key;
}

export function encrypt(text: string): string {
  // Use AES-256-GCM for authenticated encryption (AEAD)
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(getEncryptionKey(), salt, 32);
  const iv = crypto.randomBytes(12); // GCM uses 12 byte IV
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  // Format: salt:iv:authTag:encrypted
  return `${salt.toString("hex")}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");
  
  // Handle legacy CBC format (2 parts: iv:encrypted)
  if (parts.length === 2) {
    const [ivHex, encrypted] = parts;
    const legacyKey = crypto.scryptSync(getEncryptionKey(), "salt", 32);
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", legacyKey, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }
  
  // New GCM format (4 parts: salt:iv:authTag:encrypted)
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

export class ShopifyClient {
  private tenantId: string;
  private shopDomain: string = "";
  private accessToken: string = "";
  private apiVersion: string = SHOPIFY_API_VERSION;
  private locationId: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private clientId: string = "";
  private clientSecret: string = "";

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async initialize(): Promise<boolean> {
    const config = await db.query.tenantShopifyIntegrations.findFirst({
      where: eq(tenantShopifyIntegrations.tenantId, this.tenantId),
    });

    if (!config || !config.isActive) {
      console.log(`[Shopify] Tenant ${this.tenantId} Shopify integration not active`);
      return false;
    }

    if (!config.accessTokenEncrypted) {
      console.log(`[Shopify] Tenant ${this.tenantId} Shopify credentials not configured`);
      return false;
    }

    this.shopDomain = config.shopDomain;
    this.locationId = config.shopifyLocationId || null;
    this.tokenExpiresAt = config.tokenExpiresAt || null;

    try {
      this.accessToken = decrypt(config.accessTokenEncrypted);
      
      // Load OAuth credentials if available (for token refresh)
      if (config.clientIdEncrypted) {
        this.clientId = decrypt(config.clientIdEncrypted);
      }
      if (config.clientSecretEncrypted) {
        this.clientSecret = decrypt(config.clientSecretEncrypted);
      }
    } catch (error) {
      console.error(`[Shopify] Failed to decrypt credentials for tenant ${this.tenantId}:`, error);
      return false;
    }

    // Check if token needs refresh
    if (this.tokenExpiresAt && this.isTokenExpiringSoon()) {
      console.log(`[Shopify] Token expiring soon for tenant ${this.tenantId}, attempting refresh`);
      const refreshed = await this.refreshToken();
      if (!refreshed) {
        console.warn(`[Shopify] Token refresh failed, continuing with current token`);
      }
    }

    return true;
  }

  private isTokenExpiringSoon(): boolean {
    if (!this.tokenExpiresAt) return false;
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    return this.tokenExpiresAt < fiveMinutesFromNow;
  }

  private async refreshToken(): Promise<boolean> {
    if (!this.clientId || !this.clientSecret) {
      console.log(`[Shopify] No OAuth credentials available for token refresh`);
      return false;
    }

    try {
      const { refreshAccessToken } = await import("./oauth");
      const newToken = await refreshAccessToken(this.tenantId);
      if (newToken) {
        this.accessToken = newToken;
        return true;
      }
    } catch (error) {
      console.error(`[Shopify] Token refresh error:`, error);
    }
    return false;
  }

  private getBaseUrl(): string {
    return `https://${this.shopDomain}/admin/api/${this.apiVersion}`;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": this.accessToken,
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      options.body = JSON.stringify(body);
    }

    console.log(`[Shopify] ${method} ${endpoint}`);

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Shopify] API error ${response.status}: ${errorText}`);
      throw new Error(`Shopify API error ${response.status}: ${errorText}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // ==========================================
  // Products & Variants
  // ==========================================

  async getProducts(limit: number = 250, sinceId?: number): Promise<ShopifyProduct[]> {
    let endpoint = `/products.json?limit=${limit}`;
    if (sinceId) {
      endpoint += `&since_id=${sinceId}`;
    }
    const response = await this.request<ShopifyProductsResponse>("GET", endpoint);
    return response.products;
  }

  async getProduct(productId: number): Promise<ShopifyProduct> {
    const response = await this.request<{ product: ShopifyProduct }>(
      "GET",
      `/products/${productId}.json`
    );
    return response.product;
  }

  async updateVariant(variantId: number, data: Partial<ShopifyVariant>): Promise<ShopifyVariant> {
    const response = await this.request<{ variant: ShopifyVariant }>(
      "PUT",
      `/variants/${variantId}.json`,
      { variant: data }
    );
    return response.variant;
  }

  async updateVariantPrice(variantId: number, price: string): Promise<ShopifyVariant> {
    return this.updateVariant(variantId, { price });
  }

  // ==========================================
  // Locations
  // ==========================================

  async getLocations(): Promise<ShopifyLocation[]> {
    const response = await this.request<ShopifyLocationsResponse>("GET", "/locations.json");
    return response.locations;
  }

  async getPrimaryLocation(): Promise<ShopifyLocation | null> {
    const locations = await this.getLocations();
    return locations.find(loc => loc.active) || locations[0] || null;
  }

  // ==========================================
  // Inventory
  // ==========================================

  async setInventoryLevel(
    inventoryItemId: number,
    locationId: number,
    available: number
  ): Promise<ShopifyInventoryLevel> {
    const response = await this.request<{ inventory_level: ShopifyInventoryLevel }>(
      "POST",
      "/inventory_levels/set.json",
      {
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available: available,
      }
    );
    return response.inventory_level;
  }

  async adjustInventoryLevel(
    inventoryItemId: number,
    locationId: number,
    adjustment: number
  ): Promise<ShopifyInventoryLevel> {
    const response = await this.request<{ inventory_level: ShopifyInventoryLevel }>(
      "POST",
      "/inventory_levels/adjust.json",
      {
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available_adjustment: adjustment,
      }
    );
    return response.inventory_level;
  }

  async getInventoryLevels(locationId: number, inventoryItemIds: number[]): Promise<ShopifyInventoryLevel[]> {
    const ids = inventoryItemIds.join(",");
    const response = await this.request<{ inventory_levels: ShopifyInventoryLevel[] }>(
      "GET",
      `/inventory_levels.json?location_ids=${locationId}&inventory_item_ids=${ids}`
    );
    return response.inventory_levels;
  }

  // ==========================================
  // Webhooks
  // ==========================================

  async registerWebhook(topic: string, address: string): Promise<ShopifyWebhook> {
    const response = await this.request<{ webhook: ShopifyWebhook }>(
      "POST",
      "/webhooks.json",
      {
        webhook: {
          topic,
          address,
          format: "json",
        },
      }
    );
    return response.webhook;
  }

  async getWebhooks(): Promise<ShopifyWebhook[]> {
    const response = await this.request<ShopifyWebhooksResponse>("GET", "/webhooks.json");
    return response.webhooks;
  }

  async deleteWebhook(webhookId: number): Promise<void> {
    await this.request("DELETE", `/webhooks/${webhookId}.json`);
  }

  // ==========================================
  // Getters
  // ==========================================

  getLocationId(): string | null {
    return this.locationId;
  }

  getTenantId(): string {
    return this.tenantId;
  }

  getShopDomain(): string {
    return this.shopDomain;
  }
}

// Factory function to get initialized client
export async function getShopifyClient(tenantId: string): Promise<ShopifyClient | null> {
  const client = new ShopifyClient(tenantId);
  const initialized = await client.initialize();
  return initialized ? client : null;
}

// Save or update Shopify configuration for a tenant
export async function saveShopifyConfig(
  tenantId: string,
  config: {
    shopDomain: string;
    accessToken: string;
    shopifyLocationId?: string;
    syncInventory?: boolean;
    syncPrices?: boolean;
    autoImportOrders?: boolean;
    generateDianDocuments?: boolean;
  }
): Promise<void> {
  const existingConfig = await db.query.tenantShopifyIntegrations.findFirst({
    where: eq(tenantShopifyIntegrations.tenantId, tenantId),
  });

  const encryptedToken = encrypt(config.accessToken);

  if (existingConfig) {
    await db.update(tenantShopifyIntegrations)
      .set({
        shopDomain: config.shopDomain,
        accessTokenEncrypted: encryptedToken,
        shopifyLocationId: config.shopifyLocationId,
        syncInventory: config.syncInventory ?? true,
        syncPrices: config.syncPrices ?? true,
        autoImportOrders: config.autoImportOrders ?? true,
        generateDianDocuments: config.generateDianDocuments ?? true,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(tenantShopifyIntegrations.tenantId, tenantId));
  } else {
    await db.insert(tenantShopifyIntegrations).values({
      tenantId,
      shopDomain: config.shopDomain,
      accessTokenEncrypted: encryptedToken,
      shopifyLocationId: config.shopifyLocationId,
      syncInventory: config.syncInventory ?? true,
      syncPrices: config.syncPrices ?? true,
      autoImportOrders: config.autoImportOrders ?? true,
      generateDianDocuments: config.generateDianDocuments ?? true,
      isActive: true,
    });
  }
}

// Get Shopify configuration (without decrypting token)
export async function getShopifyConfig(tenantId: string) {
  return db.query.tenantShopifyIntegrations.findFirst({
    where: eq(tenantShopifyIntegrations.tenantId, tenantId),
  });
}

// Verify HMAC signature from Shopify webhook
export function verifyWebhookSignature(
  body: string,
  hmacHeader: string,
  webhookSecret: string
): boolean {
  const hash = crypto
    .createHmac("sha256", webhookSecret)
    .update(body, "utf8")
    .digest("base64");
  
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
}

// Log sync operation
export async function logSyncOperation(
  tenantId: string,
  direction: "shopify_to_flowp" | "flowp_to_shopify",
  entityType: string,
  flowpProductId: string | null,
  shopifyVariantId: string | null,
  previousValue: string | null,
  newValue: string | null,
  success: boolean,
  errorMessage?: string,
  shopifyResponse?: unknown
): Promise<void> {
  await db.insert(shopifySyncLogs).values({
    tenantId,
    direction,
    entityType,
    flowpProductId,
    shopifyVariantId,
    previousValue,
    newValue,
    success,
    errorMessage,
    shopifyResponse: shopifyResponse ? JSON.parse(JSON.stringify(shopifyResponse)) : null,
  });
}
