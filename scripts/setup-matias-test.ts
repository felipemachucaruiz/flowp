import { db } from "../server/db";
import { tenantIntegrationsMatias } from "../shared/schema";
import crypto from "crypto";

function getEncryptionKey(): string {
  const key = process.env.MATIAS_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!key) throw new Error("SESSION_SECRET required");
  return key;
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(getEncryptionKey(), "salt", 32);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

async function setup() {
  const tenantId = "d4b978d8-82bc-4cfa-b8f6-2f60ea765332";
  
  const [config] = await db.insert(tenantIntegrationsMatias).values({
    tenantId,
    baseUrl: "https://api.matias-api.com",
    email: "felipe.machuca@dms.ms",
    passwordEncrypted: encrypt("Diego1995$"),
    isEnabled: true,
    autoSubmitSales: false,
  }).onConflictDoUpdate({
    target: tenantIntegrationsMatias.tenantId,
    set: {
      baseUrl: "https://api.matias-api.com",
      email: "felipe.machuca@dms.ms",
      passwordEncrypted: encrypt("Diego1995$"),
      isEnabled: true,
      updatedAt: new Date(),
    }
  }).returning();

  console.log("MATIAS config created for tenant:", config.tenantId);
  process.exit(0);
}

setup().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
