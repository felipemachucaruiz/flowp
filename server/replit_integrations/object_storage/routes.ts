import type { Express } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

/**
 * Register object storage routes for file uploads.
 *
 * This provides example routes for the presigned URL upload flow:
 * 1. POST /api/uploads/request-url - Get a presigned URL for uploading
 * 2. The client then uploads directly to the presigned URL
 *
 * IMPORTANT: These are example routes. Customize based on your use case:
 * - Add authentication middleware for protected uploads
 * - Add file metadata storage (save to database after upload)
 * - Add ACL policies for access control
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  /**
   * Request a presigned URL for file upload.
   *
   * Request body (JSON):
   * {
   *   "name": "filename.jpg",
   *   "size": 12345,
   *   "contentType": "image/jpeg"
   * }
   *
   * Response:
   * {
   *   "uploadURL": "https://storage.googleapis.com/...",
   *   "objectPath": "/objects/uploads/uuid"
   * }
   *
   * IMPORTANT: The client should NOT send the file to this endpoint.
   * Send JSON metadata only, then upload the file directly to uploadURL.
   */
  app.post("/api/uploads/request-url", async (req, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();

      // Extract object path from the presigned URL for later reference
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL,
        objectPath,
        // Echo back the metadata for client convenience
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  /**
   * Serve public objects from PUBLIC_OBJECT_SEARCH_PATHS.
   *
   * GET /public/:filePath(*)
   *
   * This searches the public directories for the file and serves it.
   */
  app.get(/^\/public\/(.+)$/, async (req, res) => {
    try {
      const filePath = req.params[0];
      const objectFile = await objectStorageService.searchPublicObject(filePath);
      if (!objectFile) {
        return res.status(404).json({ error: "Object not found" });
      }
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving public object:", error);
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });

  /**
   * Serve uploaded objects.
   *
   * GET /objects/:objectPath(*)
   *
   * This serves files from object storage. For public files, no auth needed.
   * For protected files, add authentication middleware and ACL checks.
   */
  app.get(/^\/objects\/(.+)$/, async (req, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });

  const mediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
  });

  function convertWebmToOgg(inputBuffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const inputPath = join(tmpdir(), `voice_in_${id}.webm`);
      const outputPath = join(tmpdir(), `voice_out_${id}.ogg`);

      writeFile(inputPath, inputBuffer)
        .then(() => {
          execFile("ffmpeg", [
            "-i", inputPath,
            "-c:a", "libopus",
            "-b:a", "64k",
            "-ar", "48000",
            "-ac", "1",
            "-application", "voip",
            "-vn",
            "-f", "ogg",
            "-y",
            outputPath,
          ], { timeout: 30000 }, async (error) => {
            try {
              if (error) {
                console.error("[ffmpeg] Conversion error:", error.message);
                await unlink(inputPath).catch(() => {});
                await unlink(outputPath).catch(() => {});
                return reject(error);
              }
              const outputBuffer = await readFile(outputPath);
              await unlink(inputPath).catch(() => {});
              await unlink(outputPath).catch(() => {});
              resolve(outputBuffer);
            } catch (e) {
              reject(e);
            }
          });
        })
        .catch(reject);
    });
  }

  app.post("/api/upload/media", mediaUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file provided" });
      }

      let uploadBuffer = file.buffer;
      let uploadMimeType = file.mimetype || "application/octet-stream";
      let uploadFilename = file.originalname;

      const isWebmAudio = uploadMimeType.startsWith("audio/webm") ||
        (uploadFilename?.endsWith(".webm") && uploadMimeType.startsWith("audio/"));
      if (isWebmAudio) {
        try {
          console.log("[Media Upload] Converting WebM audio to OGG Opus for WhatsApp compatibility");
          uploadBuffer = await convertWebmToOgg(file.buffer);
          uploadMimeType = "audio/ogg";
          uploadFilename = uploadFilename.replace(/\.webm$/, ".ogg");
        } catch (convErr: any) {
          console.error("[Media Upload] ffmpeg conversion failed:", convErr.message);
          return res.status(500).json({ error: "Voice note conversion failed. WhatsApp requires OGG Opus format." });
        }
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        headers: {
          "Content-Type": uploadMimeType,
        },
        body: uploadBuffer,
      });

      if (!uploadResponse.ok) {
        const text = await uploadResponse.text();
        console.error("Media upload to storage failed:", uploadResponse.status, text);
        return res.status(500).json({ error: "Failed to upload file to storage" });
      }

      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
      const publicUrl = `${protocol}://${host}${objectPath}`;

      res.json({
        url: publicUrl,
        objectPath,
        filename: uploadFilename,
        contentType: uploadMimeType,
        size: uploadBuffer.length,
      });
    } catch (error) {
      console.error("Error in media upload:", error);
      res.status(500).json({ error: "Failed to upload media" });
    }
  });
}

