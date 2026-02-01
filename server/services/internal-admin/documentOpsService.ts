import { db } from "../../db";
import { 
  matiasDocumentQueue,
  matiasDocumentFiles,
  internalAuditLogs,
} from "@shared/schema";
import { eq, and, desc, gte, lte, like, or, sql } from "drizzle-orm";
import { getMatiasClient } from "../../integrations/matias/matiasClient";

export async function listDocuments(params: {
  tenantId?: string;
  kind?: string;
  status?: string;
  from?: Date;
  to?: Date;
  query?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  
  if (params.tenantId) {
    conditions.push(eq(matiasDocumentQueue.tenantId, params.tenantId));
  }
  if (params.kind) {
    conditions.push(eq(matiasDocumentQueue.kind, params.kind as any));
  }
  if (params.status) {
    conditions.push(eq(matiasDocumentQueue.status, params.status as any));
  }
  if (params.from) {
    conditions.push(gte(matiasDocumentQueue.createdAt, params.from));
  }
  if (params.to) {
    conditions.push(lte(matiasDocumentQueue.createdAt, params.to));
  }
  if (params.query) {
    conditions.push(
      or(
        like(matiasDocumentQueue.trackId, `%${params.query}%`),
        like(matiasDocumentQueue.orderNumber, `%${params.query}%`),
        sql`${matiasDocumentQueue.documentNumber}::text LIKE ${`%${params.query}%`}`,
      )
    );
  }

  const [documents, countResult] = await Promise.all([
    db.query.matiasDocumentQueue.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(matiasDocumentQueue.createdAt)],
      limit: params.limit || 50,
      offset: params.offset || 0,
    }),
    db
      .select({ count: sql<number>`count(*)` })
      .from(matiasDocumentQueue)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  return {
    documents,
    total: Number(countResult[0]?.count || 0),
  };
}

export async function getDocumentDetails(documentId: string) {
  const doc = await db.query.matiasDocumentQueue.findFirst({
    where: eq(matiasDocumentQueue.id, documentId),
  });

  if (!doc) return null;

  const files = await db.query.matiasDocumentFiles.findMany({
    where: eq(matiasDocumentFiles.documentId, documentId),
  });

  return { ...doc, files };
}

export async function retryDocument(documentId: string, actorInternalUserId: string) {
  const doc = await db.query.matiasDocumentQueue.findFirst({
    where: eq(matiasDocumentQueue.id, documentId),
  });

  if (!doc) throw new Error("Document not found");

  if (doc.status === "ACCEPTED") {
    throw new Error("Cannot retry an accepted document");
  }

  const [updated] = await db
    .update(matiasDocumentQueue)
    .set({
      status: "RETRY",
      retryCount: (doc.retryCount || 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(matiasDocumentQueue.id, documentId))
    .returning();

  await db.insert(internalAuditLogs).values({
    actorInternalUserId,
    actionType: "DOC_RETRY",
    tenantId: doc.tenantId,
    entityType: "document",
    entityId: documentId,
    metadata: { 
      kind: doc.kind, 
      previousStatus: doc.status,
      retryCount: updated.retryCount,
    },
  });

  return updated;
}

export async function downloadDocumentPdf(documentId: string) {
  const doc = await db.query.matiasDocumentQueue.findFirst({
    where: eq(matiasDocumentQueue.id, documentId),
  });

  if (!doc) throw new Error("Document not found");
  if (!doc.trackId) throw new Error("Document has no track ID");

  const pdfFile = await db.query.matiasDocumentFiles.findFirst({
    where: and(
      eq(matiasDocumentFiles.documentId, documentId),
      eq(matiasDocumentFiles.kind, "pdf"),
    ),
  });

  if (pdfFile?.base64Data) {
    return {
      data: Buffer.from(pdfFile.base64Data, "base64"),
      mimeType: pdfFile.mimeType || "application/pdf",
    };
  }

  const client = await getMatiasClient(doc.tenantId);
  if (!client) throw new Error("MATIAS client not available");

  const pdfData = await client.downloadPdf(doc.trackId);
  if (!pdfData) throw new Error("Failed to download PDF");

  await db.insert(matiasDocumentFiles).values({
    documentId,
    kind: "pdf",
    base64Data: pdfData.toString("base64"),
    mimeType: "application/pdf",
  });

  return {
    data: pdfData,
    mimeType: "application/pdf",
  };
}

export async function downloadDocumentAttached(documentId: string) {
  const doc = await db.query.matiasDocumentQueue.findFirst({
    where: eq(matiasDocumentQueue.id, documentId),
  });

  if (!doc) throw new Error("Document not found");
  if (!doc.trackId) throw new Error("Document has no track ID");

  const attachedFile = await db.query.matiasDocumentFiles.findFirst({
    where: and(
      eq(matiasDocumentFiles.documentId, documentId),
      eq(matiasDocumentFiles.kind, "attached_zip"),
    ),
  });

  if (attachedFile?.base64Data) {
    return {
      data: Buffer.from(attachedFile.base64Data, "base64"),
      mimeType: attachedFile.mimeType || "application/zip",
    };
  }

  const client = await getMatiasClient(doc.tenantId);
  if (!client) throw new Error("MATIAS client not available");

  const attachedData = await client.downloadAttached(doc.trackId);
  if (!attachedData) throw new Error("Failed to download attached files");

  await db.insert(matiasDocumentFiles).values({
    documentId,
    kind: "attached_zip",
    base64Data: attachedData.toString("base64"),
    mimeType: "application/zip",
  });

  return {
    data: attachedData,
    mimeType: "application/zip",
  };
}

export async function getDocumentStats(tenantId?: string) {
  const conditions = tenantId ? [eq(matiasDocumentQueue.tenantId, tenantId)] : [];
  
  const stats = await db
    .select({
      status: matiasDocumentQueue.status,
      count: sql<number>`count(*)`,
    })
    .from(matiasDocumentQueue)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(matiasDocumentQueue.status);

  const kindStats = await db
    .select({
      kind: matiasDocumentQueue.kind,
      count: sql<number>`count(*)`,
    })
    .from(matiasDocumentQueue)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(matiasDocumentQueue.kind);

  return {
    byStatus: stats.reduce((acc, s) => ({ ...acc, [s.status]: Number(s.count) }), {}),
    byKind: kindStats.reduce((acc, s) => ({ ...acc, [s.kind]: Number(s.count) }), {}),
  };
}
