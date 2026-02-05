import { db } from "../../db";
import { 
  products,
  shopifyProductMap,
  tenantShopifyIntegrations,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getShopifyClient, logSyncOperation } from "./shopifyClient";
import type { SyncResult } from "./types";

export async function syncPriceToShopify(
  tenantId: string,
  productId: string,
  newPrice: string
): Promise<SyncResult> {
  console.log(`[Shopify Price Sync] Syncing price for product ${productId} to ${newPrice}`);

  const client = await getShopifyClient(tenantId);
  if (!client) {
    return { success: false, message: "Shopify client not initialized" };
  }

  const integration = await db.query.tenantShopifyIntegrations.findFirst({
    where: eq(tenantShopifyIntegrations.tenantId, tenantId),
  });

  if (!integration?.syncPrices) {
    return { success: false, message: "Price sync disabled" };
  }

  // Find product mappings for this product
  const mappings = await db.query.shopifyProductMap.findMany({
    where: and(
      eq(shopifyProductMap.tenantId, tenantId),
      eq(shopifyProductMap.flowpProductId, productId),
      eq(shopifyProductMap.isActive, true)
    ),
  });

  if (mappings.length === 0) {
    return { success: true, message: "Product not mapped to Shopify", itemsProcessed: 0 };
  }

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const mapping of mappings) {
    try {
      const variantId = parseInt(mapping.shopifyVariantId);
      
      // Update variant price in Shopify
      await client.updateVariantPrice(variantId, newPrice);

      // Update last sync timestamp
      await db.update(shopifyProductMap)
        .set({ lastPriceSync: new Date() })
        .where(eq(shopifyProductMap.id, mapping.id));

      // Log the operation
      await logSyncOperation(
        tenantId,
        "flowp_to_shopify",
        "price",
        productId,
        mapping.shopifyVariantId,
        null,
        newPrice,
        true
      );

      processed++;
      console.log(`[Shopify Price Sync] Updated variant ${mapping.shopifyVariantId} to ${newPrice}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push(`${mapping.shopifyVariantId}: ${errorMessage}`);
      failed++;

      await logSyncOperation(
        tenantId,
        "flowp_to_shopify",
        "price",
        productId,
        mapping.shopifyVariantId,
        null,
        newPrice,
        false,
        errorMessage
      );
    }
  }

  return {
    success: failed === 0,
    message: `Synced price to ${processed} variants, ${failed} failed`,
    itemsProcessed: processed,
    itemsFailed: failed,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// Trigger price sync when product price changes in Flowp
export async function onFlowpPriceChange(
  tenantId: string,
  productId: string,
  newPrice: string
): Promise<void> {
  // Check if tenant has Shopify integration with price sync enabled
  const integration = await db.query.tenantShopifyIntegrations.findFirst({
    where: and(
      eq(tenantShopifyIntegrations.tenantId, tenantId),
      eq(tenantShopifyIntegrations.isActive, true),
      eq(tenantShopifyIntegrations.syncPrices, true)
    ),
  });

  if (!integration) {
    return;
  }

  // Check if product is mapped
  const mapping = await db.query.shopifyProductMap.findFirst({
    where: and(
      eq(shopifyProductMap.tenantId, tenantId),
      eq(shopifyProductMap.flowpProductId, productId),
      eq(shopifyProductMap.isActive, true)
    ),
  });

  if (!mapping) {
    return;
  }

  // Sync the price
  try {
    await syncPriceToShopify(tenantId, productId, newPrice);
  } catch (error) {
    console.error(`[Shopify Price Sync] Failed to sync price for product ${productId}:`, error);
  }
}

// Bulk price sync for all mapped products
export async function fullPriceSync(tenantId: string): Promise<SyncResult> {
  console.log(`[Shopify Price Sync] Starting full sync for tenant ${tenantId}`);

  const client = await getShopifyClient(tenantId);
  if (!client) {
    return { success: false, message: "Shopify client not initialized" };
  }

  const integration = await db.query.tenantShopifyIntegrations.findFirst({
    where: eq(tenantShopifyIntegrations.tenantId, tenantId),
  });

  if (!integration?.syncPrices) {
    return { success: false, message: "Price sync disabled" };
  }

  // Get all active mappings
  const mappings = await db.query.shopifyProductMap.findMany({
    where: and(
      eq(shopifyProductMap.tenantId, tenantId),
      eq(shopifyProductMap.isActive, true)
    ),
  });

  if (mappings.length === 0) {
    return { success: true, message: "No products mapped", itemsProcessed: 0 };
  }

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const mapping of mappings) {
    if (!mapping.flowpProductId) continue;

    // Get current Flowp price
    const product = await db.query.products.findFirst({
      where: eq(products.id, mapping.flowpProductId),
    });

    if (!product) continue;

    try {
      const variantId = parseInt(mapping.shopifyVariantId);
      
      // Update variant price in Shopify
      await client.updateVariantPrice(variantId, product.price);

      // Update last sync timestamp
      await db.update(shopifyProductMap)
        .set({ lastPriceSync: new Date() })
        .where(eq(shopifyProductMap.id, mapping.id));

      await logSyncOperation(
        tenantId,
        "flowp_to_shopify",
        "price",
        mapping.flowpProductId,
        mapping.shopifyVariantId,
        null,
        product.price,
        true
      );

      processed++;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push(`${mapping.shopifyVariantId}: ${errorMessage}`);
      failed++;

      await logSyncOperation(
        tenantId,
        "flowp_to_shopify",
        "price",
        mapping.flowpProductId,
        mapping.shopifyVariantId,
        null,
        product.price,
        false,
        errorMessage
      );
    }
  }

  return {
    success: failed === 0,
    message: `Synced ${processed} prices, ${failed} failed`,
    itemsProcessed: processed,
    itemsFailed: failed,
    errors: errors.length > 0 ? errors : undefined,
  };
}
