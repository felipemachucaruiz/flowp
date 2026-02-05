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

export async function refreshAccessToken(tenantId: string): Promise<string | null> {
  const config = await db.query.tenantShopifyIntegrations.findFirst({
    where: eq(tenantShopifyIntegrations.tenantId, tenantId),
  });
  
  if (!config || !config.clientIdEncrypted || !config.clientSecretEncrypted) {
    console.error(`[Shopify OAuth] Cannot refresh token - missing OAuth credentials for tenant ${tenantId}`);
    return null;
  }
  
  if (!config.refreshTokenEncrypted) {
    console.log(`[Shopify OAuth] No refresh token available for tenant ${tenantId} - token may be offline access type`);
    return config.accessTokenEncrypted ? decrypt(config.accessTokenEncrypted) : null;
  }
  
  try {
    const clientId = decrypt(config.clientIdEncrypted);
    const clientSecret = decrypt(config.clientSecretEncrypted);
    const refreshToken = decrypt(config.refreshTokenEncrypted);
    
    const tokenUrl = `https://${config.shopDomain}/admin/oauth/access_token`;
    
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Shopify OAuth] Token refresh failed: ${response.status} ${errorText}`);
      
      await db.update(tenantShopifyIntegrations)
        .set({
          lastError: `Token refresh failed: ${response.status}`,
          errorCount: (config.errorCount || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(tenantShopifyIntegrations.tenantId, tenantId));
      
      return null;
    }
    
    const data = await response.json();
    const newAccessToken = data.access_token;
    const newRefreshToken = data.refresh_token;
    const expiresIn = data.expires_in;
    
    const updates: any = {
      accessTokenEncrypted: encrypt(newAccessToken),
      lastError: null,
      errorCount: 0,
      updatedAt: new Date(),
    };
    
    if (newRefreshToken) {
      updates.refreshTokenEncrypted = encrypt(newRefreshToken);
    }
    
    if (expiresIn) {
      updates.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
    }
    
    await db.update(tenantShopifyIntegrations)
      .set(updates)
      .where(eq(tenantShopifyIntegrations.tenantId, tenantId));
    
    console.log(`[Shopify OAuth] Token refreshed for tenant ${tenantId}`);
    return newAccessToken;
  } catch (error: any) {
    console.error(`[Shopify OAuth] Error refreshing token for tenant ${tenantId}:`, error);
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
