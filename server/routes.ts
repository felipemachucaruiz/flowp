import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import bcrypt from "bcrypt";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import { storage } from "./storage";
import { emailService } from "./email";
import { getEmailWrapper } from "./email-templates";
import { getMercadoPagoPublicKey, isMercadoPagoEnabled, createSubscriptionPreapproval, getPreapprovalStatus, cancelPreapproval, createOneTimePaymentPreference, getPaymentStatus } from "./mercadopago";
import { db } from "./db";
import { orders, payments, registerSessions, cashMovements, tenantIntegrationsMatias, SUBSCRIPTION_FEATURES } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  insertTenantSchema,
  insertCategorySchema,
  insertProductSchema,
  insertCustomerSchema,
  insertFloorSchema,
  insertTableSchema,
  RETAIL_FEATURES,
  RESTAURANT_FEATURES,
} from "@shared/schema";
import { z } from "zod";
import { loadPortalSession } from "./middleware/rbac";
import internalRoutes from "./routes/internal";
import tenantRoutes from "./routes/tenant";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { matiasRouter } from "./integrations/matias/routes";
import { shopifyRouter } from "./integrations/shopify/routes";
import { whatsappRouter } from "./integrations/gupshup/routes";
import { sendReceiptNotification, sendLowStockNotification } from "./integrations/gupshup/service";
import { internalAdminRouter } from "./routes/internalAdmin";
import { generateInternalToken } from "./middleware/internalAuth";
import { generateReceiptPDF } from "./pdf-receipt";

const receiptTokens = new Map<string, { orderId: string; tenantId: string; expiresAt: number }>();

function createReceiptToken(orderId: string, tenantId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  receiptTokens.set(token, { orderId, tenantId, expiresAt: Date.now() + 10 * 60 * 1000 });
  return token;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, data] of receiptTokens) {
    if (data.expiresAt < now) receiptTokens.delete(token);
  }
}, 60 * 1000);

// WebSocket clients by tenant for real-time KDS updates
const wsClients = new Map<string, Set<WebSocket>>();

function broadcastToTenant(tenantId: string, message: any) {
  const clients = wsClients.get(tenantId);
  if (clients) {
    const data = JSON.stringify(message);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // WebSocket server for real-time KDS updates
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const tenantId = url.searchParams.get("tenantId");

    if (tenantId) {
      if (!wsClients.has(tenantId)) {
        wsClients.set(tenantId, new Set());
      }
      wsClients.get(tenantId)!.add(ws);

      ws.on("close", () => {
        wsClients.get(tenantId)?.delete(ws);
      });
    }
  });

  // ===== PORTAL ROUTES (Management Portal) =====
  app.use("/api/internal", loadPortalSession, internalRoutes);
  app.use("/api/tenant", loadPortalSession, tenantRoutes);

  // ===== OBJECT STORAGE ROUTES =====
  registerObjectStorageRoutes(app);

  // ===== MATIAS / DIAN ELECTRONIC BILLING ROUTES =====
  app.use("/api/billing/matias", matiasRouter);

  // ===== SHOPIFY INTEGRATION ROUTES =====
  app.use("/api/shopify", shopifyRouter);

  // ===== WHATSAPP / GUPSHUP INTEGRATION ROUTES =====
  app.use("/api/whatsapp", whatsappRouter);

  // ===== INTERNAL ADMIN CONSOLE ROUTES =====
  app.use("/api/internal-admin", internalAdminRouter);

  // ===== PRINTBRIDGE DOWNLOAD =====
  app.get("/printbridge/PrintBridge-Source.zip", (req: Request, res: Response) => {
    const printbridgePath = path.join(process.cwd(), "printbridge");
    
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=PrintBridge-Source.zip");
    
    const archive = archiver("zip", { store: false });
    archive.on("error", (err) => {
      res.status(500).json({ error: "Failed to create archive" });
    });
    
    archive.pipe(res);
    archive.directory(printbridgePath, "PrintBridge");
    archive.finalize();
  });

  // PrintBridge Simple Edition download (dynamically created to avoid corruption)
  app.get("/printbridge/simple.zip", (req: Request, res: Response) => {
    const simplePath = path.join(process.cwd(), "printbridge-simple");
    
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=PrintBridge-Simple.zip");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    
    const archive = archiver("zip", { store: false });
    archive.on("error", () => {
      res.status(500).json({ error: "Failed to create archive" });
    });
    
    archive.pipe(res);
    archive.file(path.join(simplePath, "package.json"), { name: "PrintBridge-Simple/package.json" });
    archive.file(path.join(simplePath, "server.js"), { name: "PrintBridge-Simple/server.js" });
    archive.file(path.join(simplePath, "start.bat"), { name: "PrintBridge-Simple/start.bat" });
    archive.finalize();
  });

  // PrintBridge Mac Edition download
  app.get("/printbridge/mac.zip", (req: Request, res: Response) => {
    const macPath = path.join(process.cwd(), "printbridge-mac");
    
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=PrintBridge-Mac.zip");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    
    const archive = archiver("zip", { store: false });
    archive.on("error", () => {
      res.status(500).json({ error: "Failed to create archive" });
    });
    
    archive.pipe(res);
    archive.file(path.join(macPath, "package.json"), { name: "PrintBridge-Mac/package.json" });
    archive.file(path.join(macPath, "server.js"), { name: "PrintBridge-Mac/server.js" });
    archive.file(path.join(macPath, "start.sh"), { name: "PrintBridge-Mac/start.sh" });
    archive.file(path.join(macPath, "README.md"), { name: "PrintBridge-Mac/README.md" });
    archive.finalize();
  });

  // Flowp Desktop (Electron) source download for developers
  app.get("/desktop/source.zip", (req: Request, res: Response) => {
    const desktopPath = path.join(process.cwd(), "flowp-desktop");
    
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=Flowp-Desktop-Source.zip");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    
    const archive = archiver("zip", { store: false });
    archive.on("error", () => {
      res.status(500).json({ error: "Failed to create archive" });
    });
    
    archive.pipe(res);
    archive.file(path.join(desktopPath, "package.json"), { name: "flowp-desktop/package.json" });
    archive.file(path.join(desktopPath, "main.js"), { name: "flowp-desktop/main.js" });
    archive.file(path.join(desktopPath, "preload.js"), { name: "flowp-desktop/preload.js" });
    archive.file(path.join(desktopPath, "printer.js"), { name: "flowp-desktop/printer.js" });
    archive.file(path.join(desktopPath, "README.md"), { name: "flowp-desktop/README.md" });
    archive.file(path.join(desktopPath, ".github/workflows/build.yml"), { name: "flowp-desktop/.github/workflows/build.yml" });
    archive.file(path.join(desktopPath, "build/icon.ico"), { name: "flowp-desktop/build/icon.ico" });
    archive.file(path.join(desktopPath, "build/icon.png"), { name: "flowp-desktop/build/icon.png" });
    archive.file(path.join(desktopPath, "build/icon256.png"), { name: "flowp-desktop/build/icon256.png" });
    archive.file(path.join(desktopPath, "build/installerSidebar.bmp"), { name: "flowp-desktop/build/installerSidebar.bmp" });
    archive.file(path.join(desktopPath, "build/installerHeader.bmp"), { name: "flowp-desktop/build/installerHeader.bmp" });
    archive.finalize();
  });

  // Flowp Desktop Installer download from Object Storage (Windows)
  app.get("/desktop/installer.exe", async (req: Request, res: Response) => {
    try {
      const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
      const storageService = new ObjectStorageService();
      
      const fileName = "Flowp POS Setup 1.0.0.exe";
      const file = await storageService.searchPublicObject(fileName);
      
      if (!file) {
        return res.status(404).json({ error: "Windows installer not found. Please upload the installer to Object Storage public folder." });
      }
      
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="Flowp POS Setup 1.0.0.exe"`);
      res.setHeader("Cache-Control", "public, max-age=3600");
      
      file.createReadStream().pipe(res);
    } catch (error) {
      console.error("Error downloading Windows installer:", error);
      res.status(500).json({ error: "Failed to download installer" });
    }
  });

  // Flowp Desktop Installer download from Object Storage (macOS)
  app.get("/desktop/installer.dmg", async (req: Request, res: Response) => {
    try {
      const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
      const storageService = new ObjectStorageService();
      
      const fileName = "Flowp POS-1.0.0.dmg";
      const file = await storageService.searchPublicObject(fileName);
      
      if (!file) {
        return res.status(404).json({ error: "Mac installer not found. Please upload the DMG to Object Storage public folder." });
      }
      
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="Flowp POS.dmg"`);
      res.setHeader("Cache-Control", "public, max-age=3600");
      
      file.createReadStream().pipe(res);
    } catch (error) {
      console.error("Error downloading Mac installer:", error);
      res.status(500).json({ error: "Failed to download installer" });
    }
  });

  // Flowp Mobile App source code download
  app.get("/mobile/source.zip", (req: Request, res: Response) => {
    const zipPath = path.join(process.cwd(), "flowp-mobile-source.zip");
    
    if (!fs.existsSync(zipPath)) {
      return res.status(404).json({ error: "Mobile source not found" });
    }
    
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=Flowp-Mobile-Source.zip");
    res.setHeader("Cache-Control", "public, max-age=3600");
    fs.createReadStream(zipPath).pipe(res);
  });

  // Flowp Mobile Android APK download from Object Storage
  app.get("/mobile/android.apk", async (req: Request, res: Response) => {
    try {
      const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
      const storageService = new ObjectStorageService();
      
      const fileName = "Flowp-POS.apk";
      const file = await storageService.searchPublicObject(fileName);
      
      if (!file) {
        return res.status(404).json({ error: "Android APK not found. Please upload the APK to Object Storage public folder." });
      }
      
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", `attachment; filename="Flowp-POS.apk"`);
      res.setHeader("Cache-Control", "public, max-age=3600");
      
      file.createReadStream().pipe(res);
    } catch (error) {
      console.error("Error downloading Android APK:", error);
      res.status(500).json({ error: "Failed to download APK" });
    }
  });

  // ===== PAYPAL ROUTES =====
  // PayPal integration for subscription payments
  const paypalEnabled = process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET;
  
  if (paypalEnabled) {
    const { createPaypalOrder, capturePaypalOrder, loadPaypalDefault } = await import("./paypal");
    
    app.get("/paypal/setup", async (req, res) => {
      await loadPaypalDefault(req, res);
    });

    app.post("/paypal/order", async (req, res) => {
      await createPaypalOrder(req, res);
    });

    app.post("/paypal/order/:orderID/capture", async (req, res) => {
      await capturePaypalOrder(req, res);
    });
  }

  // ===== AUTH ROUTES =====

  // Register new tenant and admin user
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const {
        businessName,
        businessType,
        country,
        city,
        address,
        businessPhone,
        adminName,
        adminEmail,
        adminPhone,
        adminUsername,
        adminPassword,
        trialTier,
      } = req.body;

      // Validate required fields
      if (!adminEmail || !adminPhone) {
        return res.status(400).json({ message: "Email and phone number are required" });
      }

      const TRIAL_DAYS = 14;
      const validTiers = ["basic", "pro", "enterprise"];
      const selectedTier = validTiers.includes(trialTier) ? trialTier : "basic";
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

      // Create tenant
      const tenant = await storage.createTenant({
        name: businessName,
        type: businessType,
        country: country || null,
        city: city || null,
        address: address || null,
        phone: businessPhone || null,
        currency: "$",
        taxRate: "0",
        logo: null,
        featureFlags: businessType === "restaurant" ? RESTAURANT_FEATURES : RETAIL_FEATURES,
        subscriptionTier: selectedTier,
        trialEndsAt,
        status: "trial",
      } as any);

      // Create owner user (first user is always owner)
      const user = await storage.createUser({
        tenantId: tenant.id,
        username: adminUsername,
        password: adminPassword,
        name: adminName,
        email: adminEmail,
        phone: adminPhone,
        role: "owner",
        pin: null,
        isActive: true,
      });

      await storage.createRegister({
        tenantId: tenant.id,
        name: "Caja 1",
        deviceId: null,
        printerConfig: null,
      });

      // Send welcome email (async, don't wait)
      if (adminEmail) {
        emailService.sendWelcomeEmail(
          adminEmail,
          adminName || adminUsername,
          businessName,
          tenant.id,
          tenant.language || 'en'
        ).catch(err => console.error('Failed to send welcome email:', err));
      }

      res.json({ tenant, user: { ...user, password: undefined, pin: undefined, hasPin: !!user.pin } });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(400).json({ message: error.message || "Registration failed" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      // Find user by username (searches across all tenants for login)
      const user = await storage.getUserByUsername("", username);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Handle internal admin users (no tenant)
      if (user.isInternal) {
        // Generate JWT token for internal admin API access
        const token = generateInternalToken({
          id: user.id,
          email: user.email || user.username,
          role: (user.role as "superadmin" | "supportagent" | "billingops") || "superadmin",
        });
        
        return res.json({
          user: { ...user, password: undefined, pin: undefined, hasPin: !!user.pin },
          tenant: null,
          isInternal: true,
          redirectTo: "/admin",
          token,
        });
      }

      // Regular tenant user - require tenant
      if (!user.tenantId) {
        return res.status(401).json({ message: "User has no tenant assigned" });
      }

      const tenant = await storage.getTenant(user.tenantId);

      if (!tenant) {
        return res.status(401).json({ message: "Tenant not found" });
      }

      res.json({
        user: { ...user, password: undefined, pin: undefined, hasPin: !!user.pin },
        tenant,
        isInternal: false,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(401).json({ message: "Invalid credentials" });
    }
  });

  // Request password reset
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);
      
      // Always return success to prevent email enumeration
      if (!user) {
        return res.json({ message: "If an account exists with that email, a reset link has been sent." });
      }

      // Generate secure token
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await storage.createPasswordResetToken({
        userId: user.id,
        token,
        expiresAt,
      });

      // Get tenant's display language
      let displayLanguage = "en";
      if (user.tenantId) {
        const tenant = await storage.getTenant(user.tenantId);
        displayLanguage = tenant?.displayLanguage || "en";
      }

      // Send email (non-blocking)
      emailService.sendPasswordResetEmail(email, token, user.name || user.username, displayLanguage)
        .catch(err => console.error("Failed to send password reset email:", err));

      res.json({ message: "If an account exists with that email, a reset link has been sent." });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  // Reset password with token
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ message: "Token and password are required" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const resetToken = await storage.getPasswordResetToken(token);
      
      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      if (resetToken.usedAt) {
        return res.status(400).json({ message: "This reset link has already been used" });
      }

      if (new Date() > resetToken.expiresAt) {
        return res.status(400).json({ message: "This reset link has expired" });
      }

      // Hash new password and update user
      const hashedPassword = await bcrypt.hash(password, 10);
      await storage.updateUser(resetToken.userId, { password: hashedPassword });
      
      // Mark token as used
      await storage.markPasswordResetTokenUsed(token);

      res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Validate reset token (for UI)
  app.get("/api/auth/validate-reset-token", async (req: Request, res: Response) => {
    try {
      const token = req.query.token as string;
      
      if (!token) {
        return res.status(400).json({ valid: false, message: "Token is required" });
      }

      const resetToken = await storage.getPasswordResetToken(token);
      
      if (!resetToken || resetToken.usedAt || new Date() > resetToken.expiresAt) {
        return res.json({ valid: false, message: "Invalid or expired reset token" });
      }

      res.json({ valid: true });
    } catch (error) {
      res.status(500).json({ valid: false, message: "Failed to validate token" });
    }
  });

  const pinAttempts = new Map<string, { count: number; lastAttempt: number }>();
  app.post("/api/auth/verify-pin", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const { pin } = req.body;
      if (!userId || !pin) {
        return res.status(400).json({ success: false, message: "PIN is required" });
      }
      const attempts = pinAttempts.get(userId);
      if (attempts && attempts.count >= 5 && (Date.now() - attempts.lastAttempt) < 60000) {
        return res.status(429).json({ success: false, message: "Too many attempts. Wait 1 minute." });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      if (!user.pin) {
        return res.status(400).json({ success: false, message: "No PIN configured for this user" });
      }
      if (user.pin === pin) {
        pinAttempts.delete(userId);
        return res.json({ success: true });
      }
      const current = pinAttempts.get(userId) || { count: 0, lastAttempt: 0 };
      pinAttempts.set(userId, { count: current.count + 1, lastAttempt: Date.now() });
      return res.status(401).json({ success: false, message: "Invalid PIN" });
    } catch (error) {
      res.status(500).json({ success: false, message: "Failed to verify PIN" });
    }
  });

  app.post("/api/auth/set-pin", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const { pin, currentPin } = req.body;
      if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
        return res.status(400).json({ success: false, message: "PIN must be 4-6 digits" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      if (user.pin) {
        if (!currentPin) {
          return res.status(400).json({ success: false, message: "Current PIN is required" });
        }
        if (currentPin !== user.pin) {
          return res.status(401).json({ success: false, message: "Current PIN is incorrect" });
        }
      }
      await storage.updateUser(userId, { pin });
      res.json({ success: true });
    } catch (error) {
      console.error("Set PIN error:", error);
      res.status(500).json({ success: false, message: "Failed to set PIN" });
    }
  });

  app.post("/api/auth/delete-pin", async (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const { currentPin } = req.body;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      if (!user.pin) {
        return res.status(400).json({ success: false, message: "No PIN configured" });
      }
      if (!currentPin) {
        return res.status(400).json({ success: false, message: "Current PIN is required" });
      }
      if (currentPin !== user.pin) {
        return res.status(401).json({ success: false, message: "Current PIN is incorrect" });
      }
      await storage.updateUser(userId, { pin: null } as any);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete PIN error:", error);
      res.status(500).json({ success: false, message: "Failed to delete PIN" });
    }
  });

  // ===== USERS ROUTES =====

  app.get("/api/users", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json([]);
      }
      const users = await storage.getUsersByTenant(tenantId);
      res.json(users.map(u => ({ ...u, password: undefined, pin: undefined, hasPin: !!u.pin })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/users", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const limitCheck = await storage.checkSubscriptionLimit(tenantId, "users");
      if (!limitCheck.allowed) {
        return res.status(403).json({ message: "user_limit_reached", current: limitCheck.current, max: limitCheck.max, requiresUpgrade: true });
      }
      
      const { name, email, phone, username, password, role, pin } = req.body;
      
      if (!name || !email || !phone || !username || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }

      const existingUser = await storage.getUserByUsername(tenantId, username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // storage.createUser handles password hashing
      const user = await storage.createUser({
        tenantId,
        name,
        email,
        phone,
        username,
        password,
        role: role || "cashier",
        pin: pin || null,
      });

      res.json({ ...user, password: undefined, pin: undefined, hasPin: !!user.pin });
    } catch (error) {
      console.error("User creation error:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { id } = req.params;
      const { name, email, phone, username, password, role, pin } = req.body;
      
      // Verify user belongs to tenant
      const users = await storage.getUsersByTenant(tenantId);
      const existingUser = users.find(u => u.id === id);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const updateData: Record<string, unknown> = { name, email, phone, role, pin };
      
      if (username && username !== existingUser.username) {
        const usernameExists = await storage.getUserByUsername(tenantId, username);
        if (usernameExists) {
          return res.status(400).json({ message: "Username already exists" });
        }
        updateData.username = username;
      }

      if (password) {
        const bcrypt = await import("bcrypt");
        updateData.password = await bcrypt.hash(password, 10);
      }

      const user = await storage.updateUser(id, updateData);
      res.json({ ...user, password: undefined, pin: undefined, hasPin: !!user?.pin });
    } catch (error) {
      console.error("User update error:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  const emailPreferencesSchema = z.object({
    lowStockAlerts: z.boolean().optional(),
    expiringProductAlerts: z.boolean().optional(),
    newSaleNotification: z.boolean().optional(),
    dailySalesReport: z.boolean().optional(),
    weeklyReport: z.boolean().optional(),
    newCustomerNotification: z.boolean().optional(),
    orderNotifications: z.boolean().optional(),
    refundAlerts: z.boolean().optional(),
    highValueSaleAlerts: z.boolean().optional(),
    systemAlerts: z.boolean().optional(),
  });

  app.patch("/api/users/:id/email-preferences", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // Validate email preferences
      const parseResult = emailPreferencesSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid email preferences", errors: parseResult.error.errors });
      }
      const emailPreferences = parseResult.data;
      
      // Verify user belongs to tenant
      const users = await storage.getUsersByTenant(tenantId);
      const existingUser = users.find(u => u.id === id);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const user = await storage.updateUser(id, { emailPreferences });
      res.json({ ...user, password: undefined });
    } catch (error) {
      console.error("Email preferences update error:", error);
      res.status(500).json({ message: "Failed to update email preferences" });
    }
  });

  app.delete("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // Verify user belongs to tenant
      const users = await storage.getUsersByTenant(tenantId);
      const existingUser = users.find(u => u.id === id);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Don't allow deleting yourself
      const currentUserId = req.headers["x-user-id"] as string;
      if (id === currentUserId) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      await storage.deleteUser(id);
      res.json({ success: true });
    } catch (error) {
      console.error("User deletion error:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // ===== CATEGORIES ROUTES =====

  app.get("/api/categories", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json([]);
      }
      const categories = await storage.getCategoriesByTenant(tenantId);
      res.json(categories);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post("/api/categories", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const data = insertCategorySchema.parse({ ...req.body, tenantId });
      const category = await storage.createCategory(data);
      res.json(category);
    } catch (error) {
      res.status(400).json({ message: "Failed to create category" });
    }
  });

  app.patch("/api/categories/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      // Verify category belongs to tenant
      const categories = await storage.getCategoriesByTenant(tenantId);
      const exists = categories.find(c => c.id === id);
      if (!exists) {
        return res.status(404).json({ message: "Category not found" });
      }
      const category = await storage.updateCategory(id, req.body);
      res.json(category);
    } catch (error) {
      res.status(400).json({ message: "Failed to update category" });
    }
  });

  app.delete("/api/categories/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      // Verify category belongs to tenant
      const categories = await storage.getCategoriesByTenant(tenantId);
      const exists = categories.find(c => c.id === id);
      if (!exists) {
        return res.status(404).json({ message: "Category not found" });
      }
      await storage.deleteCategory(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete category" });
    }
  });

  // ===== PRODUCTS ROUTES =====

  app.get("/api/products", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json([]);
      }
      const products = await storage.getProductsByTenant(tenantId);
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.post("/api/products", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const limitCheck = await storage.checkSubscriptionLimit(tenantId, "products");
      if (!limitCheck.allowed) {
        return res.status(403).json({ message: "product_limit_reached", current: limitCheck.current, max: limitCheck.max, requiresUpgrade: true });
      }

      const body = { ...req.body, tenantId };
      if (body.categoryId === "" || body.categoryId === undefined) {
        body.categoryId = null;
      }
      const data = insertProductSchema.parse(body);
      const product = await storage.createProduct(data);
      res.json(product);
    } catch (error: any) {
      console.error("Product creation error:", error);
      if (error?.issues) {
        console.error("Zod validation errors:", JSON.stringify(error.issues, null, 2));
      }
      res.status(400).json({ message: "Failed to create product", details: error?.issues || error?.message });
    }
  });

  app.patch("/api/products/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      // Verify product belongs to tenant
      const existingProducts = await storage.getProductsByTenant(tenantId);
      const exists = existingProducts.find(p => p.id === id);
      if (!exists) {
        return res.status(404).json({ message: "Product not found" });
      }
      // Convert/sanitize numeric fields
      const updateData = { ...req.body };
      if (typeof updateData.lowStockThreshold === 'string') {
        updateData.lowStockThreshold = parseInt(updateData.lowStockThreshold, 10) || 10;
      }
      // Handle empty strings for numeric fields - convert to null
      if (updateData.cost === '' || updateData.cost === undefined) {
        updateData.cost = null;
      }
      if (updateData.price === '') {
        delete updateData.price; // Don't update price if empty
      }
      // Convert empty categoryId to null to avoid foreign key constraint errors
      if (updateData.categoryId === '' || updateData.categoryId === undefined) {
        updateData.categoryId = null;
      }
      const product = await storage.updateProduct(id, updateData);
      res.json(product);
    } catch (error: any) {
      console.error("Product update error:", error);
      res.status(400).json({ message: "Failed to update product", error: error?.message || String(error) });
    }
  });

  app.delete("/api/products/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      // Verify product belongs to tenant
      const productsList = await storage.getProductsByTenant(tenantId);
      const exists = productsList.find(p => p.id === id);
      if (!exists) {
        return res.status(404).json({ message: "Product not found" });
      }
      // Soft delete - set isActive to false instead of hard delete
      // This preserves data integrity for historical orders/stock movements
      await storage.updateProduct(id, { isActive: false });
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete product" });
    }
  });

  // Batch product creation from CSV
  app.post("/api/products/batch", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { products: productList } = req.body;
      if (!Array.isArray(productList) || productList.length === 0) {
        return res.status(400).json({ message: "Products array is required" });
      }

      // Get categories for mapping by name
      const categories = await storage.getCategoriesByTenant(tenantId);
      const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));

      const results = {
        success: 0,
        failed: 0,
        errors: [] as { row: number; error: string }[],
      };

      for (let i = 0; i < productList.length; i++) {
        const item = productList[i];
        try {
          // Map category name to ID
          let categoryId = null;
          if (item.categoryName) {
            categoryId = categoryMap.get(item.categoryName.toLowerCase()) || null;
          }

          const productData = {
            tenantId,
            name: item.name,
            sku: item.sku || null,
            barcode: item.barcode || null,
            price: item.price?.toString() || "0",
            cost: item.cost?.toString() || null,
            description: item.description || null,
            categoryId,
            isActive: item.isActive !== false,
            trackInventory: item.trackInventory !== false,
          };

          await storage.createProduct(productData);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: i + 2, // +2 for header row and 0-indexing
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      res.json(results);
    } catch (error) {
      console.error("Batch product creation error:", error);
      res.status(400).json({ message: "Failed to create products" });
    }
  });

  // CSV template downloads
  app.get("/api/csv/template/categories", (req: Request, res: Response) => {
    const csvContent = "name,color\nBeverages,#3B82F6\nFood,#10B981\nDesserts,#F59E0B";
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=categories_template.csv");
    res.send(csvContent);
  });

  app.get("/api/csv/template/products", (req: Request, res: Response) => {
    const csvContent = "name,sku,barcode,price,cost,categoryName,description,trackInventory\nCoffee,SKU001,123456789,2.50,1.00,Beverages,Hot coffee,true\nSandwich,SKU002,987654321,5.99,2.50,Food,Turkey sandwich,true";
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=products_template.csv");
    res.send(csvContent);
  });

  app.get("/api/csv/template/stock", (req: Request, res: Response) => {
    const csvContent = "sku,barcode,quantity,notes\nSKU001,123456789,100,Initial stock\nSKU002,987654321,50,Opening inventory";
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=stock_template.csv");
    res.send(csvContent);
  });

  // Batch stock import
  app.post("/api/inventory/batch", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { stock: stockList } = req.body;
      if (!Array.isArray(stockList) || stockList.length === 0) {
        return res.status(400).json({ message: "Stock array is required" });
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as { row: number; error: string }[],
      };

      // Get all products for this tenant
      const products = await storage.getProductsByTenant(tenantId);

      for (let i = 0; i < stockList.length; i++) {
        const item = stockList[i];
        try {
          // Find product by SKU or barcode
          const product = products.find(
            p => (item.sku && p.sku === item.sku) || (item.barcode && p.barcode === item.barcode)
          );

          if (!product) {
            results.failed++;
            results.errors.push({
              row: i + 2,
              error: `Product not found: SKU=${item.sku || 'N/A'}, Barcode=${item.barcode || 'N/A'}`,
            });
            continue;
          }

          if (!product.trackInventory) {
            results.failed++;
            results.errors.push({
              row: i + 2,
              error: `Product ${product.name} does not track inventory`,
            });
            continue;
          }

          const quantity = parseInt(item.quantity) || 0;
          if (quantity > 0) {
            await storage.createStockMovement({
              tenantId,
              productId: product.id,
              type: "purchase",
              quantity,
              notes: item.notes || "Imported via CSV",
              userId: null,
            });
            results.success++;
          } else {
            results.failed++;
            results.errors.push({
              row: i + 2,
              error: `Invalid quantity: ${item.quantity}`,
            });
          }
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: i + 2,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      res.json(results);
    } catch (error) {
      console.error("Batch stock import error:", error);
      res.status(400).json({ message: "Failed to import stock" });
    }
  });

  // Batch category creation
  app.post("/api/categories/batch", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { categories: categoryList } = req.body;
      if (!Array.isArray(categoryList) || categoryList.length === 0) {
        return res.status(400).json({ message: "Categories array is required" });
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as { row: number; error: string }[],
      };

      for (let i = 0; i < categoryList.length; i++) {
        const item = categoryList[i];
        try {
          const categoryData = {
            tenantId,
            name: item.name,
            color: item.color || "#3B82F6",
            isActive: true,
            sortOrder: 0,
          };

          await storage.createCategory(categoryData);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: i + 2,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      res.json(results);
    } catch (error) {
      console.error("Batch category creation error:", error);
      res.status(400).json({ message: "Failed to create categories" });
    }
  });

  // ===== CUSTOMERS ROUTES =====

  app.get("/api/customers", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json([]);
      }
      const customers = await storage.getCustomersByTenant(tenantId);
      res.json(customers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  app.get("/api/customers/search", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json([]);
      }
      const query = req.query.q as string || "";
      const customers = await storage.searchCustomers(tenantId, query);
      res.json(customers);
    } catch (error) {
      res.status(500).json({ message: "Failed to search customers" });
    }
  });

  app.get("/api/customers/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      const customer = await storage.getCustomer(id);
      if (!customer || customer.tenantId !== tenantId) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customer" });
    }
  });

  app.post("/api/customers", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      // Handle empty strings as undefined for optional fields
      const cleanedBody = {
        ...req.body,
        tenantId,
        idType: req.body.idType || undefined,
        idNumber: req.body.idNumber || undefined,
        phone: req.body.phone || undefined,
        email: req.body.email || undefined,
      };
      const data = insertCustomerSchema.parse(cleanedBody);
      const customer = await storage.createCustomer(data);
      res.json(customer);
    } catch (error: any) {
      console.error("Customer creation error:", error?.message || error);
      if (error?.issues) {
        console.error("Validation issues:", JSON.stringify(error.issues, null, 2));
      }
      res.status(400).json({ message: "Failed to create customer", error: error?.message });
    }
  });

  app.patch("/api/customers/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      const existing = await storage.getCustomer(id);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ message: "Customer not found" });
      }
      // Only allow specific fields to be updated
      const { 
        name, email, phone, address, idType, idNumber, notes,
        countryCode, municipalityId, organizationTypeId, taxRegimeId, taxLiabilityId, defaultDiscount
      } = req.body;
      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (address !== undefined) updateData.address = address;
      if (idType !== undefined) updateData.idType = idType;
      if (idNumber !== undefined) updateData.idNumber = idNumber;
      if (notes !== undefined) updateData.notes = notes;
      if (countryCode !== undefined) updateData.countryCode = countryCode;
      if (municipalityId !== undefined) updateData.municipalityId = municipalityId;
      if (organizationTypeId !== undefined) updateData.organizationTypeId = organizationTypeId;
      if (taxRegimeId !== undefined) updateData.taxRegimeId = taxRegimeId;
      if (taxLiabilityId !== undefined) updateData.taxLiabilityId = taxLiabilityId;
      if (defaultDiscount !== undefined) updateData.defaultDiscount = defaultDiscount;
      
      const customer = await storage.updateCustomer(id, updateData);
      res.json(customer);
    } catch (error: any) {
      console.error("[customers] Update failed:", error);
      res.status(400).json({ message: "Failed to update customer", error: error?.message });
    }
  });

  app.delete("/api/customers/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      const existing = await storage.getCustomer(id);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ message: "Customer not found" });
      }
      await storage.deleteCustomer(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete customer" });
    }
  });

  // Customer details with orders and loyalty transactions
  app.get("/api/customers/:id/details", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      const customer = await storage.getCustomer(id);
      if (!customer || customer.tenantId !== tenantId) {
        return res.status(404).json({ message: "Customer not found" });
      }
      const orders = await storage.getOrdersByCustomer(id);
      const loyaltyTransactions = await storage.getLoyaltyTransactionsByCustomer(id);
      res.json({ ...customer, orders, loyaltyTransactions });
    } catch (error) {
      console.error("Customer details error:", error);
      res.status(500).json({ message: "Failed to fetch customer details" });
    }
  });

  // ===== LOYALTY REWARDS ROUTES =====

  app.get("/api/loyalty/rewards", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const rewards = await storage.getLoyaltyRewardsByTenant(tenantId);
      res.json(rewards);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rewards" });
    }
  });

  app.post("/api/loyalty/rewards", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const reward = await storage.createLoyaltyReward({ ...req.body, tenantId });
      res.json(reward);
    } catch (error) {
      console.error("Create reward error:", error);
      res.status(400).json({ message: "Failed to create reward" });
    }
  });

  app.patch("/api/loyalty/rewards/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      const reward = await storage.updateLoyaltyReward(id, req.body);
      res.json(reward);
    } catch (error) {
      res.status(400).json({ message: "Failed to update reward" });
    }
  });

  app.delete("/api/loyalty/rewards/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      await storage.deleteLoyaltyReward(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete reward" });
    }
  });

  // ===== TAX RATES ROUTES =====

  app.get("/api/tax-rates", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const taxRates = await storage.getTaxRatesByTenant(tenantId);
      res.json(taxRates);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tax rates" });
    }
  });

  app.post("/api/tax-rates", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const taxRate = await storage.createTaxRate({ ...req.body, tenantId });
      res.json(taxRate);
    } catch (error) {
      console.error("Create tax rate error:", error);
      res.status(400).json({ message: "Failed to create tax rate" });
    }
  });

  app.patch("/api/tax-rates/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      const taxRate = await storage.updateTaxRate(id, req.body);
      res.json(taxRate);
    } catch (error) {
      res.status(400).json({ message: "Failed to update tax rate" });
    }
  });

  app.delete("/api/tax-rates/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      await storage.deleteTaxRate(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete tax rate" });
    }
  });

  // ===== FLOORS ROUTES =====

  app.get("/api/floors", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json([]);
      }
      const floors = await storage.getFloorsByTenant(tenantId);
      res.json(floors);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch floors" });
    }
  });

  app.post("/api/floors", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const data = insertFloorSchema.parse({ ...req.body, tenantId });
      const floor = await storage.createFloor(data);
      res.json(floor);
    } catch (error) {
      res.status(400).json({ message: "Failed to create floor" });
    }
  });

  app.patch("/api/floors/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      // Verify floor belongs to tenant
      const floors = await storage.getFloorsByTenant(tenantId);
      const exists = floors.find(f => f.id === id);
      if (!exists) {
        return res.status(404).json({ message: "Floor not found" });
      }
      const floor = await storage.updateFloor(id, req.body);
      res.json(floor);
    } catch (error) {
      res.status(400).json({ message: "Failed to update floor" });
    }
  });

  app.delete("/api/floors/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      // Verify floor belongs to tenant
      const floors = await storage.getFloorsByTenant(tenantId);
      const exists = floors.find(f => f.id === id);
      if (!exists) {
        return res.status(404).json({ message: "Floor not found" });
      }
      await storage.deleteFloor(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete floor" });
    }
  });

  // ===== TABLES ROUTES =====

  app.get("/api/tables", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json([]);
      }
      const tables = await storage.getTablesByTenant(tenantId);
      res.json(tables);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tables" });
    }
  });

  app.post("/api/tables", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const limitCheck = await storage.checkSubscriptionLimit(tenantId, "tables");
      if (!limitCheck.allowed) {
        return res.status(403).json({ message: "Table limit reached for your subscription plan", current: limitCheck.current, max: limitCheck.max });
      }
      if (req.body.floorId) {
        const floors = await storage.getFloorsByTenant(tenantId);
        const floorExists = floors.find(f => f.id === req.body.floorId);
        if (!floorExists) {
          return res.status(400).json({ message: "Invalid floor" });
        }
      }
      // Override tenantId from header to prevent cross-tenant creation
      const data = insertTableSchema.parse({ ...req.body, tenantId });
      const table = await storage.createTable(data);
      res.json(table);
    } catch (error) {
      res.status(400).json({ message: "Failed to create table" });
    }
  });

  app.patch("/api/tables/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      // Verify table belongs to tenant
      const tables = await storage.getTablesByTenant(tenantId);
      const exists = tables.find(t => t.id === id);
      if (!exists) {
        return res.status(404).json({ message: "Table not found" });
      }
      const table = await storage.updateTable(id, req.body);
      res.json(table);
    } catch (error) {
      res.status(400).json({ message: "Failed to update table" });
    }
  });

  app.delete("/api/tables/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      // Verify table belongs to tenant
      const tables = await storage.getTablesByTenant(tenantId);
      const exists = tables.find(t => t.id === id);
      if (!exists) {
        return res.status(404).json({ message: "Table not found" });
      }
      await storage.deleteTable(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete table" });
    }
  });

  // ===== TAB MANAGEMENT ROUTES (Restaurant Dine-in) =====

  // Get open tab for a table
  app.get("/api/tabs/table/:tableId", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { tableId } = req.params;
      
      // Verify table belongs to tenant
      const tables = await storage.getTablesByTenant(tenantId);
      const table = tables.find(t => t.id === tableId);
      if (!table) {
        return res.status(404).json({ message: "Table not found" });
      }
      
      const tab = await storage.getOpenTabByTable(tableId);
      if (!tab) {
        return res.json(null);
      }
      
      // Get items for the tab
      const items = await storage.getOrderItems(tab.id);
      res.json({ ...tab, items });
    } catch (error) {
      console.error("Error fetching tab:", error);
      res.status(500).json({ message: "Failed to fetch tab" });
    }
  });

  // Open a new tab for a table
  app.post("/api/tabs", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId || !userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { tableId, customerId } = req.body;

      const activeSession = await storage.getActiveSessionByTenant(tenantId);
      if (!activeSession) {
        return res.status(403).json({ message: "REGISTER_NOT_OPEN", error: "No active register session. Please open the cash register first." });
      }
      
      // Verify table belongs to tenant
      const tables = await storage.getTablesByTenant(tenantId);
      const table = tables.find(t => t.id === tableId);
      if (!table) {
        return res.status(404).json({ message: "Table not found" });
      }
      
      // Check if table already has an open tab
      const existingTab = await storage.getOpenTabByTable(tableId);
      if (existingTab) {
        return res.status(400).json({ message: "Table already has an open tab" });
      }
      
      // Get next order number
      const orderNumber = await storage.getNextOrderNumber(tenantId);
      
      // Create tab (order with status "tab")
      const tab = await storage.createOrder({
        tenantId,
        userId,
        tableId,
        customerId: customerId || null,
        orderNumber,
        status: "tab",
        subtotal: "0",
        taxAmount: "0",
        discountAmount: "0",
        total: "0",
        registerId: activeSession.registerId,
        registerSessionId: activeSession.id,
      });
      
      // Update table status to occupied
      await storage.updateTable(tableId, { status: "occupied" });
      
      res.json(tab);
    } catch (error) {
      console.error("Error opening tab:", error);
      res.status(500).json({ message: "Failed to open tab" });
    }
  });

  // Add items to a tab
  app.post("/api/tabs/:id/items", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { id } = req.params;
      const { items } = req.body;
      
      // Verify tab exists and belongs to tenant
      const tab = await storage.getOrder(id);
      if (!tab || tab.tenantId !== tenantId || tab.status !== "tab") {
        return res.status(404).json({ message: "Tab not found" });
      }
      
      // Add items to the tab
      const createdItems = [];
      for (const item of items) {
        const orderItem = await storage.createOrderItem({
          orderId: id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          modifiers: item.modifiers || [],
          notes: item.notes || null,
          sentToKitchen: false,
        });
        createdItems.push(orderItem);
      }
      
      // Recalculate tab totals
      const allItems = await storage.getOrderItems(id);
      let subtotal = 0;
      for (const item of allItems) {
        const itemTotal = parseFloat(item.unitPrice) * item.quantity;
        const modifierTotal = (item.modifiers || []).reduce((sum: number, m: any) => sum + parseFloat(m.price || "0"), 0) * item.quantity;
        subtotal += itemTotal + modifierTotal;
      }
      
      // Get tax rates for calculation
      const taxRates = await storage.getTaxRatesByTenant(tenantId);
      const activeTaxRates = taxRates.filter(t => t.isActive);
      const totalTaxRate = activeTaxRates.reduce((sum, t) => sum + parseFloat(t.rate), 0);
      const taxAmount = subtotal * (totalTaxRate / 100);
      const total = subtotal + taxAmount;
      
      await storage.updateOrder(id, {
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
      });
      
      res.json({ items: createdItems, subtotal, taxAmount, total });
    } catch (error) {
      console.error("Error adding items to tab:", error);
      res.status(500).json({ message: "Failed to add items to tab" });
    }
  });

  // Update item in a tab
  app.patch("/api/tabs/:id/items/:itemId", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { id, itemId } = req.params;
      const { quantity, notes } = req.body;
      
      // Verify tab exists and belongs to tenant
      const tab = await storage.getOrder(id);
      if (!tab || tab.tenantId !== tenantId || tab.status !== "tab") {
        return res.status(404).json({ message: "Tab not found" });
      }
      
      // Verify item belongs to this tab
      const item = await storage.getOrderItem(itemId);
      if (!item || item.orderId !== id) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Don't allow modifying items already sent to kitchen
      if (item.sentToKitchen) {
        return res.status(400).json({ message: "Cannot modify item already sent to kitchen" });
      }
      
      await storage.updateOrderItem(itemId, { quantity, notes });
      
      // Recalculate totals
      const allItems = await storage.getOrderItems(id);
      let subtotal = 0;
      for (const i of allItems) {
        const itemTotal = parseFloat(i.unitPrice) * (i.id === itemId ? quantity : i.quantity);
        const modifierTotal = (i.modifiers || []).reduce((sum: number, m: any) => sum + parseFloat(m.price || "0"), 0) * (i.id === itemId ? quantity : i.quantity);
        subtotal += itemTotal + modifierTotal;
      }
      
      const taxRates = await storage.getTaxRatesByTenant(tenantId);
      const activeTaxRates = taxRates.filter(t => t.isActive);
      const totalTaxRate = activeTaxRates.reduce((sum, t) => sum + parseFloat(t.rate), 0);
      const taxAmount = subtotal * (totalTaxRate / 100);
      const total = subtotal + taxAmount;
      
      await storage.updateOrder(id, {
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating tab item:", error);
      res.status(500).json({ message: "Failed to update item" });
    }
  });

  // Remove item from a tab
  app.delete("/api/tabs/:id/items/:itemId", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { id, itemId } = req.params;
      
      // Verify tab exists and belongs to tenant
      const tab = await storage.getOrder(id);
      if (!tab || tab.tenantId !== tenantId || tab.status !== "tab") {
        return res.status(404).json({ message: "Tab not found" });
      }
      
      // Verify item belongs to this tab
      const item = await storage.getOrderItem(itemId);
      if (!item || item.orderId !== id) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Don't allow removing items already sent to kitchen
      if (item.sentToKitchen) {
        return res.status(400).json({ message: "Cannot remove item already sent to kitchen" });
      }
      
      await storage.deleteOrderItem(itemId);
      
      // Recalculate totals
      const allItems = await storage.getOrderItems(id);
      let subtotal = 0;
      for (const i of allItems) {
        if (i.id !== itemId) {
          const itemTotal = parseFloat(i.unitPrice) * i.quantity;
          const modifierTotal = (i.modifiers || []).reduce((sum: number, m: any) => sum + parseFloat(m.price || "0"), 0) * i.quantity;
          subtotal += itemTotal + modifierTotal;
        }
      }
      
      const taxRates = await storage.getTaxRatesByTenant(tenantId);
      const activeTaxRates = taxRates.filter(t => t.isActive);
      const totalTaxRate = activeTaxRates.reduce((sum, t) => sum + parseFloat(t.rate), 0);
      const taxAmount = subtotal * (totalTaxRate / 100);
      const total = subtotal + taxAmount;
      
      await storage.updateOrder(id, {
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing tab item:", error);
      res.status(500).json({ message: "Failed to remove item" });
    }
  });

  // Send items to kitchen
  app.post("/api/tabs/:id/send-to-kitchen", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // Verify tab exists and belongs to tenant
      const tab = await storage.getOrder(id);
      if (!tab || tab.tenantId !== tenantId || tab.status !== "tab") {
        return res.status(404).json({ message: "Tab not found" });
      }
      
      // Get items not yet sent to kitchen
      const allItems = await storage.getOrderItems(id);
      const unsent = allItems.filter(item => !item.sentToKitchen);
      
      if (unsent.length === 0) {
        return res.status(400).json({ message: "No new items to send to kitchen" });
      }
      
      // Get product names for ticket
      const products = await storage.getProductsByTenant(tenantId);
      const productMap = new Map(products.map(p => [p.id, p]));
      
      // Create kitchen ticket with unsent items
      const ticketItems = unsent.map(item => {
        const product = productMap.get(item.productId);
        return {
          id: item.id,
          name: product?.name || "Unknown",
          quantity: item.quantity,
          modifiers: (item.modifiers || []).map((m: any) => m.name),
          notes: item.notes || undefined,
        };
      });
      
      const ticket = await storage.createKitchenTicket({
        orderId: id,
        tableId: tab.tableId,
        station: "kitchen",
        status: "new",
        items: ticketItems,
      });
      
      // Mark items as sent to kitchen
      for (const item of unsent) {
        await storage.updateOrderItem(item.id, { sentToKitchen: true });
      }
      
      // Broadcast to kitchen display
      broadcastToTenant(tenantId, {
        type: "NEW_TICKET",
        ticket,
      });
      
      res.json({ ticket, itemsSent: unsent.length });
    } catch (error) {
      console.error("Error sending to kitchen:", error);
      res.status(500).json({ message: "Failed to send to kitchen" });
    }
  });

  // Close tab and process payment
  app.post("/api/tabs/:id/close", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId || !userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { id } = req.params;
      const { paymentMethod, paymentReference, splitPayments } = req.body;
      
      // Verify tab exists and belongs to tenant
      const tab = await storage.getOrder(id);
      if (!tab || tab.tenantId !== tenantId || tab.status !== "tab") {
        return res.status(404).json({ message: "Tab not found" });
      }
      
      // Create payment record(s)
      if (splitPayments && splitPayments.length > 0) {
        for (const split of splitPayments) {
          await storage.createPayment({
            orderId: id,
            method: split.method,
            amount: split.amount.toFixed(2),
            reference: split.reference || null,
          });
        }
      } else {
        await storage.createPayment({
          orderId: id,
          method: paymentMethod || "cash",
          amount: tab.total,
          reference: paymentReference || null,
        });
      }
      
      // Update order status to completed
      await storage.updateOrder(id, {
        status: "completed",
        completedAt: new Date(),
      });
      
      // Get items for stock deduction
      const items = await storage.getOrderItems(id);
      const products = await storage.getProductsByTenant(tenantId);
      const productMap = new Map(products.map(p => [p.id, p]));
      
      // Deduct inventory
      for (const item of items) {
        const product = productMap.get(item.productId);
        if (product?.trackInventory) {
          await storage.createStockMovement({
            tenantId,
            productId: item.productId,
            type: "sale",
            quantity: -item.quantity,
            referenceId: id,
            userId,
          });
        }
      }
      
      // Update table status to dirty
      if (tab.tableId) {
        await storage.updateTable(tab.tableId, { status: "dirty" });
      }
      
      // Update customer stats if applicable
      if (tab.customerId) {
        const customer = await storage.getCustomer(tab.customerId);
        if (customer) {
          await storage.updateCustomer(tab.customerId, {
            totalSpent: (parseFloat(customer.totalSpent?.toString() || "0") + parseFloat(tab.total)).toString(),
            orderCount: (customer.orderCount || 0) + 1,
            lastPurchaseAt: new Date(),
          });
        }
      }
      
      const updatedTab = await storage.getOrder(id);
      res.json(updatedTab);

      if (tab.customerId) {
        const customer = await storage.getCustomer(tab.customerId);
        if (customer?.phone) {
          const tenant = await storage.getTenant(tenantId);
          const orderTotal = parseFloat(tab.total);
          const pointsEarned = Math.floor(orderTotal / 1000);
          const token = createReceiptToken(id, tenantId);
          const appUrl = process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "flowp.replit.app"}`;
          const receiptPdfUrl = `${appUrl}/api/receipt-pdf/${token}`;
          const fullPhone = `${customer.phoneCountryCode || "57"}${customer.phone.replace(/\D/g, "")}`;
          sendReceiptNotification(
            tenantId,
            fullPhone,
            updatedTab?.orderNumber || id.slice(0, 8),
            tab.total,
            tenant?.companyName || "Flowp",
            tenant?.currency || "COP",
            pointsEarned,
            receiptPdfUrl
          ).catch(err => console.error("[whatsapp] receipt notification error:", err));
        }
      }
    } catch (error) {
      console.error("Error closing tab:", error);
      res.status(500).json({ message: "Failed to close tab" });
    }
  });

  // Cancel/void a tab
  app.post("/api/tabs/:id/cancel", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { id } = req.params;
      const { reason } = req.body;
      
      // Verify tab exists and belongs to tenant
      const tab = await storage.getOrder(id);
      if (!tab || tab.tenantId !== tenantId || tab.status !== "tab") {
        return res.status(404).json({ message: "Tab not found" });
      }
      
      // Update order status to cancelled
      await storage.updateOrder(id, {
        status: "cancelled",
        notes: reason || "Tab cancelled",
      });
      
      // Update table status to dirty
      if (tab.tableId) {
        await storage.updateTable(tab.tableId, { status: "dirty" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error cancelling tab:", error);
      res.status(500).json({ message: "Failed to cancel tab" });
    }
  });

  // ===== ORDERS ROUTES =====

  app.get("/api/orders", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json([]);
      }
      const orders = await storage.getOrdersByTenant(tenantId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/history", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json([]);
      }
      
      const filter = req.query.filter as string || "today";
      
      // Calculate date filter
      const now = new Date();
      let startDate: Date | null = null;
      
      if (filter === "today") {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (filter === "week") {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (filter === "month") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      
      const orders = await storage.getOrdersWithDetails(tenantId, startDate);
      res.json(orders);
    } catch (error) {
      console.error("Orders history error:", error);
      res.status(500).json({ message: "Failed to fetch order history" });
    }
  });

  app.post("/api/orders", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;

      if (!tenantId || !userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { items, paymentMethod, subtotal, taxAmount, total, customerId, salesRepId, appliedRewardId, appliedRewardPoints } = req.body;

      const activeSession = await storage.getActiveSessionByTenant(tenantId);
      if (!activeSession) {
        return res.status(403).json({ message: "REGISTER_NOT_OPEN", error: "No active register session. Please open the cash register before making sales." });
      }

      // Get next order number
      const orderNumber = await storage.getNextOrderNumber(tenantId);

      // Create order
      const order = await storage.createOrder({
        tenantId,
        userId,
        salesRepId: salesRepId || null,
        orderNumber,
        status: "completed",
        subtotal: subtotal.toString(),
        taxAmount: taxAmount.toString(),
        total: total.toString(),
        discountAmount: "0",
        registerId: activeSession?.registerId || null,
        registerSessionId: activeSession?.id || null,
        customerId: customerId || null,
        tableId: null,
        notes: null,
      });

      // Create order items and stock movements
      for (const item of items) {
        await storage.createOrderItem({
          orderId: order.id,
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: item.product.price,
          modifiers: item.modifiers || [],
          notes: item.notes || null,
          sentToKitchen: false,
        });

        // Create stock movement for sale
        const product = await storage.getProduct(item.product.id);
        if (product?.trackInventory) {
          await storage.createStockMovement({
            tenantId,
            productId: item.product.id,
            type: "sale",
            quantity: -item.quantity,
            referenceId: order.id,
            notes: null,
            userId,
          });

          // Check for low stock and send alert
          if (product.lowStockThreshold != null) {
            const stockLevels = await storage.getStockLevels(tenantId);
            const currentStock = stockLevels[product.id] || 0;
            if (currentStock <= product.lowStockThreshold) {
              // Get owner email to send low stock alert
              const tenantUsers = await storage.getUsersByTenant(tenantId);
              const owner = tenantUsers.find(u => u.role === 'owner');
              // Check if owner has low stock alerts enabled
              const emailPrefs = owner?.emailPreferences as { lowStockAlerts?: boolean } | null;
              if (owner?.email && emailPrefs?.lowStockAlerts !== false) {
                const tenant = await storage.getTenant(tenantId);
                emailService.sendLowStockAlert(
                  owner.email,
                  product.name,
                  currentStock,
                  tenantId,
                  tenant?.displayLanguage || 'en',
                  {
                    companyName: tenant?.companyName || undefined,
                    minStock: product.lowStockThreshold,
                    sku: product.sku || undefined,
                  }
                ).catch(err => console.error('Failed to send low stock alert:', err));
              }
              if (owner?.phone) {
                sendLowStockNotification(
                  tenantId,
                  owner.phone,
                  product.name,
                  currentStock,
                  product.lowStockThreshold!,
                  product.sku || undefined
                ).catch(err => console.error('[whatsapp] low stock notification error:', err));
              }
            }
          }
        }

        // FIFO ingredient consumption for restaurant Pro tenants
        const tenant = await storage.getTenant(tenantId);
        if (tenant?.type === "restaurant") {
          const hasIngredientFeature = await storage.hasTenantProFeature(tenantId, "restaurant_bom");
          if (hasIngredientFeature) {
            const recipe = await storage.getRecipeByProduct(item.product.id);
            if (recipe && recipe.tenantId === tenantId) {
              const recipeItems = await storage.getRecipeItems(recipe.id);
              for (const recipeItem of recipeItems) {
                const qtyNeeded = parseFloat(recipeItem.qtyPerProduct) * item.quantity;
                await storage.consumeIngredientFifo(tenantId, recipeItem.ingredientId, qtyNeeded, order.id, userId);
              }
            }
          }
        }
      }

      // Create payment
      await storage.createPayment({
        orderId: order.id,
        method: paymentMethod,
        amount: total.toString(),
        reference: null,
      });

      // Award loyalty points and update customer stats if customer is associated
      if (customerId) {
        const customer = await storage.getCustomer(customerId);
        // Security: Verify customer belongs to the same tenant
        if (customer && customer.tenantId === tenantId) {
          // Calculate points - 1 point per 1000 currency units (configurable per business)
          const orderTotal = parseFloat(total.toString());
          const pointsEarned = Math.floor(orderTotal / 1000);
          
          // Calculate net points change (earned minus redeemed)
          const pointsRedeemed = appliedRewardId && appliedRewardPoints ? appliedRewardPoints : 0;
          const netPointsChange = pointsEarned - pointsRedeemed;
          
          if (pointsEarned > 0) {
            // Create loyalty transaction for earned points
            await storage.createLoyaltyTransaction({
              tenantId,
              customerId,
              orderId: order.id,
              type: "earned",
              points: pointsEarned,
            });
          }
          
          // Create loyalty transaction for redeemed points (if reward was applied)
          if (pointsRedeemed > 0) {
            await storage.createLoyaltyTransaction({
              tenantId,
              customerId,
              orderId: order.id,
              type: "redeemed",
              points: -pointsRedeemed,
            });
          }
          
          // Update customer stats with net points change
          await storage.updateCustomer(customerId, {
            loyaltyPoints: Math.max(0, (customer.loyaltyPoints || 0) + netPointsChange),
            totalSpent: (parseFloat(customer.totalSpent?.toString() || "0") + orderTotal).toString(),
            orderCount: (customer.orderCount || 0) + 1,
            lastPurchaseAt: new Date(),
          });

          // Send order confirmation email if customer has email
          if (customer.email) {
            const tenant = await storage.getTenant(tenantId);
            
            // Build items list from the request (already have product info)
            const emailItems = items.map((item: any) => ({
              name: item.product.name || 'Product',
              quantity: item.quantity,
              price: `${tenant?.currencySymbol || '$'}${parseFloat(item.product.price).toFixed(2)}`,
              imageUrl: item.product.image || undefined,
            }));
            
            // Send order confirmation email (async, don't wait)
            emailService.sendOrderConfirmation(
              customer.email,
              order.orderNumber.toString(),
              `${tenant?.currencySymbol || '$'}${parseFloat(order.total).toFixed(2)}`,
              emailItems,
              tenantId,
              tenant?.displayLanguage || 'en',
              {
                companyName: tenant?.companyName || 'Flowp POS',
                companyLogo: tenant?.companyLogo || undefined,
              }
            ).catch(err => console.error('Failed to send order confirmation email:', err));

            // Send payment received email (async, don't wait)
            emailService.sendPaymentReceivedEmail(
              customer.email,
              `${tenant?.currencySymbol || '$'}${parseFloat(order.total).toFixed(2)}`,
              paymentMethod,
              tenantId,
              tenant?.displayLanguage || 'en',
              {
                companyName: tenant?.companyName || 'Flowp POS',
                companyLogo: tenant?.companyLogo || undefined,
                transactionId: order.orderNumber,
                date: new Date().toLocaleDateString(tenant?.displayLanguage || 'en', { year: 'numeric', month: 'long', day: 'numeric' }),
              }
            ).catch(err => console.error('Failed to send payment received email:', err));
          }

          if (customer.phone) {
            const tenantForWa = await storage.getTenant(tenantId);
            const token = createReceiptToken(order.id, tenantId);
            const appUrl = process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "flowp.replit.app"}`;
            const receiptPdfUrl = `${appUrl}/api/receipt-pdf/${token}`;
            const fullPhone = `${customer.phoneCountryCode || "57"}${customer.phone.replace(/\D/g, "")}`;
            sendReceiptNotification(
              tenantId,
              fullPhone,
              order.orderNumber.toString(),
              order.total,
              tenantForWa?.companyName || "Flowp",
              tenantForWa?.currency || "COP",
              pointsEarned,
              receiptPdfUrl
            ).catch(err => console.error("[whatsapp] receipt notification error:", err));
          }
        }
      }

      // Send new sale notification to owner if enabled
      const tenantUsers = await storage.getUsersByTenant(tenantId);
      const owner = tenantUsers.find(u => u.role === 'owner');
      const ownerPrefs = owner?.emailPreferences as { newSaleNotification?: boolean; highValueSaleAlerts?: boolean } | null;
      
      if (owner?.email && ownerPrefs?.newSaleNotification) {
        const tenant = await storage.getTenant(tenantId);
        emailService.sendNewSaleNotification(
          owner.email,
          {
            orderNumber: order.orderNumber,
            total: parseFloat(order.total),
            itemCount: items.length,
            paymentMethod: paymentMethod,
            customerName: customerId ? (await storage.getCustomer(customerId))?.name : undefined,
            cashierName: undefined,
          },
          tenantId,
          tenant?.displayLanguage || 'en',
          {
            companyName: tenant?.companyName || undefined,
            currency: tenant?.currency || 'USD',
          }
        ).catch(err => console.error('Failed to send new sale notification:', err));
      }

      // Submit to DIAN/MATIAS for electronic document (synchronous to get CUFE/QR for receipt)
      const { submitDocumentSync } = await import("./integrations/matias/index");
      const matiasResult = await submitDocumentSync({
        tenantId,
        kind: "POS",
        sourceType: "sale",
        sourceId: order.id,
        orderNumber: order.orderNumber.toString(),
      });

      // If MATIAS submission succeeded, update order with CUFE and QR code
      if (matiasResult.success && (matiasResult.cufe || matiasResult.qrCode)) {
        await db.update(orders)
          .set({
            cufe: matiasResult.cufe,
            qrCode: matiasResult.qrCode,
            trackId: matiasResult.trackId,
          })
          .where(eq(orders.id, order.id));

        // Return order with CUFE, QR code, and prefix for receipt
        res.json({
          ...order,
          cufe: matiasResult.cufe,
          qrCode: matiasResult.qrCode,
          prefix: matiasResult.prefix,
          trackId: matiasResult.trackId,
        });
      } else {
        // Return order without e-billing data (submission failed or not enabled)
        if (matiasResult.error) {
          console.log(`[MATIAS] Order ${order.orderNumber} - E-billing submission issue: ${matiasResult.error}`);
        }
        res.json(order);
      }
    } catch (error) {
      console.error("Order error:", error);
      res.status(400).json({ message: "Failed to create order" });
    }
  });

  // Send transaction receipt email
  app.post("/api/orders/:orderId/send-receipt", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { orderId } = req.params;
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email address is required" });
      }

      // Get order and verify tenant ownership
      const order = await storage.getOrder(orderId);
      if (!order || order.tenantId !== tenantId) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Get order items
      const orderItems = await storage.getOrderItems(orderId);
      const tenant = await storage.getTenant(tenantId);
      const payments = await storage.getPaymentsByOrder(orderId);
      const paymentMethod = payments[0]?.method || 'cash';

      // Build items list with product names
      const itemsWithNames = await Promise.all(orderItems.map(async (item) => {
        const product = await storage.getProduct(item.productId);
        return {
          name: product?.name || 'Product',
          quantity: item.quantity,
          price: `${tenant?.currency || '$'}${parseFloat(item.unitPrice).toFixed(2)}`,
        };
      }));

      // Send transaction receipt email
      const orderDate = order.createdAt ? new Date(order.createdAt) : new Date();
      const sent = await emailService.sendTransactionReceipt(
        email,
        {
          receiptNumber: order.orderNumber,
          date: orderDate.toLocaleDateString(),
          cashier: undefined,
          items: itemsWithNames,
          subtotal: `${tenant?.currency || '$'}${parseFloat(order.subtotal).toFixed(2)}`,
          tax: `${tenant?.currency || '$'}${parseFloat(order.taxAmount).toFixed(2)}`,
          total: `${tenant?.currency || '$'}${parseFloat(order.total).toFixed(2)}`,
          paymentMethod: paymentMethod,
          companyName: tenant?.companyName || 'Flowp POS',
          companyLogo: tenant?.companyLogo || undefined,
        },
        tenantId,
        tenant?.displayLanguage || 'en'
      );

      if (sent) {
        res.json({ success: true, message: "Receipt sent successfully" });
      } else {
        res.status(500).json({ success: false, message: "Failed to send receipt" });
      }
    } catch (error) {
      console.error("Send receipt error:", error);
      res.status(500).json({ message: "Failed to send receipt" });
    }
  });

  // Public receipt PDF endpoint (token-based access for WhatsApp/Gupshup)
  app.get("/api/receipt-pdf/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const tokenData = receiptTokens.get(token);
      if (!tokenData || tokenData.expiresAt < Date.now()) {
        return res.status(404).json({ message: "Receipt not found or expired" });
      }

      const order = await storage.getOrder(tokenData.orderId);
      if (!order || order.tenantId !== tokenData.tenantId) {
        return res.status(404).json({ message: "Order not found" });
      }

      const tenant = await storage.getTenant(tokenData.tenantId);
      const items = await storage.getOrderItems(tokenData.orderId);
      const payments = await storage.getPaymentsByOrder(tokenData.orderId);
      const currencySymbol = tenant?.currencySymbol || "$";
      const lang = tenant?.displayLanguage || "es";

      const itemsForPdf = await Promise.all(items.map(async (item) => {
        const product = await storage.getProduct(item.productId);
        return {
          name: product?.name || "Product",
          quantity: item.quantity,
          price: `${currencySymbol}${parseFloat(item.unitPrice).toFixed(0)}`,
        };
      }));

      const orderDate = order.createdAt ? new Date(order.createdAt) : new Date();

      const pdfBuffer = await generateReceiptPDF({
        receiptNumber: order.orderNumber,
        date: orderDate.toLocaleDateString(lang === "es" ? "es-CO" : lang, { year: "numeric", month: "short", day: "numeric" }),
        time: orderDate.toLocaleTimeString(lang === "es" ? "es-CO" : lang, { hour: "2-digit", minute: "2-digit" }),
        items: itemsForPdf,
        subtotal: `${currencySymbol}${parseFloat(order.subtotal).toFixed(0)}`,
        tax: `${currencySymbol}${parseFloat(order.taxAmount).toFixed(0)}`,
        total: `${currencySymbol}${parseFloat(order.total).toFixed(0)}`,
        paymentMethod: payments[0]?.method || "cash",
        companyName: tenant?.companyName || "Flowp POS",
        companyAddress: tenant?.address || undefined,
        companyPhone: tenant?.phone || undefined,
        currency: tenant?.currency || "COP",
      }, lang);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Recibo_${order.orderNumber}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Receipt PDF generation error:", error);
      res.status(500).json({ message: "Failed to generate receipt" });
    }
  });

  // ===== RETURNS / REFUNDS ROUTES =====

  app.get("/api/returns", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json([]);
      }
      const returns = await storage.getReturnsByTenant(tenantId);
      res.json(returns);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch returns" });
    }
  });

  app.get("/api/returns/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      const returnData = await storage.getReturn(id);
      if (!returnData || returnData.tenantId !== tenantId) {
        return res.status(404).json({ message: "Return not found" });
      }
      const items = await storage.getReturnItems(id);
      res.json({ ...returnData, items });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch return" });
    }
  });

  app.get("/api/orders/:orderId/returnable", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { orderId } = req.params;
      const order = await storage.getOrder(orderId);
      if (!order || order.tenantId !== tenantId) {
        return res.status(404).json({ message: "Order not found" });
      }

      const orderItems = await storage.getOrderItems(orderId);
      const returnableItems = await Promise.all(
        orderItems.map(async (item) => {
          const returnedQty = await storage.getReturnedQuantityForOrderItem(item.id);
          const product = await storage.getProduct(item.productId);
          return {
            ...item,
            productName: product?.name || 'Unknown Product',
            returnedQuantity: returnedQty,
            returnableQuantity: item.quantity - returnedQty,
          };
        })
      );

      res.json({
        order,
        items: returnableItems.filter(item => item.returnableQuantity > 0),
      });
    } catch (error) {
      console.error("Get returnable items error:", error);
      res.status(500).json({ message: "Failed to get returnable items" });
    }
  });

  app.post("/api/returns", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId || !userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { orderId, reason, reasonNotes, refundMethod, restockItems, items, createCreditNote } = req.body;

      if (!orderId || !items || items.length === 0) {
        return res.status(400).json({ message: "Order ID and items are required" });
      }

      const order = await storage.getOrder(orderId);
      if (!order || order.tenantId !== tenantId) {
        return res.status(404).json({ message: "Order not found" });
      }

      const returnNumber = await storage.getNextReturnNumber(tenantId);
      let subtotal = 0;
      let taxAmount = 0;

      for (const item of items) {
        const orderItem = await storage.getOrderItem(item.orderItemId);
        if (!orderItem) {
          return res.status(400).json({ message: `Order item ${item.orderItemId} not found` });
        }

        const returnedQty = await storage.getReturnedQuantityForOrderItem(item.orderItemId);
        const returnableQty = orderItem.quantity - returnedQty;
        
        if (item.quantity > returnableQty) {
          return res.status(400).json({ 
            message: `Cannot return more than ${returnableQty} units of this item` 
          });
        }

        const itemSubtotal = parseFloat(orderItem.unitPrice) * item.quantity;
        subtotal += itemSubtotal;
      }

      const tenant = await storage.getTenant(tenantId);
      const taxRate = parseFloat(tenant?.taxRate || "0") / 100;
      taxAmount = subtotal * taxRate;
      const total = subtotal + taxAmount;

      const returnData = await storage.createReturn({
        tenantId,
        orderId,
        returnNumber,
        userId,
        customerId: order.customerId,
        status: "completed",
        reason: reason || "customer_changed_mind",
        reasonNotes: reasonNotes || null,
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        refundMethod: refundMethod || "cash",
        restockItems: restockItems !== false,
      });

      for (const item of items) {
        const orderItem = await storage.getOrderItem(item.orderItemId);
        if (!orderItem) continue;

        await storage.createReturnItem({
          returnId: returnData.id,
          orderItemId: item.orderItemId,
          productId: orderItem.productId,
          quantity: item.quantity,
          unitPrice: orderItem.unitPrice,
          taxAmount: (parseFloat(orderItem.unitPrice) * item.quantity * taxRate).toFixed(2),
        });

        if (restockItems !== false) {
          const product = await storage.getProduct(orderItem.productId);
          if (product?.trackInventory) {
            await storage.createStockMovement({
              tenantId,
              productId: orderItem.productId,
              type: "return",
              quantity: item.quantity,
              referenceId: returnData.id,
              notes: `Return #${returnNumber}`,
              userId,
            });
          }
        }
      }

      const tenantUsers = await storage.getUsersByTenant(tenantId);
      const owner = tenantUsers.find(u => u.role === 'owner');
      const ownerPrefs = owner?.emailPreferences as { refundAlerts?: boolean } | null;
      
      if (owner?.email && ownerPrefs?.refundAlerts) {
        console.log(`Refund alert would be sent to ${owner.email} for return #${returnNumber}`);
      }

      // Create credit note if requested and order has CUFE
      console.log(`[Returns] Credit note check - createCreditNote: ${createCreditNote}, order.cufe: ${order.cufe}`);
      if (createCreditNote && order.cufe) {
        try {
          const { queueCreditNote } = await import("./integrations/matias");
          
          // Get the original document number from the MATIAS queue
          const originalDoc = await storage.getMatiasDocumentBySourceId(orderId);
          const originalNumber = originalDoc?.documentNumber?.toString() || order.orderNumber?.toString() || "";
          const originalDate = order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
          
          console.log(`[Returns] Queueing credit note - originalNumber: ${originalNumber}, originalDate: ${originalDate}`);
          
          const queueResult = await queueCreditNote({
            tenantId,
            returnId: returnData.id,
            orderId,
            refundAmount: total,
            refundReason: reasonNotes || reason || "Devolución",
            originalCufe: order.cufe,
            originalNumber,
            originalDate,
            correctionConceptId: 1, // 1 = Devolución
          });
          
          console.log(`[Returns] queueCreditNote result:`, queueResult);
          
          if (queueResult) {
            // Update return with credit note status
            await storage.updateReturn(returnData.id, {
              creditNoteStatus: "pending",
              originalCufe: order.cufe,
              originalNumber,
              originalDate,
            });
            
            console.log(`[Returns] Credit note queued for return #${returnNumber}`);
          } else {
            console.log(`[Returns] queueCreditNote returned null - check MATIAS config or quota`);
          }
        } catch (creditNoteError) {
          console.error("[Returns] Failed to create credit note:", creditNoteError);
          // Don't fail the return if credit note fails
        }
      } else {
        console.log(`[Returns] Skipping credit note - createCreditNote: ${createCreditNote}, order.cufe: ${order.cufe ? 'present' : 'missing'}`);
      }

      // Update order status to reflect it has returns
      await storage.updateOrder(orderId, { hasReturns: true });

      res.json(returnData);
    } catch (error) {
      console.error("Create return error:", error);
      res.status(500).json({ message: "Failed to process return" });
    }
  });

  // ===== CREDIT NOTE (NOTA CREDITO) ROUTES =====

  // Create credit note from a completed order with CUFE
  app.post("/api/credit-notes", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId || !userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { orderId, refundAmount, refundReason, correctionConcept, restockItems, items } = req.body;

      if (!orderId) {
        return res.status(400).json({ message: "Order ID is required" });
      }

      // Get the order and verify it has a CUFE
      const order = await storage.getOrder(orderId);
      if (!order || order.tenantId !== tenantId) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (!order.cufe) {
        return res.status(400).json({ message: "Order does not have a CUFE. Only invoiced orders can have credit notes." });
      }

      // Get order items for validation
      const orderItems = await storage.getOrderItems(orderId);
      
      // Calculate amounts based on items or use provided refundAmount
      let subtotal = 0;
      const itemsToProcess = items || orderItems.map(i => ({ 
        orderItemId: i.id, 
        productId: i.productId,
        quantity: i.quantity, 
        unitPrice: i.unitPrice 
      }));

      for (const item of itemsToProcess) {
        subtotal += parseFloat(item.unitPrice) * item.quantity;
      }

      const tenant = await storage.getTenant(tenantId);
      const taxRate = parseFloat(tenant?.taxRate || "0") / 100;
      const taxAmount = subtotal * taxRate;
      const total = refundAmount || (subtotal + taxAmount);

      // Map correction concept to DIAN code
      const correctionConceptMap: Record<string, number> = {
        devolucion: 1,
        anulacion: 2,
        descuento: 3,
        ajuste_precio: 4,
        otros: 5,
      };
      const correctionConceptId = correctionConceptMap[correctionConcept || "devolucion"] || 1;

      // Create return record
      const returnNumber = await storage.getNextReturnNumber(tenantId);
      const returnData = await storage.createReturn({
        tenantId,
        orderId,
        returnNumber,
        userId,
        customerId: order.customerId,
        status: "completed",
        reason: "customer_changed_mind",
        reasonNotes: refundReason || "Nota Crédito",
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        refundMethod: "cash",
        restockItems: restockItems !== false,
        // DIAN Credit Note fields
        correctionConcept: correctionConcept || "devolucion",
        originalCufe: order.cufe,
        originalNumber: order.orderNumber?.toString() || "",
        originalDate: order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        creditNoteStatus: "pending",
      });

      // Create return items
      for (const item of itemsToProcess) {
        await storage.createReturnItem({
          returnId: returnData.id,
          orderItemId: item.orderItemId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxAmount: (parseFloat(item.unitPrice) * item.quantity * taxRate).toFixed(2),
        });

        // Restock items if needed
        if (restockItems !== false) {
          await storage.createStockMovement({
            tenantId,
            productId: item.productId,
            type: "return",
            quantity: item.quantity,
            referenceId: returnData.id,
            notes: `Credit note #${returnNumber}`,
            userId,
          });
        }
      }

      // Queue credit note for MATIAS submission
      const { queueCreditNote, processDocument } = await import("./integrations/matias/documentQueue");
      
      const queueResult = await queueCreditNote({
        tenantId,
        returnId: returnData.id,
        orderId,
        refundAmount: total,
        refundReason: refundReason || "Nota Crédito",
        originalCufe: order.cufe,
        originalNumber: order.orderNumber?.toString() || "",
        originalDate: order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        correctionConceptId,
      });

      if (queueResult) {
        // Process immediately for synchronous response
        const processResult = await processDocument(queueResult.id);
        
        // Fetch updated return with CUDE
        const updatedReturn = await storage.getReturn(returnData.id);
        
        res.json({
          success: true,
          return: updatedReturn,
          documentId: queueResult.id,
          documentNumber: queueResult.documentNumber,
          cude: updatedReturn?.cude,
          qrCode: updatedReturn?.qrCode,
        });
      } else {
        // MATIAS not enabled or quota exceeded - still create return but without e-billing
        res.json({
          success: true,
          return: returnData,
          warning: "Credit note created but not submitted to DIAN (e-billing not configured or quota exceeded)",
        });
      }
    } catch (error) {
      console.error("Create credit note error:", error);
      res.status(500).json({ message: "Failed to create credit note" });
    }
  });

  // Get orders eligible for credit notes (completed orders with CUFE)
  app.get("/api/credit-notes/eligible-orders", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json([]);
      }

      // Get completed orders with CUFE for this tenant
      const orders = await storage.getOrdersByTenant(tenantId);
      const eligibleOrders = orders.filter(order => 
        order.status === "completed" && order.cufe
      );

      res.json(eligibleOrders);
    } catch (error) {
      console.error("Get eligible orders error:", error);
      res.status(500).json({ message: "Failed to get eligible orders" });
    }
  });

  // ===== KITCHEN TICKETS ROUTES =====

  app.get("/api/kitchen/tickets", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json([]);
      }
      const tickets = await storage.getActiveKitchenTickets(tenantId);
      res.json(tickets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch kitchen tickets" });
    }
  });

  app.patch("/api/kitchen/tickets/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      const { status } = req.body;

      // Get the ticket first to verify tenant ownership
      const existingTicket = await storage.getKitchenTicket(id);
      if (!existingTicket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      // Verify ticket belongs to tenant via order
      const order = await storage.getOrder(existingTicket.orderId);
      if (!order || order.tenantId !== tenantId) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const ticket = await storage.updateKitchenTicket(id, { status });

      // Broadcast update to connected clients
      if (ticket) {
        broadcastToTenant(tenantId, {
          type: "TICKET_UPDATE",
          ticket,
        });
      }

      res.json(ticket);
    } catch (error) {
      res.status(400).json({ message: "Failed to update kitchen ticket" });
    }
  });

  // ===== WAREHOUSE ROUTES =====

  app.get("/api/warehouses", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(401).json({ message: "Unauthorized" });
      const whs = await storage.getWarehousesByTenant(tenantId);
      res.json(whs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch warehouses" });
    }
  });

  app.post("/api/warehouses", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(401).json({ message: "Unauthorized" });

      const existing = await storage.getWarehousesByTenant(tenantId);
      const planInfo = await storage.getTenantPlanWithLimits(tenantId);
      if (planInfo.limits.maxWarehouses !== -1 && existing.length >= planInfo.limits.maxWarehouses) {
        return res.status(403).json({ message: "warehouse_limit_reached" });
      }

      const isFirst = existing.length === 0;
      const warehouse = await storage.createWarehouse({
        ...req.body,
        tenantId,
        isDefault: isFirst ? true : (req.body.isDefault || false),
      });

      if (isFirst) {
        await storage.assignOrphanedMovements(tenantId, warehouse.id);
      }

      res.json(warehouse);
    } catch (error) {
      res.status(400).json({ message: "Failed to create warehouse" });
    }
  });

  app.patch("/api/warehouses/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(401).json({ message: "Unauthorized" });
      const wh = await storage.getWarehouse(req.params.id);
      if (!wh || wh.tenantId !== tenantId) return res.status(404).json({ message: "Warehouse not found" });

      if (req.body.isDefault) {
        const all = await storage.getWarehousesByTenant(tenantId);
        for (const w of all) {
          if (w.id !== req.params.id && w.isDefault) {
            await storage.updateWarehouse(w.id, { isDefault: false });
          }
        }
      }

      const updated = await storage.updateWarehouse(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: "Failed to update warehouse" });
    }
  });

  app.delete("/api/warehouses/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(401).json({ message: "Unauthorized" });
      const wh = await storage.getWarehouse(req.params.id);
      if (!wh || wh.tenantId !== tenantId) return res.status(404).json({ message: "Warehouse not found" });
      if (wh.isDefault) return res.status(400).json({ message: "Cannot delete default warehouse" });
      await storage.deleteWarehouse(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete warehouse" });
    }
  });

  // ===== INVENTORY ROUTES =====

  app.get("/api/inventory/levels", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.json({});

      const defaultWh = await storage.getDefaultWarehouse(tenantId);
      if (defaultWh) {
        await storage.assignOrphanedMovements(tenantId, defaultWh.id);
      }

      const warehouseId = req.query.warehouseId as string | undefined;
      const levels = await storage.getStockLevels(tenantId, warehouseId);
      res.json(levels);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stock levels" });
    }
  });

  app.get("/api/inventory/movements", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.json([]);
      const warehouseId = req.query.warehouseId as string | undefined;
      const movements = await storage.getStockMovementsByTenant(tenantId, warehouseId);
      res.json(movements);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stock movements" });
    }
  });

  app.post("/api/inventory/adjust", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId) return res.status(401).json({ message: "Unauthorized" });

      const { productId, type, quantity, notes, warehouseId } = req.body;

      const products = await storage.getProductsByTenant(tenantId);
      const product = products.find(p => p.id === productId);
      if (!product) return res.status(404).json({ message: "Product not found" });

      const movement = await storage.createStockMovement({
        tenantId,
        productId,
        warehouseId: warehouseId || null,
        type,
        quantity,
        notes: notes || null,
        userId: userId || null,
        referenceId: null,
      });

      res.json(movement);
    } catch (error) {
      res.status(400).json({ message: "Failed to adjust stock" });
    }
  });

  app.post("/api/inventory/transfer", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId) return res.status(401).json({ message: "Unauthorized" });

      const { productId, fromWarehouseId, toWarehouseId, quantity, notes } = req.body;

      if (!productId || !fromWarehouseId || !toWarehouseId || !quantity || quantity <= 0) {
        return res.status(400).json({ message: "Invalid transfer data" });
      }
      if (fromWarehouseId === toWarehouseId) {
        return res.status(400).json({ message: "Cannot transfer to the same warehouse" });
      }

      await storage.createStockMovement({
        tenantId,
        productId,
        warehouseId: fromWarehouseId,
        type: "transfer",
        quantity: -quantity,
        notes: notes || `Transfer to warehouse`,
        userId: userId || null,
        referenceId: toWarehouseId,
      });

      const incoming = await storage.createStockMovement({
        tenantId,
        productId,
        warehouseId: toWarehouseId,
        type: "transfer",
        quantity: quantity,
        notes: notes || `Transfer from warehouse`,
        userId: userId || null,
        referenceId: fromWarehouseId,
      });

      res.json(incoming);
    } catch (error) {
      res.status(400).json({ message: "Failed to transfer stock" });
    }
  });

  // ===== SUPPLIER ROUTES =====

  app.get("/api/suppliers", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const supplierList = await storage.getSuppliersByTenant(tenantId);
      res.json(supplierList);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch suppliers" });
    }
  });

  app.post("/api/suppliers", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const supplier = await storage.createSupplier({
        ...req.body,
        tenantId,
      });
      res.json(supplier);
    } catch (error) {
      res.status(400).json({ message: "Failed to create supplier" });
    }
  });

  app.patch("/api/suppliers/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      
      // Verify supplier belongs to tenant
      const existing = await storage.getSupplier(id);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ message: "Supplier not found" });
      }
      
      const supplier = await storage.updateSupplier(id, req.body);
      res.json(supplier);
    } catch (error) {
      res.status(400).json({ message: "Failed to update supplier" });
    }
  });

  app.delete("/api/suppliers/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      
      // Verify supplier belongs to tenant
      const existing = await storage.getSupplier(id);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ message: "Supplier not found" });
      }
      
      await storage.deleteSupplier(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete supplier" });
    }
  });

  // ===== SUPPLIER-INGREDIENT LINKING =====
  
  app.get("/api/supplier-ingredients", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const links = await storage.getSupplierIngredients(tenantId);
      res.json(links);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch supplier ingredients" });
    }
  });

  app.get("/api/suppliers/:supplierId/ingredients", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { supplierId } = req.params;
      const links = await storage.getSupplierIngredientsBySupplier(supplierId);
      res.json(links);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch supplier ingredients" });
    }
  });

  app.post("/api/supplier-ingredients", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const link = await storage.createSupplierIngredient({
        ...req.body,
        tenantId,
      });
      res.json(link);
    } catch (error) {
      res.status(400).json({ message: "Failed to create supplier ingredient link" });
    }
  });

  app.patch("/api/supplier-ingredients/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      const updated = await storage.updateSupplierIngredient(id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: "Failed to update supplier ingredient link" });
    }
  });

  app.delete("/api/supplier-ingredients/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      await storage.deleteSupplierIngredient(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete supplier ingredient link" });
    }
  });

  // ===== SUPPLIER-PRODUCT LINKING =====
  
  app.get("/api/supplier-products", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const links = await storage.getSupplierProducts(tenantId);
      res.json(links);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch supplier products" });
    }
  });

  app.get("/api/suppliers/:supplierId/products", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { supplierId } = req.params;
      const links = await storage.getSupplierProductsBySupplier(supplierId);
      res.json(links);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch supplier products" });
    }
  });

  app.post("/api/supplier-products", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const link = await storage.createSupplierProduct({
        ...req.body,
        tenantId,
      });
      res.json(link);
    } catch (error) {
      res.status(400).json({ message: "Failed to create supplier product link" });
    }
  });

  app.patch("/api/supplier-products/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      const updated = await storage.updateSupplierProduct(id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: "Failed to update supplier product link" });
    }
  });

  app.delete("/api/supplier-products/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      await storage.deleteSupplierProduct(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete supplier product link" });
    }
  });

  // ===== QUICK REORDER =====
  
  app.get("/api/reorder-suggestions", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const tenant = await storage.getTenant(tenantId);
      const suggestions: Array<{
        type: "product" | "ingredient";
        id: string;
        name: string;
        currentStock: number;
        reorderPoint: number;
        suggestedQty: number;
        uom?: string;
        preferredSupplierId?: string | null;
        preferredSupplierName?: string | null;
        unitCost?: string | null;
      }> = [];
      
      // Get low stock products
      const products = await storage.getProductsByTenant(tenantId);
      const stockLevels = await storage.getStockLevels(tenantId);
      
      for (const product of products) {
        if (product.trackInventory && product.lowStockThreshold) {
          const currentStock = stockLevels[product.id] || 0;
          if (currentStock <= product.lowStockThreshold) {
            const supplierLinks = await storage.getSupplierProductsByProduct(product.id);
            const primarySupplier = supplierLinks.find(l => l.isPrimary) || supplierLinks[0];
            let supplierName = null;
            if (primarySupplier) {
              const supplier = await storage.getSupplier(primarySupplier.supplierId);
              supplierName = supplier?.name || null;
            }
            
            suggestions.push({
              type: "product",
              id: product.id,
              name: product.name,
              currentStock,
              reorderPoint: product.lowStockThreshold,
              suggestedQty: Math.max((product.lowStockThreshold * 2) - currentStock, 1),
              preferredSupplierId: primarySupplier?.supplierId || null,
              preferredSupplierName: supplierName,
              unitCost: primarySupplier?.unitCost || product.cost || null,
            });
          }
        }
      }
      
      // Get low stock ingredients (if restaurant tenant with Pro)
      if (tenant?.type === "restaurant") {
        const hasFeature = await storage.hasTenantProFeature(tenantId, "restaurant_bom");
        if (hasFeature) {
          const ingredients = await storage.getIngredientsByTenant(tenantId);
          const ingredientStockLevels = await storage.getIngredientStockLevels(tenantId);
          
          for (const ingredient of ingredients) {
            if (ingredient.reorderPoint) {
              const currentStock = ingredientStockLevels[ingredient.id] || 0;
              const reorderPoint = parseFloat(ingredient.reorderPoint);
              if (currentStock <= reorderPoint) {
                const supplierLinks = await storage.getSupplierIngredientsByIngredient(ingredient.id);
                const primarySupplier = supplierLinks.find(l => l.isPrimary) || supplierLinks[0];
                let supplierName = null;
                if (primarySupplier) {
                  const supplier = await storage.getSupplier(primarySupplier.supplierId);
                  supplierName = supplier?.name || null;
                }
                
                const reorderQty = parseFloat(ingredient.reorderQty || "0");
                suggestions.push({
                  type: "ingredient",
                  id: ingredient.id,
                  name: ingredient.name,
                  currentStock,
                  reorderPoint,
                  suggestedQty: reorderQty > 0 ? reorderQty : Math.max((reorderPoint * 2) - currentStock, 1),
                  uom: ingredient.uomBase,
                  preferredSupplierId: primarySupplier?.supplierId || null,
                  preferredSupplierName: supplierName,
                  unitCost: primarySupplier?.unitCost || null,
                });
              }
            }
          }
        }
      }
      
      res.json(suggestions);
    } catch (error) {
      console.error("Reorder suggestions error:", error);
      res.status(500).json({ message: "Failed to fetch reorder suggestions" });
    }
  });

  // Create purchase order from reorder suggestions
  app.post("/api/reorder-suggestions/create-order", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { items, supplierId, notes } = req.body;
      // items: Array<{ type: 'product' | 'ingredient', id: string, quantity: number, unitCost: number }>
      
      // Generate order number
      const existingOrders = await storage.getPurchaseOrdersByTenant(tenantId);
      const orderNumber = `PO-${String(existingOrders.length + 1).padStart(5, '0')}`;
      
      // Create purchase order
      const order = await storage.createPurchaseOrder({
        tenantId,
        supplierId: supplierId || null,
        orderNumber,
        status: "draft",
        notes: notes || "Auto-generated from reorder suggestions",
        createdBy: userId || null,
      });
      
      // Add items
      for (const item of items) {
        await storage.createPurchaseOrderItem({
          purchaseOrderId: order.id,
          productId: item.type === "product" ? item.id : null,
          ingredientId: item.type === "ingredient" ? item.id : null,
          quantity: item.quantity,
          unitCost: item.unitCost?.toString() || "0",
        });
      }
      
      // Get full order with items
      const orderItems = await storage.getPurchaseOrderItems(order.id);
      res.json({ ...order, items: orderItems });
    } catch (error) {
      console.error("Create reorder error:", error);
      res.status(400).json({ message: "Failed to create purchase order" });
    }
  });

  // ===== PURCHASE ORDER ROUTES =====

  app.get("/api/purchase-orders", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const orderList = await storage.getPurchaseOrdersByTenant(tenantId);
      res.json(orderList);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch purchase orders" });
    }
  });

  app.get("/api/purchase-orders/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      
      const order = await storage.getPurchaseOrder(id);
      if (!order || order.tenantId !== tenantId) {
        return res.status(404).json({ message: "Purchase order not found" });
      }
      
      const items = await storage.getPurchaseOrderItems(id);
      res.json({ ...order, items });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch purchase order" });
    }
  });

  app.post("/api/purchase-orders", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { items, ...orderData } = req.body;
      
      // Generate order number if not provided
      const orderNumber = orderData.orderNumber || `PO-${Date.now().toString().slice(-8)}`;
      
      const order = await storage.createPurchaseOrder({
        ...orderData,
        orderNumber,
        tenantId,
        createdBy: userId || null,
      });
      
      // Create items if provided
      if (items && Array.isArray(items)) {
        for (const item of items) {
          await storage.createPurchaseOrderItem({
            ...item,
            purchaseOrderId: order.id,
          });
        }
      }
      
      const orderItems = await storage.getPurchaseOrderItems(order.id);
      res.json({ ...order, items: orderItems });
    } catch (error) {
      res.status(400).json({ message: "Failed to create purchase order" });
    }
  });

  app.patch("/api/purchase-orders/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      
      // Verify order belongs to tenant
      const existing = await storage.getPurchaseOrder(id);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ message: "Purchase order not found" });
      }
      
      const { items, ...orderData } = req.body;
      const order = await storage.updatePurchaseOrder(id, orderData);
      
      res.json(order);
    } catch (error) {
      res.status(400).json({ message: "Failed to update purchase order" });
    }
  });

  app.delete("/api/purchase-orders/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      
      // Verify order belongs to tenant
      const existing = await storage.getPurchaseOrder(id);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ message: "Purchase order not found" });
      }
      
      await storage.deletePurchaseOrder(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete purchase order" });
    }
  });

  // ===== PURCHASE ORDER ITEMS ROUTES =====

  app.post("/api/purchase-orders/:orderId/items", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { orderId } = req.params;
      
      // Verify order belongs to tenant
      const order = await storage.getPurchaseOrder(orderId);
      if (!order || order.tenantId !== tenantId) {
        return res.status(404).json({ message: "Purchase order not found" });
      }
      
      const item = await storage.createPurchaseOrderItem({
        ...req.body,
        purchaseOrderId: orderId,
      });
      res.json(item);
    } catch (error) {
      res.status(400).json({ message: "Failed to add item" });
    }
  });

  app.patch("/api/purchase-order-items/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      
      const item = await storage.updatePurchaseOrderItem(id, req.body);
      res.json(item);
    } catch (error) {
      res.status(400).json({ message: "Failed to update item" });
    }
  });

  app.delete("/api/purchase-order-items/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      
      await storage.deletePurchaseOrderItem(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete item" });
    }
  });

  // Get receipts for a purchase order
  app.get("/api/purchase-orders/:id/receipts", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(401).json({ message: "Unauthorized" });
      const order = await storage.getPurchaseOrder(req.params.id);
      if (!order || order.tenantId !== tenantId) return res.status(404).json({ message: "Purchase order not found" });
      const receipts = await storage.getReceiptsByPurchaseOrder(req.params.id);
      const receiptsWithItems = await Promise.all(receipts.map(async (r) => {
        const items = await storage.getReceiptItems(r.id);
        return { ...r, items };
      }));
      res.json(receiptsWithItems);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch receipts" });
    }
  });

  // Receive stock from purchase order (creates a receipt record + stock movements)
  app.post("/api/purchase-orders/:id/receive", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId) return res.status(401).json({ message: "Unauthorized" });
      const { id } = req.params;
      const { items, warehouseId, notes } = req.body;
      
      const order = await storage.getPurchaseOrder(id);
      if (!order || order.tenantId !== tenantId) {
        return res.status(404).json({ message: "Purchase order not found" });
      }
      if (order.status === "cancelled" || order.status === "received") {
        return res.status(400).json({ message: "Cannot receive on this order" });
      }
      
      const orderItems = await storage.getPurchaseOrderItems(id);
      const effectiveWarehouseId = warehouseId || order.destinationWarehouseId || null;
      
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "No items to receive" });
      }
      for (const received of items) {
        const orderItem = orderItems.find(i => i.id === received.itemId);
        if (!orderItem) {
          return res.status(400).json({ message: `Item ${received.itemId} not found on this order` });
        }
        const pending = orderItem.quantity - (orderItem.receivedQuantity || 0);
        if (received.receivedQuantity > pending) {
          return res.status(400).json({ message: `Cannot receive more than pending quantity (${pending}) for item` });
        }
      }
      
      const receiptNumber = await storage.getNextReceiptNumber(tenantId);
      const receipt = await storage.createPurchaseReceipt({
        tenantId,
        purchaseOrderId: id,
        receiptNumber,
        warehouseId: effectiveWarehouseId,
        receivedBy: userId || null,
        notes: notes || null,
        receivedAt: new Date(),
      });
      
      for (const received of items) {
        const orderItem = orderItems.find(i => i.id === received.itemId);
        if (!orderItem || received.receivedQuantity <= 0) continue;
        
        await storage.createPurchaseReceiptItem({
          receiptId: receipt.id,
          purchaseOrderItemId: received.itemId,
          productId: orderItem.productId || null,
          ingredientId: orderItem.ingredientId || null,
          quantityReceived: received.receivedQuantity,
          unitCost: received.unitCost || orderItem.unitCost,
        });
        
        await storage.updatePurchaseOrderItem(received.itemId, {
          receivedQuantity: (orderItem.receivedQuantity || 0) + received.receivedQuantity,
          expirationDate: received.expirationDate ? new Date(received.expirationDate) : undefined,
          lotCode: received.lotCode || undefined,
        });
        
        if (orderItem.productId) {
          await storage.createStockMovement({
            tenantId,
            productId: orderItem.productId,
            warehouseId: effectiveWarehouseId,
            type: "purchase",
            quantity: received.receivedQuantity,
            referenceId: receipt.id,
            notes: `${receiptNumber} - PO ${order.orderNumber}`,
            userId: userId || null,
          });
          
          const product = await storage.getProduct(orderItem.productId);
          if (product) {
            const currentStock = await storage.getStockLevel(orderItem.productId);
            const prevStock = currentStock - received.receivedQuantity;
            const prevCost = parseFloat(product.cost || "0");
            const newCost = parseFloat(received.unitCost || orderItem.unitCost);
            let avgCost = newCost;
            if (prevStock > 0 && prevCost > 0) {
              avgCost = ((prevStock * prevCost) + (received.receivedQuantity * newCost)) / currentStock;
            }
            await storage.updateProduct(orderItem.productId, {
              cost: avgCost.toFixed(2),
            });
          }
        } else if (orderItem.ingredientId) {
          const lotCode = received.lotCode || `PO-${order.orderNumber}-${Date.now()}`;
          const lot = await storage.createIngredientLot({
            tenantId,
            ingredientId: orderItem.ingredientId,
            qtyReceivedBase: received.receivedQuantity.toString(),
            qtyRemainingBase: received.receivedQuantity.toString(),
            expiresAt: received.expirationDate ? new Date(received.expirationDate) : null,
            costPerBase: orderItem.unitCost || null,
            supplierId: order.supplierId || null,
            lotCode,
            locationId: null,
            status: "open",
          });
          
          await storage.createIngredientMovement({
            tenantId,
            ingredientId: orderItem.ingredientId,
            lotId: lot.id,
            locationId: null,
            movementType: "purchase_receive",
            qtyDeltaBase: received.receivedQuantity.toString(),
            sourceType: "purchase_receipt",
            sourceId: receipt.id,
            notes: `${receiptNumber} - PO ${order.orderNumber}`,
            createdBy: userId || null,
          });
        }
        
        if (orderItem.productId && order.supplierId) {
          const supplierLinks = await storage.getSupplierProductsByProduct(orderItem.productId);
          const existingLink = supplierLinks.find(l => l.supplierId === order.supplierId);
          if (existingLink) {
            await storage.updateSupplierProduct(existingLink.id, {
              unitCost: received.unitCost || orderItem.unitCost,
            });
          }
        }
      }
      
      const updatedItems = await storage.getPurchaseOrderItems(id);
      const allReceived = updatedItems.every(item => 
        (item.receivedQuantity || 0) >= item.quantity
      );
      const anyReceived = updatedItems.some(item =>
        (item.receivedQuantity || 0) > 0
      );
      
      let newStatus = order.status;
      if (allReceived) {
        newStatus = "received";
      } else if (anyReceived) {
        newStatus = "partial";
      }
      
      await storage.updatePurchaseOrder(id, {
        status: newStatus as any,
        receivedDate: allReceived ? new Date() : undefined,
      });
      
      const updatedOrder = await storage.getPurchaseOrder(id);
      const receiptItems = await storage.getReceiptItems(receipt.id);
      res.json({ order: updatedOrder, receipt: { ...receipt, items: receiptItems }, items: updatedItems });
    } catch (error) {
      console.error("Receive stock error:", error);
      res.status(400).json({ message: "Failed to receive stock" });
    }
  });

  // ===== INGREDIENT INVENTORY ROUTES (Pro feature for restaurants) =====

  // Middleware to check Pro feature access
  const requireProFeature = (feature: string) => async (req: Request, res: Response, next: Function) => {
    const tenantId = req.headers["x-tenant-id"] as string;
    if (!tenantId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const tenant = await storage.getTenant(tenantId);
    if (!tenant || tenant.type !== "restaurant") {
      return res.status(403).json({ message: "Feature only available for restaurant tenants" });
    }
    // Check if tenant has Pro subscription with the feature
    const hasFeature = await storage.hasTenantProFeature(tenantId, feature);
    if (!hasFeature) {
      return res.status(403).json({ message: "This feature requires a Pro subscription", requiresUpgrade: true });
    }
    next();
  };

  // Get all ingredients
  app.get("/api/ingredients", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const tenant = await storage.getTenant(tenantId);
      if (!tenant || tenant.type !== "restaurant") {
        return res.status(403).json({ message: "Feature only available for restaurant tenants" });
      }
      const hasFeature = await storage.hasTenantProFeature(tenantId, "restaurant_bom");
      if (!hasFeature) {
        return res.status(403).json({ message: "This feature requires a Pro subscription", requiresUpgrade: true });
      }
      const ingredientList = await storage.getIngredientsByTenant(tenantId);
      res.json(ingredientList);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ingredients" });
    }
  });

  // Create ingredient
  app.post("/api/ingredients", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const tenant = await storage.getTenant(tenantId);
      if (!tenant || tenant.type !== "restaurant") {
        return res.status(403).json({ message: "Feature only available for restaurant tenants" });
      }
      const hasFeature = await storage.hasTenantProFeature(tenantId, "restaurant_bom");
      if (!hasFeature) {
        return res.status(403).json({ message: "This feature requires a Pro subscription", requiresUpgrade: true });
      }
      
      const { initialStock, initialExpirationDate, ...ingredientData } = req.body;
      
      const ingredient = await storage.createIngredient({
        ...ingredientData,
        tenantId,
        createdBy: userId || null,
        updatedBy: userId || null,
      });
      
      // If initial stock is provided, create an initial lot
      if (initialStock && parseFloat(initialStock) > 0) {
        const qty = parseFloat(initialStock);
        const lot = await storage.createIngredientLot({
          tenantId,
          ingredientId: ingredient.id,
          qtyReceivedBase: qty.toString(),
          qtyRemainingBase: qty.toString(),
          expiresAt: initialExpirationDate ? new Date(initialExpirationDate) : null,
          costPerBase: null,
          supplierId: null,
          lotCode: `INIT-${Date.now()}`,
          locationId: null,
          status: "open",
        });
        
        await storage.createIngredientMovement({
          tenantId,
          ingredientId: ingredient.id,
          lotId: lot.id,
          locationId: null,
          movementType: "adjustment",
          qtyDeltaBase: qty.toString(),
          sourceType: "initial_stock",
          notes: "Initial stock entry",
          createdBy: userId || null,
        });
      }
      
      res.json(ingredient);
    } catch (error) {
      console.error("Create ingredient error:", error);
      res.status(400).json({ message: "Failed to create ingredient" });
    }
  });

  // Helper function to check Pro feature access for ingredient routes
  const checkProFeatureAccess = async (tenantId: string, res: Response): Promise<boolean> => {
    const tenant = await storage.getTenant(tenantId);
    if (!tenant || tenant.type !== "restaurant") {
      res.status(403).json({ message: "Feature only available for restaurant tenants" });
      return false;
    }
    const hasFeature = await storage.hasTenantProFeature(tenantId, "restaurant_bom");
    if (!hasFeature) {
      res.status(403).json({ message: "This feature requires a Pro subscription", requiresUpgrade: true });
      return false;
    }
    return true;
  };

  // Update ingredient
  app.patch("/api/ingredients/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const { id } = req.params;
      const existing = await storage.getIngredient(id);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ message: "Ingredient not found" });
      }
      const updated = await storage.updateIngredient(id, {
        ...req.body,
        updatedBy: userId || null,
      });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: "Failed to update ingredient" });
    }
  });

  // Delete ingredient
  app.delete("/api/ingredients/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const { id } = req.params;
      const existing = await storage.getIngredient(id);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ message: "Ingredient not found" });
      }
      await storage.deleteIngredient(id);
      res.json({ message: "Ingredient deleted" });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete ingredient" });
    }
  });

  // Get all tenant ingredient lots (for alerts)
  app.get("/api/ingredient-lots", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const lots = await storage.getIngredientLots(tenantId);
      res.json(lots);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ingredient lots" });
    }
  });

  // Get ingredient lots by ingredient
  app.get("/api/ingredients/:id/lots", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const { id } = req.params;
      const lots = await storage.getIngredientLots(tenantId, id);
      res.json(lots);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ingredient lots" });
    }
  });

  // Receive stock (create lot)
  app.post("/api/ingredients/:id/lots/receive", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const { id } = req.params;
      const { qty, expiresAt, costPerBase, supplierId, lotCode, locationId } = req.body;

      const ingredient = await storage.getIngredient(id);
      if (!ingredient || ingredient.tenantId !== tenantId) {
        return res.status(404).json({ message: "Ingredient not found" });
      }

      // Create lot
      const lot = await storage.createIngredientLot({
        tenantId,
        ingredientId: id,
        qtyReceivedBase: qty.toString(),
        qtyRemainingBase: qty.toString(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        costPerBase: costPerBase?.toString() || null,
        supplierId: supplierId || null,
        lotCode: lotCode || null,
        locationId: locationId || null,
        status: "open",
      });

      // Create movement record
      await storage.createIngredientMovement({
        tenantId,
        ingredientId: id,
        lotId: lot.id,
        locationId: locationId || null,
        movementType: "purchase_receive",
        qtyDeltaBase: qty.toString(),
        sourceType: "purchase_receipt",
        notes: `Received lot ${lotCode || lot.id}`,
      });

      res.json(lot);
    } catch (error) {
      res.status(400).json({ message: "Failed to receive stock" });
    }
  });

  // Adjust lot quantity
  app.post("/api/lots/:lotId/adjust", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const { lotId } = req.params;
      const { qtyDelta, reason, notes } = req.body;

      const lot = await storage.getIngredientLot(lotId);
      if (!lot || lot.tenantId !== tenantId) {
        return res.status(404).json({ message: "Lot not found" });
      }

      const newQty = parseFloat(lot.qtyRemainingBase) + parseFloat(qtyDelta);
      const status = newQty <= 0 ? "depleted" : "open";

      await storage.updateIngredientLot(lotId, {
        qtyRemainingBase: Math.max(0, newQty).toString(),
        status,
      });

      // Create movement record
      await storage.createIngredientMovement({
        tenantId,
        ingredientId: lot.ingredientId,
        lotId,
        locationId: lot.locationId,
        movementType: reason === "waste" ? "waste" : "adjustment",
        qtyDeltaBase: qtyDelta.toString(),
        sourceType: "manual_adjustment",
        notes,
        createdBy: userId || null,
      });

      const updatedLot = await storage.getIngredientLot(lotId);
      res.json(updatedLot);
    } catch (error) {
      res.status(400).json({ message: "Failed to adjust lot" });
    }
  });

  // Get ingredient stock levels
  app.get("/api/ingredient-stock-levels", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const levels = await storage.getIngredientStockLevels(tenantId);
      res.json(levels);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stock levels" });
    }
  });

  // Get all recipes
  app.get("/api/recipes", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const { productId } = req.query;
      if (productId) {
        const recipe = await storage.getRecipeByProduct(productId as string);
        if (recipe && recipe.tenantId === tenantId) {
          const items = await storage.getRecipeItems(recipe.id);
          return res.json([{ ...recipe, items }]);
        }
        return res.json([]);
      }
      const recipeList = await storage.getRecipesByTenant(tenantId);
      const recipesWithItems = await Promise.all(
        recipeList.map(async (recipe) => {
          const items = await storage.getRecipeItems(recipe.id);
          return { ...recipe, items };
        })
      );
      res.json(recipesWithItems);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recipes" });
    }
  });

  // Get recipe by ID
  app.get("/api/recipes/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const { id } = req.params;
      const recipe = await storage.getRecipe(id);
      if (!recipe || recipe.tenantId !== tenantId) {
        return res.status(404).json({ message: "Recipe not found" });
      }
      const items = await storage.getRecipeItems(id);
      res.json({ ...recipe, items });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recipe" });
    }
  });

  // Create recipe
  app.post("/api/recipes", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const limitCheck = await storage.checkSubscriptionLimit(tenantId, "recipes");
      if (!limitCheck.allowed) {
        return res.status(403).json({ message: "Recipe limit reached for your subscription plan", current: limitCheck.current, max: limitCheck.max });
      }
      const { items, ...recipeData } = req.body;
      const recipe = await storage.createRecipe({
        ...recipeData,
        tenantId,
        createdBy: userId || null,
        updatedBy: userId || null,
      });

      // Create recipe items
      if (items && Array.isArray(items)) {
        for (const item of items) {
          await storage.createRecipeItem({
            ...item,
            recipeId: recipe.id,
            tenantId,
          });
        }
      }

      const recipeItems = await storage.getRecipeItems(recipe.id);
      res.json({ ...recipe, items: recipeItems });
    } catch (error) {
      res.status(400).json({ message: "Failed to create recipe" });
    }
  });

  // Update recipe
  app.patch("/api/recipes/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const { id } = req.params;
      const { items, ...recipeData } = req.body;

      const existing = await storage.getRecipe(id);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ message: "Recipe not found" });
      }

      const updated = await storage.updateRecipe(id, {
        ...recipeData,
        updatedBy: userId || null,
      });

      // Update recipe items: delete existing and create new ones
      if (items && Array.isArray(items)) {
        // Delete existing items
        await storage.deleteRecipeItemsByRecipeId(id);
        // Create new items
        for (const item of items) {
          await storage.createRecipeItem({
            ...item,
            recipeId: id,
            tenantId,
          });
        }
      }

      const recipeItems = await storage.getRecipeItems(id);
      res.json({ ...updated, items: recipeItems });
    } catch (error) {
      res.status(400).json({ message: "Failed to update recipe" });
    }
  });

  // Delete recipe
  app.delete("/api/recipes/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const { id } = req.params;
      const existing = await storage.getRecipe(id);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ message: "Recipe not found" });
      }
      await storage.deleteRecipe(id);
      res.json({ message: "Recipe deleted" });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete recipe" });
    }
  });

  // Recipe items CRUD
  app.post("/api/recipes/:id/items", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const { id } = req.params;
      const recipe = await storage.getRecipe(id);
      if (!recipe || recipe.tenantId !== tenantId) {
        return res.status(404).json({ message: "Recipe not found" });
      }
      const item = await storage.createRecipeItem({
        ...req.body,
        recipeId: id,
        tenantId,
      });
      res.json(item);
    } catch (error) {
      res.status(400).json({ message: "Failed to add recipe item" });
    }
  });

  app.patch("/api/recipe-items/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const { id } = req.params;
      const existing = await storage.getRecipeItem(id);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ message: "Recipe item not found" });
      }
      const updated = await storage.updateRecipeItem(id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: "Failed to update recipe item" });
    }
  });

  app.delete("/api/recipe-items/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const { id } = req.params;
      const existing = await storage.getRecipeItem(id);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ message: "Recipe item not found" });
      }
      await storage.deleteRecipeItem(id);
      res.json({ message: "Recipe item deleted" });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete recipe item" });
    }
  });

  // Ingredient alerts
  app.get("/api/ingredient-alerts", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const acknowledged = req.query.acknowledged === "true" ? true : req.query.acknowledged === "false" ? false : undefined;
      const alerts = await storage.getIngredientAlerts(tenantId, acknowledged);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.post("/api/ingredient-alerts/:id/acknowledge", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;
      const userId = req.headers["x-user-id"] as string;
      const { id } = req.params;
      const existing = await storage.getIngredientAlert(id);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ message: "Alert not found" });
      }
      const updated = await storage.acknowledgeAlert(id, userId);
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: "Failed to acknowledge alert" });
    }
  });

  // Generate alerts for low stock and expiring lots
  app.post("/api/ingredient-alerts/generate", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;

      const ingredients = await storage.getIngredients(tenantId);
      const lots = await storage.getIngredientLots(tenantId);
      const stockLevels = await storage.getIngredientStockLevels(tenantId);
      const existingAlerts = await storage.getIngredientAlerts(tenantId, false);
      const today = new Date();
      const alertsCreated = [];

      // Check for low stock ingredients
      for (const ingredient of ingredients) {
        const currentStock = stockLevels[ingredient.id] || 0;
        const minStock = parseFloat(ingredient.minQtyBase || "0");
        
        if (minStock > 0 && currentStock <= minStock) {
          // Check if alert already exists
          const existingAlert = existingAlerts.find(
            a => a.entityType === "ingredient" && a.entityId === ingredient.id && a.alertType === "low_stock"
          );
          
          if (!existingAlert) {
            const alert = await storage.createIngredientAlert({
              tenantId,
              alertType: "low_stock",
              severity: currentStock === 0 ? "critical" : "warning",
              entityType: "ingredient",
              entityId: ingredient.id,
              message: `${ingredient.name}: ${currentStock.toFixed(2)} ${ingredient.uomBase} remaining (min: ${minStock} ${ingredient.uomBase})`,
            });
            alertsCreated.push(alert);
          }
        }
      }

      // Check for expiring lots (within 7 days)
      for (const lot of lots) {
        if (lot.expiresAt && lot.status === "open" && parseFloat(lot.qtyRemainingBase) > 0) {
          const expiresAt = new Date(lot.expiresAt);
          const daysToExpiry = Math.ceil((expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysToExpiry <= 7) {
            let alertType: "expired" | "expiring_soon" = daysToExpiry <= 0 ? "expired" : "expiring_soon";
            let severity: "critical" | "warning" = daysToExpiry <= 1 ? "critical" : "warning";
            
            // Check if alert already exists
            const existingAlert = existingAlerts.find(
              a => a.entityType === "lot" && a.entityId === lot.id && (a.alertType === "expired" || a.alertType === "expiring_soon")
            );
            
            if (!existingAlert) {
              const ingredient = ingredients.find(i => i.id === lot.ingredientId);
              const alert = await storage.createIngredientAlert({
                tenantId,
                alertType,
                severity,
                entityType: "lot",
                entityId: lot.id,
                message: daysToExpiry <= 0 
                  ? `${ingredient?.name || "Lot"} (${lot.lotCode || lot.id}): Expired` 
                  : `${ingredient?.name || "Lot"} (${lot.lotCode || lot.id}): Expires in ${daysToExpiry} days`,
              });
              alertsCreated.push(alert);
            }
          }
        }
      }

      res.json({ 
        message: `Generated ${alertsCreated.length} new alerts`,
        alerts: alertsCreated 
      });
    } catch (error) {
      console.error("Generate alerts error:", error);
      res.status(500).json({ message: "Failed to generate alerts" });
    }
  });

  // Promotion suggestions for near-expiry lots
  app.get("/api/promo-suggestions", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await checkProFeatureAccess(tenantId, res)) return;

      // Get lots expiring within 7 days
      const lots = await storage.getIngredientLots(tenantId);
      const today = new Date();
      const suggestions = [];

      for (const lot of lots) {
        if (lot.expiresAt && lot.status === "open" && parseFloat(lot.qtyRemainingBase) > 0) {
          const expiresAt = new Date(lot.expiresAt);
          const daysToExpiry = Math.ceil((expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysToExpiry <= 7 && daysToExpiry >= 0) {
            const ingredient = await storage.getIngredient(lot.ingredientId);
            let recommendedDiscount = 0;
            let tier = "";
            
            if (daysToExpiry <= 1) {
              recommendedDiscount = 35;
              tier = "critical";
            } else if (daysToExpiry <= 4) {
              recommendedDiscount = 20;
              tier = "warning";
            } else {
              recommendedDiscount = 10;
              tier = "info";
            }

            suggestions.push({
              lotId: lot.id,
              ingredientId: lot.ingredientId,
              ingredientName: ingredient?.name || "Unknown",
              lotCode: lot.lotCode,
              expiresAt: lot.expiresAt,
              daysToExpiry,
              qtyRemaining: parseFloat(lot.qtyRemainingBase),
              uom: ingredient?.uomBase || "unit",
              recommendedDiscount,
              tier,
            });
          }
        }
      }

      // Sort by days to expiry (most urgent first)
      suggestions.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
      res.json(suggestions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch promo suggestions" });
    }
  });

  // ===== TENANT ROUTES =====

  app.get("/api/auth/tenant", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      res.json(tenant);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tenant" });
    }
  });

  // Get current user data (refresh user from database)
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      // Get user ID from stored user (passed via query or we use the session approach)
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(400).json({ message: "User ID required" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { password, pin, ...userWithoutSensitive } = user;
      res.json({ ...userWithoutSensitive, hasPin: !!pin });
    } catch (error) {
      console.error("Get current user error:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.patch("/api/settings", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { 
        name, currency, taxRate, address, phone, language, logo, country, city,
        receiptShowLogo, receiptHeaderText, receiptFooterText, 
        receiptShowAddress, receiptShowPhone, receiptTaxId, receiptLogo, onboardingComplete,
        receiptLogoSize, receiptFontSize, receiptFontFamily,
        couponEnabled, couponText, openCashDrawer, allowZeroStockSales,
        autoLockEnabled, autoLockTimeout,
        subscriptionTier
      } = req.body;
      
      const updated = await storage.updateTenant(tenantId, {
        name: name || undefined,
        currency: currency || undefined,
        taxRate: taxRate || undefined,
        country: country || undefined,
        city: city || undefined,
        address: address || undefined,
        phone: phone || undefined,
        language: language || undefined,
        logo: logo !== undefined ? logo : undefined,
        receiptShowLogo: receiptShowLogo !== undefined ? receiptShowLogo : undefined,
        receiptHeaderText: receiptHeaderText !== undefined ? receiptHeaderText : undefined,
        receiptFooterText: receiptFooterText !== undefined ? receiptFooterText : undefined,
        receiptShowAddress: receiptShowAddress !== undefined ? receiptShowAddress : undefined,
        receiptShowPhone: receiptShowPhone !== undefined ? receiptShowPhone : undefined,
        receiptTaxId: receiptTaxId !== undefined ? receiptTaxId : undefined,
        receiptLogo: receiptLogo !== undefined ? receiptLogo : undefined,
        receiptLogoSize: receiptLogoSize !== undefined ? receiptLogoSize : undefined,
        receiptFontSize: receiptFontSize !== undefined ? receiptFontSize : undefined,
        receiptFontFamily: receiptFontFamily !== undefined ? receiptFontFamily : undefined,
        onboardingComplete: onboardingComplete !== undefined ? onboardingComplete : undefined,
        couponEnabled: couponEnabled !== undefined ? couponEnabled : undefined,
        couponText: couponText !== undefined ? couponText : undefined,
        openCashDrawer: openCashDrawer !== undefined ? openCashDrawer : undefined,
        allowZeroStockSales: allowZeroStockSales !== undefined ? allowZeroStockSales : undefined,
        autoLockEnabled: autoLockEnabled !== undefined ? autoLockEnabled : undefined,
        autoLockTimeout: autoLockTimeout !== undefined ? autoLockTimeout : undefined,
        subscriptionTier: subscriptionTier && ["basic", "pro", "enterprise"].includes(subscriptionTier) ? subscriptionTier : undefined,
      } as any);
      
      if (!updated) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: "Failed to update settings" });
    }
  });

  // ===== E-BILLING CONFIG ROUTES =====

  // Get e-billing config for tenant
  app.get("/api/tenant/ebilling-config", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const config = await db.query.tenantIntegrationsMatias.findFirst({
        where: eq(tenantIntegrationsMatias.tenantId, tenantId),
      });

      if (!config) {
        // Return default config if none exists
        return res.json({
          isEnabled: false,
          prefix: "",
          currentNumber: null,
          endingNumber: null,
          autoSubmitSales: true,
        });
      }

      res.json({
        isEnabled: config.isEnabled ?? false,
        prefix: config.defaultPrefix || "",
        currentNumber: config.currentNumber || null,
        endingNumber: config.endingNumber || null,
        autoSubmitSales: config.autoSubmitSales ?? true,
      });
    } catch (error) {
      console.error("E-billing config fetch error:", error);
      res.status(500).json({ message: "Failed to fetch e-billing config" });
    }
  });

  // Update e-billing config for tenant
  app.put("/api/tenant/ebilling-config", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { isEnabled, autoSubmitSales } = req.body;

      const existing = await db.query.tenantIntegrationsMatias.findFirst({
        where: eq(tenantIntegrationsMatias.tenantId, tenantId),
      });

      if (!existing) {
        // Create new config if none exists
        await db.insert(tenantIntegrationsMatias).values({
          tenantId,
          isEnabled: isEnabled ?? false,
          autoSubmitSales: autoSubmitSales ?? true,
        });
      } else {
        // Update existing config
        await db.update(tenantIntegrationsMatias)
          .set({
            isEnabled: isEnabled !== undefined ? isEnabled : existing.isEnabled,
            autoSubmitSales: autoSubmitSales !== undefined ? autoSubmitSales : existing.autoSubmitSales,
            updatedAt: new Date(),
          })
          .where(eq(tenantIntegrationsMatias.tenantId, tenantId));
      }

      res.json({ success: true });
    } catch (error) {
      console.error("E-billing config update error:", error);
      res.status(500).json({ message: "Failed to update e-billing config" });
    }
  });

  // ===== SUBSCRIPTION ROUTES (for tenants) =====

  // Get available subscription plans (public)
  app.get("/api/subscription/plans", async (req: Request, res: Response) => {
    try {
      const plans = await storage.getActiveSubscriptionPlans();
      res.json(plans);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch plans" });
    }
  });

  // Get current tenant subscription
  app.get("/api/subscription/current", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Tenant ID required" });
      }
      const subscription = await storage.getTenantSubscription(tenantId);
      res.json(subscription);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  app.get("/api/subscription/my-plan", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(401).json({ message: "Tenant ID required" });

      const tenant = await storage.getTenant(tenantId);
      const planData = await storage.getTenantPlanWithLimits(tenantId);
      const usage = await storage.getTenantUsageCounts(tenantId);

      let trialInfo: { isTrialing: boolean; trialEndsAt: string | null; daysRemaining: number; trialExpired: boolean } = {
        isTrialing: false,
        trialEndsAt: null,
        daysRemaining: 0,
        trialExpired: false,
      };

      if (tenant?.status === "trial" && tenant.trialEndsAt) {
        const now = new Date();
        const trialEnd = new Date(tenant.trialEndsAt);
        const msRemaining = trialEnd.getTime() - now.getTime();
        const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
        const trialExpired = msRemaining <= 0;

        trialInfo = {
          isTrialing: true,
          trialEndsAt: tenant.trialEndsAt.toISOString(),
          daysRemaining,
          trialExpired,
        };

        if (trialExpired && !planData.plan) {
          await storage.updateTenant(tenantId, { status: "suspended", suspendedReason: "Trial expired" } as any);
          trialInfo.trialExpired = true;
        }
      }

      res.json({
        tier: planData.tier,
        businessType: planData.businessType,
        plan: planData.plan ? { id: planData.plan.id, name: planData.plan.name } : null,
        limits: planData.limits,
        features: planData.features,
        usage: {
          ...usage,
          warehouses: (await storage.getWarehousesByTenant(tenantId)).length,
        },
        trial: trialInfo,
        status: tenant?.status || "trial",
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch plan info" });
    }
  });

  // ===== MERCADOPAGO SUBSCRIPTION ROUTES =====

  app.get("/api/mercadopago/public-key", (req: Request, res: Response) => {
    
    res.json({ publicKey: getMercadoPagoPublicKey(), enabled: isMercadoPagoEnabled() });
  });

  app.post("/api/subscription/create-preference", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(401).json({ message: "Tenant ID required" });

      const { planId, billingPeriod, payerEmail } = req.body;
      if (!planId || !billingPeriod || !payerEmail) {
        return res.status(400).json({ message: "Plan ID, billing period, and payer email are required" });
      }

      const plans = await storage.getActiveSubscriptionPlans();
      const plan = plans.find((p) => p.id === planId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });

      const amount = billingPeriod === "yearly"
        ? parseFloat(plan.priceYearly || plan.priceMonthly)
        : parseFloat(plan.priceMonthly);
      const currency = plan.currency || "COP";

      

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const backUrl = `${baseUrl}/subscription?mp_status=returned&plan_id=${planId}&billing_period=${billingPeriod}`;

      const result = await createSubscriptionPreapproval({
        planName: `Flowp ${plan.name} - ${billingPeriod === "yearly" ? "Annual" : "Monthly"}`,
        amount,
        currency,
        frequency: billingPeriod === "yearly" ? 12 : 1,
        frequencyType: "months",
        payerEmail,
        externalReference: `${tenantId}|${planId}|${billingPeriod}`,
        backUrl,
      });

      res.json({
        preapprovalId: result.id,
        initPoint: result.initPoint,
        status: result.status,
      });
    } catch (error: any) {
      console.error("MercadoPago preference error:", error);
      res.status(500).json({ message: "Failed to create payment preference", error: error.message });
    }
  });

  app.post("/api/subscription/create-onetime-preference", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(401).json({ message: "Tenant ID required" });

      const { planId, billingPeriod, payerEmail } = req.body;
      if (!planId || !billingPeriod || !payerEmail) {
        return res.status(400).json({ message: "Plan ID, billing period, and payer email are required" });
      }

      const plans = await storage.getActiveSubscriptionPlans();
      const plan = plans.find((p) => p.id === planId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });

      const amount = billingPeriod === "yearly"
        ? parseFloat(plan.priceYearly || plan.priceMonthly)
        : parseFloat(plan.priceMonthly);
      const currency = plan.currency || "COP";

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const externalReference = `onetime|${tenantId}|${planId}|${billingPeriod}`;

      const result = await createOneTimePaymentPreference({
        title: `Flowp ${plan.name} - ${billingPeriod === "yearly" ? "Annual" : "Monthly"}`,
        amount,
        currency,
        externalReference,
        payerEmail,
        backUrls: {
          success: `${baseUrl}/subscription?mp_onetime=success&plan_id=${planId}&billing_period=${billingPeriod}&payer_email=${encodeURIComponent(payerEmail)}`,
          failure: `${baseUrl}/subscription?mp_onetime=failure`,
          pending: `${baseUrl}/subscription?mp_onetime=pending&plan_id=${planId}&billing_period=${billingPeriod}&payer_email=${encodeURIComponent(payerEmail)}`,
        },
        notificationUrl: `${baseUrl}/api/webhooks/mercadopago`,
      });

      res.json({
        preferenceId: result.id,
        initPoint: result.initPoint,
        sandboxInitPoint: result.sandboxInitPoint,
      });
    } catch (error: any) {
      console.error("MercadoPago one-time preference error:", error);
      res.status(500).json({ message: "Failed to create payment preference", error: error.message });
    }
  });

  app.post("/api/subscription/confirm-onetime-payment", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(401).json({ message: "Tenant ID required" });

      const { planId, billingPeriod, payerEmail, paymentId } = req.body;
      if (!planId || !billingPeriod) {
        return res.status(400).json({ message: "Plan ID and billing period are required" });
      }

      const plans = await storage.getActiveSubscriptionPlans();
      const plan = plans.find((p) => p.id === planId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });

      let verifiedStatus = "pending";
      let verifiedAmount = 0;
      let verifiedEmail = payerEmail || "";
      let providerRef = `onetime_${Date.now()}`;

      if (paymentId) {
        try {
          const mpPayment = await getPaymentStatus(paymentId);
          const expectedRef = `onetime|${tenantId}|${planId}|${billingPeriod}`;
          if (mpPayment.externalReference && mpPayment.externalReference !== expectedRef) {
            return res.status(400).json({ message: "Payment reference mismatch" });
          }
          verifiedStatus = mpPayment.status === "approved" ? "completed" : "pending";
          verifiedAmount = mpPayment.transactionAmount || 0;
          verifiedEmail = mpPayment.payerEmail || payerEmail || "";
          providerRef = String(mpPayment.id || paymentId);
        } catch (verifyError) {
          console.warn("Could not verify payment with MercadoPago, proceeding as pending:", verifyError);
          verifiedStatus = "pending";
        }
      }

      const subscription = await storage.createSubscription({
        tenantId,
        planId,
        billingPeriod,
        mpPreapprovalId: providerRef,
        mpPayerEmail: verifiedEmail,
        paymentGateway: "mercadopago_onetime",
      });

      const amount = billingPeriod === "yearly"
        ? (plan.priceYearly || plan.priceMonthly)
        : plan.priceMonthly;

      await storage.createSaasPayment({
        tenantId,
        amount: amount,
        method: "mercadopago_onetime",
        providerRef,
        status: verifiedStatus,
      });

      if (verifiedStatus === "completed") {
        await storage.updateTenant(tenantId, {
          status: "active",
          subscriptionTier: plan.tier || "basic",
        } as any);
      }

      res.status(201).json({ subscription, status: verifiedStatus === "completed" ? "success" : "pending" });
    } catch (error: any) {
      console.error("One-time payment confirmation error:", error);
      res.status(500).json({ message: "Failed to confirm payment" });
    }
  });

  app.post("/api/subscription/subscribe", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(401).json({ message: "Tenant ID required" });

      const { planId, billingPeriod, mpPreapprovalId, payerEmail } = req.body;
      if (!planId || !billingPeriod) {
        return res.status(400).json({ message: "Plan ID and billing period are required" });
      }

      const subscription = await storage.createSubscription({
        tenantId,
        planId,
        billingPeriod,
        mpPreapprovalId: mpPreapprovalId || null,
        mpPayerEmail: payerEmail || null,
        paymentGateway: "mercadopago",
      });

      const plans = await storage.getActiveSubscriptionPlans();
      const plan = plans.find((p) => p.id === planId);
      if (plan) {
        await storage.updateTenant(tenantId, {
          status: "active",
          subscriptionTier: plan.tier || "basic",
        } as any);
      }

      res.status(201).json(subscription);
    } catch (error) {
      console.error("Subscription error:", error);
      res.status(500).json({ message: "Failed to create subscription" });
    }
  });

  app.post("/api/subscription/confirm-payment", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(401).json({ message: "Tenant ID required" });

      const { preapprovalId } = req.body;
      if (!preapprovalId) return res.status(400).json({ message: "Preapproval ID required" });

      
      let mpData;
      try {
        mpData = await getPreapprovalStatus(preapprovalId);
      } catch (e: any) {
        console.error("MercadoPago verification failed:", e);
        return res.status(400).json({ message: "Could not verify payment with MercadoPago" });
      }

      const mpStatus = mpData.status;
      if (mpStatus !== "authorized" && mpStatus !== "pending") {
        return res.status(400).json({ message: `Payment not authorized. Status: ${mpStatus}` });
      }

      const externalRef = mpData.externalReference || "";
      const [refTenantId, refPlanId, refBillingPeriod] = externalRef.split("|");

      if (refTenantId && refTenantId !== tenantId) {
        return res.status(403).json({ message: "Preapproval does not belong to this tenant" });
      }

      const planId = refPlanId || req.body.planId;
      const billingPeriod = refBillingPeriod || req.body.billingPeriod;

      if (!planId || !billingPeriod) {
        return res.status(400).json({ message: "Could not determine plan from payment data" });
      }

      const plans = await storage.getActiveSubscriptionPlans();
      const plan = plans.find((p) => p.id === planId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });

      const subscription = await storage.createSubscription({
        tenantId,
        planId,
        billingPeriod,
        mpPreapprovalId: preapprovalId,
        mpPayerEmail: mpData.payerEmail || "",
        paymentGateway: "mercadopago",
      });

      const amount = billingPeriod === "yearly"
        ? (plan.priceYearly || plan.priceMonthly)
        : plan.priceMonthly;

      await storage.createSaasPayment({
        tenantId,
        amount: amount,
        method: "mercadopago",
        providerRef: preapprovalId,
        status: mpStatus === "authorized" ? "completed" : "pending",
      });

      await storage.updateTenant(tenantId, {
        status: "active",
        subscriptionTier: plan.tier || "basic",
      } as any);

      res.status(201).json({ subscription, mpStatus });
    } catch (error: any) {
      console.error("Payment confirmation error:", error);
      res.status(500).json({ message: "Failed to confirm payment" });
    }
  });

  app.get("/api/subscription/payments", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(401).json({ message: "Tenant ID required" });
      const payments = await storage.getSubscriptionPayments(tenantId);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.post("/api/webhooks/mercadopago", async (req: Request, res: Response) => {
    try {
      const { type, data } = req.body;

      if (type === "subscription_preapproval") {
        const preapprovalId = data?.id;
        if (preapprovalId) {
          try {
            const status = await getPreapprovalStatus(preapprovalId);
            if (status.status === "authorized") {
              await storage.updateSubscriptionByMpId(preapprovalId, { status: "active" });
            } else if (status.status === "cancelled") {
              await storage.updateSubscriptionByMpId(preapprovalId, { status: "cancelled" });
            } else if (status.status === "paused") {
              await storage.updateSubscriptionByMpId(preapprovalId, { status: "past_due" });
            }
          } catch (e) {
            console.error("Webhook preapproval processing error:", e);
          }
        }
      }

      if (type === "payment") {
        const paymentIdStr = data?.id;
        if (paymentIdStr) {
          try {
            const mpPayment = await getPaymentStatus(String(paymentIdStr));
            const extRef = mpPayment.externalReference || "";
            if (extRef.startsWith("onetime|")) {
              const parts = extRef.split("|");
              const tenantId = parts[1];
              const planId = parts[2];
              if (mpPayment.status === "approved" && tenantId && planId) {
                const plans = await storage.getActiveSubscriptionPlans();
                const plan = plans.find((p) => p.id === planId);
                if (plan) {
                  await storage.updateTenant(tenantId, {
                    status: "active",
                    subscriptionTier: plan.tier || "basic",
                  } as any);
                }
              }
            }
          } catch (e) {
            console.error("Webhook payment processing error:", e);
          }
        }
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(200).json({ received: true });
    }
  });

  app.post("/api/subscription/cancel", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(401).json({ message: "Tenant ID required" });

      const subscription = await storage.getTenantSubscription(tenantId);
      if (!subscription) return res.status(404).json({ message: "No active subscription" });

      if (subscription.mpPreapprovalId) {
        try {
          
          await cancelPreapproval(subscription.mpPreapprovalId);
        } catch (e) {
          console.warn("Could not cancel MercadoPago preapproval:", e);
        }
      }

      await storage.updateSubscriptionByMpId(subscription.mpPreapprovalId || "", { status: "cancelled" });

      res.json({ message: "Subscription cancelled" });
    } catch (error) {
      console.error("Cancel subscription error:", error);
      res.status(500).json({ message: "Failed to cancel subscription" });
    }
  });

  // ===== CASH REGISTER ROUTES =====

  app.get("/api/registers", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(400).json({ error: "Missing tenant" });
      const regs = await storage.getRegistersByTenant(tenantId);
      const maxRegisters = await storage.getTenantMaxRegisters(tenantId);
      res.json({ registers: regs, maxRegisters, count: regs.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/registers", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(400).json({ error: "Missing tenant" });
      const { name } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: "Register name is required" });

      const limitCheck = await storage.checkSubscriptionLimit(tenantId, "registers");
      if (!limitCheck.allowed) {
        return res.status(403).json({ error: "register_limit_reached", current: limitCheck.current, max: limitCheck.max, requiresUpgrade: true });
      }

      const reg = await storage.createRegister({ tenantId, name: name.trim(), deviceId: null, printerConfig: null });
      res.json(reg);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/registers/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(400).json({ error: "Missing tenant" });
      const { name } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: "Register name is required" });
      const existingRegs = await storage.getRegistersByTenant(tenantId);
      const owned = existingRegs.find(r => r.id === req.params.id);
      if (!owned) return res.status(404).json({ error: "Register not found" });
      const reg = await storage.updateRegister(req.params.id, { name: name.trim() });
      res.json(reg);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/registers/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(400).json({ error: "Missing tenant" });
      const existingRegs = await storage.getRegistersByTenant(tenantId);
      const owned = existingRegs.find(r => r.id === req.params.id);
      if (!owned) return res.status(404).json({ error: "Register not found" });
      const activeSession = await storage.getActiveRegisterSession(req.params.id);
      if (activeSession) {
        return res.status(400).json({ error: "Cannot delete a register with an active session" });
      }
      await storage.deleteRegister(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/register-sessions/active", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(400).json({ error: "Missing tenant" });
      const registerId = req.query.registerId as string;
      let session;
      if (registerId) {
        session = await storage.getActiveRegisterSession(registerId);
      } else {
        session = await storage.getActiveSessionByTenant(tenantId);
      }
      res.json(session || null);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/register-sessions", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(400).json({ error: "Missing tenant" });
      const limit = parseInt(req.query.limit as string) || 50;
      const sessions = await storage.getRegisterSessionsByTenant(tenantId, limit);

      const sessionsWithUser = await Promise.all(sessions.map(async (s) => {
        const user = await storage.getUser(s.userId);
        const closedByUser = s.closedByUserId ? await storage.getUser(s.closedByUserId) : null;
        return { ...s, userName: user?.name || user?.username, closedByUserName: closedByUser?.name || closedByUser?.username };
      }));
      res.json(sessionsWithUser);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/register-sessions/:id", async (req: Request, res: Response) => {
    try {
      const session = await storage.getRegisterSession(req.params.id);
      if (!session) return res.status(404).json({ error: "Session not found" });
      const user = await storage.getUser(session.userId);
      const closedByUser = session.closedByUserId ? await storage.getUser(session.closedByUserId) : null;
      const movements = await storage.getCashMovementsBySession(session.id);
      res.json({
        ...session,
        userName: user?.name || user?.username,
        closedByUserName: closedByUser?.name || closedByUser?.username,
        movements,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/register-sessions/:id/summary", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return res.status(400).json({ error: "Missing tenant" });

      const session = await storage.getRegisterSession(req.params.id);
      if (!session || session.tenantId !== tenantId) return res.status(404).json({ error: "Session not found" });

      const sessionOrders = await db.select({
        total: orders.total,
        id: orders.id,
      }).from(orders).where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.registerSessionId, session.id),
          eq(orders.status, "completed"),
        )
      );

      let cashSales = 0;
      let cardSales = 0;
      let totalSales = 0;

      for (const order of sessionOrders) {
        totalSales += parseFloat(order.total || "0");
        const orderPayments = await db.select().from(payments).where(eq(payments.orderId, order.id));
        for (const p of orderPayments) {
          const amount = parseFloat(p.amount || "0");
          if (p.method === "cash") {
            cashSales += amount;
          } else {
            cardSales += amount;
          }
        }
      }

      const movementsResult = await db.select({
        type: cashMovements.type,
        total: sql<string>`SUM(${cashMovements.amount})`,
      }).from(cashMovements)
        .where(and(
          eq(cashMovements.sessionId, session.id),
          eq(cashMovements.tenantId, tenantId),
        ))
        .groupBy(cashMovements.type);

      let movIn = 0, movOut = 0;
      for (const m of movementsResult) {
        if (m.type === "cash_in") movIn = parseFloat(m.total || "0");
        if (m.type === "cash_out") movOut = parseFloat(m.total || "0");
      }

      const openingCash = parseFloat(session.openingCash || "0");
      const expectedCash = openingCash + cashSales + movIn - movOut;

      res.json({
        totalOrders: sessionOrders.length,
        totalSales,
        cashSales,
        cardSales,
        movementsIn: movIn,
        movementsOut: movOut,
        openingCash,
        expectedCash,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/register-sessions/open", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId || !userId) return res.status(400).json({ error: "Missing tenant or user" });

      const { registerId, openingCash } = req.body;
      if (!registerId) return res.status(400).json({ error: "Missing registerId" });

      const existingSession = await storage.getActiveRegisterSession(registerId);
      if (existingSession) {
        return res.status(400).json({ error: "Register already has an open session" });
      }

      const session = await storage.openRegisterSession({
        registerId,
        tenantId,
        userId,
        openingCash: String(openingCash || "0"),
        status: "open",
      });
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/register-sessions/:id/close", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId || !userId) return res.status(400).json({ error: "Missing tenant or user" });

      const session = await storage.getRegisterSession(req.params.id);
      if (!session || session.tenantId !== tenantId) return res.status(404).json({ error: "Session not found" });
      if (session.status === "closed") return res.status(400).json({ error: "Session already closed" });

      const { countedCash, countedCard, denominationCounts, notes } = req.body;

      const sessionOrders = await db.select({
        total: orders.total,
        id: orders.id,
      }).from(orders).where(
        and(
          eq(orders.tenantId, tenantId),
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
          } else if (p.method === "card" || p.method === "credit_card" || p.method === "debit_card") {
            expectedCardSales += amount;
          } else if (p.method === "transfer" || p.method === "nequi" || p.method === "daviplata") {
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
      const expectedCard = expectedCardSales;

      const countedCashVal = parseFloat(countedCash || "0");
      const countedCardVal = parseFloat(countedCard || "0");

      const cashVariance = countedCashVal - expectedCash;
      const cardVariance = countedCardVal - expectedCard;

      const closedSession = await storage.closeRegisterSession(session.id, {
        closedByUserId: userId,
        closingCash: String(countedCashVal),
        expectedCash: String(expectedCash),
        expectedCard: String(expectedCard),
        countedCash: String(countedCashVal),
        countedCard: String(countedCardVal),
        cashVariance: String(cashVariance),
        cardVariance: String(cardVariance),
        totalSales: String(totalSales),
        totalOrders: sessionOrders.length,
        cashMovementsIn: String(movIn),
        cashMovementsOut: String(movOut),
        denominationCounts: denominationCounts || null,
        notes: notes || null,
      });

      res.json(closedSession);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/register-sessions/:id/movements", async (req: Request, res: Response) => {
    try {
      const movements = await storage.getCashMovementsBySession(req.params.id);
      res.json(movements);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/register-sessions/:id/movements", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId || !userId) return res.status(400).json({ error: "Missing tenant or user" });

      const session = await storage.getRegisterSession(req.params.id);
      if (!session) return res.status(404).json({ error: "Session not found" });
      if (session.status === "closed") return res.status(400).json({ error: "Session is closed" });

      const { type, amount, reason } = req.body;
      if (!type || !amount) return res.status(400).json({ error: "Missing type or amount" });

      const movement = await storage.createCashMovement({
        sessionId: session.id,
        tenantId,
        userId,
        type,
        amount: String(amount),
        reason: reason || null,
      });
      res.json(movement);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== REPORTS ROUTES =====

  app.get("/api/reports/dashboard", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json({
          todaySales: 0,
          todayOrders: 0,
          averageOrderValue: 0,
          topProducts: [],
          salesByHour: [],
          salesByCategory: [],
          recentTrend: 0,
        });
      }
      const stats = await storage.getDashboardStats(tenantId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // ===== ADVANCED ANALYTICS =====
  
  app.get("/api/reports/analytics", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json({
          salesTrends: [],
          productPerformance: [],
          employeeMetrics: [],
          profitAnalysis: { totalRevenue: 0, totalCost: 0, grossProfit: 0, grossMargin: 0, topProfitProducts: [] },
        });
      }

      const hasFeature = await storage.hasSubscriptionFeature(tenantId, SUBSCRIPTION_FEATURES.REPORTS_DETAILED);
      if (!hasFeature) {
        return res.status(403).json({ message: "This feature requires a Pro subscription", requiresUpgrade: true, feature: "reports_detailed" });
      }
      const dateRange = (req.query.range as string) || "7d";
      const startDateStr = req.query.startDate as string | undefined;
      const endDateStr = req.query.endDate as string | undefined;
      
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      
      if (startDateStr && endDateStr) {
        startDate = new Date(startDateStr);
        endDate = new Date(endDateStr);
      }
      
      const analytics = await storage.getAdvancedAnalytics(tenantId, dateRange, startDate, endDate);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch advanced analytics" });
    }
  });

  // ===== SMTP / EMAIL SETTINGS (Internal Admin Only) =====
  
  // Get SMTP config (returns masked password)
  app.get("/api/internal/smtp-config", async (req: Request, res: Response) => {
    try {
      const setting = await storage.getSystemSetting("smtp_config");
      if (!setting) {
        return res.json(null);
      }
      // Mask password for security
      const config = setting.value as Record<string, unknown>;
      if (config.auth && typeof config.auth === "object") {
        const auth = config.auth as Record<string, unknown>;
        if (auth.pass) {
          auth.pass = "********";
        }
      }
      res.json(config);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch SMTP config" });
    }
  });

  // Update SMTP config
  app.post("/api/internal/smtp-config", async (req: Request, res: Response) => {
    try {
      const { host, port, secure, user, pass, fromEmail, fromName } = req.body;
      
      // Get existing config to preserve password if not provided
      const existing = await storage.getSystemSetting("smtp_config");
      let existingPass = "";
      if (existing?.value) {
        const auth = (existing.value as any)?.auth;
        if (auth?.pass) {
          existingPass = auth.pass;
        }
      }

      const config = {
        host,
        port: parseInt(port) || 587,
        secure: secure === true || secure === "true",
        auth: {
          user,
          pass: pass === "********" ? existingPass : pass,
        },
        fromEmail,
        fromName,
      };

      await storage.upsertSystemSetting("smtp_config", config);
      res.json({ message: "SMTP configuration saved" });
    } catch (error) {
      res.status(500).json({ message: "Failed to save SMTP config" });
    }
  });

  // Test SMTP connection
  app.post("/api/internal/smtp-config/test", async (req: Request, res: Response) => {
    try {
      const { host, port, secure, user, pass, fromEmail, fromName } = req.body;
      
      // Get existing password if masked
      let actualPass = pass;
      if (pass === "********") {
        const existing = await storage.getSystemSetting("smtp_config");
        actualPass = (existing?.value as any)?.auth?.pass || "";
      }

      const result = await emailService.testSmtpConnection({
        host,
        port: parseInt(port) || 587,
        secure: secure === true || secure === "true",
        user,
        password: actualPass,
        fromEmail,
        fromName,
      });

      if (result.success) {
        res.json({ success: true, message: "SMTP connection successful" });
      } else {
        res.status(400).json({ success: false, message: result.error });
      }
    } catch (error) {
      res.status(500).json({ success: false, message: "Failed to test SMTP connection" });
    }
  });

  // Get email templates
  app.get("/api/internal/email-templates", async (req: Request, res: Response) => {
    try {
      const templates = await storage.getAllEmailTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch email templates" });
    }
  });

  // Update email template
  app.put("/api/internal/email-templates/:type", async (req: Request, res: Response) => {
    try {
      const { type } = req.params;
      const { subject, htmlBody, textBody, isActive } = req.body;
      
      const template = await storage.upsertEmailTemplate({
        type: type as any,
        subject,
        htmlBody,
        textBody,
        isActive,
      });
      
      res.json(template);
    } catch (error) {
      res.status(500).json({ message: "Failed to update email template" });
    }
  });

  // Get email logs
  app.get("/api/internal/email-logs", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getEmailLogs(limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch email logs" });
    }
  });

  // Send test email to verify SMTP is working end-to-end
  app.post("/api/internal/smtp-config/send-test", async (req: Request, res: Response) => {
    try {
      const { toEmail } = req.body;
      
      if (!toEmail) {
        return res.status(400).json({ success: false, message: "Email address is required" });
      }

      // Re-initialize transporter with latest config
      const initialized = await emailService.initTransporter();
      if (!initialized) {
        return res.status(400).json({ success: false, message: "SMTP not configured" });
      }

      const sent = await emailService.sendEmail({
        to: toEmail,
        subject: "Flowp POS - Test Email",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #6E51CD;">Test Email from Flowp POS</h1>
            <p>This is a test email to verify that your SMTP configuration is working correctly.</p>
            <p style="color: #666;">If you received this email, your email delivery is properly configured!</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #999;">Sent from Flowp POS Admin Console</p>
          </div>
        `,
        text: "This is a test email to verify that your SMTP configuration is working correctly."
      });

      if (sent) {
        await storage.createEmailLog({
          templateType: "test_email",
          recipientEmail: toEmail,
          subject: "Flowp POS - Test Email",
          status: "sent",
        });
        res.json({ success: true, message: "Test email sent successfully" });
      } else {
        await storage.createEmailLog({
          templateType: "test_email",
          recipientEmail: toEmail,
          subject: "Flowp POS - Test Email",
          status: "failed",
          errorMessage: "Failed to send email",
        });
        res.status(400).json({ success: false, message: "Failed to send test email" });
      }
    } catch (error) {
      console.error("Send test email error:", error);
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Failed to send test email" });
    }
  });

  // ===== TENANT EMAIL TEMPLATES =====

  // Get email templates (tenant accessible)
  app.get("/api/email-templates", async (req: Request, res: Response) => {
    try {
      const templates = await storage.getAllEmailTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch email templates" });
    }
  });

  // Update email template (tenant accessible - owners only should be enforced by frontend)
  app.put("/api/email-templates/:type", async (req: Request, res: Response) => {
    try {
      const { type } = req.params;
      const { subject, htmlBody, textBody, isActive } = req.body;
      
      const template = await storage.upsertEmailTemplate({
        type: type as any,
        subject,
        htmlBody,
        textBody,
        isActive,
      });
      
      res.json(template);
    } catch (error) {
      console.error("Email template update error:", error);
      res.status(500).json({ message: "Failed to update email template" });
    }
  });

  app.post("/api/email-templates/preview", async (req: Request, res: Response) => {
    try {
      const { htmlBody, companyName, companyLogo, language } = req.body;
      if (!htmlBody) return res.status(400).json({ message: "htmlBody is required" });
      const wrappedHtml = getEmailWrapper(htmlBody, { companyName, companyLogo, language });
      res.json({ html: wrappedHtml });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate preview" });
    }
  });

  // ===== IN-APP NOTIFICATIONS =====

  // Get notifications for current user
  app.get("/api/notifications", async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      const tenantId = req.query.tenantId as string;
      
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      const notifications = await storage.getUserNotifications(userId, tenantId);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // Mark notification as read
  app.patch("/api/notifications/:id/read", async (req: Request, res: Response) => {
    try {
      const notification = await storage.markNotificationAsRead(req.params.id);
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.json(notification);
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // Mark all notifications as read for a user
  app.post("/api/notifications/mark-all-read", async (req: Request, res: Response) => {
    try {
      const { userId, tenantId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      await storage.markAllNotificationsAsRead(userId, tenantId);
      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notifications as read" });
    }
  });

  // Get unread notification count
  app.get("/api/notifications/unread-count", async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      const tenantId = req.query.tenantId as string;
      
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      const count = await storage.getUnreadNotificationCount(userId, tenantId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: "Failed to get notification count" });
    }
  });

  return httpServer;
}
