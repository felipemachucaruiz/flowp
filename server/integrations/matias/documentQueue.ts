import { db } from "../../db";
import { 
  matiasDocumentQueue, 
  matiasDocumentFiles,
  electronicDocumentSequences,
  tenantIntegrationsMatias,
  tenantEbillingUsage,
  tenantEbillingSubscriptions,
  ebillingPackages,
  returns,
  orders,
} from "@shared/schema";
import { eq, and, sql, lte, gte } from "drizzle-orm";
import { getMatiasClient } from "./matiasClient";
import { buildPosPayload, buildPosCreditNotePayload } from "./payloadBuilders";
import { MATIAS_DOCUMENT_TYPES } from "./types";
import type { MatiasPayload, MatiasNotePayload, MatiasSupportDocPayload } from "./types";

interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  remaining?: number;
  limit?: number;
  used?: number;
  overagePolicy?: string;
}

export async function checkDocumentQuota(tenantId: string): Promise<QuotaCheckResult> {
  const now = new Date();
  
  // Find active subscription for tenant
  const subscription = await db.query.tenantEbillingSubscriptions.findFirst({
    where: and(
      eq(tenantEbillingSubscriptions.tenantId, tenantId),
      eq(tenantEbillingSubscriptions.status, "active"),
      lte(tenantEbillingSubscriptions.cycleStart, now),
      gte(tenantEbillingSubscriptions.cycleEnd, now),
    ),
  });

  // No active subscription - check if MATIAS integration is enabled anyway (for trial/demo)
  if (!subscription) {
    // Allow documents if no subscription system is in place (graceful fallback)
    console.log(`[Quota] No active e-billing subscription for tenant ${tenantId}, allowing (no subscription required)`);
    return { allowed: true, reason: "no_subscription_required" };
  }

  // Get package details
  const pkg = await db.query.ebillingPackages.findFirst({
    where: eq(ebillingPackages.id, subscription.packageId),
  });

  if (!pkg) {
    console.log(`[Quota] Package not found for subscription, blocking`);
    return { allowed: false, reason: "package_not_found" };
  }

  const monthlyLimit = subscription.documentsIncludedSnapshot || pkg.includedDocuments;

  // Get current month usage
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const usage = await db.query.tenantEbillingUsage.findFirst({
    where: and(
      eq(tenantEbillingUsage.tenantId, tenantId),
      eq(tenantEbillingUsage.periodStart, periodStart),
    ),
  });

  const totalUsed = usage 
    ? (usage.usedPos || 0) + (usage.usedInvoice || 0) + 
      (usage.usedNotes || 0) + (usage.usedSupportDocs || 0)
    : 0;

  const remaining = monthlyLimit - totalUsed;

  if (remaining > 0) {
    return { allowed: true, remaining, limit: monthlyLimit, used: totalUsed };
  }

  // Check overage policy
  if (subscription.overagePolicy === "allow_and_charge" && subscription.overagePricePerDocUsdCents) {
    console.log(`[Quota] Quota exceeded but overage charging allowed for tenant ${tenantId}`);
    return { allowed: true, remaining: 0, limit: monthlyLimit, used: totalUsed, overagePolicy: "allow_and_charge" };
  }

  // Block policy or no overage pricing set
  console.log(`[Quota] Document quota exceeded for tenant ${tenantId}: ${totalUsed}/${monthlyLimit}`);
  return { 
    allowed: false, 
    reason: "quota_exceeded", 
    remaining: 0, 
    limit: monthlyLimit, 
    used: totalUsed,
    overagePolicy: subscription.overagePolicy || "block",
  };
}

async function incrementDocumentUsage(tenantId: string, documentKind: string): Promise<void> {
  try {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const existing = await db.query.tenantEbillingUsage.findFirst({
      where: and(
        eq(tenantEbillingUsage.tenantId, tenantId),
        eq(tenantEbillingUsage.periodStart, periodStart)
      ),
    });

    const columnMap: Record<string, string> = {
      POS: "used_pos",
      INVOICE: "used_invoice",
      POS_CREDIT_NOTE: "used_notes",
      POS_DEBIT_NOTE: "used_notes",
      SUPPORT_DOC: "used_support_docs",
      SUPPORT_ADJUSTMENT: "used_support_docs",
    };
    const column = columnMap[documentKind] || "used_pos";

    if (existing) {
      await db.execute(sql`
        UPDATE tenant_ebilling_usage
        SET ${sql.raw(column)} = COALESCE(${sql.raw(column)}, 0) + 1,
            used_total = COALESCE(used_total, 0) + 1,
            updated_at = NOW()
        WHERE id = ${existing.id}
      `);
    } else {
      // Need subscriptionId - get from tenant's active subscription
      const subscription = await db.query.tenantEbillingSubscriptions.findFirst({
        where: eq(tenantEbillingSubscriptions.tenantId, tenantId),
      });
      
      if (!subscription) {
        console.log(`[Metering] No subscription found for tenant ${tenantId}, skipping usage tracking`);
        return;
      }

      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const usageValues: any = {
        tenantId,
        subscriptionId: subscription.id,
        periodStart,
        periodEnd,
        usedPos: 0,
        usedInvoice: 0,
        usedNotes: 0,
        usedSupportDocs: 0,
        usedTotal: 1,
      };
      if (column === "used_pos") usageValues.usedPos = 1;
      if (column === "used_invoice") usageValues.usedInvoice = 1;
      if (column === "used_notes") usageValues.usedNotes = 1;
      if (column === "used_support_docs") usageValues.usedSupportDocs = 1;

      await db.insert(tenantEbillingUsage).values(usageValues);
    }

    console.log(`[Metering] Incremented ${column} for tenant ${tenantId}`);
  } catch (error: any) {
    console.error("[Metering] Failed to increment usage:", error.message);
  }
}

export async function getNextDocumentNumber(
  tenantId: string,
  resolutionNumber: string,
  prefix: string,
  isCreditNote: boolean = false,
  docType: "invoice" | "credit_note" | "support_doc" = "invoice",
): Promise<number> {
  const effectiveDocType = isCreditNote ? "credit_note" : docType;

  return await db.transaction(async (tx) => {
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
      const matiasConfig = await db.query.tenantIntegrationsMatias.findFirst({
        where: eq(tenantIntegrationsMatias.tenantId, tenantId),
      });
      
      let startNumber = 1;
      let rangeEnd: number | null = null;
      
      if (effectiveDocType === "credit_note") {
        if (matiasConfig?.creditNoteStartingNumber && matiasConfig.creditNoteStartingNumber > 0) {
          startNumber = matiasConfig.creditNoteStartingNumber;
          console.log(`[MATIAS] Using configured credit note starting number: ${startNumber}`);
        }
        rangeEnd = matiasConfig?.creditNoteEndingNumber || null;
      } else if (effectiveDocType === "support_doc") {
        if (matiasConfig?.supportDocStartingNumber && matiasConfig.supportDocStartingNumber > 0) {
          startNumber = matiasConfig.supportDocStartingNumber;
          console.log(`[MATIAS] Using configured support doc starting number: ${startNumber}`);
        }
        rangeEnd = matiasConfig?.supportDocEndingNumber || null;
      } else {
        if (matiasConfig?.startingNumber && matiasConfig.startingNumber > 0) {
          startNumber = matiasConfig.startingNumber;
          console.log(`[MATIAS] Using configured starting number: ${startNumber}`);
        } else {
          const client = await getMatiasClient(tenantId);
          if (client) {
            const lastDoc = await client.getLastDocument({ resolution: resolutionNumber, prefix });
            if (lastDoc) {
              startNumber = lastDoc.number + 1;
            }
          }
        }
        rangeEnd = matiasConfig?.endingNumber || null;
      }

      await tx.insert(electronicDocumentSequences).values({
        tenantId,
        resolutionNumber,
        prefix,
        currentNumber: startNumber,
        rangeEnd,
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

  // Check document quota before queueing
  const quotaCheck = await checkDocumentQuota(params.tenantId);
  if (!quotaCheck.allowed) {
    console.log(`[MATIAS] Document blocked due to quota: ${quotaCheck.reason} (${quotaCheck.used}/${quotaCheck.limit})`);
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

// Credit note-specific queue function
export async function queueCreditNote(params: {
  tenantId: string;
  returnId: string;
  orderId: string;
  refundAmount: number;
  refundReason: string;
  originalCufe: string;
  originalNumber: string;
  originalDate: string;
  correctionConceptId: number;
}): Promise<{ id: string; documentNumber: number } | null> {
  const config = await db.query.tenantIntegrationsMatias.findFirst({
    where: eq(tenantIntegrationsMatias.tenantId, params.tenantId),
  });

  if (!config || !config.isEnabled) {
    console.log("MATIAS not enabled for tenant:", params.tenantId);
    return null;
  }

  // Check document quota before queueing
  const quotaCheck = await checkDocumentQuota(params.tenantId);
  if (!quotaCheck.allowed) {
    console.log(`[MATIAS] Credit note blocked due to quota: ${quotaCheck.reason}`);
    return null;
  }

  // For credit notes, use credit note resolution if available, otherwise fallback to default
  const resolutionNumber = config.creditNoteResolutionNumber || config.defaultResolutionNumber || "";
  const prefix = config.creditNotePrefix || config.defaultPrefix || "";

  if (!resolutionNumber) {
    console.log("No resolution number configured for credit notes, tenant:", params.tenantId);
    return null;
  }

  try {
    // Use credit note-specific numbering sequence
    const documentNumber = await getNextDocumentNumber(
      params.tenantId,
      resolutionNumber,
      prefix,
      true, // isCreditNote = true
    );

    // Store credit note metadata in the queue record
    const creditNoteData = {
      returnId: params.returnId,
      orderId: params.orderId,
      refundAmount: params.refundAmount,
      refundReason: params.refundReason,
      originalCufe: params.originalCufe,
      originalNumber: params.originalNumber,
      originalDate: params.originalDate,
      correctionConceptId: params.correctionConceptId,
    };

    const [doc] = await db.insert(matiasDocumentQueue).values({
      tenantId: params.tenantId,
      kind: "POS_CREDIT_NOTE",
      sourceType: "refund",
      sourceId: params.returnId,
      resolutionNumber,
      prefix,
      documentNumber,
      orderNumber: `NC-${documentNumber}`,
      status: "PENDING",
      requestJson: creditNoteData,  // Store credit note specific data
    }).returning();

    return { id: doc.id, documentNumber };
  } catch (error: any) {
    console.error("Error queueing credit note:", error);
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
    let payload: MatiasPayload | MatiasNotePayload | MatiasSupportDocPayload | null = null;

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
        // Check if requestJson already contains a built payload (from a previous attempt)
        const existingPayload = doc.requestJson as any;
        if (existingPayload?.type_document_id === MATIAS_DOCUMENT_TYPES.CREDIT_NOTE && existingPayload?.billing_reference) {
          payload = existingPayload as MatiasNotePayload;
        } else {
          const cnData = doc.requestJson as {
            orderId: string;
            refundAmount: number;
            refundReason: string;
            originalCufe: string;
            originalNumber: string;
            originalDate: string;
            correctionConceptId: number;
          };
          if (cnData?.orderId) {
            payload = await buildPosCreditNotePayload(
              cnData.orderId,
              cnData.refundAmount,
              cnData.refundReason,
              doc.resolutionNumber!,
              doc.prefix!,
              doc.documentNumber!,
              cnData.originalCufe,
              cnData.originalNumber,
              cnData.originalDate,
              cnData.correctionConceptId,
            );
          }
        }
        break;
      case "POS_DEBIT_NOTE":
        break;
      case "INVOICE":
        break;
      case "SUPPORT_DOC": {
        const sdPayload = doc.requestJson as any;
        if (sdPayload?.type_document_id === MATIAS_DOCUMENT_TYPES.SUPPORT_DOCUMENT) {
          payload = sdPayload as MatiasSupportDocPayload;
        }
        break;
      }
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
      case "SUPPORT_DOC":
        response = await client.submitSupportDocument(payload as MatiasSupportDocPayload);
        break;
      default:
        response = { success: false, message: "Unsupported document type" };
    }

    if (response.success && response.data) {
      // MATIAS returns the actual DIAN CUFE/CUDE in XmlDocumentKey (96-char SHA-384 hash)
      // Not in 'cufe' field - that doesn't exist. 'uuid' is MATIAS internal ID, NOT the DIAN CUFE.
      const dianCufe = response.data.XmlDocumentKey || response.data.response?.XmlDocumentKey;
      let qrCode = response.data.qr?.qrDian;

      if (dianCufe && !qrCode) {
        qrCode = `https://catalogo-vpfe.dian.gov.co/User/SearchDocument?DocumentKey=${dianCufe}`;
      }
      
      console.log(`[MATIAS] Document accepted. MATIAS UUID: ${response.data.uuid}, DIAN CUFE: ${dianCufe?.substring(0, 30)}...`);
      
      await db.update(matiasDocumentQueue)
        .set({
          status: "ACCEPTED",
          trackId: response.data.track_id,
          cufe: dianCufe,  // Store the actual DIAN CUFE, not MATIAS UUID
          qrCode: qrCode,
          responseJson: response,
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(matiasDocumentQueue.id, documentId));

      await incrementDocumentUsage(doc.tenantId, doc.kind);

      if ((doc.kind === "POS" || doc.kind === "INVOICE") && doc.sourceId) {
        await db.update(orders)
          .set({
            cufe: dianCufe,
            qrCode: qrCode,
            trackId: response.data.track_id,
          })
          .where(eq(orders.id, doc.sourceId));
      }

      if (doc.kind === "POS_CREDIT_NOTE" && doc.sourceId) {
        await db.update(returns)
          .set({
            cude: dianCufe,  // Credit notes have CUDE (same format as CUFE)
            qrCode: qrCode,
            trackId: response.data.track_id,
            creditNoteStatus: "accepted",
          })
          .where(eq(returns.id, doc.sourceId));
      }

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
      // Check if document was "already validated" or "processed by DIAN" - meaning it exists in DIAN
      // MATIAS returns success=false in these cases but the data is valid
      const responseData = (response as any).data || response;
      const isAlreadyValidated = response.message?.includes("ya se encuentra validado") ||
        response.message?.includes("Solicitud procesada por la DIAN") ||
        responseData?.is_valid === 1;
      
      if (isAlreadyValidated) {
        console.log(`[MATIAS] Document ${doc.prefix}${doc.documentNumber} already validated/processed. Extracting existing CUFE/QR...`);
        
        // MATIAS returns the existing document data even when success=false for "already validated"
        const jsonData = responseData?.jsonData;
        let cufe = jsonData?.cufe || responseData?.XmlDocumentKey;
        let qrCode = jsonData?.qr || jsonData?.qrDian;
        
        // If not in response, try fetching from status API
        if (!cufe || !qrCode) {
          const statusResult = await client.getStatus({
            resolution: doc.resolutionNumber || undefined,
            prefix: doc.prefix || undefined,
            number: doc.documentNumber || undefined,
          });
          
          if (statusResult?.success && statusResult.data) {
            cufe = cufe || statusResult.data.cufe || statusResult.data.cude;
            qrCode = qrCode || statusResult.data.qr_code;
          }
        }
        
        // Fallback: Generate QR URL from CUFE if we have CUFE but no QR code
        if (cufe && !qrCode) {
          qrCode = `https://catalogo-vpfe.dian.gov.co/User/SearchDocument?DocumentKey=${cufe}`;
        }
        
        if (cufe) {
          await db.update(matiasDocumentQueue)
            .set({
              status: "ACCEPTED",
              cufe,
              qrCode,
              responseJson: response,
              acceptedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(matiasDocumentQueue.id, documentId));

          if ((doc.kind === "POS" || doc.kind === "INVOICE") && doc.sourceId) {
            await db.update(orders)
              .set({ cufe, qrCode, trackId: response.data?.track_id })
              .where(eq(orders.id, doc.sourceId));
          }
          if (doc.kind === "POS_CREDIT_NOTE" && doc.sourceId) {
            await db.update(returns)
              .set({ cude: cufe, qrCode, creditNoteStatus: "accepted" })
              .where(eq(returns.id, doc.sourceId));
          }
          
          console.log(`[MATIAS] Document already validated. CUFE: ${cufe?.substring(0, 20)}...`);
          await incrementDocumentUsage(doc.tenantId, doc.kind);
          return true;
        }
      }
      
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

/**
 * Synchronous document submission - waits for MATIAS response
 * Returns CUFE and QR code for immediate use on receipts
 */
export async function submitDocumentSync(params: {
  tenantId: string;
  kind: "POS" | "INVOICE" | "POS_CREDIT_NOTE" | "POS_DEBIT_NOTE" | "SUPPORT_DOC" | "SUPPORT_ADJUSTMENT";
  sourceType: "sale" | "refund" | "purchase" | "adjustment";
  sourceId: string;
  orderNumber?: string;
}): Promise<{
  success: boolean;
  documentId?: string;
  documentNumber?: number;
  prefix?: string;
  cufe?: string;
  qrCode?: string;
  trackId?: string;
  error?: string;
}> {
  const config = await db.query.tenantIntegrationsMatias.findFirst({
    where: eq(tenantIntegrationsMatias.tenantId, params.tenantId),
  });

  if (!config || !config.isEnabled) {
    console.log("[MATIAS] Not enabled for tenant:", params.tenantId);
    return { success: false, error: "E-billing not enabled" };
  }

  // Check document quota
  const quotaCheck = await checkDocumentQuota(params.tenantId);
  if (!quotaCheck.allowed) {
    console.log(`[MATIAS] Quota exceeded: ${quotaCheck.reason}`);
    return { success: false, error: quotaCheck.reason };
  }

  const resolutionNumber = config.defaultResolutionNumber || "";
  const prefix = config.defaultPrefix || "";

  if (!resolutionNumber) {
    return { success: false, error: "No resolution number configured" };
  }

  try {
    const documentNumber = await getNextDocumentNumber(
      params.tenantId,
      resolutionNumber,
      prefix,
    );

    console.log(`[MATIAS] Using document number: ${documentNumber}`);

    // Create document record
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

    // Get MATIAS client
    const client = await getMatiasClient(params.tenantId);
    if (!client) {
      await db.update(matiasDocumentQueue)
        .set({ status: "FAILED", lastErrorMessage: "Could not initialize MATIAS client", updatedAt: new Date() })
        .where(eq(matiasDocumentQueue.id, doc.id));
      return { success: false, documentId: doc.id, documentNumber, error: "Could not connect to MATIAS" };
    }

    // Build payload
    let payload: MatiasPayload | MatiasNotePayload | MatiasSupportDocPayload | null = null;

    switch (params.kind) {
      case "POS":
        payload = await buildPosPayload(params.sourceId, resolutionNumber, prefix, documentNumber);
        break;
      case "SUPPORT_DOC": {
        const existingReqJson = (params as any).requestJson;
        if (existingReqJson?.type_document_id === MATIAS_DOCUMENT_TYPES.SUPPORT_DOCUMENT) {
          payload = { ...existingReqJson, number: documentNumber, resolution_number: resolutionNumber, prefix } as MatiasSupportDocPayload;
        }
        break;
      }
      case "POS_CREDIT_NOTE":
      case "POS_DEBIT_NOTE":
      case "INVOICE":
      case "SUPPORT_ADJUSTMENT":
        break;
    }

    if (!payload) {
      await db.update(matiasDocumentQueue)
        .set({ status: "FAILED", lastErrorMessage: "Could not build payload", updatedAt: new Date() })
        .where(eq(matiasDocumentQueue.id, doc.id));
      return { success: false, documentId: doc.id, documentNumber, error: "Could not build document payload" };
    }

    // Update status to SENT and store request
    await db.update(matiasDocumentQueue)
      .set({ status: "SENT", requestJson: payload, submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(matiasDocumentQueue.id, doc.id));

    // Submit to MATIAS
    let response;
    switch (params.kind) {
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
      case "SUPPORT_DOC":
        response = await client.submitSupportDocument(payload as MatiasSupportDocPayload);
        break;
      default:
        response = { success: false, message: "Unsupported document type" };
    }

    if (response.success && response.data) {
      // MATIAS returns the actual DIAN CUFE/CUDE in XmlDocumentKey (96-char SHA-384 hash)
      // Not in 'cufe' field - that doesn't exist. 'uuid' is MATIAS internal ID, NOT the DIAN CUFE.
      const cufe = response.data.XmlDocumentKey || response.data.response?.XmlDocumentKey;
      let qrCode = response.data.qr?.qrDian;
      const trackId = response.data.track_id;

      // Fallback: Generate QR URL from CUFE if we have CUFE but no QR code
      if (cufe && !qrCode) {
        qrCode = `https://catalogo-vpfe.dian.gov.co/User/SearchDocument?DocumentKey=${cufe}`;
      }

      console.log(`[MATIAS SYNC] Document accepted. MATIAS UUID: ${response.data.uuid}, DIAN CUFE: ${cufe?.substring(0, 30)}...`);

      await db.update(matiasDocumentQueue)
        .set({
          status: "ACCEPTED",
          trackId,
          cufe,
          qrCode,
          responseJson: response,
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(matiasDocumentQueue.id, doc.id));

      await incrementDocumentUsage(params.tenantId, params.kind);

      // Download PDF in background (don't wait)
      if (trackId) {
        client.downloadPdf(trackId).then(async (pdfBuffer) => {
          if (pdfBuffer) {
            await db.insert(matiasDocumentFiles).values({
              documentId: doc.id,
              kind: "pdf",
              base64Data: pdfBuffer.toString("base64"),
              mimeType: "application/pdf",
            });
          }
        }).catch(err => console.error("[MATIAS] PDF download error:", err));
      }

      console.log(`[MATIAS] Document ${prefix}${documentNumber} accepted. CUFE: ${cufe?.substring(0, 20)}...`);

      return {
        success: true,
        documentId: doc.id,
        documentNumber,
        prefix,
        cufe,
        qrCode,
        trackId,
      };
    } else {
      // Check if document was "already validated" or "processed by DIAN" - meaning it exists in DIAN
      // MATIAS returns success=false in these cases but the data is valid
      const responseData = (response as any).data || response;
      const isAlreadyValidated = response.message?.includes("ya se encuentra validado") ||
        response.message?.includes("Solicitud procesada por la DIAN") ||
        responseData?.is_valid === 1;
      
      if (isAlreadyValidated) {
        console.log(`[MATIAS] Document ${prefix}${documentNumber} already validated/processed. Extracting existing CUFE/QR...`);
        
        // MATIAS returns the existing document data even when success=false for "already validated"
        // XmlDocumentKey contains the actual DIAN CUFE, not the 'cufe' field
        const jsonData = responseData?.jsonData;
        let cufe = responseData?.XmlDocumentKey || jsonData?.XmlDocumentKey;
        let qrCode = responseData?.qr?.qrDian || jsonData?.qr?.qrDian;
        
        // If not in response, try fetching from status API
        if (!cufe || !qrCode) {
          const statusResult = await client.getStatus({
            resolution: resolutionNumber,
            prefix: prefix,
            number: documentNumber,
          });
          
          if (statusResult?.success && statusResult.data) {
            cufe = cufe || statusResult.data.cufe || statusResult.data.cude;
            qrCode = qrCode || statusResult.data.qr_code;
          }
        }
        
        // Fallback: Generate QR URL from CUFE if we have CUFE but no QR code
        if (cufe && !qrCode) {
          qrCode = `https://catalogo-vpfe.dian.gov.co/User/SearchDocument?DocumentKey=${cufe}`;
        }
        
        if (cufe) {
          await db.update(matiasDocumentQueue)
            .set({
              status: "ACCEPTED",
              cufe,
              qrCode,
              responseJson: response,
              acceptedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(matiasDocumentQueue.id, doc.id));
          
          console.log(`[MATIAS] Document already validated. CUFE: ${cufe?.substring(0, 20)}...`);
          
          return {
            success: true,
            documentId: doc.id,
            documentNumber,
            prefix,
            cufe,
            qrCode,
          };
        }
      }
      
      // Submission failed - mark for retry (background processor will handle retries)
      await db.update(matiasDocumentQueue)
        .set({
          status: "RETRY",
          retryCount: 1,
          lastErrorMessage: response.message || JSON.stringify(response.errors),
          responseJson: response,
          updatedAt: new Date(),
        })
        .where(eq(matiasDocumentQueue.id, doc.id));

      console.log(`[MATIAS] Document submission failed: ${response.message}`);

      return {
        success: false,
        documentId: doc.id,
        documentNumber,
        error: response.message || "Document rejected by MATIAS",
      };
    }
  } catch (error: any) {
    console.error("[MATIAS] Sync submission error:", error);
    return { success: false, error: error.message };
  }
}
