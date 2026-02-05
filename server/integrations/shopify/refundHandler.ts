import { db } from "../../db";
import { 
  orders,
  returns,
  returnItems,
  orderItems,
  stockMovements,
  shopifyOrders,
  tenantShopifyIntegrations,
  products,
  users,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import type { ShopifyRefund, ShopifyRefundLineItem } from "./types";
import { queueCreditNote } from "../matias/documentQueue";

export interface RefundResult {
  success: boolean;
  message: string;
  returnId?: string;
}

export async function processShopifyRefund(
  tenantId: string,
  refund: ShopifyRefund,
  integration: typeof tenantShopifyIntegrations.$inferSelect
): Promise<RefundResult> {
  const shopifyOrderId = String(refund.order_id);
  const shopifyRefundId = String(refund.id);

  console.log(`[Shopify Refund] Processing refund ${shopifyRefundId} for order ${shopifyOrderId}`);

  // Find the Shopify order record
  const shopifyOrderRecord = await db.query.shopifyOrders.findFirst({
    where: and(
      eq(shopifyOrders.tenantId, tenantId),
      eq(shopifyOrders.shopifyOrderId, shopifyOrderId)
    ),
  });

  if (!shopifyOrderRecord || !shopifyOrderRecord.flowpOrderId) {
    console.error(`[Shopify Refund] Original order not found: ${shopifyOrderId}`);
    return { success: false, message: "Original order not found in Flowp" };
  }

  // Get the Flowp order
  const flowpOrder = await db.query.orders.findFirst({
    where: eq(orders.id, shopifyOrderRecord.flowpOrderId),
  });

  if (!flowpOrder) {
    return { success: false, message: "Flowp order not found" };
  }

  // Check if refund already processed
  const existingReturn = await db.query.returns.findFirst({
    where: and(
      eq(returns.tenantId, tenantId),
      eq(returns.orderId, flowpOrder.id),
      eq(returns.reasonNotes, `Shopify refund: ${shopifyRefundId}`)
    ),
  });

  if (existingReturn) {
    console.log(`[Shopify Refund] Refund already processed: ${shopifyRefundId}`);
    return { success: true, message: "Refund already processed", returnId: existingReturn.id };
  }

  try {
    // Get next return number
    const [maxReturnResult] = await db
      .select({ maxNum: sql<number>`COALESCE(MAX(return_number), 0)` })
      .from(returns)
      .where(eq(returns.tenantId, tenantId));
    const returnNumber = (maxReturnResult?.maxNum || 0) + 1;

    // Calculate refund totals
    let subtotal = 0;
    let taxAmount = 0;

    for (const refundLine of refund.refund_line_items) {
      subtotal += refundLine.subtotal;
      taxAmount += refundLine.total_tax;
    }

    // Add order adjustments (shipping refunds, etc.)
    for (const adjustment of refund.order_adjustments) {
      subtotal += parseFloat(adjustment.amount);
      taxAmount += parseFloat(adjustment.tax_amount);
    }

    const total = subtotal + taxAmount;

    // Get the first user for this tenant
    const user = await db.query.users.findFirst({
      where: eq(users.tenantId, tenantId),
    });

    if (!user) {
      throw new Error("No user found for tenant");
    }

    // Create the return record
    const [newReturn] = await db.insert(returns).values({
      tenantId,
      orderId: flowpOrder.id,
      returnNumber,
      userId: user.id,
      customerId: flowpOrder.customerId,
      status: "completed",
      reason: "customer_changed_mind",
      reasonNotes: `Shopify refund: ${shopifyRefundId}`,
      subtotal: subtotal.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      total: total.toFixed(2),
      refundMethod: "card",
      restockItems: refund.restock,
      correctionConcept: "devolucion",
      originalCufe: flowpOrder.cufe,
      originalNumber: flowpOrder.documentNumber ? 
        `${flowpOrder.prefix || ""}${flowpOrder.documentNumber}` : 
        String(flowpOrder.orderNumber),
      originalDate: flowpOrder.createdAt?.toISOString().split("T")[0],
      creditNoteStatus: "pending",
    }).returning();

    // Create return items
    for (const refundLine of refund.refund_line_items) {
      const originalLineItem = refundLine.line_item;
      
      // Find matching order item
      const flowpOrderItems = await db.query.orderItems.findMany({
        where: eq(orderItems.orderId, flowpOrder.id),
      });

      // Try to match by product
      let matchingOrderItem = flowpOrderItems[0];
      
      if (originalLineItem.sku) {
        const product = await db.query.products.findFirst({
          where: and(
            eq(products.tenantId, tenantId),
            eq(products.sku, originalLineItem.sku)
          ),
        });

        if (product) {
          const found = flowpOrderItems.find(oi => oi.productId === product.id);
          if (found) matchingOrderItem = found;
        }
      }

      if (matchingOrderItem) {
        await db.insert(returnItems).values({
          returnId: newReturn.id,
          orderItemId: matchingOrderItem.id,
          productId: matchingOrderItem.productId,
          quantity: refundLine.quantity,
          unitPrice: matchingOrderItem.unitPrice,
          taxAmount: (refundLine.total_tax / refundLine.quantity).toFixed(2),
        });

        // Restock if enabled
        if (refund.restock) {
          const product = await db.query.products.findFirst({
            where: eq(products.id, matchingOrderItem.productId),
          });

          if (product?.trackInventory) {
            await db.insert(stockMovements).values({
              tenantId,
              productId: matchingOrderItem.productId,
              type: "return",
              quantity: refundLine.quantity,
              referenceId: newReturn.id,
              notes: `Shopify refund ${shopifyRefundId}`,
            });
          }
        }
      }
    }

    // Mark order as having returns
    await db.update(orders)
      .set({ hasReturns: true })
      .where(eq(orders.id, flowpOrder.id));

    // Queue credit note if DIAN is enabled and original order had CUFE
    if (integration.generateDianDocuments && flowpOrder.cufe) {
      try {
        const correctionConceptMap: Record<string, number> = {
          devolucion: 1,
          anulacion: 2,
          descuento: 3,
          ajuste_precio: 4,
          otros: 5,
        };
        
        await queueCreditNote({
          tenantId,
          returnId: newReturn.id,
          orderId: flowpOrder.id,
          refundAmount: total,
          refundReason: `Shopify refund: ${shopifyRefundId}`,
          originalCufe: flowpOrder.cufe,
          originalNumber: flowpOrder.documentNumber 
            ? `${flowpOrder.prefix || ""}${flowpOrder.documentNumber}` 
            : String(flowpOrder.orderNumber),
          originalDate: flowpOrder.createdAt?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0],
          correctionConceptId: correctionConceptMap.devolucion,
        });
        console.log(`[Shopify Refund] Credit note queued for return ${newReturn.id}`);
      } catch (error) {
        console.error(`[Shopify Refund] Failed to queue credit note:`, error);
      }
    }

    console.log(`[Shopify Refund] Successfully processed refund ${shopifyRefundId} as return ${newReturn.id}`);

    return {
      success: true,
      message: `Refund processed successfully`,
      returnId: newReturn.id,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Shopify Refund] Failed to process refund ${shopifyRefundId}:`, error);

    return {
      success: false,
      message: errorMessage,
    };
  }
}
