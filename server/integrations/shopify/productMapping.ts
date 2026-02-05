import { db } from "../../db";
import { 
  products,
  shopifyProductMap,
  tenantShopifyIntegrations,
} from "@shared/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { getShopifyClient } from "./shopifyClient";
import type { ShopifyProduct, ShopifyVariant, SyncResult } from "./types";

export interface ProductMappingResult {
  success: boolean;
  message: string;
  mappingsCreated?: number;
  mappingsUpdated?: number;
  unmappedShopifyProducts?: {
    productId: string;
    variantId: string;
    title: string;
    sku: string | null;
  }[];
}

// Auto-map products by SKU
export async function autoMapProductsBySku(tenantId: string): Promise<ProductMappingResult> {
  console.log(`[Shopify Product Mapping] Starting auto-map for tenant ${tenantId}`);

  const client = await getShopifyClient(tenantId);
  if (!client) {
    return { success: false, message: "Shopify client not initialized" };
  }

  // Get all Shopify products
  const shopifyProducts = await client.getProducts();

  let mappingsCreated = 0;
  let mappingsUpdated = 0;
  const unmapped: ProductMappingResult["unmappedShopifyProducts"] = [];

  for (const shopifyProduct of shopifyProducts) {
    for (const variant of shopifyProduct.variants) {
      if (!variant.sku) {
        unmapped.push({
          productId: String(shopifyProduct.id),
          variantId: String(variant.id),
          title: `${shopifyProduct.title}${variant.title !== "Default Title" ? ` - ${variant.title}` : ""}`,
          sku: null,
        });
        continue;
      }

      // Try to find matching Flowp product by SKU first
      let flowpProduct = await db.query.products.findFirst({
        where: and(
          eq(products.tenantId, tenantId),
          eq(products.sku, variant.sku),
          eq(products.isActive, true)
        ),
      });

      // If no SKU match, try matching by barcode
      if (!flowpProduct) {
        flowpProduct = await db.query.products.findFirst({
          where: and(
            eq(products.tenantId, tenantId),
            eq(products.barcode, variant.sku),
            eq(products.isActive, true)
          ),
        });
      }

      if (!flowpProduct) {
        unmapped.push({
          productId: String(shopifyProduct.id),
          variantId: String(variant.id),
          title: `${shopifyProduct.title}${variant.title !== "Default Title" ? ` - ${variant.title}` : ""}`,
          sku: variant.sku,
        });
        continue;
      }

      // Check if mapping already exists
      const existingMapping = await db.query.shopifyProductMap.findFirst({
        where: and(
          eq(shopifyProductMap.tenantId, tenantId),
          eq(shopifyProductMap.shopifyVariantId, String(variant.id))
        ),
      });

      if (existingMapping) {
        // Update if different product
        if (existingMapping.flowpProductId !== flowpProduct.id) {
          await db.update(shopifyProductMap)
            .set({
              flowpProductId: flowpProduct.id,
              shopifySku: variant.sku,
              autoMatched: true,
              shopifyInventoryItemId: String(variant.inventory_item_id),
              updatedAt: new Date(),
            })
            .where(eq(shopifyProductMap.id, existingMapping.id));
          mappingsUpdated++;
        }
      } else {
        // Create new mapping
        await db.insert(shopifyProductMap).values({
          tenantId,
          shopifyProductId: String(shopifyProduct.id),
          shopifyVariantId: String(variant.id),
          shopifyTitle: shopifyProduct.title,
          shopifyVariantTitle: variant.title !== "Default Title" ? variant.title : null,
          shopifySku: variant.sku,
          flowpProductId: flowpProduct.id,
          autoMatched: true,
          shopifyInventoryItemId: String(variant.inventory_item_id),
        });
        mappingsCreated++;
      }
    }
  }

  console.log(`[Shopify Product Mapping] Auto-map complete: ${mappingsCreated} created, ${mappingsUpdated} updated, ${unmapped.length} unmapped`);

  return {
    success: true,
    message: `Created ${mappingsCreated} mappings, updated ${mappingsUpdated}, ${unmapped.length} products need manual mapping`,
    mappingsCreated,
    mappingsUpdated,
    unmappedShopifyProducts: unmapped,
  };
}

// Manual mapping
export async function createManualMapping(
  tenantId: string,
  shopifyVariantId: string,
  flowpProductId: string
): Promise<{ success: boolean; message: string; mappingId?: string }> {
  const client = await getShopifyClient(tenantId);
  if (!client) {
    return { success: false, message: "Shopify client not initialized" };
  }

  // Verify Flowp product exists
  const flowpProduct = await db.query.products.findFirst({
    where: and(
      eq(products.id, flowpProductId),
      eq(products.tenantId, tenantId)
    ),
  });

  if (!flowpProduct) {
    return { success: false, message: "Flowp product not found" };
  }

  // Check if mapping already exists
  const existingMapping = await db.query.shopifyProductMap.findFirst({
    where: and(
      eq(shopifyProductMap.tenantId, tenantId),
      eq(shopifyProductMap.shopifyVariantId, shopifyVariantId)
    ),
  });

  if (existingMapping) {
    // Update existing mapping
    await db.update(shopifyProductMap)
      .set({
        flowpProductId,
        autoMatched: false,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(shopifyProductMap.id, existingMapping.id));

    return { 
      success: true, 
      message: "Mapping updated", 
      mappingId: existingMapping.id 
    };
  }

  // Need to fetch Shopify product info
  try {
    // Find the variant in Shopify
    const shopifyProducts = await client.getProducts();
    let foundProduct: ShopifyProduct | undefined;
    let foundVariant: ShopifyVariant | undefined;

    for (const product of shopifyProducts) {
      const variant = product.variants.find(v => String(v.id) === shopifyVariantId);
      if (variant) {
        foundProduct = product;
        foundVariant = variant;
        break;
      }
    }

    if (!foundProduct || !foundVariant) {
      return { success: false, message: "Shopify variant not found" };
    }

    // Create new mapping
    const [mapping] = await db.insert(shopifyProductMap).values({
      tenantId,
      shopifyProductId: String(foundProduct.id),
      shopifyVariantId: String(foundVariant.id),
      shopifyTitle: foundProduct.title,
      shopifyVariantTitle: foundVariant.title !== "Default Title" ? foundVariant.title : null,
      shopifySku: foundVariant.sku,
      flowpProductId,
      autoMatched: false,
      shopifyInventoryItemId: String(foundVariant.inventory_item_id),
    }).returning();

    return { success: true, message: "Mapping created", mappingId: mapping.id };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message: errorMessage };
  }
}

// Remove mapping
export async function removeMapping(
  tenantId: string,
  mappingId: string
): Promise<{ success: boolean; message: string }> {
  const mapping = await db.query.shopifyProductMap.findFirst({
    where: and(
      eq(shopifyProductMap.id, mappingId),
      eq(shopifyProductMap.tenantId, tenantId)
    ),
  });

  if (!mapping) {
    return { success: false, message: "Mapping not found" };
  }

  await db.update(shopifyProductMap)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(shopifyProductMap.id, mappingId));

  return { success: true, message: "Mapping removed" };
}

// Get all mappings for a tenant
export async function getProductMappings(tenantId: string): Promise<{
  mappings: Array<{
    id: string;
    shopifyProductId: string;
    shopifyVariantId: string;
    shopifyTitle: string | null;
    shopifyVariantTitle: string | null;
    shopifySku: string | null;
    flowpProductId: string | null;
    flowpProductName?: string;
    flowpProductSku?: string | null;
    autoMatched: boolean;
    isActive: boolean;
    lastInventorySync: Date | null;
    lastPriceSync: Date | null;
  }>;
}> {
  const mappings = await db.query.shopifyProductMap.findMany({
    where: eq(shopifyProductMap.tenantId, tenantId),
    orderBy: (m, { desc }) => [desc(m.createdAt)],
  });

  const result = await Promise.all(mappings.map(async (m) => {
    let flowpProduct = null;
    if (m.flowpProductId) {
      flowpProduct = await db.query.products.findFirst({
        where: eq(products.id, m.flowpProductId),
      });
    }

    return {
      id: m.id,
      shopifyProductId: m.shopifyProductId,
      shopifyVariantId: m.shopifyVariantId,
      shopifyTitle: m.shopifyTitle,
      shopifyVariantTitle: m.shopifyVariantTitle,
      shopifySku: m.shopifySku,
      flowpProductId: m.flowpProductId,
      flowpProductName: flowpProduct?.name,
      flowpProductSku: flowpProduct?.sku,
      autoMatched: m.autoMatched ?? false,
      isActive: m.isActive ?? true,
      lastInventorySync: m.lastInventorySync,
      lastPriceSync: m.lastPriceSync,
    };
  }));

  return { mappings: result };
}

// Get unmapped Flowp products (products without any Shopify mapping)
export async function getUnmappedFlowpProducts(tenantId: string): Promise<{
  products: Array<{
    id: string;
    name: string;
    sku: string | null;
    price: string;
  }>;
}> {
  const allProducts = await db.query.products.findMany({
    where: and(
      eq(products.tenantId, tenantId),
      eq(products.isActive, true)
    ),
  });

  const mappedProductIds = await db
    .select({ flowpProductId: shopifyProductMap.flowpProductId })
    .from(shopifyProductMap)
    .where(and(
      eq(shopifyProductMap.tenantId, tenantId),
      eq(shopifyProductMap.isActive, true)
    ));

  const mappedIds = new Set(mappedProductIds.map(m => m.flowpProductId).filter(Boolean));

  const unmapped = allProducts.filter(p => !mappedIds.has(p.id));

  return {
    products: unmapped.map(p => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: p.price,
    })),
  };
}

// Fetch Shopify products for mapping UI
export async function fetchShopifyProducts(tenantId: string): Promise<{
  products: Array<{
    id: string;
    title: string;
    variants: Array<{
      id: string;
      title: string;
      sku: string | null;
      price: string;
      inventoryItemId: string;
      isMapped: boolean;
      mappedToProductId?: string;
    }>;
  }>;
}> {
  const client = await getShopifyClient(tenantId);
  if (!client) {
    return { products: [] };
  }

  const shopifyProducts = await client.getProducts();

  // Get existing mappings
  const mappings = await db.query.shopifyProductMap.findMany({
    where: and(
      eq(shopifyProductMap.tenantId, tenantId),
      eq(shopifyProductMap.isActive, true)
    ),
  });

  const mappingsByVariant = new Map(
    mappings.map(m => [m.shopifyVariantId, m])
  );

  return {
    products: shopifyProducts.map(p => ({
      id: String(p.id),
      title: p.title,
      variants: p.variants.map(v => {
        const mapping = mappingsByVariant.get(String(v.id));
        return {
          id: String(v.id),
          title: v.title !== "Default Title" ? v.title : p.title,
          sku: v.sku,
          price: v.price,
          inventoryItemId: String(v.inventory_item_id),
          isMapped: !!mapping,
          mappedToProductId: mapping?.flowpProductId || undefined,
        };
      }),
    })),
  };
}
