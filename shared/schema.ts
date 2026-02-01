import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const tenantTypeEnum = pgEnum("tenant_type", ["retail", "restaurant"]);
export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "manager", "cashier", "kitchen", "inventory"]);
export const tableStatusEnum = pgEnum("table_status", ["free", "occupied", "dirty", "reserved"]);
export const orderStatusEnum = pgEnum("order_status", ["pending", "in_progress", "completed", "cancelled", "held", "tab"]);
export const kitchenTicketStatusEnum = pgEnum("kitchen_ticket_status", ["new", "preparing", "ready", "served"]);
export const stockMovementTypeEnum = pgEnum("stock_movement_type", ["sale", "return", "purchase", "adjustment", "waste", "transfer"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "card", "split"]);
export const customerIdTypeEnum = pgEnum("customer_id_type", ["pasaporte", "cedula_ciudadania", "cedula_extranjeria", "nit"]);

// Purchase order enums
export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", ["draft", "ordered", "partial", "received", "cancelled"]);

// Portal enums
export const tenantStatusEnum = pgEnum("tenant_status", ["trial", "active", "past_due", "suspended", "cancelled"]);
export const portalRoleTypeEnum = pgEnum("portal_role_type", ["internal", "tenant"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["trial", "active", "past_due", "suspended", "cancelled"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["open", "in_progress", "pending", "resolved", "closed"]);
export const ticketPriorityEnum = pgEnum("ticket_priority", ["low", "medium", "high", "urgent"]);
export const documentStatusEnum = pgEnum("document_status", ["pending", "sent", "accepted", "rejected", "error"]);
export const impersonationModeEnum = pgEnum("impersonation_mode", ["read_only", "write"]);
export const subscriptionTierEnum = pgEnum("subscription_tier", ["basic", "pro", "enterprise"]);

// Ingredient inventory enums (Pro feature for restaurants)
export const ingredientUomEnum = pgEnum("ingredient_uom", ["g", "kg", "ml", "L", "unit"]);
export const lotStatusEnum = pgEnum("lot_status", ["open", "depleted", "expired", "void"]);
export const ingredientMovementTypeEnum = pgEnum("ingredient_movement_type", ["sale_consume", "purchase_receive", "adjustment", "waste", "transfer"]);
export const alertTypeEnum = pgEnum("alert_type", ["low_stock", "expiring_soon", "expired"]);
export const alertSeverityEnum = pgEnum("alert_severity", ["info", "warning", "critical"]);

// Tenants
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: tenantTypeEnum("type").notNull(),
  status: tenantStatusEnum("status").default("trial"),
  featureFlags: jsonb("feature_flags").$type<string[]>().default([]),
  logo: text("logo"),
  country: text("country"),
  city: text("city"),
  address: text("address"),
  phone: text("phone"),
  currency: text("currency").default("USD"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  language: text("language").default("en"),
  timezone: text("timezone").default("America/Bogota"),
  // Receipt settings
  receiptLogo: text("receipt_logo"),
  receiptLogoSize: integer("receipt_logo_size").default(200),
  receiptShowLogo: boolean("receipt_show_logo").default(true),
  receiptHeaderText: text("receipt_header_text"),
  receiptFooterText: text("receipt_footer_text"),
  receiptShowAddress: boolean("receipt_show_address").default(true),
  receiptShowPhone: boolean("receipt_show_phone").default(true),
  receiptTaxId: text("receipt_tax_id"),
  receiptFontSize: integer("receipt_font_size").default(12),
  receiptFontFamily: text("receipt_font_family").default("monospace"),
  // Cash drawer settings
  openCashDrawer: boolean("open_cash_drawer").default(false),
  // Coupon settings
  couponEnabled: boolean("coupon_enabled").default(false),
  couponText: text("coupon_text"),
  // Inventory settings
  allowZeroStockSales: boolean("allow_zero_stock_sales").default(true),
  onboardingComplete: boolean("onboarding_complete").default(false),
  trialEndsAt: timestamp("trial_ends_at"),
  suspendedAt: timestamp("suspended_at"),
  suspendedReason: text("suspended_reason"),
  subscriptionTier: subscriptionTierEnum("subscription_tier").default("basic"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Email notification preference types
export type EmailPreferences = {
  // Inventory alerts
  lowStockAlerts: boolean;
  expiringProductAlerts: boolean;
  // Sales notifications
  newSaleNotification: boolean;
  dailySalesReport: boolean;
  weeklyReport: boolean;
  // Customer notifications
  newCustomerNotification: boolean;
  // Order notifications (for customer-facing)
  orderNotifications: boolean;
  // Financial alerts
  refundAlerts: boolean;
  highValueSaleAlerts: boolean;
  // System
  systemAlerts: boolean;
};

// Users
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  username: text("username").notNull(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  role: userRoleEnum("role").notNull().default("cashier"),
  pin: text("pin"),
  isActive: boolean("is_active").default(true),
  isInternal: boolean("is_internal").default(false),
  emailPreferences: jsonb("email_preferences").$type<EmailPreferences>().default({
    lowStockAlerts: true,
    expiringProductAlerts: true,
    newSaleNotification: false,
    dailySalesReport: false,
    weeklyReport: false,
    newCustomerNotification: false,
    orderNotifications: true,
    refundAlerts: true,
    highValueSaleAlerts: false,
    systemAlerts: true,
  }),
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
    openCashDrawer?: boolean;
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
  lowStockThreshold: integer("low_stock_threshold").default(10),
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

// Customers
export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  idType: customerIdTypeEnum("id_type"),
  idNumber: text("id_number"),
  notes: text("notes"),
  // Default discount percentage for this customer (0-100)
  defaultDiscount: decimal("default_discount", { precision: 5, scale: 2 }).default("0"),
  // Loyalty program fields
  loyaltyPoints: integer("loyalty_points").default(0),
  totalSpent: decimal("total_spent", { precision: 12, scale: 2 }).default("0"),
  orderCount: integer("order_count").default(0),
  lastPurchaseAt: timestamp("last_purchase_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Loyalty points transaction types
export const loyaltyTransactionTypeEnum = pgEnum("loyalty_transaction_type", ["earned", "redeemed", "expired", "adjustment"]);

// Loyalty points history
export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  customerId: varchar("customer_id").references(() => customers.id).notNull(),
  orderId: varchar("order_id"),
  type: loyaltyTransactionTypeEnum("type").notNull(),
  points: integer("points").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Loyalty rewards catalog
export const loyaltyRewards = pgTable("loyalty_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  pointsCost: integer("points_cost").notNull(),
  rewardType: text("reward_type").default("discount"), // discount, product
  discountType: text("discount_type").default("fixed"), // fixed, percentage (only for discount rewards)
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }),
  productId: varchar("product_id").references(() => products.id), // for product rewards
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tax Rates
export const taxRates = pgTable("tax_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  name: text("name").notNull(),
  rate: decimal("rate", { precision: 5, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaxRateSchema = createInsertSchema(taxRates).omit({ id: true, createdAt: true });
export type InsertTaxRate = z.infer<typeof insertTaxRateSchema>;
export type TaxRate = typeof taxRates.$inferSelect;

// Orders
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  registerId: varchar("register_id").references(() => registers.id),
  userId: varchar("user_id").references(() => users.id).notNull(),
  salesRepId: varchar("sales_rep_id").references(() => users.id),
  customerId: varchar("customer_id").references(() => customers.id),
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

// Returns / Refunds
export const returnStatusEnum = pgEnum("return_status", ["pending", "approved", "completed", "rejected"]);
export const returnReasonEnum = pgEnum("return_reason", ["defective", "wrong_item", "customer_changed_mind", "damaged", "expired", "other"]);

export const returns = pgTable("returns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  returnNumber: integer("return_number").notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  customerId: varchar("customer_id").references(() => customers.id),
  status: returnStatusEnum("status").default("completed"),
  reason: returnReasonEnum("reason").default("customer_changed_mind"),
  reasonNotes: text("reason_notes"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  refundMethod: paymentMethodEnum("refund_method").notNull(),
  restockItems: boolean("restock_items").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const returnItems = pgTable("return_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  returnId: varchar("return_id").references(() => returns.id).notNull(),
  orderItemId: varchar("order_item_id").references(() => orderItems.id).notNull(),
  productId: varchar("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0"),
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

// ============================================
// PURCHASING / RESTOCKING TABLES
// ============================================

// Suppliers/Providers
export const suppliers = pgTable("suppliers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  taxId: text("tax_id"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Purchase Orders
export const purchaseOrders = pgTable("purchase_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  supplierId: varchar("supplier_id").references(() => suppliers.id),
  orderNumber: text("order_number").notNull(),
  status: purchaseOrderStatusEnum("status").default("draft").notNull(),
  expectedDate: timestamp("expected_date"),
  receivedDate: timestamp("received_date"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 12, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Purchase Order Items (supports both products and ingredients)
export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  purchaseOrderId: varchar("purchase_order_id").references(() => purchaseOrders.id).notNull(),
  productId: varchar("product_id").references(() => products.id),
  ingredientId: varchar("ingredient_id").references(() => ingredients.id),
  quantity: integer("quantity").notNull(),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }).notNull(),
  receivedQuantity: integer("received_quantity").default(0),
  expirationDate: timestamp("expiration_date"),
  lotCode: text("lot_code"),
  notes: text("notes"),
});

// Supplier-Ingredient Linking (preferred suppliers for ingredients)
export const supplierIngredients = pgTable("supplier_ingredients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  supplierId: varchar("supplier_id").references(() => suppliers.id).notNull(),
  ingredientId: varchar("ingredient_id").references(() => ingredients.id).notNull(),
  supplierSku: text("supplier_sku"),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }),
  leadTimeDays: integer("lead_time_days"),
  minOrderQty: decimal("min_order_qty", { precision: 10, scale: 3 }),
  isPrimary: boolean("is_primary").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Supplier-Product Linking (preferred suppliers for products)
export const supplierProducts = pgTable("supplier_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  supplierId: varchar("supplier_id").references(() => suppliers.id).notNull(),
  productId: varchar("product_id").references(() => products.id).notNull(),
  supplierSku: text("supplier_sku"),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }),
  leadTimeDays: integer("lead_time_days"),
  minOrderQty: integer("min_order_qty"),
  isPrimary: boolean("is_primary").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================
// MANAGEMENT PORTAL TABLES
// ============================================

// Portal Roles (for RBAC)
export const portalRoles = pgTable("portal_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: portalRoleTypeEnum("type").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Portal Permissions
export const portalPermissions = pgTable("portal_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  description: text("description"),
});

// Role-Permission mapping
export const rolePermissions = pgTable("role_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: varchar("role_id").references(() => portalRoles.id).notNull(),
  permissionId: varchar("permission_id").references(() => portalPermissions.id).notNull(),
});

// User-Portal Role mapping
export const userPortalRoles = pgTable("user_portal_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  roleId: varchar("role_id").references(() => portalRoles.id).notNull(),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  grantedBy: varchar("granted_by").references(() => users.id),
  grantedAt: timestamp("granted_at").defaultNow(),
});

// Locations (multi-store support)
export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  country: text("country").default("CO"),
  timezone: text("timezone").default("America/Bogota"),
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Warehouses
export const warehouses = pgTable("warehouses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  locationId: varchar("location_id").references(() => locations.id),
  name: text("name").notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Devices (registered devices per register)
export const devices = pgTable("devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  registerId: varchar("register_id").references(() => registers.id).notNull(),
  deviceType: text("device_type"),
  deviceId: text("device_id"),
  appVersion: text("app_version"),
  osVersion: text("os_version"),
  lastSeenAt: timestamp("last_seen_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Impersonation Sessions (for support mode)
export const impersonationSessions = pgTable("impersonation_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").references(() => users.id).notNull(),
  targetTenantId: varchar("target_tenant_id").references(() => tenants.id).notNull(),
  targetUserId: varchar("target_user_id").references(() => users.id),
  mode: impersonationModeEnum("mode").default("read_only"),
  reason: text("reason"),
  ticketId: varchar("ticket_id"),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  actionsTaken: jsonb("actions_taken").$type<{ action: string; timestamp: string; details?: string }[]>().default([]),
});

// Support Tickets
export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  assignedTo: varchar("assigned_to").references(() => users.id),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  status: ticketStatusEnum("status").default("open"),
  priority: ticketPriorityEnum("priority").default("medium"),
  category: text("category"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// Ticket Comments
export const ticketComments = pgTable("ticket_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").references(() => supportTickets.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  isInternal: boolean("is_internal").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Ticket Attachments
export const ticketAttachments = pgTable("ticket_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").references(() => supportTickets.id).notNull(),
  commentId: varchar("comment_id").references(() => ticketComments.id),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Subscription Plans
export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  priceMonthly: decimal("price_monthly", { precision: 10, scale: 2 }).notNull(),
  priceYearly: decimal("price_yearly", { precision: 10, scale: 2 }),
  currency: text("currency").default("USD"),
  maxLocations: integer("max_locations").default(1),
  maxRegisters: integer("max_registers").default(2),
  maxUsers: integer("max_users").default(5),
  features: jsonb("features").$type<string[]>().default([]),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Subscriptions
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  planId: varchar("plan_id").references(() => subscriptionPlans.id).notNull(),
  status: subscriptionStatusEnum("status").default("trial"),
  billingPeriod: text("billing_period").default("monthly"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  trialEndsAt: timestamp("trial_ends_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Invoices (SaaS billing)
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriptionId: varchar("subscription_id").references(() => subscriptions.id),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),
  status: text("status").default("pending"),
  issuedAt: timestamp("issued_at").defaultNow(),
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  pdfUrl: text("pdf_url"),
});

// SaaS Payments
export const saasPayments = pgTable("saas_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").references(() => invoices.id),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method"),
  providerRef: text("provider_ref"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Electronic Documents (DIAN/Matias)
export const electronicDocuments = pgTable("electronic_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  orderId: varchar("order_id").references(() => orders.id),
  documentType: text("document_type").notNull(),
  trackId: text("track_id"),
  cufe: text("cufe"),
  status: documentStatusEnum("status").default("pending"),
  requestPayload: jsonb("request_payload"),
  responsePayload: jsonb("response_payload"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  lastRetryAt: timestamp("last_retry_at"),
  reviewed: boolean("reviewed").default(false),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  pdfUrl: text("pdf_url"),
  xmlUrl: text("xml_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Document Status History
export const documentStatusHistory = pgTable("document_status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").references(() => electronicDocuments.id).notNull(),
  status: documentStatusEnum("status").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Billing Provider Config (encrypted credentials)
export const billingProviderConfig = pgTable("billing_provider_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  provider: text("provider").notNull(),
  apiUrl: text("api_url"),
  clientIdEncrypted: text("client_id_encrypted"),
  clientSecretEncrypted: text("client_secret_encrypted"),
  accessTokenCached: text("access_token_cached"),
  tokenExpiresAt: timestamp("token_expires_at"),
  isEnabled: boolean("is_enabled").default(false),
  lastSuccessfulEmissionAt: timestamp("last_successful_emission_at"),
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

// ============================================================
// INGREDIENT INVENTORY (Pro feature for restaurants)
// ============================================================

// Ingredients - stockable items used in recipes
export const ingredients = pgTable("ingredients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  name: text("name").notNull(),
  sku: text("sku"),
  barcode: text("barcode"),
  uomBase: ingredientUomEnum("uom_base").notNull().default("g"),
  reorderPointBase: decimal("reorder_point_base", { precision: 10, scale: 3 }).default("0"),
  reorderQtyBase: decimal("reorder_qty_base", { precision: 10, scale: 3 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
});

// Ingredient Lots - batches with expiration tracking
export const ingredientLots = pgTable("ingredient_lots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  ingredientId: varchar("ingredient_id").references(() => ingredients.id).notNull(),
  locationId: varchar("location_id").references(() => registers.id),
  receivedAt: timestamp("received_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  qtyReceivedBase: decimal("qty_received_base", { precision: 10, scale: 3 }).notNull(),
  qtyRemainingBase: decimal("qty_remaining_base", { precision: 10, scale: 3 }).notNull(),
  costPerBase: decimal("cost_per_base", { precision: 10, scale: 4 }),
  supplierId: varchar("supplier_id").references(() => suppliers.id),
  lotCode: text("lot_code"),
  status: lotStatusEnum("status").default("open"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Recipes - links menu items to ingredients (BOM)
export const recipes = pgTable("recipes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  productId: varchar("product_id").references(() => products.id).notNull(),
  yieldQty: decimal("yield_qty", { precision: 10, scale: 2 }).default("1"),
  yieldUom: text("yield_uom").default("serving"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
});

// Recipe Items - ingredient requirements per recipe
export const recipeItems = pgTable("recipe_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  recipeId: varchar("recipe_id").references(() => recipes.id).notNull(),
  ingredientId: varchar("ingredient_id").references(() => ingredients.id).notNull(),
  qtyRequiredBase: decimal("qty_required_base", { precision: 10, scale: 3 }).notNull(),
  wastePct: decimal("waste_pct", { precision: 5, scale: 2 }).default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Ingredient Stock Movements - ledger for lot-level tracking
export const ingredientMovements = pgTable("ingredient_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  ingredientId: varchar("ingredient_id").references(() => ingredients.id).notNull(),
  lotId: varchar("lot_id").references(() => ingredientLots.id),
  locationId: varchar("location_id").references(() => registers.id),
  movementType: ingredientMovementTypeEnum("movement_type").notNull(),
  qtyDeltaBase: decimal("qty_delta_base", { precision: 10, scale: 3 }).notNull(),
  sourceType: text("source_type"),
  sourceId: varchar("source_id"),
  notes: text("notes"),
  occurredAt: timestamp("occurred_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
});

// Sale Ingredient Consumptions - traceability for sales
export const saleIngredientConsumptions = pgTable("sale_ingredient_consumptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  orderItemId: varchar("order_item_id").references(() => orderItems.id).notNull(),
  ingredientId: varchar("ingredient_id").references(() => ingredients.id).notNull(),
  lotId: varchar("lot_id").references(() => ingredientLots.id),
  qtyConsumedBase: decimal("qty_consumed_base", { precision: 10, scale: 3 }).notNull(),
  occurredAt: timestamp("occurred_at").defaultNow(),
});

// Ingredient Alerts - low stock, expiring soon, expired
export const ingredientAlerts = pgTable("ingredient_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  alertType: alertTypeEnum("alert_type").notNull(),
  severity: alertSeverityEnum("severity").default("warning"),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  message: text("message"),
  isAcknowledged: boolean("is_acknowledged").default(false),
  acknowledgedBy: varchar("acknowledged_by").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at"),
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
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true, loyaltyPoints: true, totalSpent: true, orderCount: true, lastPurchaseAt: true });
export const insertLoyaltyTransactionSchema = createInsertSchema(loyaltyTransactions).omit({ id: true, createdAt: true });
export const insertLoyaltyRewardSchema = createInsertSchema(loyaltyRewards).omit({ id: true, createdAt: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, completedAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertKitchenTicketSchema = createInsertSchema(kitchenTickets).omit({ id: true, createdAt: true, startedAt: true, completedAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export const insertReturnSchema = createInsertSchema(returns).omit({ id: true, createdAt: true });
export const insertReturnItemSchema = createInsertSchema(returnItems).omit({ id: true });
export const insertStockMovementSchema = createInsertSchema(stockMovements).omit({ id: true, createdAt: true });
export const insertSupplierSchema = createInsertSchema(suppliers).omit({ id: true, createdAt: true });
export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItems).omit({ id: true });
export const insertSupplierIngredientSchema = createInsertSchema(supplierIngredients).omit({ id: true, createdAt: true });
export const insertSupplierProductSchema = createInsertSchema(supplierProducts).omit({ id: true, createdAt: true });
export const insertModifierGroupSchema = createInsertSchema(modifierGroups).omit({ id: true });
export const insertModifierSchema = createInsertSchema(modifiers).omit({ id: true });
export const insertRegisterSessionSchema = createInsertSchema(registerSessions).omit({ id: true, openedAt: true, closedAt: true });

// Portal Insert Schemas
export const insertPortalRoleSchema = createInsertSchema(portalRoles).omit({ id: true, createdAt: true });
export const insertPortalPermissionSchema = createInsertSchema(portalPermissions).omit({ id: true });
export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({ id: true });
export const insertUserPortalRoleSchema = createInsertSchema(userPortalRoles).omit({ id: true, grantedAt: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true, createdAt: true });
export const insertWarehouseSchema = createInsertSchema(warehouses).omit({ id: true, createdAt: true });
export const insertDeviceSchema = createInsertSchema(devices).omit({ id: true, createdAt: true });
export const insertImpersonationSessionSchema = createInsertSchema(impersonationSessions).omit({ id: true, startedAt: true });
export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({ id: true, createdAt: true, updatedAt: true, resolvedAt: true });
export const insertTicketCommentSchema = createInsertSchema(ticketComments).omit({ id: true, createdAt: true });
export const insertTicketAttachmentSchema = createInsertSchema(ticketAttachments).omit({ id: true, createdAt: true });
export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({ id: true, createdAt: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, issuedAt: true });
export const insertSaasPaymentSchema = createInsertSchema(saasPayments).omit({ id: true, createdAt: true });
export const insertElectronicDocumentSchema = createInsertSchema(electronicDocuments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDocumentStatusHistorySchema = createInsertSchema(documentStatusHistory).omit({ id: true, createdAt: true });
export const insertBillingProviderConfigSchema = createInsertSchema(billingProviderConfig).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });

// Ingredient Inventory Schemas (Pro feature)
export const insertIngredientSchema = createInsertSchema(ingredients).omit({ id: true, createdAt: true, updatedAt: true });
export const insertIngredientLotSchema = createInsertSchema(ingredientLots).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRecipeSchema = createInsertSchema(recipes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRecipeItemSchema = createInsertSchema(recipeItems).omit({ id: true, createdAt: true });
export const insertIngredientMovementSchema = createInsertSchema(ingredientMovements).omit({ id: true, occurredAt: true });
export const insertSaleIngredientConsumptionSchema = createInsertSchema(saleIngredientConsumptions).omit({ id: true, occurredAt: true });
export const insertIngredientAlertSchema = createInsertSchema(ingredientAlerts).omit({ id: true, createdAt: true });

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
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type LoyaltyTransaction = typeof loyaltyTransactions.$inferSelect;
export type InsertLoyaltyTransaction = z.infer<typeof insertLoyaltyTransactionSchema>;
export type LoyaltyReward = typeof loyaltyRewards.$inferSelect;
export type InsertLoyaltyReward = z.infer<typeof insertLoyaltyRewardSchema>;
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
export type Return = typeof returns.$inferSelect;
export type InsertReturn = z.infer<typeof insertReturnSchema>;
export type ReturnItem = typeof returnItems.$inferSelect;
export type InsertReturnItem = z.infer<typeof insertReturnItemSchema>;
export type StockMovement = typeof stockMovements.$inferSelect;
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = z.infer<typeof insertPurchaseOrderItemSchema>;
export type SupplierIngredient = typeof supplierIngredients.$inferSelect;
export type InsertSupplierIngredient = z.infer<typeof insertSupplierIngredientSchema>;
export type SupplierProduct = typeof supplierProducts.$inferSelect;
export type InsertSupplierProduct = z.infer<typeof insertSupplierProductSchema>;

// Portal Types
export type PortalRole = typeof portalRoles.$inferSelect;
export type InsertPortalRole = z.infer<typeof insertPortalRoleSchema>;
export type PortalPermission = typeof portalPermissions.$inferSelect;
export type InsertPortalPermission = z.infer<typeof insertPortalPermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type UserPortalRole = typeof userPortalRoles.$inferSelect;
export type InsertUserPortalRole = z.infer<typeof insertUserPortalRoleSchema>;
export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Warehouse = typeof warehouses.$inferSelect;
export type InsertWarehouse = z.infer<typeof insertWarehouseSchema>;
export type Device = typeof devices.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type ImpersonationSession = typeof impersonationSessions.$inferSelect;
export type InsertImpersonationSession = z.infer<typeof insertImpersonationSessionSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type TicketComment = typeof ticketComments.$inferSelect;
export type InsertTicketComment = z.infer<typeof insertTicketCommentSchema>;
export type TicketAttachment = typeof ticketAttachments.$inferSelect;
export type InsertTicketAttachment = z.infer<typeof insertTicketAttachmentSchema>;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type SaasPayment = typeof saasPayments.$inferSelect;
export type InsertSaasPayment = z.infer<typeof insertSaasPaymentSchema>;
export type ElectronicDocument = typeof electronicDocuments.$inferSelect;
export type InsertElectronicDocument = z.infer<typeof insertElectronicDocumentSchema>;
export type DocumentStatusHistory = typeof documentStatusHistory.$inferSelect;
export type InsertDocumentStatusHistory = z.infer<typeof insertDocumentStatusHistorySchema>;
export type BillingProviderConfig = typeof billingProviderConfig.$inferSelect;
export type InsertBillingProviderConfig = z.infer<typeof insertBillingProviderConfigSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// Ingredient Inventory Types (Pro feature)
export type Ingredient = typeof ingredients.$inferSelect;
export type InsertIngredient = z.infer<typeof insertIngredientSchema>;
export type IngredientLot = typeof ingredientLots.$inferSelect;
export type InsertIngredientLot = z.infer<typeof insertIngredientLotSchema>;
export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type RecipeItem = typeof recipeItems.$inferSelect;
export type InsertRecipeItem = z.infer<typeof insertRecipeItemSchema>;
export type IngredientMovement = typeof ingredientMovements.$inferSelect;
export type InsertIngredientMovement = z.infer<typeof insertIngredientMovementSchema>;
export type SaleIngredientConsumption = typeof saleIngredientConsumptions.$inferSelect;
export type InsertSaleIngredientConsumption = z.infer<typeof insertSaleIngredientConsumptionSchema>;
export type IngredientAlert = typeof ingredientAlerts.$inferSelect;
export type InsertIngredientAlert = z.infer<typeof insertIngredientAlertSchema>;

// Pro feature flag constant
export const PRO_FEATURES = {
  RESTAURANT_BOM: "restaurant_bom",
} as const;

// System Settings (SMTP, etc.) - Global settings for the entire system
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({ id: true, updatedAt: true });
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;

// Password Reset Tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({ id: true, createdAt: true, usedAt: true });
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;

// Email Templates
export const emailTemplateTypeEnum = pgEnum("email_template_type", [
  "password_reset",
  "order_confirmation",
  "payment_received",
  "low_stock_alert",
  "welcome",
  "account_suspended"
]);

export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: emailTemplateTypeEnum("type").notNull().unique(),
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull(),
  textBody: text("text_body"),
  isActive: boolean("is_active").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true, updatedAt: true });
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;

// Email Logs (for tracking sent emails)
export const emailLogs = pgTable("email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  templateType: text("template_type").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("sent"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").defaultNow(),
});

export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({ id: true, sentAt: true });
export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;

// In-App Notifications
export const notificationTypeEnum = pgEnum("notification_type", [
  "info",
  "warning",
  "error",
  "success",
  "low_stock",
  "order_status",
  "payment",
  "system",
  "expiring_ingredient"
]);

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  userId: varchar("user_id").references(() => users.id),
  type: notificationTypeEnum("type").notNull().default("info"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  data: jsonb("data"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  readAt: timestamp("read_at"),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true, readAt: true });
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

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
