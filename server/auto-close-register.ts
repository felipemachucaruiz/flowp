import { db } from "./db";
import { tenants, registerSessions, orders, payments, cashMovements } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { storage } from "./storage";

export async function autoCloseExpiredSessions() {
  try {
    const tenantsWithAutoClose = await db.select({
      id: tenants.id,
      storeCloseTime: tenants.storeCloseTime,
    }).from(tenants).where(
      and(
        eq(tenants.storeHoursEnabled, true),
        eq(tenants.autoCloseRegister, true),
      )
    );

    if (tenantsWithAutoClose.length === 0) return;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const tenant of tenantsWithAutoClose) {
      if (!tenant.storeCloseTime) continue;

      const [closeHour, closeMinute] = tenant.storeCloseTime.split(":").map(Number);
      const closeMinutes = closeHour * 60 + closeMinute;

      if (currentMinutes < closeMinutes || currentMinutes > closeMinutes + 30) continue;

      const openSessions = await db.select()
        .from(registerSessions)
        .where(
          and(
            eq(registerSessions.tenantId, tenant.id),
            eq(registerSessions.status, "open"),
          )
        );

      for (const session of openSessions) {
        try {
          const sessionOrders = await db.select({
            total: orders.total,
            id: orders.id,
          }).from(orders).where(
            and(
              eq(orders.tenantId, tenant.id),
              eq(orders.registerSessionId, session.id),
              eq(orders.status, "completed"),
            )
          );

          let expectedCashSales = 0;
          let expectedCardSales = 0;
          let totalSales = 0;

          for (const order of sessionOrders) {
            totalSales += parseFloat(order.total || "0");
            const orderPayments = await db.select().from(payments).where(eq(payments.orderId, order.id));
            for (const p of orderPayments) {
              const amount = parseFloat(p.amount || "0");
              if (p.method === "cash") {
                expectedCashSales += amount;
              } else {
                expectedCardSales += amount;
              }
            }
          }

          const movementsResult = await db.select({
            type: cashMovements.type,
            total: sql<string>`SUM(${cashMovements.amount})`,
          }).from(cashMovements)
            .where(eq(cashMovements.sessionId, session.id))
            .groupBy(cashMovements.type);

          let movIn = 0, movOut = 0;
          for (const m of movementsResult) {
            if (m.type === "cash_in") movIn = parseFloat(m.total || "0");
            if (m.type === "cash_out") movOut = parseFloat(m.total || "0");
          }

          const openingCashVal = parseFloat(session.openingCash || "0");
          const expectedCash = openingCashVal + expectedCashSales + movIn - movOut;

          await storage.closeRegisterSession(session.id, {
            closedByUserId: session.userId,
            closingCash: String(expectedCash),
            expectedCash: String(expectedCash),
            expectedCard: String(expectedCardSales),
            countedCash: String(expectedCash),
            countedCard: String(expectedCardSales),
            cashVariance: "0",
            cardVariance: "0",
            totalSales: String(totalSales),
            totalOrders: sessionOrders.length,
            cashMovementsIn: String(movIn),
            cashMovementsOut: String(movOut),
            notes: "Auto-closed at store closing time",
          });

          console.log(`[Auto-Close] Closed register session ${session.id} for tenant ${tenant.id}`);
        } catch (err: any) {
          console.error(`[Auto-Close] Error closing session ${session.id}:`, err.message);
        }
      }
    }
  } catch (err: any) {
    console.error("[Auto-Close] Error in auto-close check:", err.message);
  }
}
