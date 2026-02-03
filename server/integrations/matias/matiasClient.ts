import { db } from "../../db";
import { tenantIntegrationsMatias, matiasDocumentQueue, matiasDocumentFiles, platformConfig } from "@shared/schema";
import { eq, and, or } from "drizzle-orm";
import crypto from "crypto";

// MATIAS API v2 URLs
// Auth and API share the same base domain, different paths
const MATIAS_BASE_URL = "https://api-v2.matias-api.com";
const MATIAS_AUTH_URL = MATIAS_BASE_URL; // Auth endpoint: /auth/login
const MATIAS_API_URL = `${MATIAS_BASE_URL}/api/ubl2.1`; // Document submission endpoint
import type {
  MatiasAuthRequest,
  MatiasAuthResponse,
  MatiasDocumentResponse,
  MatiasStatusResponse,
  MatiasDocumentSearchParams,
  MatiasLastDocumentParams,
  MatiasPayload,
  MatiasNotePayload,
  MatiasSupportDocPayload,
  MatiasSupportAdjustmentPayload,
} from "./types";

function getEncryptionKey(): string {
  const key = process.env.MATIAS_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!key) {
    throw new Error("MATIAS_ENCRYPTION_KEY or SESSION_SECRET environment variable is required for secure credential storage");
  }
  return key;
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(getEncryptionKey(), "salt", 32);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const encrypted = parts[1];
  const key = crypto.scryptSync(getEncryptionKey(), "salt", 32);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export class MatiasClient {
  private tenantId: string;
  private authUrl: string = MATIAS_AUTH_URL;
  private apiUrl: string = MATIAS_API_URL;
  private accessToken: string = "";
  private email: string = "";
  private password: string = "";
  private tokenExpiresAt: Date | null = null;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async initialize(): Promise<boolean> {
    // Get per-tenant MATIAS configuration
    const tenantConfig = await db.query.tenantIntegrationsMatias.findFirst({
      where: eq(tenantIntegrationsMatias.tenantId, this.tenantId),
    });

    if (!tenantConfig || !tenantConfig.isEnabled) {
      console.log(`[MATIAS] Tenant ${this.tenantId} MATIAS integration not enabled`);
      return false;
    }

    // Use per-tenant credentials
    if (!tenantConfig.email || !tenantConfig.passwordEncrypted) {
      console.log(`[MATIAS] Tenant ${this.tenantId} MATIAS credentials not configured`);
      return false;
    }

    this.email = tenantConfig.email;
    try {
      this.password = decrypt(tenantConfig.passwordEncrypted);
    } catch (e) {
      console.error(`[MATIAS] Failed to decrypt password for tenant ${this.tenantId}`);
      return false;
    }

    // Use tenant's API URL if configured, otherwise use default
    if (tenantConfig.baseUrl) {
      this.apiUrl = tenantConfig.baseUrl;
    }

    // Check for cached per-tenant token
    if (tenantConfig.accessTokenEncrypted && tenantConfig.tokenExpiresAt) {
      const expiresAt = new Date(tenantConfig.tokenExpiresAt);
      const now = new Date();
      if (expiresAt > now) {
        try {
          this.accessToken = decrypt(tenantConfig.accessTokenEncrypted);
          this.tokenExpiresAt = expiresAt;
          console.log(`[MATIAS] Using cached token for tenant ${this.tenantId}`);
          return true;
        } catch {
          // Token decrypt failed, need to re-authenticate
        }
      }
    }

    return await this.authenticate();
  }

  private async authenticate(): Promise<boolean> {
    try {
      // MATIAS API: Auth endpoint is /auth/login on the API domain
      const authEndpoint = `${this.authUrl}/auth/login`;
      console.log(`[MATIAS] Authenticating with ${authEndpoint}`);
      
      const authPayload: MatiasAuthRequest = {
        email: this.email,
        password: this.password,
        remember_me: 0,
      };

      const response = await fetch(authEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(authPayload),
      });

      const responseText = await response.text();
      console.log(`[MATIAS] Auth response status: ${response.status}`);
      
      if (!response.ok) {
        console.error("[MATIAS] Auth failed:", response.status, responseText);
        return false;
      }

      // Check if response is HTML (error page)
      if (responseText.startsWith("<!DOCTYPE") || responseText.startsWith("<html")) {
        console.error("[MATIAS] Auth returned HTML instead of JSON. Check the API URL.");
        console.error("[MATIAS] Response preview:", responseText.substring(0, 200));
        return false;
      }

      let data: MatiasAuthResponse;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("[MATIAS] Failed to parse auth response:", parseError);
        console.error("[MATIAS] Response:", responseText.substring(0, 500));
        return false;
      }
      this.accessToken = data.access_token;
      
      // Parse expiration - MATIAS returns expires_at as date string or expires_in as seconds
      if (data.expires_at) {
        this.tokenExpiresAt = new Date(data.expires_at);
      } else if (data.expires_in) {
        this.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);
      } else {
        // Default to 1 year
        this.tokenExpiresAt = new Date(Date.now() + 31536000 * 1000);
      }

      // Save token to per-tenant configuration
      await db
        .update(tenantIntegrationsMatias)
        .set({
          accessTokenEncrypted: encrypt(this.accessToken),
          tokenExpiresAt: this.tokenExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(tenantIntegrationsMatias.tenantId, this.tenantId));

      console.log(`[MATIAS] Authentication successful for tenant ${this.tenantId}, token cached`);
      return true;
    } catch (error) {
      console.error("[MATIAS] Auth error:", error);
      return false;
    }
  }

  private async upsertPlatformConfig(key: string, value: string, isEncrypted: boolean): Promise<void> {
    const existing = await db.select().from(platformConfig).where(eq(platformConfig.key, key));
    const now = new Date();
    
    if (existing.length > 0) {
      await db.update(platformConfig)
        .set({
          value: isEncrypted ? null : value,
          encryptedValue: isEncrypted ? encrypt(value) : null,
          updatedAt: now,
        })
        .where(eq(platformConfig.key, key));
    } else {
      await db.insert(platformConfig).values({
        key,
        value: isEncrypted ? null : value,
        encryptedValue: isEncrypted ? encrypt(value) : null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: any,
    retryOn401 = true
  ): Promise<{ success: boolean; data?: T; error?: string; status?: number }> {
    try {
      const url = `${this.apiUrl}${endpoint}`;
      const options: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      };

      if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      if (response.status === 401 && retryOn401) {
        const reauthed = await this.authenticate();
        if (reauthed) {
          return this.request(method, endpoint, body, false);
        }
        return { success: false, error: "Authentication failed", status: 401 };
      }

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || JSON.stringify(data.errors),
          status: response.status,
          data,
        };
      }

      return { success: true, data, status: response.status };
    } catch (error: any) {
      return { success: false, error: error.message, status: 0 };
    }
  }

  async submitInvoice(payload: MatiasPayload): Promise<MatiasDocumentResponse> {
    const result = await this.request<MatiasDocumentResponse>("POST", "/invoice", payload);
    return result.data || { success: false, message: result.error };
  }

  async submitPos(payload: MatiasPayload): Promise<MatiasDocumentResponse> {
    const result = await this.request<MatiasDocumentResponse>("POST", "/invoice", payload);
    return result.data || { success: false, message: result.error };
  }

  async submitCreditNote(payload: MatiasNotePayload): Promise<MatiasDocumentResponse> {
    const result = await this.request<MatiasDocumentResponse>("POST", "/notes/credit", payload);
    return result.data || { success: false, message: result.error };
  }

  async submitDebitNote(payload: MatiasNotePayload): Promise<MatiasDocumentResponse> {
    const result = await this.request<MatiasDocumentResponse>("POST", "/notes/debit", payload);
    return result.data || { success: false, message: result.error };
  }

  async submitSupportDocument(payload: MatiasSupportDocPayload): Promise<MatiasDocumentResponse> {
    const result = await this.request<MatiasDocumentResponse>("POST", "/ds/document", payload);
    return result.data || { success: false, message: result.error };
  }

  async submitSupportAdjustmentNote(payload: MatiasSupportAdjustmentPayload): Promise<MatiasDocumentResponse> {
    const result = await this.request<MatiasDocumentResponse>("POST", "/ds/adjustment-note", payload);
    return result.data || { success: false, message: result.error };
  }

  async searchDocuments(params: MatiasDocumentSearchParams): Promise<any> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, String(value));
      }
    });
    const result = await this.request<any>("GET", `/documents?${queryParams.toString()}`);
    return result.data;
  }

  async getLastDocument(params: MatiasLastDocumentParams): Promise<{ number: number } | null> {
    const result = await this.request<any>(
      "GET",
      `/documents/last?resolution=${params.resolution}&prefix=${params.prefix}`
    );
    if (result.success && result.data) {
      return { number: result.data.number || result.data.data?.number || 0 };
    }
    return null;
  }

  async getStatus(params: {
    order_number?: string;
    resolution?: string;
    number?: number;
    prefix?: string;
  }): Promise<MatiasStatusResponse | null> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, String(value));
      }
    });
    const result = await this.request<MatiasStatusResponse>(
      "GET",
      `/status?${queryParams.toString()}`
    );
    return result.data || null;
  }

  async getStatusByTrackId(trackId: string): Promise<MatiasStatusResponse | null> {
    const result = await this.request<MatiasStatusResponse>(
      "GET",
      `/status/document/${trackId}`
    );
    return result.data || null;
  }

  async downloadPdf(trackId: string, regenerate = false): Promise<Buffer | null> {
    try {
      const url = `${this.apiUrl}/documents/pdf/${trackId}${regenerate ? "?regenerate=1" : ""}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/pdf",
        },
      });

      if (!response.ok) {
        return null;
      }

      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      return null;
    }
  }

  async downloadAttached(trackId: string, regenerate = false): Promise<Buffer | null> {
    try {
      const url = `${this.apiUrl}/documents/attached/${trackId}${regenerate ? "?regenerate=1" : ""}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/zip",
        },
      });

      if (!response.ok) {
        return null;
      }

      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      console.error("Error downloading attached:", error);
      return null;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    const initialized = await this.initialize();
    if (!initialized) {
      return { success: false, message: "Failed to authenticate with MATIAS API" };
    }
    return { success: true, message: "Connection successful" };
  }
}

export async function getMatiasClient(tenantId: string): Promise<MatiasClient | null> {
  const client = new MatiasClient(tenantId);
  const initialized = await client.initialize();
  if (!initialized) {
    return null;
  }
  return client;
}

export async function saveMatiasConfig(
  tenantId: string,
  config: {
    baseUrl: string;
    email: string;
    password: string;
    defaultResolutionNumber?: string;
    defaultPrefix?: string;
    posTerminalNumber?: string;
    posSalesCode?: string;
    posCashierType?: string;
    posAddress?: string;
    softwareId?: string;
    softwarePin?: string;
    manufacturerName?: string;
    manufacturerNit?: string;
    isEnabled?: boolean;
    autoSubmitSales?: boolean;
  }
): Promise<{ success: boolean; message: string }> {
  try {
    const existing = await db.query.tenantIntegrationsMatias.findFirst({
      where: eq(tenantIntegrationsMatias.tenantId, tenantId),
    });

    const encryptedPassword = encrypt(config.password);

    if (existing) {
      await db
        .update(tenantIntegrationsMatias)
        .set({
          baseUrl: config.baseUrl,
          email: config.email,
          passwordEncrypted: encryptedPassword,
          defaultResolutionNumber: config.defaultResolutionNumber,
          defaultPrefix: config.defaultPrefix,
          posTerminalNumber: config.posTerminalNumber,
          posSalesCode: config.posSalesCode,
          posCashierType: config.posCashierType,
          posAddress: config.posAddress,
          softwareId: config.softwareId,
          softwarePin: config.softwarePin,
          manufacturerName: config.manufacturerName,
          manufacturerNit: config.manufacturerNit,
          isEnabled: config.isEnabled ?? true,
          autoSubmitSales: config.autoSubmitSales ?? true,
          accessTokenEncrypted: null,
          tokenExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(tenantIntegrationsMatias.tenantId, tenantId));
    } else {
      await db.insert(tenantIntegrationsMatias).values({
        tenantId,
        baseUrl: config.baseUrl,
        email: config.email,
        passwordEncrypted: encryptedPassword,
        defaultResolutionNumber: config.defaultResolutionNumber,
        defaultPrefix: config.defaultPrefix,
        posTerminalNumber: config.posTerminalNumber,
        posSalesCode: config.posSalesCode,
        posCashierType: config.posCashierType,
        posAddress: config.posAddress,
        softwareId: config.softwareId,
        softwarePin: config.softwarePin,
        manufacturerName: config.manufacturerName,
        manufacturerNit: config.manufacturerNit,
        isEnabled: config.isEnabled ?? true,
        autoSubmitSales: config.autoSubmitSales ?? true,
      });
    }

    return { success: true, message: "Configuration saved successfully" };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function getMatiasConfig(tenantId: string) {
  const config = await db.query.tenantIntegrationsMatias.findFirst({
    where: eq(tenantIntegrationsMatias.tenantId, tenantId),
  });

  if (!config) return null;

  return {
    ...config,
    passwordEncrypted: undefined,
    accessTokenEncrypted: undefined,
    hasPassword: !!config.passwordEncrypted,
    hasToken: !!config.accessTokenEncrypted,
  };
}

export { encrypt, decrypt };
