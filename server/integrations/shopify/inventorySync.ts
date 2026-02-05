import { db } from "../../db";
import { 
  products,
  stockMovements,
  shopifyProductMap,
  tenantShopifyIntegrations,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { getShopifyClient, logSyncOperation } from "./shopifyClient";
import type { SyncResult } from "./types";

export async function syncInventoryToShopify(
  tenantId: string,
  productId?: string
): Promise<SyncResult> {
  console.log(`[Shopify Inventory Sync] Starting sync for tenant ${tenantId}`);

  const client = await getShopifyClient(tenantId);
  if (!client) {
    return { success: false, message: "Shopify client not initialized" };
  }

  const integration = await db.query.tenantShopifyIntegrations.findFirst({
    where: eq(tenantShopifyIntegrations.tenantId, tenantId),
  });

  if (!integration?.syncInventory) {
    return { success: false, message: "Inventory sync disabled" };
  }

  const locationId = integration.shopifyLocationId;
  if (!locationId) {
    return { success: false, message: "No Shopify location configured" };
  }

  // Get product mappings to sync
  let mappingsQuery = db.query.shopifyProductMap.findMany({
    where: and(
      eq(shopifyProductMap.tenantId, tenantId),
      eq(shopifyProductMap.isActive, true)
    ),
  });

  if (productId) {
    mappingsQuery = db.query.shopifyProductMap.findMany({
      where: and(
        eq(shopifyProductMap.tenantId, tenantId),
        eq(shopifyProductMap.flowpProductId, productId),
        eq(shopifyProductMap.isActive, true)
      ),
    });
  }

  const mappings = await mappingsQuery;

  if (mappings.length === 0) {
    return { success: true, message: "No products mapped for sync", itemsProcessed: 0 };
  }

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const mapping of mappings) {
    if (!mapping.flowpProductId || !mapping.shopifyInventoryItemId) {
      continue;
    }

    try {
      // Get current Flowp stock level
      const stockResult = await db
        .select({ 
          total: sql<number>`COALESCE(SUM(quantity), 0)` 
        })
        .from(stockMovements)
        .where(and(
          eq(stockMovements.tenantId, tenantId),
          eq(stockMovements.productId, mapping.flowpProductId)
        ));

      const currentStock = Number(stockResult[0]?.total) || 0;

      console.log(`[Shopify Inventory Sync] Setting inventory_item_id=${mapping.shopifyInventoryItemId} location=${locationId} to available=${currentStock}`);

      // Push to Shopify - this SETS the absolute value, not adjusts
      const result = await client.setInventoryLevel(
        parseInt(mapping.shopifyInventoryItemId),
        parseInt(locationId),
        currentStock
      );

      console.log(`[Shopify Inventory Sync] Shopify response: available=${result.available}`);

      // Update last sync timestamp
      await db.update(shopifyProductMap)
        .set({ lastInventorySync: new Date() })
        .where(eq(shopifyProductMap.id, mapping.id));

      // Log the operation
      await logSyncOperation(
        tenantId,
        "flowp_to_shopify",
        "inventory",
        mapping.flowpProductId,
        mapping.shopifyVariantId,
        null,
        String(currentStock),
        true
      );

      processed++;
      console.log(`[Shopify Inventory Sync] Updated inventory_item ${mapping.shopifyInventoryItemId} to ${currentStock} (confirmed: ${result.available})`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push(`${mapping.shopifyVariantId}: ${errorMessage}`);
      failed++;

      await logSyncOperation(
        tenantId,
        "flowp_to_shopify",
        "inventory",
        mapping.flowpProductId,
        mapping.shopifyVariantId,
        null,
        null,
        false,
        errorMessage
      );
    }
  }

  // Update last sync timestamp on integration
  await db.update(tenantShopifyIntegrations)
    .set({ lastSyncAt: new Date() })
    .where(eq(tenantShopifyIntegrations.tenantId, tenantId));

  return {
    success: failed === 0,
    message: `Synced ${processed} items, ${failed} failed`,
    itemsProcessed: processed,
    itemsFailed: failed,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// Trigger inventory sync when stock changes in Flowp
export async function onFlowpStockChange(
  tenantId: string,
  productId: string
): Promise<void> {
  // Check if tenant has Shopify integration with inventory sync enabled
  const integration = await db.query.tenantShopifyIntegrations.findFirst({
    where: and(
      eq(tenantShopifyIntegrations.tenantId, tenantId),
      eq(tenantShopifyIntegrations.isActive, true),
      eq(tenantShopifyIntegrations.syncInventory, true)
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

  // Queue the sync (or do it immediately for now)
  try {
    await syncInventoryToShopify(tenantId, productId);
  } catch (error) {
    console.error(`[Shopify Inventory Sync] Failed to sync product ${productId}:`, error);
  }
}

// Full inventory sync for a tenant
export async function fullInventorySync(tenantId: string): Promise<SyncResult> {
  return syncInventoryToShopify(tenantId);
}

// Reconciliation job - sync all mapped products
export async function runInventoryReconciliation(): Promise<{
  tenantsProcessed: number;
  totalItemsSynced: number;
  errors: string[];
}> {
  const integrations = await db.query.tenantShopifyIntegrations.findMany({
    where: and(
      eq(tenantShopifyIntegrations.isActive, true),
      eq(tenantShopifyIntegrations.syncInventory, true)
    ),
  });

  let tenantsProcessed = 0;
  let totalItemsSynced = 0;
  const errors: string[] = [];

  for (const integration of integrations) {
    try {
      const result = await syncInventoryToShopify(integration.tenantId);
      tenantsProcessed++;
      totalItemsSynced += result.itemsProcessed || 0;
      
      if (result.errors) {
        errors.push(...result.errors.map(e => `${integration.tenantId}: ${e}`));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push(`${integration.tenantId}: ${errorMessage}`);
    }
  }

  console.log(`[Shopify Inventory Sync] Reconciliation complete: ${tenantsProcessed} tenants, ${totalItemsSynced} items synced`);

  return {
    tenantsProcessed,
    totalItemsSynced,
    errors,
  };
}
