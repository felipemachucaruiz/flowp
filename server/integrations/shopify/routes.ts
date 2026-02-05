import { Router, Request, Response } from "express";
import { db } from "../../db";
import { tenantShopifyIntegrations, shopifyOrders, shopifySyncLogs, shopifyProductMap, products } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { 
  saveShopifyConfig,
  getShopifyConfig,
  verifyWebhookSignature,
  handleShopifyWebhook,
  autoMapProductsBySku,
  createManualMapping,
  removeMapping,
  getProductMappings,
  getUnmappedFlowpProducts,
  fetchShopifyProducts,
  fullInventorySync,
  fullPriceSync,
  importPendingShopifyOrder,
  getShopifyClient,
} from "./index";
import {
  generateOAuthUrl,
  validateOAuthState,
  exchangeCodeForToken,
  saveOAuthCredentials,
} from "./oauth";
import { encrypt } from "./shopifyClient";

export const shopifyRouter = Router();

// ==========================================
// OAuth Flow Endpoints
// ==========================================

// Start OAuth flow - returns authorization URL
shopifyRouter.post("/oauth/authorize", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const { shopDomain, clientId, clientSecret } = req.body;

    if (!shopDomain || !clientId || !clientSecret) {
      return res.status(400).json({ 
        error: "Shop domain, client ID, and client secret are required" 
      });
    }

    const host = req.get("host") || "localhost:5000";
    const protocol = req.secure || req.get("x-forwarded-proto") === "https" ? "https" : "http";
    const redirectUri = `${protocol}://${host}/api/shopify/oauth/callback`;

    // Store credentials temporarily (will be saved permanently after callback)
    const existing = await db.query.tenantShopifyIntegrations.findFirst({
      where: eq(tenantShopifyIntegrations.tenantId, tenantId),
    });

    const cleanDomain = shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");

    if (existing) {
      await db.update(tenantShopifyIntegrations)
        .set({
          shopDomain: cleanDomain,
          clientIdEncrypted: encrypt(clientId),
          clientSecretEncrypted: encrypt(clientSecret),
          updatedAt: new Date(),
        })
        .where(eq(tenantShopifyIntegrations.tenantId, tenantId));
    } else {
      await db.insert(tenantShopifyIntegrations).values({
        tenantId,
        shopDomain: cleanDomain,
        clientIdEncrypted: encrypt(clientId),
        clientSecretEncrypted: encrypt(clientSecret),
        isActive: false,
      });
    }

    const authUrl = generateOAuthUrl(tenantId, shopDomain, clientId, redirectUri);

    return res.json({ 
      success: true, 
      authUrl,
      message: "Redirect user to authUrl to complete OAuth flow" 
    });
  } catch (error: any) {
    console.error("[Shopify OAuth] Authorize error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// OAuth callback - exchange code for token
shopifyRouter.get("/oauth/callback", async (req: Request, res: Response) => {
  try {
    const { code, state, shop, error: oauthError, error_description } = req.query;

    if (oauthError) {
      console.error(`[Shopify OAuth] Error from Shopify: ${oauthError} - ${error_description}`);
      return res.redirect(`/settings?shopify_error=${encodeURIComponent(String(error_description || oauthError))}`);
    }

    if (!code || !state || !shop) {
      return res.redirect("/settings?shopify_error=missing_parameters");
    }

    const oauthState = validateOAuthState(String(state));
    if (!oauthState) {
      console.error("[Shopify OAuth] Invalid or expired state");
      return res.redirect("/settings?shopify_error=invalid_state");
    }

    const { tenantId } = oauthState;

    // Get stored credentials
    const config = await db.query.tenantShopifyIntegrations.findFirst({
      where: eq(tenantShopifyIntegrations.tenantId, tenantId),
    });

    if (!config || !config.clientIdEncrypted || !config.clientSecretEncrypted) {
      console.error("[Shopify OAuth] Missing stored credentials");
      return res.redirect("/settings?shopify_error=missing_credentials");
    }

    // Import decrypt here to avoid circular dependency
    const { decrypt } = await import("./shopifyClient");
    const clientId = decrypt(config.clientIdEncrypted);
    const clientSecret = decrypt(config.clientSecretEncrypted);

    // Exchange code for token
    const tokenResponse = await exchangeCodeForToken(
      String(shop),
      clientId,
      clientSecret,
      String(code)
    );

    // Save the credentials
    await saveOAuthCredentials(
      tenantId,
      String(shop),
      clientId,
      clientSecret,
      tokenResponse.accessToken,
      tokenResponse.scope,
      tokenResponse.expiresIn
    );

    console.log(`[Shopify OAuth] Successfully connected for tenant ${tenantId}`);
    return res.redirect("/settings?shopify_success=true");
  } catch (error: any) {
    console.error("[Shopify OAuth] Callback error:", error);
    return res.redirect(`/settings?shopify_error=${encodeURIComponent(error.message)}`);
  }
});

// Get Shopify integration status
shopifyRouter.get("/status", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const config = await getShopifyConfig(tenantId);
    
    if (!config) {
      return res.json({
        configured: false,
        isActive: false,
      });
    }

    // Get recent sync stats
    const recentOrders = await db.query.shopifyOrders.findMany({
      where: eq(shopifyOrders.tenantId, tenantId),
      limit: 100,
    });

    const stats = {
      totalOrders: recentOrders.length,
      completedOrders: recentOrders.filter(o => o.status === "completed").length,
      failedOrders: recentOrders.filter(o => o.status === "failed").length,
      pendingOrders: recentOrders.filter(o => o.status === "pending" || o.status === "processing").length,
    };

    return res.json({
      configured: true,
      isActive: config.isActive,
      shopName: config.shopDomain,
      syncInventory: config.syncInventory,
      syncPrices: config.syncPrices,
      generateDianDocuments: config.generateDianDocuments,
      lastSyncAt: config.lastSyncAt,
      stats,
    });
  } catch (error: any) {
    console.error("[Shopify Status] Error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Save Shopify configuration (OAuth callback or manual setup)
shopifyRouter.post("/config", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const { shopDomain, accessToken, syncInventory, syncPrices, generateDianDocuments, shopifyLocationId } = req.body;

    if (!shopDomain || !accessToken) {
      return res.status(400).json({ error: "Shop domain and access token are required" });
    }

    await saveShopifyConfig(tenantId, {
      shopDomain,
      accessToken,
      syncInventory: syncInventory ?? true,
      syncPrices: syncPrices ?? true,
      generateDianDocuments: generateDianDocuments ?? true,
      shopifyLocationId,
    });

    return res.json({ success: true, message: "Shopify configuration saved" });
  } catch (error: any) {
    console.error("[Shopify Config] Error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Update sync settings
shopifyRouter.patch("/config", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const { syncInventory, syncPrices, generateDianDocuments, shopifyLocationId, isActive } = req.body;

    const existing = await db.query.tenantShopifyIntegrations.findFirst({
      where: eq(tenantShopifyIntegrations.tenantId, tenantId),
    });

    if (!existing) {
      return res.status(404).json({ error: "Shopify not configured" });
    }

    await db.update(tenantShopifyIntegrations)
      .set({
        syncInventory: syncInventory ?? existing.syncInventory,
        syncPrices: syncPrices ?? existing.syncPrices,
        generateDianDocuments: generateDianDocuments ?? existing.generateDianDocuments,
        shopifyLocationId: shopifyLocationId ?? existing.shopifyLocationId,
        isActive: isActive ?? existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(tenantShopifyIntegrations.tenantId, tenantId));

    return res.json({ success: true, message: "Settings updated" });
  } catch (error: any) {
    console.error("[Shopify Config Update] Error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint (no auth, uses HMAC verification)
shopifyRouter.post("/webhook/:topic", async (req: Request, res: Response) => {
  const topic = String(req.params.topic || "").replace(/-/g, "/"); // Convert orders-create to orders/create

  console.log(`[Shopify Webhook] Received ${topic}`);

  // Build headers object for the handler
  const headers = {
    "x-shopify-hmac-sha256": req.headers["x-shopify-hmac-sha256"] as string,
    "x-shopify-topic": topic,
    "x-shopify-shop-domain": req.headers["x-shopify-shop-domain"] as string,
    "x-shopify-webhook-id": req.headers["x-shopify-webhook-id"] as string,
    "x-shopify-event-id": req.headers["x-shopify-event-id"] as string,
    "x-shopify-api-version": req.headers["x-shopify-api-version"] as string,
  };

  try {
    // Use the raw body captured by Express for HMAC verification
    // This is critical - Shopify signs the exact bytes sent, not parsed+stringified JSON
    const rawBody = (req as any).rawBody 
      ? Buffer.isBuffer((req as any).rawBody) 
        ? (req as any).rawBody.toString("utf8") 
        : String((req as any).rawBody)
      : JSON.stringify(req.body);
    
    const result = await handleShopifyWebhook(rawBody, headers);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    return res.status(200).json({ success: true, message: result.message });
  } catch (error: any) {
    console.error("[Shopify Webhook] Error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Product mapping endpoints
shopifyRouter.get("/mappings", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const result = await getProductMappings(tenantId);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

shopifyRouter.post("/mappings/auto", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const result = await autoMapProductsBySku(tenantId);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

shopifyRouter.post("/mappings", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const { shopifyVariantId, flowpProductId } = req.body;
    const result = await createManualMapping(tenantId, shopifyVariantId, flowpProductId);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

shopifyRouter.delete("/mappings/:mappingId", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const mappingId = String(req.params.mappingId);
    const result = await removeMapping(tenantId, mappingId);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get Shopify products for mapping UI
shopifyRouter.get("/products", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const result = await fetchShopifyProducts(tenantId);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get unmapped Flowp products
shopifyRouter.get("/unmapped-products", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const result = await getUnmappedFlowpProducts(tenantId);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Sync endpoints
shopifyRouter.post("/sync/inventory", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const result = await fullInventorySync(tenantId);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

shopifyRouter.post("/sync/prices", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const result = await fullPriceSync(tenantId);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get sync logs
shopifyRouter.get("/sync-logs", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const logs = await db.query.shopifySyncLogs.findMany({
      where: eq(shopifySyncLogs.tenantId, tenantId),
      orderBy: [desc(shopifySyncLogs.createdAt)],
      limit: 100,
    });
    return res.json({ logs });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get Shopify orders
shopifyRouter.get("/orders", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const orders = await db.query.shopifyOrders.findMany({
      where: eq(shopifyOrders.tenantId, tenantId),
      orderBy: [desc(shopifyOrders.createdAt)],
      limit: 100,
    });
    return res.json({ orders });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Retry failed order import
shopifyRouter.post("/orders/:orderId/retry", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const orderId = String(req.params.orderId);
    
    // Verify order belongs to tenant
    const order = await db.query.shopifyOrders.findFirst({
      where: and(
        eq(shopifyOrders.id, orderId),
        eq(shopifyOrders.tenantId, tenantId)
      ),
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const result = await importPendingShopifyOrder(orderId);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get Shopify locations for configuration
shopifyRouter.get("/locations", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const client = await getShopifyClient(tenantId);
    if (!client) {
      return res.status(400).json({ error: "Shopify not configured" });
    }

    const locations = await client.getLocations();
    return res.json({ locations });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Disconnect Shopify (deactivate, keep data for audit)
shopifyRouter.delete("/disconnect", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    await db.update(tenantShopifyIntegrations)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(tenantShopifyIntegrations.tenantId, tenantId));

    return res.json({ success: true, message: "Shopify disconnected" });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
