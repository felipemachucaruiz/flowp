import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import bcrypt from "bcrypt";
import crypto from "crypto";
import path from "path";
import archiver from "archiver";
import { storage } from "./storage";
import { emailService } from "./email";
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

  // ===== PRINTBRIDGE DOWNLOAD =====
  app.get("/printbridge/PrintBridge-Source.zip", (req: Request, res: Response) => {
    const printbridgePath = path.join(process.cwd(), "printbridge");
    
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=PrintBridge-Source.zip");
    
    const archive = archiver("zip", { zlib: { level: 9 } });
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
    
    const archive = archiver("zip", { store: true });
    archive.on("error", () => {
      res.status(500).json({ error: "Failed to create archive" });
    });
    
    archive.pipe(res);
    archive.file(path.join(simplePath, "package.json"), { name: "PrintBridge-Simple/package.json" });
    archive.file(path.join(simplePath, "server.js"), { name: "PrintBridge-Simple/server.js" });
    archive.file(path.join(simplePath, "start.bat"), { name: "PrintBridge-Simple/start.bat" });
    archive.finalize();
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
      } = req.body;

      // Validate required fields
      if (!adminEmail || !adminPhone) {
        return res.status(400).json({ message: "Email and phone number are required" });
      }

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
      });

      // Create admin user
      const user = await storage.createUser({
        tenantId: tenant.id,
        username: adminUsername,
        password: adminPassword,
        name: adminName,
        email: adminEmail,
        phone: adminPhone,
        role: "admin",
        pin: null,
        isActive: true,
      });

      res.json({ tenant, user: { ...user, password: undefined } });
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
        return res.json({
          user: { ...user, password: undefined },
          tenant: null,
          isInternal: true,
          redirectTo: "/admin",
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
        user: { ...user, password: undefined },
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

      // Send email (non-blocking)
      emailService.sendPasswordResetEmail(email, token, user.name || user.username)
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

  // ===== USERS ROUTES =====

  app.get("/api/users", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json([]);
      }
      const users = await storage.getUsersByTenant(tenantId);
      res.json(users.map(u => ({ ...u, password: undefined })));
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
      
      const { name, email, phone, username, password, role, pin } = req.body;
      
      if (!name || !email || !phone || !username || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }

      // Check if username exists
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

      res.json({ ...user, password: undefined });
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
      res.json({ ...user, password: undefined });
    } catch (error) {
      console.error("User update error:", error);
      res.status(500).json({ message: "Failed to update user" });
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
      const data = insertProductSchema.parse({ ...req.body, tenantId });
      const product = await storage.createProduct(data);
      res.json(product);
    } catch (error) {
      console.error("Product creation error:", error);
      res.status(400).json({ message: "Failed to create product" });
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
      const products = await storage.getProductsByTenant(tenantId);
      const exists = products.find(p => p.id === id);
      if (!exists) {
        return res.status(404).json({ message: "Product not found" });
      }
      const product = await storage.updateProduct(id, req.body);
      res.json(product);
    } catch (error) {
      res.status(400).json({ message: "Failed to update product" });
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
      const products = await storage.getProductsByTenant(tenantId);
      const exists = products.find(p => p.id === id);
      if (!exists) {
        return res.status(404).json({ message: "Product not found" });
      }
      await storage.deleteProduct(id);
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
      const { name, email, phone, address, idType, idNumber, notes } = req.body;
      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (address !== undefined) updateData.address = address;
      if (idType !== undefined) updateData.idType = idType;
      if (idNumber !== undefined) updateData.idNumber = idNumber;
      if (notes !== undefined) updateData.notes = notes;
      
      const customer = await storage.updateCustomer(id, updateData);
      res.json(customer);
    } catch (error) {
      res.status(400).json({ message: "Failed to update customer" });
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
      // Verify floor belongs to tenant if provided
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

      const { items, paymentMethod, subtotal, taxAmount, total, customerId, salesRepId } = req.body;

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
        registerId: null,
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
          
          if (pointsEarned > 0) {
            // Create loyalty transaction
            await storage.createLoyaltyTransaction({
              tenantId,
              customerId,
              orderId: order.id,
              type: "earned",
              points: pointsEarned,
            });
          }
          
          // Update customer stats
          await storage.updateCustomer(customerId, {
            loyaltyPoints: (customer.loyaltyPoints || 0) + pointsEarned,
            totalSpent: (parseFloat(customer.totalSpent?.toString() || "0") + orderTotal).toString(),
            orderCount: (customer.orderCount || 0) + 1,
            lastPurchaseAt: new Date(),
          });
        }
      }

      res.json(order);
    } catch (error) {
      console.error("Order error:", error);
      res.status(400).json({ message: "Failed to create order" });
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

  // ===== INVENTORY ROUTES =====

  app.get("/api/inventory/levels", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json({});
      }
      const levels = await storage.getStockLevels(tenantId);
      res.json(levels);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stock levels" });
    }
  });

  app.get("/api/inventory/movements", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.json([]);
      }
      const movements = await storage.getStockMovementsByTenant(tenantId);
      res.json(movements);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stock movements" });
    }
  });

  app.post("/api/inventory/adjust", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;

      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { productId, type, quantity, notes } = req.body;

      // Verify product belongs to tenant
      const products = await storage.getProductsByTenant(tenantId);
      const product = products.find(p => p.id === productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const movement = await storage.createStockMovement({
        tenantId,
        productId,
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

  // Receive stock from purchase order
  app.post("/api/purchase-orders/:id/receive", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id } = req.params;
      const { items } = req.body; // Array of { itemId, receivedQuantity }
      
      // Verify order belongs to tenant
      const order = await storage.getPurchaseOrder(id);
      if (!order || order.tenantId !== tenantId) {
        return res.status(404).json({ message: "Purchase order not found" });
      }
      
      const orderItems = await storage.getPurchaseOrderItems(id);
      
      // Process received items
      for (const received of items) {
        const orderItem = orderItems.find(i => i.id === received.itemId);
        if (orderItem && received.receivedQuantity > 0) {
          // Update item received quantity
          await storage.updatePurchaseOrderItem(received.itemId, {
            receivedQuantity: (orderItem.receivedQuantity || 0) + received.receivedQuantity,
          });
          
          // Create stock movement for the received items
          await storage.createStockMovement({
            tenantId,
            productId: orderItem.productId,
            type: "purchase",
            quantity: received.receivedQuantity,
            referenceId: id,
            notes: `Received from PO ${order.orderNumber}`,
            userId: userId || null,
          });
        }
      }
      
      // Check if all items are fully received
      const updatedItems = await storage.getPurchaseOrderItems(id);
      const allReceived = updatedItems.every(item => 
        (item.receivedQuantity || 0) >= item.quantity
      );
      const partiallyReceived = updatedItems.some(item =>
        (item.receivedQuantity || 0) > 0 && (item.receivedQuantity || 0) < item.quantity
      );
      
      // Update order status
      let newStatus: "received" | "partial" = "received";
      if (!allReceived && partiallyReceived) {
        newStatus = "partial";
      }
      
      await storage.updatePurchaseOrder(id, {
        status: newStatus,
        receivedDate: allReceived ? new Date() : undefined,
      });
      
      const updatedOrder = await storage.getPurchaseOrder(id);
      res.json({ ...updatedOrder, items: updatedItems });
    } catch (error) {
      res.status(400).json({ message: "Failed to receive stock" });
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
        couponEnabled, couponText
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
      });
      
      if (!updated) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: "Failed to update settings" });
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

  // Subscribe to a plan
  app.post("/api/subscription/subscribe", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Tenant ID required" });
      }

      const { planId, billingPeriod, paypalOrderId } = req.body;

      if (!planId || !billingPeriod || !paypalOrderId) {
        return res.status(400).json({ message: "Plan ID, billing period, and PayPal order ID are required" });
      }

      const subscription = await storage.createSubscription({
        tenantId,
        planId,
        billingPeriod,
        paypalOrderId,
      });

      res.status(201).json(subscription);
    } catch (error) {
      console.error("Subscription error:", error);
      res.status(500).json({ message: "Failed to create subscription" });
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
        auth: { user, pass: actualPass },
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

  return httpServer;
}
