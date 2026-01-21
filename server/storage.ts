import {
  tenants, users, registers, registerSessions, categories, products,
  modifierGroups, modifiers, productModifierGroups, floors, tables,
  orders, orderItems, kitchenTickets, payments, stockMovements, auditLogs, customers,
  loyaltyTransactions, loyaltyRewards,
  type Tenant, type InsertTenant, type User, type InsertUser,
  type Register, type InsertRegister, type RegisterSession, type InsertRegisterSession,
  type Category, type InsertCategory, type Product, type InsertProduct,
  type Customer, type InsertCustomer,
  type LoyaltyTransaction, type InsertLoyaltyTransaction,
  type LoyaltyReward, type InsertLoyaltyReward,
  type ModifierGroup, type InsertModifierGroup, type Modifier, type InsertModifier,
  type Floor, type InsertFloor, type Table, type InsertTable,
  type Order, type InsertOrder, type OrderItem, type InsertOrderItem,
  type KitchenTicket, type InsertKitchenTicket, type Payment, type InsertPayment,
  type StockMovement, type InsertStockMovement,
  RETAIL_FEATURES, RESTAURANT_FEATURES,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, gte, or, ilike, inArray } from "drizzle-orm";
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
    return db.select().from(products).where(eq(products.tenantId, tenantId)).orderBy(products.sortOrder);
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
}

export const storage = new DatabaseStorage();
