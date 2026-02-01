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
} from "./index";

export const matiasRouter = Router();

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
