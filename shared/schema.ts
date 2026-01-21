import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const tenantTypeEnum = pgEnum("tenant_type", ["retail", "restaurant"]);
export const userRoleEnum = pgEnum("user_role", ["admin", "manager", "cashier", "kitchen"]);
export const tableStatusEnum = pgEnum("table_status", ["free", "occupied", "dirty", "reserved"]);
export const orderStatusEnum = pgEnum("order_status", ["pending", "in_progress", "completed", "cancelled", "held"]);
export const kitchenTicketStatusEnum = pgEnum("kitchen_ticket_status", ["new", "preparing", "ready", "served"]);
export const stockMovementTypeEnum = pgEnum("stock_movement_type", ["sale", "return", "purchase", "adjustment", "waste", "transfer"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "card", "split"]);

// Tenants
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: tenantTypeEnum("type").notNull(),
  featureFlags: jsonb("feature_flags").$type<string[]>().default([]),
  logo: text("logo"),
  address: text("address"),
  phone: text("phone"),
  currency: text("currency").default("$"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Users
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("cashier"),
  pin: text("pin"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Registers
export const registers = pgTable("registers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  name: text("name").notNull(),
  deviceId: text("device_id"),
  printerConfig: jsonb("printer_config").$type<{
    printerName?: string;
    paperSize?: "58mm" | "80mm";
    autoPrint?: boolean;
  }>(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Register Sessions (Cash Drawer)
export const registerSessions = pgTable("register_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  registerId: varchar("register_id").references(() => registers.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  openingCash: decimal("opening_cash", { precision: 10, scale: 2 }).notNull(),
  closingCash: decimal("closing_cash", { precision: 10, scale: 2 }),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
});

// Categories
export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  name: text("name").notNull(),
  color: text("color").default("#3B82F6"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
});

// Products (Retail) / Menu Items (Restaurant)
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  categoryId: varchar("category_id").references(() => categories.id),
  name: text("name").notNull(),
  sku: text("sku"),
  barcode: text("barcode"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  image: text("image"),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  trackInventory: boolean("track_inventory").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Modifier Groups (Restaurant)
export const modifierGroups = pgTable("modifier_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  name: text("name").notNull(),
  minSelections: integer("min_selections").default(0),
  maxSelections: integer("max_selections").default(1),
  isRequired: boolean("is_required").default(false),
});

// Modifiers (Restaurant)
export const modifiers = pgTable("modifiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").references(() => modifierGroups.id).notNull(),
  name: text("name").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).default("0"),
  isDefault: boolean("is_default").default(false),
});

// Product-Modifier Group Link
export const productModifierGroups = pgTable("product_modifier_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").references(() => products.id).notNull(),
  modifierGroupId: varchar("modifier_group_id").references(() => modifierGroups.id).notNull(),
});

// Floors (Restaurant)
export const floors = pgTable("floors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").default(0),
});

// Tables (Restaurant)
export const tables = pgTable("tables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  floorId: varchar("floor_id").references(() => floors.id).notNull(),
  name: text("name").notNull(),
  capacity: integer("capacity").default(4),
  status: tableStatusEnum("status").default("free"),
  posX: integer("pos_x").default(0),
  posY: integer("pos_y").default(0),
});

// Orders
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  registerId: varchar("register_id").references(() => registers.id),
  userId: varchar("user_id").references(() => users.id).notNull(),
  tableId: varchar("table_id").references(() => tables.id),
  orderNumber: integer("order_number").notNull(),
  status: orderStatusEnum("status").default("pending"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Order Items
export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  productId: varchar("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  modifiers: jsonb("modifiers").$type<{ id: string; name: string; price: string }[]>().default([]),
  notes: text("notes"),
  sentToKitchen: boolean("sent_to_kitchen").default(false),
});

// Kitchen Tickets
export const kitchenTickets = pgTable("kitchen_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  tableId: varchar("table_id").references(() => tables.id),
  station: text("station").default("kitchen"),
  status: kitchenTicketStatusEnum("status").default("new"),
  items: jsonb("items").$type<{
    id: string;
    name: string;
    quantity: number;
    modifiers: string[];
    notes?: string;
  }[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

// Payments
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  method: paymentMethodEnum("method").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  reference: text("reference"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Stock Movements (Ledger-based Inventory)
export const stockMovements = pgTable("stock_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  productId: varchar("product_id").references(() => products.id).notNull(),
  type: stockMovementTypeEnum("type").notNull(),
  quantity: integer("quantity").notNull(),
  referenceId: varchar("reference_id"),
  notes: text("notes"),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Audit Logs
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: varchar("entity_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  registers: many(registers),
  categories: many(categories),
  products: many(products),
  floors: many(floors),
  orders: many(orders),
}));

export const usersRelations = relations(users, ({ one }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  tenant: one(tenants, { fields: [categories.tenantId], references: [tenants.id] }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one }) => ({
  tenant: one(tenants, { fields: [products.tenantId], references: [tenants.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
}));

export const floorsRelations = relations(floors, ({ one, many }) => ({
  tenant: one(tenants, { fields: [floors.tenantId], references: [tenants.id] }),
  tables: many(tables),
}));

export const tablesRelations = relations(tables, ({ one }) => ({
  floor: one(floors, { fields: [tables.floorId], references: [floors.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  tenant: one(tenants, { fields: [orders.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  table: one(tables, { fields: [orders.tableId], references: [tables.id] }),
  items: many(orderItems),
  payments: many(payments),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

// Insert Schemas
export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertRegisterSchema = createInsertSchema(registers).omit({ id: true, createdAt: true });
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export const insertFloorSchema = createInsertSchema(floors).omit({ id: true });
export const insertTableSchema = createInsertSchema(tables).omit({ id: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, completedAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertKitchenTicketSchema = createInsertSchema(kitchenTickets).omit({ id: true, createdAt: true, startedAt: true, completedAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export const insertStockMovementSchema = createInsertSchema(stockMovements).omit({ id: true, createdAt: true });
export const insertModifierGroupSchema = createInsertSchema(modifierGroups).omit({ id: true });
export const insertModifierSchema = createInsertSchema(modifiers).omit({ id: true });
export const insertRegisterSessionSchema = createInsertSchema(registerSessions).omit({ id: true, openedAt: true, closedAt: true });

// Types
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Register = typeof registers.$inferSelect;
export type InsertRegister = z.infer<typeof insertRegisterSchema>;
export type RegisterSession = typeof registerSessions.$inferSelect;
export type InsertRegisterSession = z.infer<typeof insertRegisterSessionSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type ModifierGroup = typeof modifierGroups.$inferSelect;
export type InsertModifierGroup = z.infer<typeof insertModifierGroupSchema>;
export type Modifier = typeof modifiers.$inferSelect;
export type InsertModifier = z.infer<typeof insertModifierSchema>;
export type Floor = typeof floors.$inferSelect;
export type InsertFloor = z.infer<typeof insertFloorSchema>;
export type Table = typeof tables.$inferSelect;
export type InsertTable = z.infer<typeof insertTableSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type KitchenTicket = typeof kitchenTickets.$inferSelect;
export type InsertKitchenTicket = z.infer<typeof insertKitchenTicketSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type StockMovement = typeof stockMovements.$inferSelect;
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;

// Feature flags for tenant types
export const RETAIL_FEATURES = [
  "pos.core",
  "inventory.core", 
  "purchasing.core",
  "customers.core",
  "reporting.core",
  "retail.barcode",
  "retail.returns",
  "retail.bulk_discounts",
];

export const RESTAURANT_FEATURES = [
  "pos.core",
  "inventory.core",
  "purchasing.core", 
  "customers.core",
  "reporting.core",
  "restaurant.tables",
  "restaurant.floors",
  "restaurant.kitchen_tickets",
  "restaurant.modifiers",
  "restaurant.courses",
  "restaurant.split_checks",
  "restaurant.tips",
];
