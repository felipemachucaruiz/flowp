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
export const orderChannelEnum = pgEnum("order_channel", ["pos", "shopify", "manual"]);
export const customerIdTypeEnum = pgEnum("customer_id_type", ["pasaporte", "cedula_ciudadania", "cedula_extranjeria", "nit", "tarjeta_identidad", "registro_civil", "consumidor_final"]);

// Purchase order enums
export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", ["draft", "sent", "partial", "received", "cancelled"]);
export const supplierDocTypeEnum = pgEnum("supplier_doc_type", ["nit", "cc", "other"]);
export const paymentTermsTypeEnum = pgEnum("payment_terms_type", ["cash", "credit"]);

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
  supportId: varchar("support_id").unique(),
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
  // Store hours settings
  storeOpenTime: text("store_open_time"),
  storeCloseTime: text("store_close_time"),
  storeHoursEnabled: boolean("store_hours_enabled").default(false),
  // Auto-lock / standby settings
  autoLockEnabled: boolean("auto_lock_enabled").default(false),
  autoLockTimeout: integer("auto_lock_timeout").default(5),
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
  warehouseId: varchar("warehouse_id").references(() => warehouses.id),
  printerConfig: jsonb("printer_config").$type<{
    printerName?: string;
    paperSize?: "58mm" | "80mm";
    autoPrint?: boolean;
    openCashDrawer?: boolean;
  }>(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Register Session Status
export const registerSessionStatusEnum = pgEnum("register_session_status", ["open", "closed"]);
export const cashMovementTypeEnum = pgEnum("cash_movement_type", ["cash_in", "cash_out"]);

// Register Sessions (Cash Drawer)
export const registerSessions = pgTable("register_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  registerId: varchar("register_id").references(() => registers.id).notNull(),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  closedByUserId: varchar("closed_by_user_id").references(() => users.id),
  status: registerSessionStatusEnum("status").default("open").notNull(),
  openingCash: decimal("opening_cash", { precision: 10, scale: 2 }).notNull(),
  closingCash: decimal("closing_cash", { precision: 10, scale: 2 }),
  expectedCash: decimal("expected_cash", { precision: 10, scale: 2 }),
  expectedCard: decimal("expected_card", { precision: 10, scale: 2 }),
  countedCash: decimal("counted_cash", { precision: 10, scale: 2 }),
  countedCard: decimal("counted_card", { precision: 10, scale: 2 }),
  cashVariance: decimal("cash_variance", { precision: 10, scale: 2 }),
  cardVariance: decimal("card_variance", { precision: 10, scale: 2 }),
  totalSales: decimal("total_sales", { precision: 10, scale: 2 }),
  totalOrders: integer("total_orders").default(0),
  totalReturns: decimal("total_returns", { precision: 10, scale: 2 }).default("0"),
  cashMovementsIn: decimal("cash_movements_in", { precision: 10, scale: 2 }).default("0"),
  cashMovementsOut: decimal("cash_movements_out", { precision: 10, scale: 2 }).default("0"),
  denominationCounts: jsonb("denomination_counts").$type<Record<string, number>>(),
  notes: text("notes"),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
});

// Cash Movements (deposits/withdrawals during session)
export const cashMovements = pgTable("cash_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => registerSessions.id).notNull(),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: cashMovementTypeEnum("type").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
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
  phoneCountryCode: varchar("phone_country_code", { length: 5 }).default("57"),
  address: text("address"),
  countryCode: varchar("country_code", { length: 3 }).default("45"),
  municipalityId: integer("municipality_id").default(1),
  organizationTypeId: integer("organization_type_id").default(2),
  taxRegimeId: integer("tax_regime_id").default(2),
  taxLiabilityId: integer("tax_liability_id").default(117),
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
  registerSessionId: varchar("register_session_id").references(() => registerSessions.id),
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
  // DIAN/MATIAS E-Billing Data
  cufe: text("cufe"),  // Código Único de Factura Electrónica
  qrCode: text("qr_code"),  // QR code for receipt printing
  trackId: text("track_id"),  // MATIAS tracking ID
  prefix: text("prefix"),  // DIAN resolution prefix (e.g., "SETT")
  documentNumber: integer("document_number"),  // DIAN sequential number
  // Returns tracking
  hasReturns: boolean("has_returns").default(false),  // True if order has any returns
  // Sales channel tracking
  channel: orderChannelEnum("channel").default("pos"),  // Order source: pos, shopify, manual
  externalOrderId: varchar("external_order_id"),  // External system order ID (e.g., Shopify order ID)
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

// DIAN Correction Concepts for Credit Notes
export const correctionConceptEnum = pgEnum("correction_concept", ["devolucion", "anulacion", "descuento", "ajuste_precio", "otros"]);

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
  // DIAN Credit Note fields
  cude: text("cude"),  // Código Único de Documento Electrónico (for credit notes)
  qrCode: text("qr_code"),
  trackId: text("track_id"),
  correctionConcept: correctionConceptEnum("correction_concept").default("devolucion"),
  originalCufe: text("original_cufe"),  // CUFE of the original invoice
  originalNumber: text("original_number"),  // Number of the original invoice
  originalDate: text("original_date"),  // Date of the original invoice
  creditNoteStatus: text("credit_note_status").default("pending"),  // pending, sent, accepted, rejected
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
  warehouseId: varchar("warehouse_id").references(() => warehouses.id),
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
  documentType: supplierDocTypeEnum("document_type"),
  identification: text("identification"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  taxId: text("tax_id"),
  paymentTermsType: paymentTermsTypeEnum("payment_terms_type").default("cash"),
  paymentTermsDays: integer("payment_terms_days").default(0),
  currency: text("currency"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Purchase Orders
export const purchaseOrders = pgTable("purchase_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  supplierId: varchar("supplier_id").references(() => suppliers.id),
  destinationWarehouseId: varchar("destination_warehouse_id").references(() => warehouses.id),
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

// Purchase Receipts (goods received notes)
export const purchaseReceipts = pgTable("purchase_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  purchaseOrderId: varchar("purchase_order_id").references(() => purchaseOrders.id).notNull(),
  receiptNumber: text("receipt_number").notNull(),
  warehouseId: varchar("warehouse_id").references(() => warehouses.id),
  receivedBy: varchar("received_by").references(() => users.id),
  notes: text("notes"),
  receivedAt: timestamp("received_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Purchase Receipt Items
export const purchaseReceiptItems = pgTable("purchase_receipt_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  receiptId: varchar("receipt_id").references(() => purchaseReceipts.id).notNull(),
  purchaseOrderItemId: varchar("purchase_order_item_id").references(() => purchaseOrderItems.id),
  productId: varchar("product_id").references(() => products.id),
  ingredientId: varchar("ingredient_id").references(() => ingredients.id),
  quantityReceived: integer("quantity_received").notNull(),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }).notNull(),
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
  ticketNumber: integer("ticket_number").notNull(),
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
export const SUBSCRIPTION_FEATURES = {
  USER_MANAGEMENT: "user_management",
  INVENTORY_ADVANCED: "inventory_advanced",
  REPORTS_DETAILED: "reports_detailed",
  LABEL_DESIGNER: "label_designer",
  MULTI_LOCATION: "multi_location",
  REPORTS_MANAGEMENT: "reports_management",
  ECOMMERCE_INTEGRATIONS: "ecommerce_integrations",
  SECURITY_AUDIT: "security_audit",
  KDS_ADVANCED: "kds_advanced",
  FLOOR_MANAGEMENT: "floor_management",
  MODIFIERS_ADVANCED: "modifiers_advanced",
  INGREDIENTS_RECIPES: "ingredients_recipes",
  TIPS_ANALYTICS: "tips_analytics",
  REPORTS_EXPORT: "reports_export",
  WHATSAPP_CHAT: "whatsapp_chat",
} as const;

export type SubscriptionFeature = typeof SUBSCRIPTION_FEATURES[keyof typeof SUBSCRIPTION_FEATURES];

export const RETAIL_TIER_FEATURES: Record<string, SubscriptionFeature[]> = {
  basic: [],
  pro: [
    SUBSCRIPTION_FEATURES.USER_MANAGEMENT,
    SUBSCRIPTION_FEATURES.INVENTORY_ADVANCED,
    SUBSCRIPTION_FEATURES.REPORTS_DETAILED,
    SUBSCRIPTION_FEATURES.LABEL_DESIGNER,
    SUBSCRIPTION_FEATURES.WHATSAPP_CHAT,
  ],
  enterprise: [
    SUBSCRIPTION_FEATURES.USER_MANAGEMENT,
    SUBSCRIPTION_FEATURES.INVENTORY_ADVANCED,
    SUBSCRIPTION_FEATURES.REPORTS_DETAILED,
    SUBSCRIPTION_FEATURES.LABEL_DESIGNER,
    SUBSCRIPTION_FEATURES.MULTI_LOCATION,
    SUBSCRIPTION_FEATURES.REPORTS_MANAGEMENT,
    SUBSCRIPTION_FEATURES.ECOMMERCE_INTEGRATIONS,
    SUBSCRIPTION_FEATURES.SECURITY_AUDIT,
    SUBSCRIPTION_FEATURES.REPORTS_EXPORT,
    SUBSCRIPTION_FEATURES.WHATSAPP_CHAT,
  ],
};

export const RESTAURANT_TIER_FEATURES: Record<string, SubscriptionFeature[]> = {
  basic: [
    SUBSCRIPTION_FEATURES.LABEL_DESIGNER,
  ],
  pro: [
    SUBSCRIPTION_FEATURES.LABEL_DESIGNER,
    SUBSCRIPTION_FEATURES.USER_MANAGEMENT,
    SUBSCRIPTION_FEATURES.REPORTS_DETAILED,
    SUBSCRIPTION_FEATURES.KDS_ADVANCED,
    SUBSCRIPTION_FEATURES.INGREDIENTS_RECIPES,
    SUBSCRIPTION_FEATURES.MODIFIERS_ADVANCED,
    SUBSCRIPTION_FEATURES.INVENTORY_ADVANCED,
    SUBSCRIPTION_FEATURES.WHATSAPP_CHAT,
  ],
  enterprise: [
    SUBSCRIPTION_FEATURES.LABEL_DESIGNER,
    SUBSCRIPTION_FEATURES.USER_MANAGEMENT,
    SUBSCRIPTION_FEATURES.REPORTS_DETAILED,
    SUBSCRIPTION_FEATURES.KDS_ADVANCED,
    SUBSCRIPTION_FEATURES.INGREDIENTS_RECIPES,
    SUBSCRIPTION_FEATURES.MODIFIERS_ADVANCED,
    SUBSCRIPTION_FEATURES.INVENTORY_ADVANCED,
    SUBSCRIPTION_FEATURES.TIPS_ANALYTICS,
    SUBSCRIPTION_FEATURES.MULTI_LOCATION,
    SUBSCRIPTION_FEATURES.REPORTS_MANAGEMENT,
    SUBSCRIPTION_FEATURES.ECOMMERCE_INTEGRATIONS,
    SUBSCRIPTION_FEATURES.SECURITY_AUDIT,
    SUBSCRIPTION_FEATURES.REPORTS_EXPORT,
    SUBSCRIPTION_FEATURES.WHATSAPP_CHAT,
  ],
};

export function getTierFeaturesForType(businessType: string, tier: string): SubscriptionFeature[] {
  const mapping = businessType === "restaurant" ? RESTAURANT_TIER_FEATURES : RETAIL_TIER_FEATURES;
  return mapping[tier] || [];
}

export const TIER_FEATURES: Record<string, SubscriptionFeature[]> = RETAIL_TIER_FEATURES;

export interface TierLimits {
  maxRegisters: number;
  maxUsers: number;
  maxLocations: number;
  maxProducts: number;
  maxWarehouses: number;
  maxDianDocuments: number;
  maxTables: number;
  maxRecipes: number;
}

export const RETAIL_TIER_LIMITS: Record<string, TierLimits> = {
  basic: { maxRegisters: 1, maxUsers: 1, maxLocations: 1, maxProducts: 100, maxWarehouses: 1, maxDianDocuments: 200, maxTables: 0, maxRecipes: 0 },
  pro: { maxRegisters: 2, maxUsers: 3, maxLocations: 1, maxProducts: 250, maxWarehouses: 2, maxDianDocuments: 600, maxTables: 0, maxRecipes: 0 },
  enterprise: { maxRegisters: 5, maxUsers: 10, maxLocations: 3, maxProducts: -1, maxWarehouses: 5, maxDianDocuments: 1000, maxTables: 0, maxRecipes: 0 },
};

export const RESTAURANT_TIER_LIMITS: Record<string, TierLimits> = {
  basic: { maxRegisters: 1, maxUsers: 2, maxLocations: 1, maxProducts: 50, maxWarehouses: 1, maxDianDocuments: 500, maxTables: 10, maxRecipes: 0 },
  pro: { maxRegisters: 2, maxUsers: 5, maxLocations: 1, maxProducts: 200, maxWarehouses: 2, maxDianDocuments: 1500, maxTables: 30, maxRecipes: 50 },
  enterprise: { maxRegisters: 5, maxUsers: 15, maxLocations: 3, maxProducts: -1, maxWarehouses: 5, maxDianDocuments: 4000, maxTables: 100, maxRecipes: -1 },
};

export function getTierLimitsForType(businessType: string, tier: string): TierLimits {
  const mapping = businessType === "restaurant" ? RESTAURANT_TIER_LIMITS : RETAIL_TIER_LIMITS;
  const fallback = businessType === "restaurant" ? RESTAURANT_TIER_LIMITS.basic : RETAIL_TIER_LIMITS.basic;
  return mapping[tier] || fallback;
}

export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  tier: text("tier").default("basic"),
  businessType: text("business_type").default("retail"),
  priceMonthly: decimal("price_monthly", { precision: 10, scale: 2 }).notNull(),
  priceYearly: decimal("price_yearly", { precision: 10, scale: 2 }),
  currency: text("currency").default("COP"),
  maxLocations: integer("max_locations").default(1),
  maxRegisters: integer("max_registers").default(1),
  maxUsers: integer("max_users").default(1),
  maxProducts: integer("max_products").default(100),
  maxWarehouses: integer("max_warehouses").default(1),
  maxDianDocuments: integer("max_dian_documents").default(200),
  maxTables: integer("max_tables").default(0),
  maxRecipes: integer("max_recipes").default(0),
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
  mpPreapprovalId: text("mp_preapproval_id"),
  mpPayerEmail: text("mp_payer_email"),
  paymentGateway: text("payment_gateway").default("mercadopago"),
  isComped: boolean("is_comped").default(false),
  compedBy: text("comped_by"),
  compedAt: timestamp("comped_at"),
  compedReason: text("comped_reason"),
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
  invoiceType: text("invoice_type").default("subscription"),
  billingPeriodStart: timestamp("billing_period_start"),
  billingPeriodEnd: timestamp("billing_period_end"),
  mpPreferenceId: text("mp_preference_id"),
  issuedAt: timestamp("issued_at").defaultNow(),
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  pdfUrl: text("pdf_url"),
});

// Invoice Line Items (breakdown of charges)
export const invoiceLineItems = pgTable("invoice_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").references(() => invoices.id).notNull(),
  type: text("type").notNull(),
  refId: text("ref_id"),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;

// SaaS Payments
export const saasPayments = pgTable("saas_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").references(() => invoices.id),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method"),
  providerRef: text("provider_ref"),
  paymentPurpose: text("payment_purpose").default("subscription"),
  mpPaymentId: text("mp_payment_id"),
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
export const insertPurchaseReceiptSchema = createInsertSchema(purchaseReceipts).omit({ id: true, createdAt: true });
export const insertPurchaseReceiptItemSchema = createInsertSchema(purchaseReceiptItems).omit({ id: true });
export const insertModifierGroupSchema = createInsertSchema(modifierGroups).omit({ id: true });
export const insertModifierSchema = createInsertSchema(modifiers).omit({ id: true });
export const insertRegisterSessionSchema = createInsertSchema(registerSessions).omit({ id: true, openedAt: true, closedAt: true });
export const insertCashMovementSchema = createInsertSchema(cashMovements).omit({ id: true, createdAt: true });

// Portal Insert Schemas
export const insertPortalRoleSchema = createInsertSchema(portalRoles).omit({ id: true, createdAt: true });
export const insertPortalPermissionSchema = createInsertSchema(portalPermissions).omit({ id: true });
export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({ id: true });
export const insertUserPortalRoleSchema = createInsertSchema(userPortalRoles).omit({ id: true, grantedAt: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true, createdAt: true });
export const insertWarehouseSchema = createInsertSchema(warehouses).omit({ id: true, createdAt: true });
export const insertDeviceSchema = createInsertSchema(devices).omit({ id: true, createdAt: true });
export const insertImpersonationSessionSchema = createInsertSchema(impersonationSessions).omit({ id: true, startedAt: true });
export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({ id: true, ticketNumber: true, createdAt: true, updatedAt: true, resolvedAt: true });
export const insertTicketCommentSchema = createInsertSchema(ticketComments).omit({ id: true, createdAt: true });
export const insertTicketAttachmentSchema = createInsertSchema(ticketAttachments).omit({ id: true, createdAt: true });
export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({ id: true, createdAt: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, issuedAt: true });
export const insertInvoiceLineItemSchema = createInsertSchema(invoiceLineItems).omit({ id: true, createdAt: true });
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
export type CashMovement = typeof cashMovements.$inferSelect;
export type InsertCashMovement = z.infer<typeof insertCashMovementSchema>;
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
export type PurchaseReceipt = typeof purchaseReceipts.$inferSelect;
export type InsertPurchaseReceipt = z.infer<typeof insertPurchaseReceiptSchema>;
export type PurchaseReceiptItem = typeof purchaseReceiptItems.$inferSelect;
export type InsertPurchaseReceiptItem = z.infer<typeof insertPurchaseReceiptItemSchema>;

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
export type InsertInvoiceLineItem = z.infer<typeof insertInvoiceLineItemSchema>;
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

// ==========================================
// MATIAS / DIAN Electronic Billing Integration
// ==========================================

// Electronic document kind enum
export const electronicDocumentKindEnum = pgEnum("electronic_document_kind", [
  "POS",
  "INVOICE", 
  "POS_CREDIT_NOTE",
  "POS_DEBIT_NOTE",
  "SUPPORT_DOC",
  "SUPPORT_ADJUSTMENT"
]);

// Electronic document source type enum
export const electronicDocumentSourceTypeEnum = pgEnum("electronic_document_source_type", [
  "sale",
  "refund",
  "purchase",
  "adjustment"
]);

// Electronic document status enum (more granular than existing documentStatusEnum)
export const electronicDocumentStatusEnum = pgEnum("electronic_document_status", [
  "PENDING",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "RETRY",
  "FAILED"
]);

// Electronic document file kind enum
export const electronicDocumentFileKindEnum = pgEnum("electronic_document_file_kind", [
  "pdf",
  "attached_zip",
  "qr",
  "xml"
]);

// Tenant MATIAS Integration Configuration
export const tenantIntegrationsMatias = pgTable("tenant_integrations_matias", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id).unique(),
  
  // API Configuration
  baseUrl: text("base_url").notNull(),
  email: text("email").notNull(),
  passwordEncrypted: text("password_encrypted").notNull(),
  accessTokenEncrypted: text("access_token_encrypted"),
  tokenExpiresAt: timestamp("token_expires_at"),
  
  // Default Resolution/Numbering
  defaultResolutionNumber: text("default_resolution_number"),
  defaultPrefix: text("default_prefix"),
  startingNumber: integer("starting_number"),
  endingNumber: integer("ending_number"),
  currentNumber: integer("current_number"),
  defaultResolutionStartDate: text("default_resolution_start_date"),
  defaultResolutionEndDate: text("default_resolution_end_date"),
  
  // Credit Note Resolution/Numbering
  creditNoteResolutionNumber: text("credit_note_resolution_number"),
  creditNotePrefix: text("credit_note_prefix"),
  creditNoteStartingNumber: integer("credit_note_starting_number"),
  creditNoteEndingNumber: integer("credit_note_ending_number"),
  creditNoteCurrentNumber: integer("credit_note_current_number"),
  creditNoteResolutionStartDate: text("credit_note_resolution_start_date"),
  creditNoteResolutionEndDate: text("credit_note_resolution_end_date"),
  
  // Support Document (Documento Soporte) Resolution/Numbering
  supportDocResolutionNumber: text("support_doc_resolution_number"),
  supportDocPrefix: text("support_doc_prefix"),
  supportDocStartingNumber: integer("support_doc_starting_number"),
  supportDocEndingNumber: integer("support_doc_ending_number"),
  supportDocCurrentNumber: integer("support_doc_current_number"),
  supportDocResolutionStartDate: text("support_doc_resolution_start_date"),
  supportDocResolutionEndDate: text("support_doc_resolution_end_date"),
  
  // POS Configuration
  posTerminalNumber: text("pos_terminal_number"),
  posSalesCode: text("pos_sales_code"),
  posCashierType: text("pos_cashier_type"),
  posAddress: text("pos_address"),
  
  // Software/Manufacturer Info (required for DIAN)
  softwareId: text("software_id"),
  softwarePin: text("software_pin"),
  manufacturerName: text("manufacturer_name").default("Flowp"),
  manufacturerNit: text("manufacturer_nit"),
  
  // Feature toggles
  isEnabled: boolean("is_enabled").default(false),
  autoSubmitSales: boolean("auto_submit_sales").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantIntegrationsMatiasSchema = createInsertSchema(tenantIntegrationsMatias).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type TenantIntegrationsMatias = typeof tenantIntegrationsMatias.$inferSelect;
export type InsertTenantIntegrationsMatias = z.infer<typeof insertTenantIntegrationsMatiasSchema>;

// MATIAS Document Queue (separate from existing electronicDocuments to avoid conflicts)
export const matiasDocumentQueue = pgTable("matias_document_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  
  // Document Classification
  kind: electronicDocumentKindEnum("kind").notNull(),
  sourceType: electronicDocumentSourceTypeEnum("source_type").notNull(),
  sourceId: varchar("source_id").notNull(),
  
  // DIAN Numbering
  resolutionNumber: text("resolution_number"),
  prefix: text("prefix"),
  documentNumber: integer("document_number"),
  orderNumber: text("order_number"),
  
  // DIAN Tracking
  trackId: text("track_id"),
  cufe: text("cufe"),
  qrCode: text("qr_code"),
  
  // Processing Status
  status: electronicDocumentStatusEnum("status").notNull().default("PENDING"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  lastErrorMessage: text("last_error_message"),
  lastHttpStatus: integer("last_http_status"),
  
  // Request/Response Storage
  requestJson: jsonb("request_json"),
  responseJson: jsonb("response_json"),
  
  // Reference to original document (for credit/debit notes)
  originalDocumentId: varchar("original_document_id"),
  
  // Timestamps
  submittedAt: timestamp("submitted_at"),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMatiasDocumentQueueSchema = createInsertSchema(matiasDocumentQueue).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  submittedAt: true,
  acceptedAt: true
});
export type MatiasDocumentQueue = typeof matiasDocumentQueue.$inferSelect;
export type InsertMatiasDocumentQueue = z.infer<typeof insertMatiasDocumentQueueSchema>;

// MATIAS Document Files (PDF, XML, QR, etc.)
export const matiasDocumentFiles = pgTable("matias_document_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => matiasDocumentQueue.id),
  
  kind: electronicDocumentFileKindEnum("kind").notNull(),
  url: text("url"),
  path: text("path"),
  base64Data: text("base64_data"),
  mimeType: text("mime_type"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMatiasDocumentFileSchema = createInsertSchema(matiasDocumentFiles).omit({ 
  id: true, 
  createdAt: true 
});
export type MatiasDocumentFile = typeof matiasDocumentFiles.$inferSelect;
export type InsertMatiasDocumentFile = z.infer<typeof insertMatiasDocumentFileSchema>;

// Document Number Sequences (for safe allocation with locking)
export const electronicDocumentSequences = pgTable("electronic_document_sequences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  resolutionNumber: text("resolution_number").notNull(),
  prefix: text("prefix").notNull(),
  currentNumber: integer("current_number").notNull().default(0),
  rangeStart: integer("range_start"),
  rangeEnd: integer("range_end"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertElectronicDocumentSequenceSchema = createInsertSchema(electronicDocumentSequences).omit({ 
  id: true, 
  updatedAt: true 
});
export type ElectronicDocumentSequence = typeof electronicDocumentSequences.$inferSelect;
export type InsertElectronicDocumentSequence = z.infer<typeof insertElectronicDocumentSequenceSchema>;

// ============================================================
// INTERNAL ADMIN CONSOLE (E-Billing Management)
// ============================================================

// Internal Admin Enums
export const internalUserRoleEnum = pgEnum("internal_user_role", ["superadmin", "supportagent", "billingops"]);
export const internalAuditActionEnum = pgEnum("internal_audit_action", [
  "TENANT_UPDATE", "INTEGRATION_TEST", "DOC_RETRY", "PACKAGE_ASSIGN", 
  "PACKAGE_CHANGE", "CREDIT_ADJUST", "TENANT_SUSPEND", "TENANT_UNSUSPEND"
]);
export const billingCycleEnum = pgEnum("billing_cycle", ["monthly", "annual"]);
export const overagePolicyEnum = pgEnum("overage_policy", ["block", "allow_and_charge", "allow_and_mark_overage"]);
export const ebillingAlertTypeEnum = pgEnum("ebilling_alert_type", [
  "THRESHOLD_70", "THRESHOLD_90", "LIMIT_REACHED", "AUTH_FAIL", "HIGH_REJECT_RATE"
]);
export const integrationStatusEnum = pgEnum("integration_status", ["configured", "needs_attention", "disabled"]);

// Internal Users (Flowp admin staff)
export const internalUsers = pgTable("internal_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: internalUserRoleEnum("role").notNull().default("supportagent"),
  passwordHash: text("password_hash"),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInternalUserSchema = createInsertSchema(internalUsers).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  lastLoginAt: true 
});
export type InternalUser = typeof internalUsers.$inferSelect;
export type InsertInternalUser = z.infer<typeof insertInternalUserSchema>;

// Platform Configuration (global settings)
export const platformConfig = pgTable("platform_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value"),
  encryptedValue: text("encrypted_value"),
  description: text("description"),
  updatedBy: varchar("updated_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PlatformConfig = typeof platformConfig.$inferSelect;

// Internal Audit Logs (for admin actions)
export const internalAuditLogs = pgTable("internal_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorInternalUserId: varchar("actor_internal_user_id").references(() => internalUsers.id),
  actionType: internalAuditActionEnum("action_type").notNull(),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  entityType: text("entity_type"),
  entityId: varchar("entity_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInternalAuditLogSchema = createInsertSchema(internalAuditLogs).omit({ 
  id: true, 
  createdAt: true 
});
export type InternalAuditLog = typeof internalAuditLogs.$inferSelect;
export type InsertInternalAuditLog = z.infer<typeof insertInternalAuditLogSchema>;

// E-Billing Packages (pricing catalog)
export const ebillingPackages = pgTable("ebilling_packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  billingCycle: billingCycleEnum("billing_cycle").notNull().default("monthly"),
  includedDocuments: integer("included_documents").notNull().default(0),
  includesPos: boolean("includes_pos").default(true),
  includesInvoice: boolean("includes_invoice").default(true),
  includesNotes: boolean("includes_notes").default(true),
  includesSupportDocs: boolean("includes_support_docs").default(true),
  priceUsdCents: integer("price_usd_cents").notNull().default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEbillingPackageSchema = createInsertSchema(ebillingPackages).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type EbillingPackage = typeof ebillingPackages.$inferSelect;
export type InsertEbillingPackage = z.infer<typeof insertEbillingPackageSchema>;

// Tenant E-Billing Subscription
export const tenantEbillingSubscriptions = pgTable("tenant_ebilling_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  packageId: varchar("package_id").references(() => ebillingPackages.id).notNull(),
  status: subscriptionStatusEnum("status").default("trial"),
  cycleStart: timestamp("cycle_start").notNull(),
  cycleEnd: timestamp("cycle_end").notNull(),
  autoRenew: boolean("auto_renew").default(true),
  overagePolicy: overagePolicyEnum("overage_policy").default("block"),
  overagePricePerDocUsdCents: integer("overage_price_per_doc_usd_cents"),
  documentsIncludedSnapshot: integer("documents_included_snapshot").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantEbillingSubscriptionSchema = createInsertSchema(tenantEbillingSubscriptions).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type TenantEbillingSubscription = typeof tenantEbillingSubscriptions.$inferSelect;
export type InsertTenantEbillingSubscription = z.infer<typeof insertTenantEbillingSubscriptionSchema>;

// Tenant E-Billing Usage (metering)
export const tenantEbillingUsage = pgTable("tenant_ebilling_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  subscriptionId: varchar("subscription_id").references(() => tenantEbillingSubscriptions.id).notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  usedPos: integer("used_pos").default(0),
  usedInvoice: integer("used_invoice").default(0),
  usedNotes: integer("used_notes").default(0),
  usedSupportDocs: integer("used_support_docs").default(0),
  usedTotal: integer("used_total").default(0),
  remainingTotal: integer("remaining_total").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantEbillingUsageSchema = createInsertSchema(tenantEbillingUsage).omit({ 
  id: true, 
  updatedAt: true 
});
export type TenantEbillingUsage = typeof tenantEbillingUsage.$inferSelect;
export type InsertTenantEbillingUsage = z.infer<typeof insertTenantEbillingUsageSchema>;

// Tenant E-Billing Credits (manual adjustments)
export const tenantEbillingCredits = pgTable("tenant_ebilling_credits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  subscriptionId: varchar("subscription_id").references(() => tenantEbillingSubscriptions.id).notNull(),
  deltaDocuments: integer("delta_documents").notNull(),
  reason: text("reason"),
  createdByInternalUserId: varchar("created_by_internal_user_id").references(() => internalUsers.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTenantEbillingCreditSchema = createInsertSchema(tenantEbillingCredits).omit({ 
  id: true, 
  createdAt: true 
});
export type TenantEbillingCredit = typeof tenantEbillingCredits.$inferSelect;
export type InsertTenantEbillingCredit = z.infer<typeof insertTenantEbillingCreditSchema>;

// E-Billing Alerts (internal + tenant alerts)
export const ebillingAlerts = pgTable("ebilling_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id).notNull(),
  type: ebillingAlertTypeEnum("type").notNull(),
  severity: alertSeverityEnum("severity").notNull().default("info"),
  message: text("message").notNull(),
  isAcknowledged: boolean("is_acknowledged").default(false),
  acknowledgedByInternalUserId: varchar("acknowledged_by_internal_user_id").references(() => internalUsers.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEbillingAlertSchema = createInsertSchema(ebillingAlerts).omit({ 
  id: true, 
  createdAt: true,
  acknowledgedAt: true 
});
export type EbillingAlert = typeof ebillingAlerts.$inferSelect;
export type InsertEbillingAlert = z.infer<typeof insertEbillingAlertSchema>;

// ============================================================
// SHOPIFY INTEGRATION (Paid Add-on)
// ============================================================

// Shopify order status enum
export const shopifyOrderStatusEnum = pgEnum("shopify_order_status", [
  "pending",       // Received webhook, not yet processed
  "processing",    // Currently being imported
  "completed",     // Successfully imported to Flowp
  "failed",        // Failed to import (will retry)
  "skipped"        // Skipped (e.g., duplicate)
]);

// Shopify sync direction enum
export const shopifySyncDirectionEnum = pgEnum("shopify_sync_direction", [
  "shopify_to_flowp",  // Orders coming from Shopify
  "flowp_to_shopify"   // Inventory/price push to Shopify
]);

// Tenant Shopify Integration Configuration
export const tenantShopifyIntegrations = pgTable("tenant_shopify_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id).unique(),
  
  // Shopify Store Config
  shopDomain: text("shop_domain").notNull(),  // e.g., "mystore.myshopify.com"
  
  // OAuth Credentials (encrypted)
  clientIdEncrypted: text("client_id_encrypted"),  // Encrypted OAuth client ID
  clientSecretEncrypted: text("client_secret_encrypted"),  // Encrypted OAuth client secret
  accessTokenEncrypted: text("access_token_encrypted"),  // Encrypted access token (from OAuth or legacy)
  refreshTokenEncrypted: text("refresh_token_encrypted"),  // Encrypted refresh token for token rotation
  tokenExpiresAt: timestamp("token_expires_at"),  // When the access token expires
  tokenScope: text("token_scope"),  // OAuth scopes granted
  
  webhookSecret: text("webhook_secret"),  // For HMAC signature verification
  
  // Shopify Location (for inventory sync)
  shopifyLocationId: text("shopify_location_id"),
  
  // Feature toggles
  isActive: boolean("is_active").default(true),
  syncInventory: boolean("sync_inventory").default(true),  // Push inventory to Shopify
  syncPrices: boolean("sync_prices").default(true),  // Push price changes to Shopify
  autoImportOrders: boolean("auto_import_orders").default(true),  // Auto-import orders
  generateDianDocuments: boolean("generate_dian_documents").default(true),  // Generate DIAN docs for Shopify orders
  
  // Default DIAN document type for Shopify orders
  defaultDocumentTypeId: integer("default_document_type_id").default(20),  // 20 = POS Electrónico
  
  // Webhook registration status
  ordersWebhookId: text("orders_webhook_id"),
  refundsWebhookId: text("refunds_webhook_id"),
  
  // Status & errors
  lastWebhookAt: timestamp("last_webhook_at"),
  lastSyncAt: timestamp("last_sync_at"),
  lastError: text("last_error"),
  errorCount: integer("error_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantShopifyIntegrationSchema = createInsertSchema(tenantShopifyIntegrations).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  lastWebhookAt: true,
  lastSyncAt: true
});
export type TenantShopifyIntegration = typeof tenantShopifyIntegrations.$inferSelect;
export type InsertTenantShopifyIntegration = z.infer<typeof insertTenantShopifyIntegrationSchema>;

// Shopify Orders (tracking table for imported orders)
export const shopifyOrders = pgTable("shopify_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  
  // Shopify identifiers
  shopifyOrderId: text("shopify_order_id").notNull(),  // Shopify's internal order ID
  shopifyOrderNumber: text("shopify_order_number"),  // Human-readable order number (e.g., #1001)
  shopifyOrderName: text("shopify_order_name"),  // Name shown in Shopify admin (e.g., "#1001")
  
  // Flowp reference
  flowpOrderId: varchar("flowp_order_id").references(() => orders.id),
  
  // Processing status
  status: shopifyOrderStatusEnum("status").default("pending"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  
  // Original payload (for debugging/retry)
  payloadJson: jsonb("payload_json"),
  
  // Financial totals from Shopify
  subtotalPrice: decimal("subtotal_price", { precision: 12, scale: 2 }),
  totalTax: decimal("total_tax", { precision: 12, scale: 2 }),
  totalDiscounts: decimal("total_discounts", { precision: 12, scale: 2 }),
  totalPrice: decimal("total_price", { precision: 12, scale: 2 }),
  currency: text("currency").default("COP"),
  
  // Customer info from Shopify
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  
  // DIAN document reference
  dianDocumentId: varchar("dian_document_id").references(() => matiasDocumentQueue.id),
  
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

export const insertShopifyOrderSchema = createInsertSchema(shopifyOrders).omit({ 
  id: true, 
  createdAt: true,
  processedAt: true
});
export type ShopifyOrder = typeof shopifyOrders.$inferSelect;
export type InsertShopifyOrder = z.infer<typeof insertShopifyOrderSchema>;

// Shopify Webhook Logs (for debugging and idempotency)
export const shopifyWebhookLogs = pgTable("shopify_webhook_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  
  // Webhook details
  topic: text("topic").notNull(),  // e.g., "orders/create", "orders/paid", "refunds/create"
  shopifyEventId: text("shopify_event_id"),  // X-Shopify-Event-Id header (for idempotency)
  shopifyWebhookId: text("shopify_webhook_id"),  // X-Shopify-Webhook-Id header
  shopDomain: text("shop_domain"),  // X-Shopify-Shop-Domain header
  
  // Payload
  payloadJson: jsonb("payload_json"),
  
  // Processing
  processed: boolean("processed").default(false),
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
  
  // Signature verification
  signatureValid: boolean("signature_valid"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertShopifyWebhookLogSchema = createInsertSchema(shopifyWebhookLogs).omit({ 
  id: true, 
  createdAt: true,
  processedAt: true
});
export type ShopifyWebhookLog = typeof shopifyWebhookLogs.$inferSelect;
export type InsertShopifyWebhookLog = z.infer<typeof insertShopifyWebhookLogSchema>;

// Shopify Product Mapping (links Shopify variants to Flowp products)
export const shopifyProductMap = pgTable("shopify_product_map", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  
  // Shopify identifiers
  shopifyProductId: text("shopify_product_id").notNull(),
  shopifyVariantId: text("shopify_variant_id").notNull(),
  shopifyTitle: text("shopify_title"),
  shopifyVariantTitle: text("shopify_variant_title"),
  shopifySku: text("shopify_sku"),
  
  // Flowp product reference
  flowpProductId: varchar("flowp_product_id").references(() => products.id),
  
  // Mapping status
  autoMatched: boolean("auto_matched").default(false),  // True if matched automatically by SKU
  isActive: boolean("is_active").default(true),
  
  // Last sync state
  lastInventorySync: timestamp("last_inventory_sync"),
  lastPriceSync: timestamp("last_price_sync"),
  shopifyInventoryItemId: text("shopify_inventory_item_id"),  // For inventory API calls
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertShopifyProductMapSchema = createInsertSchema(shopifyProductMap).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  lastInventorySync: true,
  lastPriceSync: true
});
export type ShopifyProductMap = typeof shopifyProductMap.$inferSelect;
export type InsertShopifyProductMap = z.infer<typeof insertShopifyProductMapSchema>;

// Shopify Sync Logs (for inventory/price push operations)
export const shopifySyncLogs = pgTable("shopify_sync_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  
  // Sync details
  direction: shopifySyncDirectionEnum("direction").notNull(),
  entityType: text("entity_type").notNull(),  // "inventory", "price", "product"
  flowpProductId: varchar("flowp_product_id").references(() => products.id),
  shopifyVariantId: text("shopify_variant_id"),
  
  // Values
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  
  // Status
  success: boolean("success").default(false),
  errorMessage: text("error_message"),
  shopifyResponse: jsonb("shopify_response"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertShopifySyncLogSchema = createInsertSchema(shopifySyncLogs).omit({ 
  id: true, 
  createdAt: true 
});
export type ShopifySyncLog = typeof shopifySyncLogs.$inferSelect;
export type InsertShopifySyncLog = z.infer<typeof insertShopifySyncLogSchema>;

// ============================================================
// PAID ADD-ONS
// ============================================================

export const addonStatusEnum = pgEnum("addon_status", ["active", "cancelled", "expired", "trial"]);

// Add-on Definitions (catalog of available add-ons)
export const addonDefinitions = pgTable("addon_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Identifier (used in code, e.g., "shopify_integration")
  addonKey: text("addon_key").notNull().unique(),
  
  // Display info
  name: text("name").notNull(),  // "Shopify Integration"
  description: text("description"),  // Longer description for UI
  icon: text("icon"),  // Lucide icon name, e.g., "ShoppingBag"
  logoUrl: text("logo_url"),  // Optional custom logo URL for the add-on
  category: text("category").default("integration"),  // "integration", "feature", "premium"
  
  // Pricing (in cents)
  monthlyPrice: integer("monthly_price").default(0),  // 0 = free or included
  yearlyPrice: integer("yearly_price"),  // Optional yearly discount
  
  // Trial settings
  trialDays: integer("trial_days").default(0),  // 0 = no trial
  
  // Which subscription tiers include this add-on for free
  // e.g., ["pro", "enterprise"] means Pro and Enterprise get it free
  includedInTiers: jsonb("included_in_tiers").$type<string[]>().default([]),
  
  // Feature flags this add-on enables
  enabledFeatures: jsonb("enabled_features").$type<string[]>().default([]),
  
  // Status
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAddonDefinitionSchema = createInsertSchema(addonDefinitions).omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true,
});
export type AddonDefinition = typeof addonDefinitions.$inferSelect;
export type InsertAddonDefinition = z.infer<typeof insertAddonDefinitionSchema>;

export const PAID_ADDONS = {
  SHOPIFY_INTEGRATION: "shopify_integration",
  WHATSAPP_NOTIFICATIONS: "whatsapp_notifications",
} as const;

export type PaidAddonType = typeof PAID_ADDONS[keyof typeof PAID_ADDONS];

// Tenant Add-ons (tracks which paid add-ons each tenant has)
export const tenantAddons = pgTable("tenant_addons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  
  addonType: text("addon_type").notNull(),  // e.g., "shopify_integration"
  status: addonStatusEnum("status").default("active"),
  
  // Billing tracking
  monthlyPrice: integer("monthly_price"),  // Price in cents
  billingCycleStart: timestamp("billing_cycle_start"),
  billingCycleEnd: timestamp("billing_cycle_end"),
  
  // Trial support
  trialEndsAt: timestamp("trial_ends_at"),
  trialUsedAt: timestamp("trial_used_at"),  // Track if trial was ever used (prevent reuse)
  
  // Metadata
  activatedAt: timestamp("activated_at").defaultNow(),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantAddonSchema = createInsertSchema(tenantAddons).omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true,
  activatedAt: true,
});
export type TenantAddon = typeof tenantAddons.$inferSelect;
export type InsertTenantAddon = z.infer<typeof insertTenantAddonSchema>;

// ==========================================
// WhatsApp / Gupshup Integration
// ==========================================

export const whatsappMessageDirectionEnum = pgEnum("whatsapp_message_direction", ["inbound", "outbound"]);
export const whatsappMessageTypeEnum = pgEnum("whatsapp_message_type", ["receipt", "alert", "manual", "command", "auto_reply"]);
export const whatsappMessageStatusEnum = pgEnum("whatsapp_message_status", ["queued", "sent", "delivered", "read", "failed"]);
export const whatsappSubscriptionStatusEnum = pgEnum("whatsapp_subscription_status", ["active", "exhausted", "expired", "cancelled"]);

export const tenantWhatsappIntegrations = pgTable("tenant_whatsapp_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id).unique(),

  enabled: boolean("enabled").default(false),

  gupshupApiKeyEncrypted: text("gupshup_api_key_encrypted"),
  gupshupAppName: text("gupshup_app_name"),
  senderPhone: text("sender_phone"),

  approvedTemplates: jsonb("approved_templates").$type<string[]>().default([]),

  notifyOnSale: boolean("notify_on_sale").default(false),
  notifyOnLowStock: boolean("notify_on_low_stock").default(false),
  notifyDailySummary: boolean("notify_daily_summary").default(false),

  businessHours: text("business_hours"),
  supportInfo: text("support_info"),

  lastError: text("last_error"),
  errorCount: integer("error_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantWhatsappIntegrationSchema = createInsertSchema(tenantWhatsappIntegrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type TenantWhatsappIntegration = typeof tenantWhatsappIntegrations.$inferSelect;
export type InsertTenantWhatsappIntegration = z.infer<typeof insertTenantWhatsappIntegrationSchema>;

export const whatsappPackages = pgTable("whatsapp_packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  messageLimit: integer("message_limit").notNull(),
  price: integer("price").notNull(),
  active: boolean("active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWhatsappPackageSchema = createInsertSchema(whatsappPackages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type WhatsappPackage = typeof whatsappPackages.$inferSelect;
export type InsertWhatsappPackage = z.infer<typeof insertWhatsappPackageSchema>;

export const tenantWhatsappSubscriptions = pgTable("tenant_whatsapp_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  packageId: varchar("package_id").notNull().references(() => whatsappPackages.id),
  messagesUsed: integer("messages_used").default(0),
  messageLimit: integer("message_limit").notNull(),
  status: whatsappSubscriptionStatusEnum("status").default("active"),
  renewalDate: timestamp("renewal_date"),
  activatedAt: timestamp("activated_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantWhatsappSubscriptionSchema = createInsertSchema(tenantWhatsappSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  activatedAt: true,
});
export type TenantWhatsappSubscription = typeof tenantWhatsappSubscriptions.$inferSelect;
export type InsertTenantWhatsappSubscription = z.infer<typeof insertTenantWhatsappSubscriptionSchema>;

export const whatsappMessageLogs = pgTable("whatsapp_message_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  direction: whatsappMessageDirectionEnum("direction").notNull(),
  phone: text("phone").notNull(),
  messageType: whatsappMessageTypeEnum("message_type").notNull(),
  templateId: text("template_id"),
  messageBody: text("message_body"),
  status: whatsappMessageStatusEnum("status").default("queued"),
  providerMessageId: text("provider_message_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWhatsappMessageLogSchema = createInsertSchema(whatsappMessageLogs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type WhatsappMessageLog = typeof whatsappMessageLogs.$inferSelect;
export type InsertWhatsappMessageLog = z.infer<typeof insertWhatsappMessageLogSchema>;

// ==========================================
// WHATSAPP TEMPLATE MANAGER
// ==========================================

export const whatsappTemplateCategoryEnum = pgEnum("whatsapp_template_category", ["utility", "marketing", "authentication"]);
export const whatsappTemplateStatusEnum = pgEnum("whatsapp_template_status", ["draft", "pending", "approved", "rejected"]);

export const whatsappTemplates = pgTable("whatsapp_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 512 }).notNull(),
  category: whatsappTemplateCategoryEnum("category").notNull().default("utility"),
  language: varchar("language", { length: 10 }).notNull().default("es"),
  headerText: text("header_text"),
  bodyText: text("body_text").notNull(),
  footerText: text("footer_text"),
  buttons: jsonb("buttons").$type<Array<{ type: string; text: string; url?: string; phoneNumber?: string }>>().default([]),
  variablesSample: jsonb("variables_sample").$type<Record<string, string>>().default({}),
  gupshupTemplateId: varchar("gupshup_template_id", { length: 255 }),
  status: whatsappTemplateStatusEnum("status").notNull().default("draft"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWhatsappTemplateSchema = createInsertSchema(whatsappTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type WhatsappTemplate = typeof whatsappTemplates.$inferSelect;
export type InsertWhatsappTemplate = z.infer<typeof insertWhatsappTemplateSchema>;

export const whatsappTriggerEventEnum = pgEnum("whatsapp_trigger_event", [
  "sale_completed",
  "low_stock_alert",
  "order_ready",
  "payment_received",
  "daily_summary",
]);

export const whatsappTemplateTriggers = pgTable("whatsapp_template_triggers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  templateId: varchar("template_id").notNull().references(() => whatsappTemplates.id, { onDelete: "cascade" }),
  event: whatsappTriggerEventEnum("event").notNull(),
  enabled: boolean("enabled").default(true),
  variableMapping: jsonb("variable_mapping").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWhatsappTemplateTriggerSchema = createInsertSchema(whatsappTemplateTriggers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type WhatsappTemplateTrigger = typeof whatsappTemplateTriggers.$inferSelect;
export type InsertWhatsappTemplateTrigger = z.infer<typeof insertWhatsappTemplateTriggerSchema>;

// ==========================================
// WHATSAPP TWO-WAY CHAT
// ==========================================

export const whatsappChatContentTypeEnum = pgEnum("whatsapp_chat_content_type", [
  "text", "image", "video", "audio", "document", "sticker", "location", "contact", "notification"
]);

export const whatsappConversations = pgTable("whatsapp_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  customerPhone: text("customer_phone").notNull(),
  customerName: text("customer_name"),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  lastMessagePreview: text("last_message_preview"),
  unreadCount: integer("unread_count").default(0),
  isActive: boolean("is_active").default(true),
  assignedUserId: integer("assigned_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWhatsappConversationSchema = createInsertSchema(whatsappConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type WhatsappConversation = typeof whatsappConversations.$inferSelect;
export type InsertWhatsappConversation = z.infer<typeof insertWhatsappConversationSchema>;

export const whatsappChatMessages = pgTable("whatsapp_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => whatsappConversations.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  direction: whatsappMessageDirectionEnum("direction").notNull(),
  contentType: whatsappChatContentTypeEnum("content_type").notNull().default("text"),
  body: text("body"),
  mediaUrl: text("media_url"),
  mediaMimeType: text("media_mime_type"),
  mediaFilename: text("media_filename"),
  caption: text("caption"),
  senderPhone: text("sender_phone"),
  senderName: text("sender_name"),
  providerMessageId: text("provider_message_id"),
  status: whatsappMessageStatusEnum("status").default("sent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWhatsappChatMessageSchema = createInsertSchema(whatsappChatMessages).omit({
  id: true,
  createdAt: true,
});
export type WhatsappChatMessage = typeof whatsappChatMessages.$inferSelect;
export type InsertWhatsappChatMessage = z.infer<typeof insertWhatsappChatMessageSchema>;
