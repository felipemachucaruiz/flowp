import { db } from "../../db";
import { 
  matiasDocumentQueue, 
  matiasDocumentFiles,
  electronicDocumentSequences,
  tenantIntegrationsMatias,
} from "@shared/schema";
import { eq, and, sql, lte } from "drizzle-orm";
import { getMatiasClient } from "./matiasClient";
import { buildPosPayload, buildPosCreditNotePayload } from "./payloadBuilders";
import type { MatiasPayload, MatiasNotePayload } from "./types";

export async function getNextDocumentNumber(
  tenantId: string,
  resolutionNumber: string,
  prefix: string,
): Promise<number> {
  return await db.transaction(async (tx) => {
    // Use SELECT ... FOR UPDATE to acquire row-level lock and prevent race conditions
    const sequenceRows = await tx.execute(sql`
      SELECT * FROM electronic_document_sequences
      WHERE tenant_id = ${tenantId}
        AND resolution_number = ${resolutionNumber}
        AND prefix = ${prefix}
      FOR UPDATE
    `);

    const sequence = sequenceRows.rows[0] as {
      id: string;
      current_number: number;
      range_end: number | null;
    } | undefined;

    if (!sequence) {
      const client = await getMatiasClient(tenantId);
      let startNumber = 1;
      
      if (client) {
        const lastDoc = await client.getLastDocument({ resolution: resolutionNumber, prefix });
        if (lastDoc) {
          startNumber = lastDoc.number + 1;
        }
      }

      await tx.insert(electronicDocumentSequences).values({
        tenantId,
        resolutionNumber,
        prefix,
        currentNumber: startNumber,
      });

      return startNumber;
    }

    const nextNumber = sequence.current_number + 1;

    if (sequence.range_end && nextNumber > sequence.range_end) {
      throw new Error(`Document number ${nextNumber} exceeds resolution range (max: ${sequence.range_end})`);
    }

    await tx.execute(sql`
      UPDATE electronic_document_sequences 
      SET current_number = ${nextNumber}, updated_at = NOW()
      WHERE id = ${sequence.id}
    `);

    return nextNumber;
  });
}

export async function queueDocument(params: {
  tenantId: string;
  kind: "POS" | "INVOICE" | "POS_CREDIT_NOTE" | "POS_DEBIT_NOTE" | "SUPPORT_DOC" | "SUPPORT_ADJUSTMENT";
  sourceType: "sale" | "refund" | "purchase" | "adjustment";
  sourceId: string;
  orderNumber?: string;
}): Promise<{ id: string; documentNumber: number } | null> {
  const config = await db.query.tenantIntegrationsMatias.findFirst({
    where: eq(tenantIntegrationsMatias.tenantId, params.tenantId),
  });

  if (!config || !config.isEnabled) {
    console.log("MATIAS not enabled for tenant:", params.tenantId);
    return null;
  }

  const resolutionNumber = config.defaultResolutionNumber || "";
  const prefix = config.defaultPrefix || "";

  if (!resolutionNumber) {
    console.log("No resolution number configured for tenant:", params.tenantId);
    return null;
  }

  try {
    const documentNumber = await getNextDocumentNumber(
      params.tenantId,
      resolutionNumber,
      prefix,
    );

    const [doc] = await db.insert(matiasDocumentQueue).values({
      tenantId: params.tenantId,
      kind: params.kind,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      resolutionNumber,
      prefix,
      documentNumber,
      orderNumber: params.orderNumber,
      status: "PENDING",
    }).returning();

    return { id: doc.id, documentNumber };
  } catch (error: any) {
    console.error("Error queueing document:", error);
    return null;
  }
}

export async function processPendingDocuments(): Promise<void> {
  const pendingDocs = await db.query.matiasDocumentQueue.findMany({
    where: and(
      eq(matiasDocumentQueue.status, "PENDING"),
      lte(matiasDocumentQueue.retryCount, 3),
    ),
    limit: 10,
  });

  for (const doc of pendingDocs) {
    await processDocument(doc.id);
  }

  const retryDocs = await db.query.matiasDocumentQueue.findMany({
    where: and(
      eq(matiasDocumentQueue.status, "RETRY"),
      lte(matiasDocumentQueue.retryCount, 3),
    ),
    limit: 5,
  });

  for (const doc of retryDocs) {
    await processDocument(doc.id);
  }
}

export async function processDocument(documentId: string): Promise<boolean> {
  const doc = await db.query.matiasDocumentQueue.findFirst({
    where: eq(matiasDocumentQueue.id, documentId),
  });

  if (!doc) return false;

  const client = await getMatiasClient(doc.tenantId);
  if (!client) {
    await db.update(matiasDocumentQueue)
      .set({
        status: "FAILED",
        lastErrorMessage: "Could not initialize MATIAS client",
        updatedAt: new Date(),
      })
      .where(eq(matiasDocumentQueue.id, documentId));
    return false;
  }

  try {
    let payload: MatiasPayload | MatiasNotePayload | null = null;

    switch (doc.kind) {
      case "POS":
        payload = await buildPosPayload(
          doc.sourceId,
          doc.resolutionNumber!,
          doc.prefix!,
          doc.documentNumber!,
        );
        break;
      case "POS_CREDIT_NOTE":
        break;
      case "POS_DEBIT_NOTE":
        break;
      case "INVOICE":
        break;
      case "SUPPORT_DOC":
        break;
      case "SUPPORT_ADJUSTMENT":
        break;
    }

    if (!payload) {
      await db.update(matiasDocumentQueue)
        .set({
          status: "FAILED",
          lastErrorMessage: "Could not build payload",
          updatedAt: new Date(),
        })
        .where(eq(matiasDocumentQueue.id, documentId));
      return false;
    }

    await db.update(matiasDocumentQueue)
      .set({
        status: "SENT",
        requestJson: payload,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(matiasDocumentQueue.id, documentId));

    let response;
    switch (doc.kind) {
      case "POS":
      case "INVOICE":
        response = await client.submitPos(payload as MatiasPayload);
        break;
      case "POS_CREDIT_NOTE":
        response = await client.submitCreditNote(payload as MatiasNotePayload);
        break;
      case "POS_DEBIT_NOTE":
        response = await client.submitDebitNote(payload as MatiasNotePayload);
        break;
      default:
        response = { success: false, message: "Unsupported document type" };
    }

    if (response.success && response.data) {
      await db.update(matiasDocumentQueue)
        .set({
          status: "ACCEPTED",
          trackId: response.data.track_id,
          cufe: response.data.cufe || response.data.uuid,
          qrCode: response.data.qr_code,
          responseJson: response,
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(matiasDocumentQueue.id, documentId));

      if (response.data.track_id) {
        const pdfBuffer = await client.downloadPdf(response.data.track_id);
        if (pdfBuffer) {
          await db.insert(matiasDocumentFiles).values({
            documentId: documentId,
            kind: "pdf",
            base64Data: pdfBuffer.toString("base64"),
            mimeType: "application/pdf",
          });
        }
      }

      return true;
    } else {
      const retryCount = (doc.retryCount || 0) + 1;
      const shouldRetry = retryCount < (doc.maxRetries || 3);

      await db.update(matiasDocumentQueue)
        .set({
          status: shouldRetry ? "RETRY" : "REJECTED",
          retryCount,
          lastErrorMessage: response.message || JSON.stringify(response.errors),
          responseJson: response,
          updatedAt: new Date(),
        })
        .where(eq(matiasDocumentQueue.id, documentId));

      return false;
    }
  } catch (error: any) {
    const retryCount = (doc.retryCount || 0) + 1;
    const shouldRetry = retryCount < (doc.maxRetries || 3);

    await db.update(matiasDocumentQueue)
      .set({
        status: shouldRetry ? "RETRY" : "FAILED",
        retryCount,
        lastErrorMessage: error.message,
        updatedAt: new Date(),
      })
      .where(eq(matiasDocumentQueue.id, documentId));

    return false;
  }
}

export async function getDocumentStatus(documentId: string) {
  const doc = await db.query.matiasDocumentQueue.findFirst({
    where: eq(matiasDocumentQueue.id, documentId),
  });

  if (!doc) return null;

  const files = await db.query.matiasDocumentFiles.findMany({
    where: eq(matiasDocumentFiles.documentId, documentId),
  });

  return {
    ...doc,
    files: files.map(f => ({
      id: f.id,
      kind: f.kind,
      mimeType: f.mimeType,
      hasData: !!f.base64Data,
      url: f.url,
    })),
  };
}

export async function downloadDocumentFile(
  documentId: string,
  fileKind: string,
): Promise<Buffer | null> {
  const file = await db.query.matiasDocumentFiles.findFirst({
    where: and(
      eq(matiasDocumentFiles.documentId, documentId),
      eq(matiasDocumentFiles.kind, fileKind as any),
    ),
  });

  if (!file || !file.base64Data) return null;
  return Buffer.from(file.base64Data, "base64");
}
