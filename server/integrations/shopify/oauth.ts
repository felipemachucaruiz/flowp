import { db } from "../../db";
import { tenantShopifyIntegrations } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { encrypt, decrypt } from "./shopifyClient";

const SHOPIFY_API_VERSION = "2024-01";
const SHOPIFY_SCOPES = [
  "read_orders",
  "write_orders", 
  "read_products",
  "write_products",
  "read_inventory",
  "write_inventory",
  "read_locations",
  "read_customers",
].join(",");

interface OAuthState {
  tenantId: string;
  nonce: string;
  redirectUri: string;
}

const pendingOAuthStates = new Map<string, OAuthState>();

export function generateOAuthUrl(
  tenantId: string,
  shopDomain: string,
  clientId: string,
  redirectUri: string
): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = crypto.randomBytes(32).toString("hex");
  
  pendingOAuthStates.set(state, {
    tenantId,
    nonce,
    redirectUri,
  });
  
  setTimeout(() => {
    pendingOAuthStates.delete(state);
  }, 10 * 60 * 1000);
  
  const cleanDomain = shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  
  const authUrl = new URL(`https://${cleanDomain}/admin/oauth/authorize`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", SHOPIFY_SCOPES);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("grant_options[]", "per-user");
  
  return authUrl.toString();
}

export function validateOAuthState(state: string): OAuthState | null {
  const oauthState = pendingOAuthStates.get(state);
  if (oauthState) {
    pendingOAuthStates.delete(state);
  }
  return oauthState || null;
}

export function verifyOAuthCallback(
  query: Record<string, string>,
  clientSecret: string
): boolean {
  const { hmac, ...params } = query;
  
  if (!hmac) {
    console.warn("[Shopify OAuth] No HMAC in callback");
    return false;
  }
  
  // Validate hmac is a valid hex string
  if (!/^[a-f0-9]+$/i.test(hmac)) {
    console.warn("[Shopify OAuth] Invalid HMAC format");
    return false;
  }
  
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  
  const computedHmac = crypto
    .createHmac("sha256", clientSecret)
    .update(sortedParams)
    .digest("hex");
  
  // Ensure both buffers have the same length before comparison
  if (hmac.length !== computedHmac.length) {
    console.warn("[Shopify OAuth] HMAC length mismatch");
    return false;
  }
  
  try {
    const valid = crypto.timingSafeEqual(
      Buffer.from(hmac, "hex"),
      Buffer.from(computedHmac, "hex")
    );
    
    if (!valid) {
      console.warn("[Shopify OAuth] HMAC verification failed");
    }
    
    return valid;
  } catch (error) {
    console.error("[Shopify OAuth] HMAC comparison error:", error);
    return false;
  }
}

export async function exchangeCodeForToken(
  shopDomain: string,
  clientId: string,
  clientSecret: string,
  code: string
): Promise<{
  accessToken: string;
  scope: string;
  expiresIn?: number;
  associatedUserScope?: string;
  associatedUser?: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    account_owner: boolean;
    locale: string;
    collaborator: boolean;
    email_verified: boolean;
  };
}> {
  const cleanDomain = shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const tokenUrl = `https://${cleanDomain}/admin/oauth/access_token`;
  
  console.log(`[Shopify OAuth] Exchanging code for token at ${tokenUrl}`);
  
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Shopify OAuth] Token exchange failed: ${response.status} ${errorText}`);
    throw new Error(`Failed to exchange code for token: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  console.log(`[Shopify OAuth] Token exchange successful, scope: ${data.scope}`);
  
  return {
    accessToken: data.access_token,
    scope: data.scope,
    expiresIn: data.expires_in,
    associatedUserScope: data.associated_user_scope,
    associatedUser: data.associated_user,
  };
}

export async function saveOAuthCredentials(
  tenantId: string,
  shopDomain: string,
  clientId: string,
  clientSecret: string,
  accessToken: string,
  scope: string,
  expiresIn?: number
): Promise<void> {
  const cleanDomain = shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  
  const clientIdEncrypted = encrypt(clientId);
  const clientSecretEncrypted = encrypt(clientSecret);
  const accessTokenEncrypted = encrypt(accessToken);
  
  let tokenExpiresAt: Date | null = null;
  if (expiresIn) {
    tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
  }
  
  const existing = await db.query.tenantShopifyIntegrations.findFirst({
    where: eq(tenantShopifyIntegrations.tenantId, tenantId),
  });
  
  if (existing) {
    await db.update(tenantShopifyIntegrations)
      .set({
        shopDomain: cleanDomain,
        clientIdEncrypted,
        clientSecretEncrypted,
        accessTokenEncrypted,
        tokenScope: scope,
        tokenExpiresAt,
        isActive: true,
        lastError: null,
        errorCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(tenantShopifyIntegrations.tenantId, tenantId));
  } else {
    await db.insert(tenantShopifyIntegrations).values({
      tenantId,
      shopDomain: cleanDomain,
      clientIdEncrypted,
      clientSecretEncrypted,
      accessTokenEncrypted,
      tokenScope: scope,
      tokenExpiresAt,
      isActive: true,
      syncInventory: true,
      syncPrices: true,
      autoImportOrders: true,
      generateDianDocuments: true,
    });
  }
  
  console.log(`[Shopify OAuth] Credentials saved for tenant ${tenantId}`);
}

export async function getAccessToken(tenantId: string): Promise<string | null> {
  const config = await db.query.tenantShopifyIntegrations.findFirst({
    where: eq(tenantShopifyIntegrations.tenantId, tenantId),
  });
  
  if (!config || !config.accessTokenEncrypted) {
    console.error(`[Shopify OAuth] No access token found for tenant ${tenantId}`);
    return null;
  }
  
  try {
    return decrypt(config.accessTokenEncrypted);
  } catch (error: any) {
    console.error(`[Shopify OAuth] Error decrypting token for tenant ${tenantId}:`, error);
    return null;
  }
}

export async function isTokenExpiringSoon(tenantId: string): Promise<boolean> {
  const config = await db.query.tenantShopifyIntegrations.findFirst({
    where: eq(tenantShopifyIntegrations.tenantId, tenantId),
  });
  
  if (!config || !config.tokenExpiresAt) {
    return false;
  }
  
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  return config.tokenExpiresAt < fiveMinutesFromNow;
}
