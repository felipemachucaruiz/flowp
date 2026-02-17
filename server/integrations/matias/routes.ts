import { Router, Request, Response } from "express";
import { db } from "../../db";
import { 
  matiasDocumentQueue, 
  matiasDocumentFiles,
  tenantIntegrationsMatias,
  electronicDocumentSequences,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { 
  getMatiasClient, 
  saveMatiasConfig, 
  getMatiasConfig,
  queueDocument,
  processDocument,
  getDocumentStatus,
  downloadDocumentFile,
  processPendingDocuments,
  getNextDocumentNumber,
  checkDocumentQuota,
} from "./index";

export const matiasRouter = Router();

matiasRouter.get("/status", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const config = await getMatiasConfig(tenantId);
    
    const documents = await db.query.matiasDocumentQueue.findMany({
      where: eq(matiasDocumentQueue.tenantId, tenantId),
    });

    const thisMonth = documents.filter(d => {
      if (!d.createdAt) return false;
      const docDate = new Date(d.createdAt);
      const now = new Date();
      return docDate.getMonth() === now.getMonth() && docDate.getFullYear() === now.getFullYear();
    });

    const accepted = documents.filter(d => d.status === "ACCEPTED").length;
    const total = documents.length;
    const successRate = total > 0 ? `${Math.round((accepted / total) * 100)}%` : "N/A";

    res.json({
      configured: config?.isEnabled || false,
      documentsThisMonth: thisMonth.length,
      documentsTotal: total,
      successRate,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

matiasRouter.get("/config", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const config = await getMatiasConfig(tenantId);
    res.json({ success: true, config });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

matiasRouter.post("/config", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const result = await saveMatiasConfig(tenantId, req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

matiasRouter.post("/test-connection", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const client = await getMatiasClient(tenantId);
    if (!client) {
      return res.json({ success: false, message: "MATIAS integration not configured or disabled" });
    }
    const result = await client.testConnection();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

matiasRouter.get("/documents", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const documents = await db.query.matiasDocumentQueue.findMany({
      where: eq(matiasDocumentQueue.tenantId, tenantId),
      orderBy: [desc(matiasDocumentQueue.createdAt)],
      limit: 100,
    });
    res.json({ success: true, documents });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

matiasRouter.get("/documents/:id", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  const documentId = req.params.id as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const status = await getDocumentStatus(documentId);
    if (!status || status.tenantId !== tenantId) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json({ success: true, document: status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

matiasRouter.post("/documents/:id/retry", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  const documentId = req.params.id as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const doc = await db.query.matiasDocumentQueue.findFirst({
      where: and(
        eq(matiasDocumentQueue.id, documentId),
        eq(matiasDocumentQueue.tenantId, tenantId),
      ),
    });

    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    await db.update(matiasDocumentQueue)
      .set({ status: "PENDING", retryCount: 0, updatedAt: new Date() })
      .where(eq(matiasDocumentQueue.id, documentId));

    const success = await processDocument(documentId);
    res.json({ success, message: success ? "Document reprocessed" : "Reprocessing failed" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

matiasRouter.get("/documents/:id/pdf", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  const documentId = req.params.id as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const doc = await db.query.matiasDocumentQueue.findFirst({
      where: and(
        eq(matiasDocumentQueue.id, documentId),
        eq(matiasDocumentQueue.tenantId, tenantId),
      ),
    });

    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    const pdfBuffer = await downloadDocumentFile(documentId, "pdf");
    if (!pdfBuffer) {
      return res.status(404).json({ error: "PDF not available" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="document-${doc.documentNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

matiasRouter.post("/support-doc", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  const { supplier, items, notes, date } = req.body;

  if (!supplier || !supplier.name || !supplier.idNumber || !items || !items.length) {
    return res.status(400).json({ error: "Missing required fields: supplier (name, idNumber), items" });
  }

  try {
    const config = await db.query.tenantIntegrationsMatias.findFirst({
      where: eq(tenantIntegrationsMatias.tenantId, tenantId),
    });

    if (!config || !config.isEnabled) {
      return res.status(400).json({ error: "MATIAS not configured or disabled" });
    }

    const resolutionNumber = config.supportDocResolutionNumber || config.defaultResolutionNumber || "";
    const prefix = config.supportDocPrefix || config.defaultPrefix || "";

    if (!resolutionNumber) {
      return res.status(400).json({ error: "No support document resolution number configured. Please configure it in the admin panel." });
    }

    const idTypeMap: Record<string, number> = { cc: 1, nit: 2, passport: 3, ce: 4, ti: 5 };
    const supplierIdType = idTypeMap[supplier.idType?.toLowerCase() || "cc"] || 1;

    const docDate = date ? new Date(date) : new Date();
    const dateStr = docDate.toISOString().split("T")[0];
    const timeStr = docDate.toISOString().split("T")[1].split(".")[0];

    const roundTo2 = (n: number) => Math.round(n * 100) / 100;

    const invoiceLines = items.map((item: any, idx: number) => {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.unitPrice) || 0;
      const taxPercent = Number(item.taxPercent) || 0;
      const lineExtension = roundTo2(qty * price);
      const taxAmount = roundTo2(lineExtension * taxPercent / 100);
      let itemCode = (item.code || String(idx + 1)).replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 20);
      if (!itemCode) itemCode = String(idx + 1);

      return {
        invoiced_quantity: String(qty),
        unit_measure_id: 70,
        line_extension_amount: lineExtension.toFixed(2),
        free_of_charge_indicator: false,
        description: (item.description || `Item ${idx + 1}`).substring(0, 300),
        code: itemCode,
        type_item_identification_id: 4,
        reference_price_id: 1,
        price_amount: price.toFixed(2),
        base_quantity: String(qty),
        tax_totals: [{
          tax_id: 1,
          tax_amount: roundTo2(taxAmount),
          taxable_amount: roundTo2(lineExtension),
          percent: taxPercent,
        }],
      };
    });

    let totalLineExtension = 0;
    let totalTax = 0;
    for (const item of items) {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.unitPrice) || 0;
      const taxPercent = Number(item.taxPercent) || 0;
      const lineExt = roundTo2(qty * price);
      totalLineExtension += lineExt;
      totalTax += roundTo2(lineExt * taxPercent / 100);
    }
    totalLineExtension = roundTo2(totalLineExtension);
    totalTax = roundTo2(totalTax);
    const payableAmount = roundTo2(totalLineExtension + totalTax);

    const paymentMethodId = supplier.paymentMethodId || 1;
    const meansPaymentId = supplier.meansPaymentId || 10;

    const taxTotalsArray: any[] = [];
    const taxGroups: Record<number, { taxAmount: number; taxableAmount: number }> = {};
    for (const item of items) {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.unitPrice) || 0;
      const taxPercent = Number(item.taxPercent) || 0;
      const lineExt = roundTo2(qty * price);
      const taxAmt = roundTo2(lineExt * taxPercent / 100);
      if (!taxGroups[taxPercent]) {
        taxGroups[taxPercent] = { taxAmount: 0, taxableAmount: 0 };
      }
      taxGroups[taxPercent].taxAmount += taxAmt;
      taxGroups[taxPercent].taxableAmount += lineExt;
    }
    for (const [pct, grp] of Object.entries(taxGroups)) {
      const percent = Number(pct);
      taxTotalsArray.push({
        tax_id: percent > 0 ? 1 : 13,
        tax_amount: roundTo2(grp.taxAmount),
        taxable_amount: roundTo2(grp.taxableAmount),
        percent,
      });
    }

    const supportDocPayload = {
      type_document_id: 11,
      resolution_number: resolutionNumber,
      prefix,
      number: 0,
      date: dateStr,
      time: timeStr,
      notes: notes || "",
      supplier: {
        dni: supplier.idNumber,
        company_name: supplier.name,
        name: supplier.name,
        phone: supplier.phone || "",
        address: supplier.address || "",
        email: supplier.email || "",
        identity_document_id: supplierIdType,
        type_organization_id: supplierIdType === 2 ? 1 : 2,
        tax_regime_id: 2,
        tax_level_id: 5,
        city_id: supplier.cityId ? Number(supplier.cityId) : 149,
      },
      legal_monetary_totals: {
        line_extension_amount: totalLineExtension.toFixed(2),
        tax_exclusive_amount: totalLineExtension.toFixed(2),
        tax_inclusive_amount: payableAmount.toFixed(2),
        payable_amount: payableAmount.toFixed(2),
      },
      tax_totals: taxTotalsArray.length > 0 ? taxTotalsArray : [{
        tax_id: 13,
        tax_amount: 0,
        taxable_amount: totalLineExtension,
        percent: 0,
      }],
      invoice_lines: invoiceLines,
      payments: [{
        payment_method_id: paymentMethodId,
        means_payment_id: meansPaymentId,
        value_paid: payableAmount.toFixed(2),
      }],
    };

    const quotaCheck = await checkDocumentQuota(tenantId);
    if (!quotaCheck.allowed) {
      return res.json({ success: false, message: `Quota exceeded: ${quotaCheck.reason}` });
    }

    const documentNumber = await getNextDocumentNumber(tenantId, resolutionNumber, prefix, false, "support_doc");

    const finalPayload = {
      ...supportDocPayload,
      number: documentNumber,
    };

    const [doc] = await db.insert(matiasDocumentQueue).values({
      tenantId,
      kind: "SUPPORT_DOC",
      sourceType: "purchase",
      sourceId: `manual-${Date.now()}`,
      resolutionNumber,
      prefix,
      documentNumber,
      status: "PENDING",
      requestJson: finalPayload,
    }).returning();

    const result = { id: doc.id, documentNumber };

    const success = await processDocument(result.id);

    if (success) {
      await db.update(tenantIntegrationsMatias)
        .set({ supportDocCurrentNumber: documentNumber, updatedAt: new Date() })
        .where(eq(tenantIntegrationsMatias.tenantId, tenantId));
    }

    res.json({
      success,
      documentId: result.id,
      documentNumber: result.documentNumber,
      message: success ? "Support document submitted to DIAN" : "Document queued but submission pending",
    });
  } catch (error: any) {
    console.error("[MATIAS] Support doc error:", error);
    res.status(500).json({ error: error.message });
  }
});

matiasRouter.post("/queue", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  const { kind, sourceType, sourceId, orderNumber } = req.body;

  if (!kind || !sourceType || !sourceId) {
    return res.status(400).json({ error: "Missing required fields: kind, sourceType, sourceId" });
  }

  try {
    const result = await queueDocument({
      tenantId,
      kind,
      sourceType,
      sourceId,
      orderNumber,
    });

    if (!result) {
      return res.json({ success: false, message: "Could not queue document. Check MATIAS configuration." });
    }

    res.json({ success: true, documentId: result.id, documentNumber: result.documentNumber });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

matiasRouter.post("/process-queue", async (req: Request, res: Response) => {
  try {
    await processPendingDocuments();
    res.json({ success: true, message: "Queue processing started" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

matiasRouter.get("/sequences", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const sequences = await db.query.electronicDocumentSequences.findMany({
      where: eq(electronicDocumentSequences.tenantId, tenantId),
    });
    res.json({ success: true, sequences });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

matiasRouter.post("/sequences", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  const { resolutionNumber, prefix, currentNumber, rangeStart, rangeEnd } = req.body;

  if (!resolutionNumber || !prefix) {
    return res.status(400).json({ error: "Missing required fields: resolutionNumber, prefix" });
  }

  try {
    const existing = await db.query.electronicDocumentSequences.findFirst({
      where: and(
        eq(electronicDocumentSequences.tenantId, tenantId),
        eq(electronicDocumentSequences.resolutionNumber, resolutionNumber),
        eq(electronicDocumentSequences.prefix, prefix),
      ),
    });

    if (existing) {
      await db.update(electronicDocumentSequences)
        .set({
          currentNumber: currentNumber || existing.currentNumber,
          rangeStart: rangeStart ?? existing.rangeStart,
          rangeEnd: rangeEnd ?? existing.rangeEnd,
          updatedAt: new Date(),
        })
        .where(eq(electronicDocumentSequences.id, existing.id));

      return res.json({ success: true, message: "Sequence updated" });
    }

    await db.insert(electronicDocumentSequences).values({
      tenantId,
      resolutionNumber,
      prefix,
      currentNumber: currentNumber || 0,
      rangeStart,
      rangeEnd,
    });

    res.json({ success: true, message: "Sequence created" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

matiasRouter.get("/status/:trackId", async (req: Request, res: Response) => {
  const tenantId = req.headers["x-tenant-id"] as string;
  const trackId = req.params.trackId as string;
  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID required" });
  }

  try {
    const client = await getMatiasClient(tenantId);
    if (!client) {
      return res.status(400).json({ error: "MATIAS not configured" });
    }

    const status = await client.getStatusByTrackId(trackId);
    res.json({ success: true, status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
