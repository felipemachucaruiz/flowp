import {
  tenants, users, registers, registerSessions, categories, products,
  modifierGroups, modifiers, productModifierGroups, floors, tables,
  orders, orderItems, kitchenTickets, payments, stockMovements, auditLogs, customers,
  loyaltyTransactions, loyaltyRewards, taxRates, subscriptionPlans, subscriptions,
  systemSettings, passwordResetTokens, emailTemplates, emailLogs,
  suppliers, purchaseOrders, purchaseOrderItems,
  ingredients, ingredientLots, recipes, recipeItems, ingredientMovements,
  saleIngredientConsumptions, ingredientAlerts,
  type Tenant, type InsertTenant, type User, type InsertUser,
  type Register, type InsertRegister, type RegisterSession, type InsertRegisterSession,
  type Category, type InsertCategory, type Product, type InsertProduct,
  type Customer, type InsertCustomer,
  type LoyaltyTransaction, type InsertLoyaltyTransaction,
  type LoyaltyReward, type InsertLoyaltyReward,
  type TaxRate, type InsertTaxRate,
  type ModifierGroup, type InsertModifierGroup, type Modifier, type InsertModifier,
  type Floor, type InsertFloor, type Table, type InsertTable,
  type Order, type InsertOrder, type OrderItem, type InsertOrderItem,
  type KitchenTicket, type InsertKitchenTicket, type Payment, type InsertPayment,
  type StockMovement, type InsertStockMovement,
  type Supplier, type InsertSupplier,
  type PurchaseOrder, type InsertPurchaseOrder,
  type PurchaseOrderItem, type InsertPurchaseOrderItem,
  type SubscriptionPlan, type Subscription,
  type SystemSetting, type InsertSystemSetting,
  type PasswordResetToken, type InsertPasswordResetToken,
  type EmailTemplate, type InsertEmailTemplate,
  type EmailLog, type InsertEmailLog,
  type Ingredient, type InsertIngredient,
  type IngredientLot, type InsertIngredientLot,
  type Recipe, type InsertRecipe,
  type RecipeItem, type InsertRecipeItem,
  type IngredientMovement, type InsertIngredientMovement,
  type IngredientAlert, type InsertIngredientAlert,
  RETAIL_FEATURES, RESTAURANT_FEATURES, PRO_FEATURES,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql, gte, lte, or, ilike, inArray, isNull, isNotNull } from "drizzle-orm";
import bcrypt from "bcrypt";

export interface IStorage {
  // Tenants
  getTenant(id: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined>;
  
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(tenantId: string, username: string): Promise<User | undefined>;
  getUsersByTenant(tenantId: string): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;
  
  // Categories
  getCategoriesByTenant(tenantId: string): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: string, data: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: string): Promise<void>;
  
  // Products
  getProductsByTenant(tenantId: string): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, data: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<void>;
  
  // Customers
  getCustomersByTenant(tenantId: string): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  searchCustomers(tenantId: string, query: string): Promise<Customer[]>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, data: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: string): Promise<void>;
  getOrdersByCustomer(customerId: string): Promise<Order[]>;
  getLoyaltyTransactionsByCustomer(customerId: string): Promise<LoyaltyTransaction[]>;
  
  // Loyalty Rewards
  getLoyaltyRewardsByTenant(tenantId: string): Promise<LoyaltyReward[]>;
  createLoyaltyReward(reward: InsertLoyaltyReward): Promise<LoyaltyReward>;
  updateLoyaltyReward(id: string, data: Partial<InsertLoyaltyReward>): Promise<LoyaltyReward | undefined>;
  deleteLoyaltyReward(id: string): Promise<void>;
  createLoyaltyTransaction(transaction: InsertLoyaltyTransaction): Promise<LoyaltyTransaction>;
  
  // Tax Rates
  getTaxRatesByTenant(tenantId: string): Promise<TaxRate[]>;
  createTaxRate(taxRate: InsertTaxRate): Promise<TaxRate>;
  updateTaxRate(id: string, data: Partial<InsertTaxRate>): Promise<TaxRate | undefined>;
  deleteTaxRate(id: string): Promise<void>;
  
  // Floors
  getFloorsByTenant(tenantId: string): Promise<Floor[]>;
  createFloor(floor: InsertFloor): Promise<Floor>;
  updateFloor(id: string, data: Partial<InsertFloor>): Promise<Floor | undefined>;
  deleteFloor(id: string): Promise<void>;
  
  // Tables
  getTablesByTenant(tenantId: string): Promise<Table[]>;
  getTablesByFloor(floorId: string): Promise<Table[]>;
  createTable(table: InsertTable): Promise<Table>;
  updateTable(id: string, data: Partial<InsertTable>): Promise<Table | undefined>;
  deleteTable(id: string): Promise<void>;
  
  // Orders
  getOrdersByTenant(tenantId: string, limit?: number): Promise<Order[]>;
  getOrdersWithDetails(tenantId: string, startDate: Date | null): Promise<any[]>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: string, data: Partial<InsertOrder>): Promise<Order | undefined>;
  getNextOrderNumber(tenantId: string): Promise<number>;
  
  // Order Items
  getOrderItems(orderId: string): Promise<OrderItem[]>;
  createOrderItem(item: InsertOrderItem): Promise<OrderItem>;
  
  // Kitchen Tickets
  getKitchenTicket(id: string): Promise<KitchenTicket | undefined>;
  getKitchenTicketsByTenant(tenantId: string): Promise<KitchenTicket[]>;
  getActiveKitchenTickets(tenantId: string): Promise<KitchenTicket[]>;
  createKitchenTicket(ticket: InsertKitchenTicket): Promise<KitchenTicket>;
  updateKitchenTicket(id: string, data: Partial<InsertKitchenTicket>): Promise<KitchenTicket | undefined>;
  
  // Payments
  createPayment(payment: InsertPayment): Promise<Payment>;
  
  // Stock Movements
  getStockMovementsByTenant(tenantId: string): Promise<StockMovement[]>;
  createStockMovement(movement: InsertStockMovement): Promise<StockMovement>;
  getStockLevel(productId: string): Promise<number>;
  getStockLevels(tenantId: string): Promise<Record<string, number>>;
  
  // Suppliers
  getSuppliersByTenant(tenantId: string): Promise<Supplier[]>;
  getSupplier(id: string): Promise<Supplier | undefined>;
  createSupplier(supplier: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: string, data: Partial<InsertSupplier>): Promise<Supplier | undefined>;
  deleteSupplier(id: string): Promise<boolean>;
  
  // Purchase Orders
  getPurchaseOrdersByTenant(tenantId: string): Promise<PurchaseOrder[]>;
  getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined>;
  createPurchaseOrder(order: InsertPurchaseOrder): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: string, data: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder | undefined>;
  deletePurchaseOrder(id: string): Promise<boolean>;
  
  // Purchase Order Items
  getPurchaseOrderItems(purchaseOrderId: string): Promise<PurchaseOrderItem[]>;
  createPurchaseOrderItem(item: InsertPurchaseOrderItem): Promise<PurchaseOrderItem>;
  updatePurchaseOrderItem(id: string, data: Partial<InsertPurchaseOrderItem>): Promise<PurchaseOrderItem | undefined>;
  deletePurchaseOrderItem(id: string): Promise<boolean>;
  
  // Reports
  getDashboardStats(tenantId: string): Promise<{
    todaySales: number;
    todayOrders: number;
    averageOrderValue: number;
    topProducts: { name: string; quantity: number; revenue: number }[];
    salesByHour: { hour: string; sales: number }[];
    salesByCategory: { name: string; value: number }[];
    recentTrend: number;
  }>;
  
  getAdvancedAnalytics(tenantId: string, dateRange: string, customStartDate?: Date, customEndDate?: Date): Promise<{
    salesTrends: { date: string; revenue: number; orders: number; profit: number }[];
    productPerformance: { id: string; name: string | null; quantity: number; revenue: number; cost: number; profit: number; margin: number }[];
    employeeMetrics: { id: string; name: string | null; salesCount: number; revenue: number; avgOrderValue: number }[];
    profitAnalysis: { totalRevenue: number; totalCost: number; grossProfit: number; grossMargin: number; topProfitProducts: { name: string; profit: number; margin: number }[] };
  }>;
  
  // Subscription Plans
  getActiveSubscriptionPlans(): Promise<SubscriptionPlan[]>;
  getTenantSubscription(tenantId: string): Promise<Subscription | null>;
  createSubscription(data: { tenantId: string; planId: string; billingPeriod: string; paypalOrderId: string }): Promise<Subscription>;
  
  // Ingredients (Pro feature)
  getIngredientsByTenant(tenantId: string): Promise<Ingredient[]>;
  getIngredient(id: string): Promise<Ingredient | undefined>;
  createIngredient(ingredient: InsertIngredient): Promise<Ingredient>;
  updateIngredient(id: string, data: Partial<InsertIngredient>): Promise<Ingredient | undefined>;
  deleteIngredient(id: string): Promise<void>;
  
  // Ingredient Lots
  getIngredientLots(tenantId: string, ingredientId?: string): Promise<IngredientLot[]>;
  getIngredientLot(id: string): Promise<IngredientLot | undefined>;
  createIngredientLot(lot: InsertIngredientLot): Promise<IngredientLot>;
  updateIngredientLot(id: string, data: Partial<InsertIngredientLot>): Promise<IngredientLot | undefined>;
  getAvailableLotsForIngredient(ingredientId: string): Promise<IngredientLot[]>;
  
  // Recipes
  getRecipesByTenant(tenantId: string): Promise<Recipe[]>;
  getRecipeByProduct(productId: string): Promise<Recipe | undefined>;
  getRecipe(id: string): Promise<Recipe | undefined>;
  createRecipe(recipe: InsertRecipe): Promise<Recipe>;
  updateRecipe(id: string, data: Partial<InsertRecipe>): Promise<Recipe | undefined>;
  deleteRecipe(id: string): Promise<void>;
  
  // Recipe Items
  getRecipeItems(recipeId: string): Promise<RecipeItem[]>;
  getRecipeItem(id: string): Promise<RecipeItem | undefined>;
  createRecipeItem(item: InsertRecipeItem): Promise<RecipeItem>;
  updateRecipeItem(id: string, data: Partial<InsertRecipeItem>): Promise<RecipeItem | undefined>;
  deleteRecipeItem(id: string): Promise<void>;
  
  // Ingredient Movements
  createIngredientMovement(movement: InsertIngredientMovement): Promise<IngredientMovement>;
  getIngredientMovements(tenantId: string, ingredientId?: string): Promise<IngredientMovement[]>;
  
  // Ingredient Alerts
  getIngredientAlerts(tenantId: string, acknowledged?: boolean): Promise<IngredientAlert[]>;
  getIngredientAlert(id: string): Promise<IngredientAlert | undefined>;
  createIngredientAlert(alert: InsertIngredientAlert): Promise<IngredientAlert>;
  acknowledgeAlert(id: string, userId: string): Promise<IngredientAlert | undefined>;
  
  // Ingredient Stock Levels (computed)
  getIngredientStockLevels(tenantId: string): Promise<Record<string, number>>;
  
  // FIFO Ingredient Consumption
  consumeIngredientFifo(tenantId: string, ingredientId: string, qtyNeeded: number, orderId: string, userId?: string): Promise<void>;
  
  // Pro Feature Check
  hasTenantProFeature(tenantId: string, feature: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Tenants
  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant || undefined;
  }

  async updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined> {
    const [updated] = await db.update(tenants).set(data).where(eq(tenants.id, id)).returning();
    return updated;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const featureFlags = tenant.type === "restaurant" ? RESTAURANT_FEATURES : RETAIL_FEATURES;
    const [created] = await db.insert(tenants).values({ ...tenant, featureFlags }).returning();
    return created;
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(tenantId: string, username: string): Promise<User | undefined> {
    if (tenantId) {
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.username, username)));
      return user || undefined;
    } else {
      // Search across all tenants (for login without tenant context)
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));
      return user || undefined;
    }
  }

  async getUsersByTenant(tenantId: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.tenantId, tenantId));
  }

  async createUser(user: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    const [created] = await db.insert(users).values({ ...user, password: hashedPassword }).returning();
    return created;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // Categories
  async getCategoriesByTenant(tenantId: string): Promise<Category[]> {
    return db.select().from(categories).where(eq(categories.tenantId, tenantId)).orderBy(categories.sortOrder);
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [created] = await db.insert(categories).values(category).returning();
    return created;
  }

  async updateCategory(id: string, data: Partial<InsertCategory>): Promise<Category | undefined> {
    const [updated] = await db.update(categories).set(data).where(eq(categories.id, id)).returning();
    return updated;
  }

  async deleteCategory(id: string): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  // Products
  async getProductsByTenant(tenantId: string): Promise<Product[]> {
    return db.select().from(products).where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.isActive, true)
      )
    ).orderBy(products.sortOrder);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product || undefined;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [created] = await db.insert(products).values(product).returning();
    return created;
  }

  async updateProduct(id: string, data: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updated] = await db.update(products).set(data).where(eq(products.id, id)).returning();
    return updated;
  }

  async deleteProduct(id: string): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  // Customers
  async getCustomersByTenant(tenantId: string): Promise<Customer[]> {
    return db.select().from(customers).where(eq(customers.tenantId, tenantId)).orderBy(desc(customers.createdAt));
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer || undefined;
  }

  async searchCustomers(tenantId: string, query: string): Promise<Customer[]> {
    if (!query.trim()) {
      return this.getCustomersByTenant(tenantId);
    }
    const searchPattern = `%${query}%`;
    return db.select().from(customers).where(
      and(
        eq(customers.tenantId, tenantId),
        or(
          ilike(customers.name, searchPattern),
          ilike(customers.email, searchPattern),
          ilike(customers.phone, searchPattern),
          ilike(customers.idNumber, searchPattern)
        )
      )
    ).orderBy(customers.name);
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const [created] = await db.insert(customers).values(customer).returning();
    return created;
  }

  async updateCustomer(id: string, data: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [updated] = await db.update(customers).set(data).where(eq(customers.id, id)).returning();
    return updated || undefined;
  }

  async deleteCustomer(id: string): Promise<void> {
    await db.delete(customers).where(eq(customers.id, id));
  }

  async getOrdersByCustomer(customerId: string): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.customerId, customerId)).orderBy(desc(orders.createdAt));
  }

  async getLoyaltyTransactionsByCustomer(customerId: string): Promise<LoyaltyTransaction[]> {
    return db.select().from(loyaltyTransactions).where(eq(loyaltyTransactions.customerId, customerId)).orderBy(desc(loyaltyTransactions.createdAt));
  }

  // Loyalty Rewards
  async getLoyaltyRewardsByTenant(tenantId: string): Promise<LoyaltyReward[]> {
    return db.select().from(loyaltyRewards).where(eq(loyaltyRewards.tenantId, tenantId));
  }

  async createLoyaltyReward(reward: InsertLoyaltyReward): Promise<LoyaltyReward> {
    const [created] = await db.insert(loyaltyRewards).values(reward).returning();
    return created;
  }

  async updateLoyaltyReward(id: string, data: Partial<InsertLoyaltyReward>): Promise<LoyaltyReward | undefined> {
    const [updated] = await db.update(loyaltyRewards).set(data).where(eq(loyaltyRewards.id, id)).returning();
    return updated || undefined;
  }

  async deleteLoyaltyReward(id: string): Promise<void> {
    await db.delete(loyaltyRewards).where(eq(loyaltyRewards.id, id));
  }

  async createLoyaltyTransaction(transaction: InsertLoyaltyTransaction): Promise<LoyaltyTransaction> {
    const [created] = await db.insert(loyaltyTransactions).values(transaction).returning();
    return created;
  }

  // Tax Rates
  async getTaxRatesByTenant(tenantId: string): Promise<TaxRate[]> {
    return db.select().from(taxRates).where(eq(taxRates.tenantId, tenantId)).orderBy(taxRates.createdAt);
  }

  async createTaxRate(taxRate: InsertTaxRate): Promise<TaxRate> {
    const [created] = await db.insert(taxRates).values(taxRate).returning();
    return created;
  }

  async updateTaxRate(id: string, data: Partial<InsertTaxRate>): Promise<TaxRate | undefined> {
    const [updated] = await db.update(taxRates).set(data).where(eq(taxRates.id, id)).returning();
    return updated;
  }

  async deleteTaxRate(id: string): Promise<void> {
    await db.delete(taxRates).where(eq(taxRates.id, id));
  }

  // Floors
  async getFloorsByTenant(tenantId: string): Promise<Floor[]> {
    return db.select().from(floors).where(eq(floors.tenantId, tenantId)).orderBy(floors.sortOrder);
  }

  async createFloor(floor: InsertFloor): Promise<Floor> {
    const [created] = await db.insert(floors).values(floor).returning();
    return created;
  }

  async updateFloor(id: string, data: Partial<InsertFloor>): Promise<Floor | undefined> {
    const [updated] = await db.update(floors).set(data).where(eq(floors.id, id)).returning();
    return updated;
  }

  async deleteFloor(id: string): Promise<void> {
    await db.delete(floors).where(eq(floors.id, id));
  }

  // Tables
  async getTablesByTenant(tenantId: string): Promise<Table[]> {
    const tenantFloors = await this.getFloorsByTenant(tenantId);
    const floorIds = tenantFloors.map(f => f.id);
    if (floorIds.length === 0) return [];
    
    const allTables: Table[] = [];
    for (const floorId of floorIds) {
      const floorTables = await db.select().from(tables).where(eq(tables.floorId, floorId));
      allTables.push(...floorTables);
    }
    return allTables;
  }

  async getTablesByFloor(floorId: string): Promise<Table[]> {
    return db.select().from(tables).where(eq(tables.floorId, floorId));
  }

  async createTable(table: InsertTable): Promise<Table> {
    const [created] = await db.insert(tables).values(table).returning();
    return created;
  }

  async updateTable(id: string, data: Partial<InsertTable>): Promise<Table | undefined> {
    const [updated] = await db.update(tables).set(data).where(eq(tables.id, id)).returning();
    return updated;
  }

  async deleteTable(id: string): Promise<void> {
    await db.delete(tables).where(eq(tables.id, id));
  }

  // Orders
  async getOrdersByTenant(tenantId: string, limit = 100): Promise<Order[]> {
    return db
      .select()
      .from(orders)
      .where(eq(orders.tenantId, tenantId))
      .orderBy(desc(orders.createdAt))
      .limit(limit);
  }

  async getOrdersWithDetails(tenantId: string, startDate: Date | null): Promise<any[]> {
    let query = db
      .select()
      .from(orders)
      .where(
        startDate
          ? and(eq(orders.tenantId, tenantId), gte(orders.createdAt, startDate))
          : eq(orders.tenantId, tenantId)
      )
      .orderBy(desc(orders.createdAt))
      .limit(200);
    
    const orderList = await query;
    
    const ordersWithDetails = await Promise.all(
      orderList.map(async (order) => {
        const items = await db
          .select({
            id: orderItems.id,
            productId: orderItems.productId,
            quantity: orderItems.quantity,
            unitPrice: orderItems.unitPrice,
            productName: products.name,
          })
          .from(orderItems)
          .leftJoin(products, eq(orderItems.productId, products.id))
          .where(eq(orderItems.orderId, order.id));
        
        const orderPayments = await db
          .select()
          .from(payments)
          .where(eq(payments.orderId, order.id));
        
        let customer = null;
        if (order.customerId) {
          const [cust] = await db
            .select()
            .from(customers)
            .where(eq(customers.id, order.customerId));
          customer = cust || null;
        }
        
        return {
          ...order,
          items,
          payments: orderPayments,
          customer,
        };
      })
    );
    
    return ordersWithDetails;
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order || undefined;
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [created] = await db.insert(orders).values(order).returning();
    return created;
  }

  async updateOrder(id: string, data: Partial<InsertOrder>): Promise<Order | undefined> {
    const [updated] = await db.update(orders).set(data).where(eq(orders.id, id)).returning();
    return updated;
  }

  async getNextOrderNumber(tenantId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, today)));
    
    return (result?.count || 0) + 1;
  }

  // Order Items
  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }

  async createOrderItem(item: InsertOrderItem): Promise<OrderItem> {
    const [created] = await db.insert(orderItems).values(item).returning();
    return created;
  }

  // Kitchen Tickets
  async getKitchenTicket(id: string): Promise<KitchenTicket | undefined> {
    const [ticket] = await db.select().from(kitchenTickets).where(eq(kitchenTickets.id, id));
    return ticket;
  }

  async getKitchenTicketsByTenant(tenantId: string): Promise<KitchenTicket[]> {
    const tenantOrders = await this.getOrdersByTenant(tenantId, 1000);
    const orderIds = tenantOrders.map(o => o.id);
    if (orderIds.length === 0) return [];
    
    const allTickets: KitchenTicket[] = [];
    for (const orderId of orderIds) {
      const orderTickets = await db
        .select()
        .from(kitchenTickets)
        .where(eq(kitchenTickets.orderId, orderId))
        .orderBy(desc(kitchenTickets.createdAt));
      allTickets.push(...orderTickets);
    }
    return allTickets.slice(0, 100);
  }

  async getActiveKitchenTickets(tenantId: string): Promise<KitchenTicket[]> {
    const allTickets = await this.getKitchenTicketsByTenant(tenantId);
    return allTickets.filter(t => t.status !== "served");
  }

  async createKitchenTicket(ticket: InsertKitchenTicket): Promise<KitchenTicket> {
    const [created] = await db.insert(kitchenTickets).values(ticket).returning();
    return created;
  }

  async updateKitchenTicket(id: string, data: Partial<InsertKitchenTicket>): Promise<KitchenTicket | undefined> {
    const updateData: any = { ...data };
    if (data.status === "preparing") {
      updateData.startedAt = new Date();
    } else if (data.status === "ready" || data.status === "served") {
      updateData.completedAt = new Date();
    }
    const [updated] = await db.update(kitchenTickets).set(updateData).where(eq(kitchenTickets.id, id)).returning();
    return updated;
  }

  // Payments
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [created] = await db.insert(payments).values(payment).returning();
    return created;
  }

  // Stock Movements
  async getStockMovementsByTenant(tenantId: string): Promise<StockMovement[]> {
    return db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.tenantId, tenantId))
      .orderBy(desc(stockMovements.createdAt))
      .limit(100);
  }

  async createStockMovement(movement: InsertStockMovement): Promise<StockMovement> {
    const [created] = await db.insert(stockMovements).values(movement).returning();
    return created;
  }

  async getStockLevel(productId: string): Promise<number> {
    const [result] = await db
      .select({ total: sql<number>`COALESCE(SUM(quantity), 0)` })
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId));
    return result?.total || 0;
  }

  async getStockLevels(tenantId: string): Promise<Record<string, number>> {
    const results = await db
      .select({
        productId: stockMovements.productId,
        total: sql<number>`COALESCE(SUM(quantity), 0)`,
      })
      .from(stockMovements)
      .where(eq(stockMovements.tenantId, tenantId))
      .groupBy(stockMovements.productId);
    
    const levels: Record<string, number> = {};
    for (const r of results) {
      levels[r.productId] = r.total;
    }
    return levels;
  }

  // Suppliers
  async getSuppliersByTenant(tenantId: string): Promise<Supplier[]> {
    return db
      .select()
      .from(suppliers)
      .where(eq(suppliers.tenantId, tenantId))
      .orderBy(desc(suppliers.createdAt));
  }

  async getSupplier(id: string): Promise<Supplier | undefined> {
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    return supplier;
  }

  async createSupplier(supplier: InsertSupplier): Promise<Supplier> {
    const [created] = await db.insert(suppliers).values(supplier).returning();
    return created;
  }

  async updateSupplier(id: string, data: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    const [updated] = await db
      .update(suppliers)
      .set(data)
      .where(eq(suppliers.id, id))
      .returning();
    return updated;
  }

  async deleteSupplier(id: string): Promise<boolean> {
    const result = await db.delete(suppliers).where(eq(suppliers.id, id));
    return true;
  }

  // Purchase Orders
  async getPurchaseOrdersByTenant(tenantId: string): Promise<PurchaseOrder[]> {
    return db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.tenantId, tenantId))
      .orderBy(desc(purchaseOrders.createdAt));
  }

  async getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
    const [order] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    return order;
  }

  async createPurchaseOrder(order: InsertPurchaseOrder): Promise<PurchaseOrder> {
    const [created] = await db.insert(purchaseOrders).values(order).returning();
    return created;
  }

  async updatePurchaseOrder(id: string, data: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder | undefined> {
    const [updated] = await db
      .update(purchaseOrders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id))
      .returning();
    return updated;
  }

  async deletePurchaseOrder(id: string): Promise<boolean> {
    // Delete items first
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id));
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
    return true;
  }

  // Purchase Order Items
  async getPurchaseOrderItems(purchaseOrderId: string): Promise<PurchaseOrderItem[]> {
    return db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
  }

  async createPurchaseOrderItem(item: InsertPurchaseOrderItem): Promise<PurchaseOrderItem> {
    const [created] = await db.insert(purchaseOrderItems).values(item).returning();
    return created;
  }

  async updatePurchaseOrderItem(id: string, data: Partial<InsertPurchaseOrderItem>): Promise<PurchaseOrderItem | undefined> {
    const [updated] = await db
      .update(purchaseOrderItems)
      .set(data)
      .where(eq(purchaseOrderItems.id, id))
      .returning();
    return updated;
  }

  async deletePurchaseOrderItem(id: string): Promise<boolean> {
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.id, id));
    return true;
  }

  // Reports
  async getDashboardStats(tenantId: string): Promise<{
    todaySales: number;
    todayOrders: number;
    averageOrderValue: number;
    topProducts: { name: string; quantity: number; revenue: number }[];
    salesByHour: { hour: string; sales: number }[];
    salesByCategory: { name: string; value: number }[];
    recentTrend: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Today's orders
    const todayOrders = await db
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, today), eq(orders.status, "completed")));

    const todaySales = todayOrders.reduce((sum, o) => sum + parseFloat(o.total), 0);
    const averageOrderValue = todayOrders.length > 0 ? todaySales / todayOrders.length : 0;

    // Yesterday's orders for trend
    const yesterdayOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          gte(orders.createdAt, yesterday),
          eq(orders.status, "completed")
        )
      );
    const yesterdaySales = yesterdayOrders
      .filter((o) => new Date(o.createdAt!) < today)
      .reduce((sum, o) => sum + parseFloat(o.total), 0);

    const recentTrend =
      yesterdaySales > 0
        ? Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100)
        : 0;

    // Get all order items with product info for today's orders
    const orderIds = todayOrders.map(o => o.id);
    let allOrderItems: { productId: string; quantity: number; unitPrice: string }[] = [];
    if (orderIds.length > 0) {
      allOrderItems = await db
        .select({
          productId: orderItems.productId,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds));
    }

    // Get products with category info
    const allProducts = await db
      .select({
        id: products.id,
        name: products.name,
        categoryId: products.categoryId,
      })
      .from(products)
      .where(eq(products.tenantId, tenantId));

    const productMap = new Map(allProducts.map(p => [p.id, p]));

    // Get categories
    const allCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.tenantId, tenantId));
    const categoryMap = new Map(allCategories.map(c => [c.id, c.name]));

    // Top products
    const productSales = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const item of allOrderItems) {
      const product = productMap.get(item.productId);
      const productName = product?.name || "Unknown";
      const existing = productSales.get(item.productId) || { name: productName, quantity: 0, revenue: 0 };
      existing.quantity += item.quantity;
      existing.revenue += parseFloat(item.unitPrice) * item.quantity;
      productSales.set(item.productId, existing);
    }
    const topProducts = Array.from(productSales.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Sales by hour
    const salesByHour: { hour: string; sales: number }[] = [];
    for (let h = 8; h <= 22; h++) {
      salesByHour.push({ hour: `${h}:00`, sales: 0 });
    }
    for (const order of todayOrders) {
      const hour = new Date(order.createdAt!).getHours();
      const idx = salesByHour.findIndex((s) => s.hour === `${hour}:00`);
      if (idx >= 0) {
        salesByHour[idx].sales += parseFloat(order.total);
      }
    }

    // Sales by category
    const categorySales = new Map<string, number>();
    for (const item of allOrderItems) {
      const product = productMap.get(item.productId);
      const categoryId = product?.categoryId;
      if (categoryId) {
        const categoryName = categoryMap.get(categoryId) || "Other";
        const existing = categorySales.get(categoryName) || 0;
        categorySales.set(categoryName, existing + parseFloat(item.unitPrice) * item.quantity);
      }
    }
    const salesByCategory = Array.from(categorySales.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      todaySales,
      todayOrders: todayOrders.length,
      averageOrderValue,
      topProducts,
      salesByHour,
      salesByCategory,
      recentTrend,
    };
  }

  async getAdvancedAnalytics(tenantId: string, dateRange: string, customStartDate?: Date, customEndDate?: Date): Promise<{
    salesTrends: { date: string; revenue: number; orders: number; profit: number }[];
    productPerformance: { id: string; name: string | null; quantity: number; revenue: number; cost: number; profit: number; margin: number }[];
    employeeMetrics: { id: string; name: string | null; salesCount: number; revenue: number; avgOrderValue: number }[];
    profitAnalysis: { totalRevenue: number; totalCost: number; grossProfit: number; grossMargin: number; topProfitProducts: { name: string; profit: number; margin: number }[] };
  }> {
    // Calculate date range
    let today = new Date();
    today.setHours(23, 59, 59, 999);
    let startDate = new Date();
    
    // Use custom dates if provided
    if (customStartDate && customEndDate) {
      startDate = new Date(customStartDate);
      startDate.setHours(0, 0, 0, 0);
      today = new Date(customEndDate);
      today.setHours(23, 59, 59, 999);
    } else {
      switch (dateRange) {
        case "7d":
          startDate.setDate(startDate.getDate() - 7);
          break;
        case "30d":
          startDate.setDate(startDate.getDate() - 30);
          break;
        case "90d":
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }
      startDate.setHours(0, 0, 0, 0);
    }

    // Get all completed orders in date range
    const rangeOrders = await db
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, startDate), eq(orders.status, "completed")));

    // Get all products with cost info
    const allProducts = await db
      .select()
      .from(products)
      .where(eq(products.tenantId, tenantId));
    const productMap = new Map(allProducts.map(p => [p.id, p]));

    // Get all users for employee metrics
    const allUsers = await db
      .select()
      .from(users)
      .where(eq(users.tenantId, tenantId));
    const userMap = new Map(allUsers.map(u => [u.id, u]));

    // Get order items for all orders
    const orderIds = rangeOrders.map(o => o.id);
    let allOrderItems: { orderId: string; productId: string; quantity: number; unitPrice: string }[] = [];
    if (orderIds.length > 0) {
      allOrderItems = await db
        .select({
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds));
    }

    // Sales Trends - group by date
    const salesByDate = new Map<string, { revenue: number; orders: number; profit: number }>();
    for (const order of rangeOrders) {
      const dateKey = new Date(order.createdAt!).toISOString().split("T")[0];
      const existing = salesByDate.get(dateKey) || { revenue: 0, orders: 0, profit: 0 };
      existing.revenue += parseFloat(order.total);
      existing.orders += 1;
      salesByDate.set(dateKey, existing);
    }

    // Calculate profit per order
    const orderItemsByOrder = new Map<string, typeof allOrderItems>();
    for (const item of allOrderItems) {
      const existing = orderItemsByOrder.get(item.orderId) || [];
      existing.push(item);
      orderItemsByOrder.set(item.orderId, existing);
    }

    for (const order of rangeOrders) {
      const dateKey = new Date(order.createdAt!).toISOString().split("T")[0];
      const items = orderItemsByOrder.get(order.id) || [];
      let orderProfit = 0;
      for (const item of items) {
        const product = productMap.get(item.productId);
        const revenue = parseFloat(item.unitPrice) * item.quantity;
        const cost = product?.cost ? parseFloat(product.cost) * item.quantity : 0;
        orderProfit += revenue - cost;
      }
      const existing = salesByDate.get(dateKey)!;
      existing.profit += orderProfit;
    }

    const salesTrends = Array.from(salesByDate.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Product Performance
    const productStats = new Map<string, { quantity: number; revenue: number; cost: number }>();
    for (const item of allOrderItems) {
      const product = productMap.get(item.productId);
      const revenue = parseFloat(item.unitPrice) * item.quantity;
      const cost = product?.cost ? parseFloat(product.cost) * item.quantity : 0;
      const existing = productStats.get(item.productId) || { quantity: 0, revenue: 0, cost: 0 };
      existing.quantity += item.quantity;
      existing.revenue += revenue;
      existing.cost += cost;
      productStats.set(item.productId, existing);
    }

    const productPerformance = Array.from(productStats.entries())
      .map(([id, stats]) => {
        const product = productMap.get(id);
        const profit = stats.revenue - stats.cost;
        const margin = stats.revenue > 0 ? (profit / stats.revenue) * 100 : 0;
        return {
          id,
          name: product?.name || null,
          quantity: stats.quantity,
          revenue: stats.revenue,
          cost: stats.cost,
          profit,
          margin: Math.round(margin * 100) / 100,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);

    // Employee Metrics
    const employeeStats = new Map<string, { salesCount: number; revenue: number }>();
    for (const order of rangeOrders) {
      const userId = order.userId;
      if (!userId) continue;
      const existing = employeeStats.get(userId) || { salesCount: 0, revenue: 0 };
      existing.salesCount += 1;
      existing.revenue += parseFloat(order.total);
      employeeStats.set(userId, existing);
    }

    const employeeMetrics = Array.from(employeeStats.entries())
      .map(([id, stats]) => {
        const user = userMap.get(id);
        return {
          id,
          name: user?.name || null,
          salesCount: stats.salesCount,
          revenue: stats.revenue,
          avgOrderValue: stats.salesCount > 0 ? stats.revenue / stats.salesCount : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    // Profit Analysis
    let totalRevenue = 0;
    let totalCost = 0;
    for (const item of allOrderItems) {
      const product = productMap.get(item.productId);
      totalRevenue += parseFloat(item.unitPrice) * item.quantity;
      totalCost += product?.cost ? parseFloat(product.cost) * item.quantity : 0;
    }
    const grossProfit = totalRevenue - totalCost;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    const topProfitProducts = productPerformance
      .filter(p => p.profit > 0)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5)
      .map(p => ({ name: p.name, profit: p.profit, margin: p.margin }));

    return {
      salesTrends,
      productPerformance,
      employeeMetrics,
      profitAnalysis: {
        totalRevenue,
        totalCost,
        grossProfit,
        grossMargin: Math.round(grossMargin * 100) / 100,
        topProfitProducts,
      },
    };
  }

  // System Settings
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return setting;
  }

  async getAllSystemSettings(): Promise<SystemSetting[]> {
    return db.select().from(systemSettings);
  }

  async upsertSystemSetting(key: string, value: Record<string, unknown>, updatedBy?: string): Promise<SystemSetting> {
    const existing = await this.getSystemSetting(key);
    if (existing) {
      const [updated] = await db
        .update(systemSettings)
        .set({ value, updatedAt: new Date(), updatedBy })
        .where(eq(systemSettings.key, key))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(systemSettings)
      .values({ key, value, updatedBy })
      .returning();
    return created;
  }

  // Password Reset Tokens
  async createPasswordResetToken(data: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const [token] = await db.insert(passwordResetTokens).values(data).returning();
    return token;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [result] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    return result;
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.token, token));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  // Email Templates
  async getEmailTemplate(type: string): Promise<EmailTemplate | undefined> {
    const [template] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.type, type as EmailTemplate["type"]));
    return template;
  }

  async getAllEmailTemplates(): Promise<EmailTemplate[]> {
    return db.select().from(emailTemplates);
  }

  async upsertEmailTemplate(data: InsertEmailTemplate): Promise<EmailTemplate> {
    const existing = await this.getEmailTemplate(data.type);
    if (existing) {
      const [updated] = await db
        .update(emailTemplates)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(emailTemplates.type, data.type))
        .returning();
      return updated;
    }
    const [created] = await db.insert(emailTemplates).values(data).returning();
    return created;
  }

  // Email Logs
  async createEmailLog(data: InsertEmailLog): Promise<EmailLog> {
    const [log] = await db.insert(emailLogs).values(data).returning();
    return log;
  }

  async getEmailLogs(limit = 100): Promise<EmailLog[]> {
    return db
      .select()
      .from(emailLogs)
      .orderBy(desc(emailLogs.sentAt))
      .limit(limit);
  }

  // Subscription Plans
  async getActiveSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true)).orderBy(subscriptionPlans.sortOrder);
  }

  async getTenantSubscription(tenantId: string): Promise<Subscription | null> {
    const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId)).orderBy(desc(subscriptions.createdAt)).limit(1);
    return subscription || null;
  }

  async createSubscription(data: { tenantId: string; planId: string; billingPeriod: string; paypalOrderId: string }): Promise<Subscription> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + (data.billingPeriod === "yearly" ? 12 : 1));
    
    const [created] = await db.insert(subscriptions).values({
      tenantId: data.tenantId,
      planId: data.planId,
      billingPeriod: data.billingPeriod,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    }).returning();
    return created;
  }

  // ============================================================
  // INGREDIENT INVENTORY (Pro feature for restaurants)
  // ============================================================

  // Ingredients
  async getIngredientsByTenant(tenantId: string): Promise<Ingredient[]> {
    return db.select().from(ingredients).where(eq(ingredients.tenantId, tenantId)).orderBy(ingredients.name);
  }

  async getIngredient(id: string): Promise<Ingredient | undefined> {
    const [ingredient] = await db.select().from(ingredients).where(eq(ingredients.id, id));
    return ingredient;
  }

  async createIngredient(ingredient: InsertIngredient): Promise<Ingredient> {
    const [created] = await db.insert(ingredients).values(ingredient).returning();
    return created;
  }

  async updateIngredient(id: string, data: Partial<InsertIngredient>): Promise<Ingredient | undefined> {
    const [updated] = await db.update(ingredients).set({ ...data, updatedAt: new Date() }).where(eq(ingredients.id, id)).returning();
    return updated;
  }

  async deleteIngredient(id: string): Promise<void> {
    await db.delete(ingredients).where(eq(ingredients.id, id));
  }

  // Ingredient Lots
  async getIngredientLots(tenantId: string, ingredientId?: string): Promise<IngredientLot[]> {
    if (ingredientId) {
      return db.select().from(ingredientLots)
        .where(and(eq(ingredientLots.tenantId, tenantId), eq(ingredientLots.ingredientId, ingredientId)))
        .orderBy(desc(ingredientLots.receivedAt));
    }
    return db.select().from(ingredientLots)
      .where(eq(ingredientLots.tenantId, tenantId))
      .orderBy(desc(ingredientLots.receivedAt));
  }

  async getIngredientLot(id: string): Promise<IngredientLot | undefined> {
    const [lot] = await db.select().from(ingredientLots).where(eq(ingredientLots.id, id));
    return lot;
  }

  async createIngredientLot(lot: InsertIngredientLot): Promise<IngredientLot> {
    const [created] = await db.insert(ingredientLots).values(lot).returning();
    return created;
  }

  async updateIngredientLot(id: string, data: Partial<InsertIngredientLot>): Promise<IngredientLot | undefined> {
    const [updated] = await db.update(ingredientLots).set({ ...data, updatedAt: new Date() }).where(eq(ingredientLots.id, id)).returning();
    return updated;
  }

  async getAvailableLotsForIngredient(ingredientId: string): Promise<IngredientLot[]> {
    const today = new Date();
    return db.select().from(ingredientLots)
      .where(and(
        eq(ingredientLots.ingredientId, ingredientId),
        eq(ingredientLots.status, "open"),
        sql`CAST(${ingredientLots.qtyRemainingBase} AS DECIMAL) > 0`,
        or(
          isNull(ingredientLots.expiresAt),
          gte(ingredientLots.expiresAt, today)
        )
      ))
      .orderBy(asc(ingredientLots.expiresAt), asc(ingredientLots.receivedAt));
  }

  // Recipes
  async getRecipesByTenant(tenantId: string): Promise<Recipe[]> {
    return db.select().from(recipes).where(eq(recipes.tenantId, tenantId));
  }

  async getRecipeByProduct(productId: string): Promise<Recipe | undefined> {
    const [recipe] = await db.select().from(recipes)
      .where(and(eq(recipes.productId, productId), eq(recipes.isActive, true)));
    return recipe;
  }

  async getRecipe(id: string): Promise<Recipe | undefined> {
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
    return recipe;
  }

  async createRecipe(recipe: InsertRecipe): Promise<Recipe> {
    const [created] = await db.insert(recipes).values(recipe).returning();
    return created;
  }

  async updateRecipe(id: string, data: Partial<InsertRecipe>): Promise<Recipe | undefined> {
    const [updated] = await db.update(recipes).set({ ...data, updatedAt: new Date() }).where(eq(recipes.id, id)).returning();
    return updated;
  }

  async deleteRecipe(id: string): Promise<void> {
    await db.delete(recipeItems).where(eq(recipeItems.recipeId, id));
    await db.delete(recipes).where(eq(recipes.id, id));
  }

  // Recipe Items
  async getRecipeItems(recipeId: string): Promise<RecipeItem[]> {
    return db.select().from(recipeItems).where(eq(recipeItems.recipeId, recipeId));
  }

  async getRecipeItem(id: string): Promise<RecipeItem | undefined> {
    const [item] = await db.select().from(recipeItems).where(eq(recipeItems.id, id));
    return item;
  }

  async createRecipeItem(item: InsertRecipeItem): Promise<RecipeItem> {
    const [created] = await db.insert(recipeItems).values(item).returning();
    return created;
  }

  async updateRecipeItem(id: string, data: Partial<InsertRecipeItem>): Promise<RecipeItem | undefined> {
    const [updated] = await db.update(recipeItems).set(data).where(eq(recipeItems.id, id)).returning();
    return updated;
  }

  async deleteRecipeItem(id: string): Promise<void> {
    await db.delete(recipeItems).where(eq(recipeItems.id, id));
  }

  // Ingredient Movements
  async createIngredientMovement(movement: InsertIngredientMovement): Promise<IngredientMovement> {
    const [created] = await db.insert(ingredientMovements).values(movement).returning();
    return created;
  }

  async getIngredientMovements(tenantId: string, ingredientId?: string): Promise<IngredientMovement[]> {
    if (ingredientId) {
      return db.select().from(ingredientMovements)
        .where(and(eq(ingredientMovements.tenantId, tenantId), eq(ingredientMovements.ingredientId, ingredientId)))
        .orderBy(desc(ingredientMovements.occurredAt));
    }
    return db.select().from(ingredientMovements)
      .where(eq(ingredientMovements.tenantId, tenantId))
      .orderBy(desc(ingredientMovements.occurredAt));
  }

  // Ingredient Alerts
  async getIngredientAlerts(tenantId: string, acknowledged?: boolean): Promise<IngredientAlert[]> {
    if (acknowledged !== undefined) {
      return db.select().from(ingredientAlerts)
        .where(and(eq(ingredientAlerts.tenantId, tenantId), eq(ingredientAlerts.isAcknowledged, acknowledged)))
        .orderBy(desc(ingredientAlerts.createdAt));
    }
    return db.select().from(ingredientAlerts)
      .where(eq(ingredientAlerts.tenantId, tenantId))
      .orderBy(desc(ingredientAlerts.createdAt));
  }

  async getIngredientAlert(id: string): Promise<IngredientAlert | undefined> {
    const [alert] = await db.select().from(ingredientAlerts).where(eq(ingredientAlerts.id, id));
    return alert;
  }

  async createIngredientAlert(alert: InsertIngredientAlert): Promise<IngredientAlert> {
    const [created] = await db.insert(ingredientAlerts).values(alert).returning();
    return created;
  }

  async acknowledgeAlert(id: string, userId: string): Promise<IngredientAlert | undefined> {
    const [updated] = await db.update(ingredientAlerts)
      .set({ isAcknowledged: true, acknowledgedBy: userId, acknowledgedAt: new Date() })
      .where(eq(ingredientAlerts.id, id))
      .returning();
    return updated;
  }

  // Ingredient Stock Levels (computed from lots)
  async getIngredientStockLevels(tenantId: string): Promise<Record<string, number>> {
    const result = await db
      .select({
        ingredientId: ingredientLots.ingredientId,
        totalStock: sql<string>`SUM(CAST(${ingredientLots.qtyRemainingBase} AS DECIMAL))`.as("total_stock"),
      })
      .from(ingredientLots)
      .where(and(
        eq(ingredientLots.tenantId, tenantId),
        eq(ingredientLots.status, "open")
      ))
      .groupBy(ingredientLots.ingredientId);

    const levels: Record<string, number> = {};
    for (const row of result) {
      levels[row.ingredientId] = parseFloat(row.totalStock) || 0;
    }
    return levels;
  }

  // FIFO Ingredient Consumption - consumes from oldest lots first
  async consumeIngredientFifo(tenantId: string, ingredientId: string, qtyNeeded: number, orderId: string, userId?: string): Promise<void> {
    // Get open lots for this ingredient, ordered by expiration date (FIFO), then by creation date
    const lots = await db.select()
      .from(ingredientLots)
      .where(and(
        eq(ingredientLots.tenantId, tenantId),
        eq(ingredientLots.ingredientId, ingredientId),
        eq(ingredientLots.status, "open")
      ))
      .orderBy(
        sql`COALESCE(${ingredientLots.expiresAt}, '9999-12-31'::timestamp) ASC`,
        asc(ingredientLots.receivedAt)
      );

    let remaining = qtyNeeded;

    for (const lot of lots) {
      if (remaining <= 0) break;

      const lotQty = parseFloat(lot.qtyRemainingBase);
      const consumed = Math.min(lotQty, remaining);
      remaining -= consumed;

      const newQty = lotQty - consumed;
      const newStatus = newQty <= 0 ? "depleted" : "open";

      await db.update(ingredientLots)
        .set({
          qtyRemainingBase: newQty.toString(),
          status: newStatus,
        })
        .where(eq(ingredientLots.id, lot.id));

      // Record the movement
      await this.createIngredientMovement({
        tenantId,
        ingredientId,
        lotId: lot.id,
        locationId: lot.locationId,
        movementType: "sale_consumption",
        qtyDeltaBase: (-consumed).toString(),
        sourceType: "order",
        sourceId: orderId,
        notes: `Auto-consumed for order ${orderId}`,
        createdBy: userId || null,
      });
    }

    // If we couldn't fulfill the entire consumption, log a warning (stock shortage)
    if (remaining > 0) {
      console.warn(`Ingredient ${ingredientId}: Could not fulfill ${remaining} units - insufficient stock`);
      // Could also create an alert here for stock shortage
    }
  }

  // Pro Feature Check
  async hasTenantProFeature(tenantId: string, feature: string): Promise<boolean> {
    const subscription = await this.getTenantSubscription(tenantId);
    if (!subscription) return false;
    
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, subscription.planId));
    if (!plan) return false;
    
    const features = plan.features as string[] || [];
    return features.includes(feature);
  }
}

export const storage = new DatabaseStorage();
