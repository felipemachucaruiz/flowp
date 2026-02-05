import { db } from "../../db";
import { 
  tenantShopifyIntegrations, 
  shopifyWebhookLogs, 
  shopifyOrders,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { verifyWebhookSignature } from "./shopifyClient";
import { importShopifyOrder } from "./orderImport";
import { processShopifyRefund } from "./refundHandler";
import type { ShopifyOrder, ShopifyRefund, ShopifyWebhookTopic } from "./types";

interface WebhookHeaders {
  "x-shopify-hmac-sha256"?: string;
  "x-shopify-topic"?: string;
  "x-shopify-shop-domain"?: string;
  "x-shopify-webhook-id"?: string;
  "x-shopify-event-id"?: string;
  "x-shopify-api-version"?: string;
}

export interface WebhookResult {
  success: boolean;
  message: string;
  logId?: string;
  orderId?: string;
}

export async function handleShopifyWebhook(
  rawBody: string,
  headers: WebhookHeaders
): Promise<WebhookResult> {
  const topic = headers["x-shopify-topic"] as ShopifyWebhookTopic;
  const shopDomain = headers["x-shopify-shop-domain"];
  const hmacHeader = headers["x-shopify-hmac-sha256"];
  const eventId = headers["x-shopify-event-id"];
  const webhookId = headers["x-shopify-webhook-id"];

  if (!topic || !shopDomain || !hmacHeader) {
    return { success: false, message: "Missing required Shopify headers" };
  }

  // Find tenant by shop domain
  const integration = await db.query.tenantShopifyIntegrations.findFirst({
    where: eq(tenantShopifyIntegrations.shopDomain, shopDomain),
  });

  if (!integration) {
    console.log(`[Shopify Webhook] No integration found for shop: ${shopDomain}`);
    return { success: false, message: `No integration found for shop: ${shopDomain}` };
  }

  if (!integration.isActive) {
    console.log(`[Shopify Webhook] Integration disabled for tenant: ${integration.tenantId}`);
    return { success: false, message: "Integration disabled" };
  }

  const tenantId = integration.tenantId;

  // Verify HMAC signature
  let signatureValid = false;
  if (integration.webhookSecret) {
    signatureValid = verifyWebhookSignature(rawBody, hmacHeader, integration.webhookSecret);
    if (!signatureValid) {
      console.error(`[Shopify Webhook] Invalid signature for tenant: ${tenantId}`);
    }
  } else {
    console.warn(`[Shopify Webhook] No webhook secret configured for tenant: ${tenantId}`);
  }

  // Parse payload
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    return { success: false, message: "Invalid JSON payload" };
  }

  // Check for duplicate webhook (idempotency) - use eventId first, then webhookId as fallback
  const idempotencyKey = eventId || webhookId;
  if (idempotencyKey) {
    // Check by eventId first
    if (eventId) {
      const existingByEventId = await db.query.shopifyWebhookLogs.findFirst({
        where: and(
          eq(shopifyWebhookLogs.tenantId, tenantId),
          eq(shopifyWebhookLogs.shopifyEventId, eventId)
        ),
      });

      if (existingByEventId && existingByEventId.processed) {
        console.log(`[Shopify Webhook] Duplicate webhook ignored (eventId): ${eventId}`);
        return { success: true, message: "Webhook already processed (idempotent)", logId: existingByEventId.id };
      }
    }
    
    // Fallback to webhookId if no eventId match
    if (webhookId && !eventId) {
      const existingByWebhookId = await db.query.shopifyWebhookLogs.findFirst({
        where: and(
          eq(shopifyWebhookLogs.tenantId, tenantId),
          eq(shopifyWebhookLogs.shopifyWebhookId, webhookId)
        ),
      });

      if (existingByWebhookId && existingByWebhookId.processed) {
        console.log(`[Shopify Webhook] Duplicate webhook ignored (webhookId): ${webhookId}`);
        return { success: true, message: "Webhook already processed (idempotent)", logId: existingByWebhookId.id };
      }
    }
  }

  // Log the webhook
  const [logEntry] = await db.insert(shopifyWebhookLogs).values({
    tenantId,
    topic,
    shopifyEventId: eventId || null,
    shopifyWebhookId: webhookId || null,
    shopDomain,
    payloadJson: payload,
    signatureValid,
    processed: false,
  }).returning();

  // Update last webhook timestamp
  await db.update(tenantShopifyIntegrations)
    .set({ lastWebhookAt: new Date() })
    .where(eq(tenantShopifyIntegrations.tenantId, tenantId));

  // Process based on topic
  try {
    let result: WebhookResult;

    switch (topic) {
      case "orders/create":
      case "orders/paid":
        result = await handleOrderWebhook(tenantId, payload as ShopifyOrder, integration);
        break;

      case "refunds/create":
        result = await handleRefundWebhook(tenantId, payload as ShopifyRefund, integration);
        break;

      default:
        console.log(`[Shopify Webhook] Unhandled topic: ${topic}`);
        result = { success: true, message: `Topic ${topic} acknowledged but not processed` };
    }

    // Mark as processed
    await db.update(shopifyWebhookLogs)
      .set({ 
        processed: true, 
        processedAt: new Date(),
        errorMessage: result.success ? null : result.message,
      })
      .where(eq(shopifyWebhookLogs.id, logEntry.id));

    return { ...result, logId: logEntry.id };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Shopify Webhook] Error processing ${topic}:`, error);

    // Log error
    await db.update(shopifyWebhookLogs)
      .set({ 
        processed: false,
        errorMessage,
      })
      .where(eq(shopifyWebhookLogs.id, logEntry.id));

    // Update error count
    await db.update(tenantShopifyIntegrations)
      .set({ 
        lastError: errorMessage,
        errorCount: (integration.errorCount || 0) + 1,
      })
      .where(eq(tenantShopifyIntegrations.tenantId, tenantId));

    return { success: false, message: errorMessage, logId: logEntry.id };
  }
}

async function handleOrderWebhook(
  tenantId: string,
  order: ShopifyOrder,
  integration: typeof tenantShopifyIntegrations.$inferSelect
): Promise<WebhookResult> {
  const shopifyOrderId = String(order.id);

  // Check for duplicate order
  const existingOrder = await db.query.shopifyOrders.findFirst({
    where: and(
      eq(shopifyOrders.tenantId, tenantId),
      eq(shopifyOrders.shopifyOrderId, shopifyOrderId)
    ),
  });

  if (existingOrder && existingOrder.status === "completed") {
    console.log(`[Shopify Webhook] Order already imported: ${shopifyOrderId}`);
    return { 
      success: true, 
      message: "Order already imported",
      orderId: existingOrder.flowpOrderId || undefined
    };
  }

  // Skip if auto-import is disabled
  if (!integration.autoImportOrders) {
    console.log(`[Shopify Webhook] Auto-import disabled, skipping order: ${shopifyOrderId}`);
    
    // Still log the order for manual processing later
    await db.insert(shopifyOrders).values({
      tenantId,
      shopifyOrderId,
      shopifyOrderNumber: String(order.order_number),
      shopifyOrderName: order.name,
      status: "pending",
      payloadJson: order,
      subtotalPrice: order.subtotal_price,
      totalTax: order.total_tax,
      totalDiscounts: order.total_discounts,
      totalPrice: order.total_price,
      currency: order.currency,
      customerEmail: order.email || order.customer?.email,
      customerPhone: order.phone || order.customer?.phone,
    });

    return { success: true, message: "Order logged for manual import" };
  }

  // Import the order
  const result = await importShopifyOrder(tenantId, order, integration);
  
  return {
    success: result.success,
    message: result.message,
    orderId: result.flowpOrderId,
  };
}

async function handleRefundWebhook(
  tenantId: string,
  refund: ShopifyRefund,
  integration: typeof tenantShopifyIntegrations.$inferSelect
): Promise<WebhookResult> {
  // Process the refund
  const result = await processShopifyRefund(tenantId, refund, integration);
  
  return {
    success: result.success,
    message: result.message,
  };
}

// Retry failed webhooks
export async function retryFailedWebhooks(tenantId: string): Promise<{
  processed: number;
  failed: number;
}> {
  const failedLogs = await db.query.shopifyWebhookLogs.findMany({
    where: and(
      eq(shopifyWebhookLogs.tenantId, tenantId),
      eq(shopifyWebhookLogs.processed, false)
    ),
    limit: 50,
    orderBy: (logs, { asc }) => [asc(logs.createdAt)],
  });

  let processed = 0;
  let failed = 0;

  for (const log of failedLogs) {
    if (!log.payloadJson) continue;

    try {
      const result = await handleShopifyWebhook(
        JSON.stringify(log.payloadJson),
        {
          "x-shopify-topic": log.topic as ShopifyWebhookTopic,
          "x-shopify-shop-domain": log.shopDomain || undefined,
          "x-shopify-hmac-sha256": "retry-skip-verify",
          "x-shopify-event-id": log.shopifyEventId || undefined,
        }
      );

      if (result.success) {
        processed++;
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
    }
  }

  return { processed, failed };
}
