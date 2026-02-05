import { db } from "../../db";
import { 
  orders, 
  orderItems, 
  payments,
  customers,
  shopifyOrders,
  shopifyProductMap,
  stockMovements,
  tenantShopifyIntegrations,
  products,
  users,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import type { ShopifyOrder, ShopifyLineItem } from "./types";
import { queueDocument } from "../matias/documentQueue";

export interface OrderImportResult {
  success: boolean;
  message: string;
  flowpOrderId?: string;
  shopifyOrderRecordId?: string;
}

export async function importShopifyOrder(
  tenantId: string,
  shopifyOrder: ShopifyOrder,
  integration: typeof tenantShopifyIntegrations.$inferSelect
): Promise<OrderImportResult> {
  const shopifyOrderId = String(shopifyOrder.id);

  console.log(`[Shopify Order Import] Processing order ${shopifyOrder.name} for tenant ${tenantId}`);

  // Check for existing record
  let shopifyOrderRecord = await db.query.shopifyOrders.findFirst({
    where: and(
      eq(shopifyOrders.tenantId, tenantId),
      eq(shopifyOrders.shopifyOrderId, shopifyOrderId)
    ),
  });

  // Create or update shopify order record
  if (!shopifyOrderRecord) {
    [shopifyOrderRecord] = await db.insert(shopifyOrders).values({
      tenantId,
      shopifyOrderId,
      shopifyOrderNumber: String(shopifyOrder.order_number),
      shopifyOrderName: shopifyOrder.name,
      status: "processing",
      payloadJson: shopifyOrder,
      subtotalPrice: shopifyOrder.subtotal_price,
      totalTax: shopifyOrder.total_tax,
      totalDiscounts: shopifyOrder.total_discounts,
      totalPrice: shopifyOrder.total_price,
      currency: shopifyOrder.currency,
      customerEmail: shopifyOrder.email || shopifyOrder.customer?.email,
      customerPhone: shopifyOrder.phone || shopifyOrder.customer?.phone,
    }).returning();
  } else {
    await db.update(shopifyOrders)
      .set({ status: "processing" })
      .where(eq(shopifyOrders.id, shopifyOrderRecord.id));
  }

  try {
    // Find or create customer
    let customerId: string | null = null;
    if (shopifyOrder.customer || shopifyOrder.email) {
      customerId = await findOrCreateCustomer(tenantId, shopifyOrder);
    }

    // Map line items to Flowp products
    const mappedItems = await mapLineItems(tenantId, shopifyOrder.line_items);
    
    if (mappedItems.unmapped.length > 0) {
      console.warn(`[Shopify Order Import] ${mappedItems.unmapped.length} unmapped items in order ${shopifyOrder.name}`);
    }

    if (mappedItems.mapped.length === 0) {
      throw new Error("No line items could be mapped to Flowp products");
    }

    // Get next order number
    const [maxOrderResult] = await db
      .select({ maxNum: sql<number>`COALESCE(MAX(order_number), 0)` })
      .from(orders)
      .where(eq(orders.tenantId, tenantId));
    const orderNumber = (maxOrderResult?.maxNum || 0) + 1;

    // Calculate totals from mapped items
    const subtotal = mappedItems.mapped.reduce(
      (sum, item) => sum + parseFloat(item.unitPrice) * item.quantity, 
      0
    );
    const taxAmount = parseFloat(shopifyOrder.total_tax) || 0;
    const discountAmount = parseFloat(shopifyOrder.total_discounts) || 0;
    const total = subtotal + taxAmount - discountAmount;

    // Create Flowp order
    const [newOrder] = await db.insert(orders).values({
      tenantId,
      userId: await getSystemUserId(tenantId),
      customerId,
      orderNumber,
      status: "completed",
      subtotal: subtotal.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      total: total.toFixed(2),
      notes: `Shopify order ${shopifyOrder.name}`,
      channel: "shopify",
      externalOrderId: shopifyOrderId,
      completedAt: new Date(),
    }).returning();

    // Create order items
    for (const item of mappedItems.mapped) {
      await db.insert(orderItems).values({
        orderId: newOrder.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        notes: item.notes,
      });

      // Decrease inventory
      const product = await db.query.products.findFirst({
        where: eq(products.id, item.productId),
      });

      if (product?.trackInventory) {
        await db.insert(stockMovements).values({
          tenantId,
          productId: item.productId,
          type: "sale",
          quantity: -item.quantity,
          referenceId: newOrder.id,
          notes: `Shopify order ${shopifyOrder.name}`,
        });
      }
    }

    // Create payment record
    const paymentMethod = mapPaymentMethod(shopifyOrder.payment_gateway_names);
    await db.insert(payments).values({
      orderId: newOrder.id,
      method: paymentMethod,
      amount: total.toFixed(2),
      reference: `Shopify: ${shopifyOrder.payment_gateway_names.join(", ")}`,
    });

    // Update shopify order record
    await db.update(shopifyOrders)
      .set({
        status: "completed",
        flowpOrderId: newOrder.id,
        processedAt: new Date(),
      })
      .where(eq(shopifyOrders.id, shopifyOrderRecord.id));

    // Queue DIAN document if enabled
    if (integration.generateDianDocuments) {
      try {
        await queueDocument({
          tenantId,
          kind: "POS",
          sourceType: "sale",
          sourceId: newOrder.id,
        });
        console.log(`[Shopify Order Import] DIAN document queued for order ${newOrder.id}`);
      } catch (error) {
        console.error(`[Shopify Order Import] Failed to queue DIAN document:`, error);
      }
    }

    console.log(`[Shopify Order Import] Successfully imported order ${shopifyOrder.name} as ${newOrder.id}`);

    return {
      success: true,
      message: `Order ${shopifyOrder.name} imported successfully`,
      flowpOrderId: newOrder.id,
      shopifyOrderRecordId: shopifyOrderRecord.id,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Shopify Order Import] Failed to import order ${shopifyOrder.name}:`, error);

    // Update status to failed
    await db.update(shopifyOrders)
      .set({
        status: "failed",
        errorMessage,
        retryCount: (shopifyOrderRecord?.retryCount || 0) + 1,
      })
      .where(eq(shopifyOrders.id, shopifyOrderRecord!.id));

    return {
      success: false,
      message: errorMessage,
      shopifyOrderRecordId: shopifyOrderRecord?.id,
    };
  }
}

interface MappedLineItem {
  productId: string;
  quantity: number;
  unitPrice: string;
  notes?: string;
}

interface LineItemMappingResult {
  mapped: MappedLineItem[];
  unmapped: ShopifyLineItem[];
}

async function mapLineItems(
  tenantId: string,
  lineItems: ShopifyLineItem[]
): Promise<LineItemMappingResult> {
  const mapped: MappedLineItem[] = [];
  const unmapped: ShopifyLineItem[] = [];

  for (const item of lineItems) {
    // Try to find mapping by variant ID
    let mapping = null;
    
    if (item.variant_id) {
      mapping = await db.query.shopifyProductMap.findFirst({
        where: and(
          eq(shopifyProductMap.tenantId, tenantId),
          eq(shopifyProductMap.shopifyVariantId, String(item.variant_id)),
          eq(shopifyProductMap.isActive, true)
        ),
      });
    }

    // Try by SKU if no mapping found
    if (!mapping && item.sku) {
      const productBySku = await db.query.products.findFirst({
        where: and(
          eq(products.tenantId, tenantId),
          eq(products.sku, item.sku),
          eq(products.isActive, true)
        ),
      });

      if (productBySku) {
        mapping = { flowpProductId: productBySku.id };
      }
    }

    if (mapping?.flowpProductId) {
      mapped.push({
        productId: mapping.flowpProductId,
        quantity: item.quantity,
        unitPrice: item.price,
        notes: item.variant_title || undefined,
      });
    } else {
      unmapped.push(item);
    }
  }

  return { mapped, unmapped };
}

async function findOrCreateCustomer(
  tenantId: string,
  shopifyOrder: ShopifyOrder
): Promise<string | null> {
  const email = shopifyOrder.email || shopifyOrder.customer?.email;
  const phone = shopifyOrder.phone || shopifyOrder.customer?.phone;

  if (!email && !phone) return null;

  // Try to find existing customer
  if (email) {
    const existing = await db.query.customers.findFirst({
      where: and(
        eq(customers.tenantId, tenantId),
        eq(customers.email, email)
      ),
    });
    if (existing) return existing.id;
  }

  if (phone) {
    const existing = await db.query.customers.findFirst({
      where: and(
        eq(customers.tenantId, tenantId),
        eq(customers.phone, phone)
      ),
    });
    if (existing) return existing.id;
  }

  // Create new customer
  const customer = shopifyOrder.customer;
  const name = customer 
    ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "Shopify Customer"
    : "Shopify Customer";

  const address = shopifyOrder.shipping_address || shopifyOrder.billing_address || customer?.default_address;

  const [newCustomer] = await db.insert(customers).values({
    tenantId,
    name,
    email: email || null,
    phone: phone || null,
    address: address ? `${address.address1 || ""} ${address.address2 || ""}`.trim() : null,
  }).returning();

  return newCustomer.id;
}

async function getSystemUserId(tenantId: string): Promise<string> {
  // Get the first user (owner/admin) for the tenant to use as order creator
  const user = await db.query.users.findFirst({
    where: eq(users.tenantId, tenantId),
    orderBy: (u, { asc }) => [asc(u.createdAt)],
  });

  if (!user) {
    throw new Error(`No user found for tenant ${tenantId}`);
  }

  return user.id;
}

function mapPaymentMethod(gateways: string[]): "cash" | "card" | "split" {
  const gatewayStr = gateways.join(" ").toLowerCase();
  
  if (gatewayStr.includes("cash") || gatewayStr.includes("cod")) {
    return "cash";
  }
  
  return "card";
}

// Manual import for pending orders
export async function importPendingShopifyOrder(
  shopifyOrderRecordId: string
): Promise<OrderImportResult> {
  const record = await db.query.shopifyOrders.findFirst({
    where: eq(shopifyOrders.id, shopifyOrderRecordId),
  });

  if (!record) {
    return { success: false, message: "Shopify order record not found" };
  }

  if (record.status === "completed") {
    return { 
      success: true, 
      message: "Order already imported",
      flowpOrderId: record.flowpOrderId || undefined,
    };
  }

  if (!record.payloadJson) {
    return { success: false, message: "No order payload stored" };
  }

  const integration = await db.query.tenantShopifyIntegrations.findFirst({
    where: eq(tenantShopifyIntegrations.tenantId, record.tenantId),
  });

  if (!integration) {
    return { success: false, message: "Shopify integration not configured" };
  }

  return importShopifyOrder(
    record.tenantId,
    record.payloadJson as ShopifyOrder,
    integration
  );
}
