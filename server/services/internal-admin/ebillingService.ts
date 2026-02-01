import { db } from "../../db";
import { 
  ebillingPackages,
  tenantEbillingSubscriptions,
  tenantEbillingUsage,
  tenantEbillingCredits,
  ebillingAlerts,
  internalAuditLogs,
  matiasDocumentQueue,
  tenants,
} from "@shared/schema";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import type { 
  InsertEbillingPackage, 
  InsertTenantEbillingSubscription,
  InsertEbillingAlert,
} from "@shared/schema";

export async function listPackages() {
  return await db.query.ebillingPackages.findMany({
    orderBy: [desc(ebillingPackages.createdAt)],
  });
}

export async function getActivePackages() {
  return await db.query.ebillingPackages.findMany({
    where: eq(ebillingPackages.isActive, true),
    orderBy: [desc(ebillingPackages.createdAt)],
  });
}

export async function createPackage(data: InsertEbillingPackage) {
  const [pkg] = await db.insert(ebillingPackages).values(data).returning();
  return pkg;
}

export async function updatePackage(id: string, data: Partial<InsertEbillingPackage>) {
  const [pkg] = await db
    .update(ebillingPackages)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(ebillingPackages.id, id))
    .returning();
  return pkg;
}

export async function deactivatePackage(id: string) {
  return await updatePackage(id, { isActive: false });
}

export async function getTenantSubscription(tenantId: string) {
  return await db.query.tenantEbillingSubscriptions.findFirst({
    where: eq(tenantEbillingSubscriptions.tenantId, tenantId),
    with: {
    },
  });
}

export async function assignPackageToTenant(params: {
  tenantId: string;
  packageId: string;
  overagePolicy?: "block" | "allow_and_charge" | "allow_and_mark_overage";
  overagePricePerDocUsdCents?: number;
  actorInternalUserId: string;
}) {
  const pkg = await db.query.ebillingPackages.findFirst({
    where: eq(ebillingPackages.id, params.packageId),
  });

  if (!pkg) throw new Error("Package not found");

  const now = new Date();
  const cycleEnd = new Date(now);
  if (pkg.billingCycle === "monthly") {
    cycleEnd.setMonth(cycleEnd.getMonth() + 1);
  } else {
    cycleEnd.setFullYear(cycleEnd.getFullYear() + 1);
  }

  const existingSub = await getTenantSubscription(params.tenantId);
  
  let subscription;
  if (existingSub) {
    [subscription] = await db
      .update(tenantEbillingSubscriptions)
      .set({
        packageId: params.packageId,
        status: "active",
        cycleStart: now,
        cycleEnd,
        overagePolicy: params.overagePolicy || "block",
        overagePricePerDocUsdCents: params.overagePricePerDocUsdCents,
        documentsIncludedSnapshot: pkg.includedDocuments,
        updatedAt: now,
      })
      .where(eq(tenantEbillingSubscriptions.id, existingSub.id))
      .returning();

    await db.insert(internalAuditLogs).values({
      actorInternalUserId: params.actorInternalUserId,
      actionType: "PACKAGE_CHANGE",
      tenantId: params.tenantId,
      entityType: "subscription",
      entityId: subscription.id,
      metadata: { oldPackageId: existingSub.packageId, newPackageId: params.packageId },
    });
  } else {
    [subscription] = await db.insert(tenantEbillingSubscriptions).values({
      tenantId: params.tenantId,
      packageId: params.packageId,
      status: "active",
      cycleStart: now,
      cycleEnd,
      overagePolicy: params.overagePolicy || "block",
      overagePricePerDocUsdCents: params.overagePricePerDocUsdCents,
      documentsIncludedSnapshot: pkg.includedDocuments,
    }).returning();

    await db.insert(internalAuditLogs).values({
      actorInternalUserId: params.actorInternalUserId,
      actionType: "PACKAGE_ASSIGN",
      tenantId: params.tenantId,
      entityType: "subscription",
      entityId: subscription.id,
      metadata: { packageId: params.packageId },
    });
  }

  await db.insert(tenantEbillingUsage).values({
    tenantId: params.tenantId,
    subscriptionId: subscription.id,
    periodStart: now,
    periodEnd: cycleEnd,
    usedPos: 0,
    usedInvoice: 0,
    usedNotes: 0,
    usedSupportDocs: 0,
    usedTotal: 0,
    remainingTotal: pkg.includedDocuments,
  });

  return subscription;
}

export async function getTenantUsage(tenantId: string, periodStart?: Date) {
  if (periodStart) {
    return await db.query.tenantEbillingUsage.findFirst({
      where: and(
        eq(tenantEbillingUsage.tenantId, tenantId),
        eq(tenantEbillingUsage.periodStart, periodStart),
      ),
    });
  }
  
  return await db.query.tenantEbillingUsage.findFirst({
    where: eq(tenantEbillingUsage.tenantId, tenantId),
    orderBy: [desc(tenantEbillingUsage.periodStart)],
  });
}

export async function applyCredit(params: {
  tenantId: string;
  deltaDocuments: number;
  reason: string;
  actorInternalUserId: string;
}) {
  const subscription = await getTenantSubscription(params.tenantId);
  if (!subscription) throw new Error("No active subscription");

  const [credit] = await db.insert(tenantEbillingCredits).values({
    tenantId: params.tenantId,
    subscriptionId: subscription.id,
    deltaDocuments: params.deltaDocuments,
    reason: params.reason,
    createdByInternalUserId: params.actorInternalUserId,
  }).returning();

  const usage = await getTenantUsage(params.tenantId);
  if (usage) {
    await db
      .update(tenantEbillingUsage)
      .set({
        remainingTotal: (usage.remainingTotal || 0) + params.deltaDocuments,
        updatedAt: new Date(),
      })
      .where(eq(tenantEbillingUsage.id, usage.id));
  }

  await db.insert(internalAuditLogs).values({
    actorInternalUserId: params.actorInternalUserId,
    actionType: "CREDIT_ADJUST",
    tenantId: params.tenantId,
    entityType: "credit",
    entityId: credit.id,
    metadata: { deltaDocuments: params.deltaDocuments, reason: params.reason },
  });

  return credit;
}

export async function incrementUsage(tenantId: string, kind: string) {
  const usage = await getTenantUsage(tenantId);
  if (!usage) return;

  const updates: Record<string, any> = { updatedAt: new Date() };
  
  if (kind === "POS") {
    updates.usedPos = (usage.usedPos || 0) + 1;
  } else if (kind === "INVOICE") {
    updates.usedInvoice = (usage.usedInvoice || 0) + 1;
  } else if (kind === "POS_CREDIT_NOTE" || kind === "POS_DEBIT_NOTE") {
    updates.usedNotes = (usage.usedNotes || 0) + 1;
  } else if (kind === "SUPPORT_DOC" || kind === "SUPPORT_ADJUSTMENT") {
    updates.usedSupportDocs = (usage.usedSupportDocs || 0) + 1;
  }

  const newUsedTotal = (usage.usedTotal || 0) + 1;
  updates.usedTotal = newUsedTotal;
  updates.remainingTotal = Math.max(0, (usage.remainingTotal || 0) - 1);

  await db
    .update(tenantEbillingUsage)
    .set(updates)
    .where(eq(tenantEbillingUsage.id, usage.id));

  const subscription = await getTenantSubscription(tenantId);
  if (subscription) {
    const included = subscription.documentsIncludedSnapshot || 0;
    const percentUsed = included > 0 ? (newUsedTotal / included) * 100 : 100;

    if (percentUsed >= 70 && percentUsed < 90) {
      await createAlert(tenantId, "THRESHOLD_70", "warning", `Usage at ${percentUsed.toFixed(0)}% of included documents`);
    } else if (percentUsed >= 90 && percentUsed < 100) {
      await createAlert(tenantId, "THRESHOLD_90", "warning", `Usage at ${percentUsed.toFixed(0)}% of included documents`);
    } else if (percentUsed >= 100) {
      await createAlert(tenantId, "LIMIT_REACHED", "critical", "Document limit reached");
    }
  }
}

export async function createAlert(
  tenantId: string, 
  type: "THRESHOLD_70" | "THRESHOLD_90" | "LIMIT_REACHED" | "AUTH_FAIL" | "HIGH_REJECT_RATE",
  severity: "info" | "warning" | "critical",
  message: string
) {
  const existing = await db.query.ebillingAlerts.findFirst({
    where: and(
      eq(ebillingAlerts.tenantId, tenantId),
      eq(ebillingAlerts.type, type),
      eq(ebillingAlerts.isAcknowledged, false),
    ),
  });

  if (existing) return existing;

  const [alert] = await db.insert(ebillingAlerts).values({
    tenantId,
    type,
    severity,
    message,
  }).returning();

  return alert;
}

export async function listAlerts(params: {
  tenantId?: string;
  type?: string;
  isAcknowledged?: boolean;
  limit?: number;
}) {
  const conditions = [];
  
  if (params.tenantId) {
    conditions.push(eq(ebillingAlerts.tenantId, params.tenantId));
  }
  if (params.type) {
    conditions.push(eq(ebillingAlerts.type, params.type as any));
  }
  if (params.isAcknowledged !== undefined) {
    conditions.push(eq(ebillingAlerts.isAcknowledged, params.isAcknowledged));
  }

  return await db.query.ebillingAlerts.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: [desc(ebillingAlerts.createdAt)],
    limit: params.limit || 100,
  });
}

export async function acknowledgeAlert(alertId: string, actorInternalUserId: string) {
  const [alert] = await db
    .update(ebillingAlerts)
    .set({
      isAcknowledged: true,
      acknowledgedByInternalUserId: actorInternalUserId,
      acknowledgedAt: new Date(),
    })
    .where(eq(ebillingAlerts.id, alertId))
    .returning();

  return alert;
}

export async function listAuditLogs(params: {
  tenantId?: string;
  actionType?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}) {
  const conditions = [];
  
  if (params.tenantId) {
    conditions.push(eq(internalAuditLogs.tenantId, params.tenantId));
  }
  if (params.actionType) {
    conditions.push(eq(internalAuditLogs.actionType, params.actionType as any));
  }
  if (params.from) {
    conditions.push(gte(internalAuditLogs.createdAt, params.from));
  }
  if (params.to) {
    conditions.push(lte(internalAuditLogs.createdAt, params.to));
  }

  return await db.query.internalAuditLogs.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: [desc(internalAuditLogs.createdAt)],
    limit: params.limit || 100,
  });
}
