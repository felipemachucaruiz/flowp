import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import {
  insertTenantSchema,
  insertCategorySchema,
  insertProductSchema,
  insertFloorSchema,
  insertTableSchema,
  RETAIL_FEATURES,
  RESTAURANT_FEATURES,
} from "@shared/schema";
import { z } from "zod";

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

  // ===== AUTH ROUTES =====

  // Register new tenant and admin user
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const {
        businessName,
        businessType,
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

      const tenant = await storage.getTenant(user.tenantId);

      if (!tenant) {
        return res.status(401).json({ message: "Tenant not found" });
      }

      res.json({
        user: { ...user, password: undefined },
        tenant,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(401).json({ message: "Invalid credentials" });
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

  app.post("/api/orders", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = req.headers["x-user-id"] as string;

      if (!tenantId || !userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { items, paymentMethod, subtotal, taxAmount, total } = req.body;

      // Get next order number
      const orderNumber = await storage.getNextOrderNumber(tenantId);

      // Create order
      const order = await storage.createOrder({
        tenantId,
        userId,
        orderNumber,
        status: "completed",
        subtotal: subtotal.toString(),
        taxAmount: taxAmount.toString(),
        total: total.toString(),
        discountAmount: "0",
        registerId: null,
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

  // ===== TENANT ROUTES =====

  app.get("/api/tenant", async (req: Request, res: Response) => {
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

  app.patch("/api/tenant/settings", async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { currency, taxRate, address, phone, language } = req.body;
      
      const updated = await storage.updateTenant(tenantId, {
        currency: currency || undefined,
        taxRate: taxRate || undefined,
        address: address || undefined,
        phone: phone || undefined,
        language: language || undefined,
      });
      
      if (!updated) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: "Failed to update settings" });
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

  return httpServer;
}
