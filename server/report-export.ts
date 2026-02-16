import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import { PassThrough } from "stream";

interface TenantInfo {
  name: string;
  address?: string | null;
  phone?: string | null;
  taxId?: string | null;
  currency?: string;
  logoUrl?: string | null;
}

interface ExportRequest {
  reportType: string;
  reportTitle: string;
  dateRange: string;
  format: "pdf" | "excel";
  data: any;
  tenant: TenantInfo;
  language: string;
}

const LOCALE_MAP: Record<string, string> = { en: "en-US", es: "es-ES", pt: "pt-BR" };

function getLocale(language: string): string {
  return LOCALE_MAP[language] || "en-US";
}

function formatCurrencyValue(value: number, currency: string, language: string): string {
  try {
    return new Intl.NumberFormat(getLocale(language), { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `$${value.toLocaleString(getLocale(language))}`;
  }
}

function formatPercent(value: number, language: string): string {
  return new Intl.NumberFormat(getLocale(language), { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
}

function formatDate(dateStr: string, language: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(getLocale(language), { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

const EXPORT_LABELS: Record<string, Record<string, string>> = {
  en: {
    summary: "Summary", total_sales: "Total Sales", total_orders: "Total Orders", avg_order_value: "Average Order Value",
    sales_trend: "Sales Trend", top_products: "Top Products", product: "Product", quantity: "Quantity", revenue: "Revenue",
    sales_by_hour: "Sales by Hour", hour: "Hour", sales: "Sales", sales_trends: "Sales Trends", date: "Date", orders: "Orders",
    profit: "Profit", product_performance: "Product Performance", qty: "Qty", cost: "Cost", margin: "Margin",
    profit_analysis: "Profit Analysis", metric: "Metric", value: "Value", total_revenue: "Total Revenue", total_cost: "Total Cost",
    gross_profit: "Gross Profit", gross_margin: "Gross Margin", payment_breakdown: "Payment Breakdown", method: "Method",
    count: "Count", total: "Total", percentage: "Percentage", daily_payments: "Daily Payments", cash: "Cash", card: "Card",
    average_by_method: "Average by Method", avg_amount: "Average Amount", refund_summary: "Refund Summary",
    total_refunds: "Total Refunds", refund_count: "Refund Count", top_customers: "Top Customers", customer: "Customer",
    total_spent: "Total Spent", avg_order: "Avg Order", customer_segments: "Customer Segments", segment: "Segment",
    new_customers: "New Customers", returning_customers: "Returning Customers", metrics: "Metrics",
    avg_basket_size: "Average Basket Size", register_metrics: "Register Metrics", register: "Register",
    avg_ticket: "Avg Ticket", sessions: "Sessions", cash_variance: "Cash Variance", expected: "Expected",
    actual: "Actual", variance: "Variance", category_breakdown: "Category Breakdown", category: "Category",
    items_sold: "Items Sold", top_products_by_category: "Top Products by Category", discount_summary: "Discount Summary",
    total_discounts: "Total Discounts", orders_with_discount: "Orders with Discount", avg_discount_pct: "Avg Discount %",
    daily_discounts: "Daily Discounts", discount_total: "Discount Total", revenue_total: "Revenue Total",
    discount_orders: "Discount Orders", inventory_turnover: "Inventory Turnover", sold: "Sold", stock: "Stock",
    turnover_rate: "Turnover Rate", days_of_stock: "Days of Stock", cost_value: "Cost Value", total_products: "Total Products",
    avg_turnover_rate: "Avg Turnover Rate", fast_moving: "Fast Moving", slow_moving: "Slow Moving", no_movement: "No Movement",
    tax_summary: "Tax Summary", total_tax_collected: "Total Tax Collected", avg_tax_per_order: "Avg Tax per Order",
    effective_tax_rate: "Effective Tax Rate", daily_tax: "Daily Tax", tax_total: "Tax Total", subtotal: "Subtotal",
    tax_by_method: "Tax by Payment Method", order_count: "Order Count", peak_hours: "Peak Hours",
    busiest_day: "Busiest Day", busiest_hour: "Busiest Hour", heatmap_data: "Heatmap Data", day: "Day",
    employee_rankings: "Employee Rankings", rank: "Rank", name: "Name", role: "Role", active_days: "Active Days",
    orders_per_day: "Orders/Day", total_employees: "Total Employees", top_performer: "Top Performer",
    avg_revenue_per_employee: "Avg Revenue per Employee", financial_overview: "Financial Overview",
    total_tax: "Total Tax", net_revenue: "Net Revenue", avg_order_value_short: "Avg Order Value",
    daily_financials: "Daily Financials", tax: "Tax", discounts: "Discounts",
    monthly_comparison: "Monthly Comparison", month: "Month", report_data: "Report Data", key: "Key",
    period: "Period", generated: "Generated", page: "Page", of: "of",
    company: "Company", address: "Address", phone: "Phone", tax_id: "Tax ID", report: "Report",
  },
  es: {
    summary: "Resumen", total_sales: "Ventas Totales", total_orders: "Total Pedidos", avg_order_value: "Valor Promedio del Pedido",
    sales_trend: "Tendencia de Ventas", top_products: "Productos Principales", product: "Producto", quantity: "Cantidad", revenue: "Ingresos",
    sales_by_hour: "Ventas por Hora", hour: "Hora", sales: "Ventas", sales_trends: "Tendencias de Ventas", date: "Fecha", orders: "Pedidos",
    profit: "Ganancia", product_performance: "Rendimiento de Productos", qty: "Cant", cost: "Costo", margin: "Margen",
    profit_analysis: "Analisis de Ganancias", metric: "Metrica", value: "Valor", total_revenue: "Ingresos Totales", total_cost: "Costo Total",
    gross_profit: "Ganancia Bruta", gross_margin: "Margen Bruto", payment_breakdown: "Desglose de Pagos", method: "Metodo",
    count: "Cantidad", total: "Total", percentage: "Porcentaje", daily_payments: "Pagos Diarios", cash: "Efectivo", card: "Tarjeta",
    average_by_method: "Promedio por Metodo", avg_amount: "Monto Promedio", refund_summary: "Resumen de Reembolsos",
    total_refunds: "Reembolsos Totales", refund_count: "Cantidad de Reembolsos", top_customers: "Mejores Clientes", customer: "Cliente",
    total_spent: "Total Gastado", avg_order: "Pedido Promedio", customer_segments: "Segmentos de Clientes", segment: "Segmento",
    new_customers: "Clientes Nuevos", returning_customers: "Clientes Recurrentes", metrics: "Metricas",
    avg_basket_size: "Tamano Promedio de Canasta", register_metrics: "Metricas de Cajas", register: "Caja",
    avg_ticket: "Ticket Promedio", sessions: "Sesiones", cash_variance: "Variacion de Efectivo", expected: "Esperado",
    actual: "Real", variance: "Variacion", category_breakdown: "Desglose por Categoria", category: "Categoria",
    items_sold: "Articulos Vendidos", top_products_by_category: "Productos Principales por Categoria", discount_summary: "Resumen de Descuentos",
    total_discounts: "Descuentos Totales", orders_with_discount: "Pedidos con Descuento", avg_discount_pct: "% Descuento Promedio",
    daily_discounts: "Descuentos Diarios", discount_total: "Total Descuentos", revenue_total: "Total Ingresos",
    discount_orders: "Pedidos con Descuento", inventory_turnover: "Rotacion de Inventario", sold: "Vendido", stock: "Stock",
    turnover_rate: "Tasa de Rotacion", days_of_stock: "Dias de Stock", cost_value: "Valor de Costo", total_products: "Total Productos",
    avg_turnover_rate: "Tasa Promedio de Rotacion", fast_moving: "Mov. Rapido", slow_moving: "Mov. Lento", no_movement: "Sin Movimiento",
    tax_summary: "Resumen de Impuestos", total_tax_collected: "Total Impuestos Recaudados", avg_tax_per_order: "Impuesto Promedio por Pedido",
    effective_tax_rate: "Tasa Impositiva Efectiva", daily_tax: "Impuestos Diarios", tax_total: "Total Impuestos", subtotal: "Subtotal",
    tax_by_method: "Impuestos por Metodo de Pago", order_count: "Cantidad de Pedidos", peak_hours: "Horas Pico",
    busiest_day: "Dia mas Activo", busiest_hour: "Hora mas Activa", heatmap_data: "Datos del Mapa de Calor", day: "Dia",
    employee_rankings: "Ranking de Empleados", rank: "Posicion", name: "Nombre", role: "Rol", active_days: "Dias Activos",
    orders_per_day: "Pedidos/Dia", total_employees: "Total Empleados", top_performer: "Mejor Empleado",
    avg_revenue_per_employee: "Ingreso Promedio por Empleado", financial_overview: "Resumen Financiero",
    total_tax: "Total Impuestos", net_revenue: "Ingresos Netos", avg_order_value_short: "Valor Promedio de Pedido",
    daily_financials: "Finanzas Diarias", tax: "Impuesto", discounts: "Descuentos",
    monthly_comparison: "Comparacion Mensual", month: "Mes", report_data: "Datos del Reporte", key: "Clave",
    period: "Periodo", generated: "Generado", page: "Pagina", of: "de",
    company: "Empresa", address: "Direccion", phone: "Telefono", tax_id: "NIT", report: "Reporte",
  },
  pt: {
    summary: "Resumo", total_sales: "Vendas Totais", total_orders: "Total de Pedidos", avg_order_value: "Valor Medio do Pedido",
    sales_trend: "Tendencia de Vendas", top_products: "Principais Produtos", product: "Produto", quantity: "Quantidade", revenue: "Receita",
    sales_by_hour: "Vendas por Hora", hour: "Hora", sales: "Vendas", sales_trends: "Tendencias de Vendas", date: "Data", orders: "Pedidos",
    profit: "Lucro", product_performance: "Desempenho de Produtos", qty: "Qtd", cost: "Custo", margin: "Margem",
    profit_analysis: "Analise de Lucro", metric: "Metrica", value: "Valor", total_revenue: "Receita Total", total_cost: "Custo Total",
    gross_profit: "Lucro Bruto", gross_margin: "Margem Bruta", payment_breakdown: "Detalhamento de Pagamentos", method: "Metodo",
    count: "Quantidade", total: "Total", percentage: "Porcentagem", daily_payments: "Pagamentos Diarios", cash: "Dinheiro", card: "Cartao",
    average_by_method: "Media por Metodo", avg_amount: "Valor Medio", refund_summary: "Resumo de Reembolsos",
    total_refunds: "Total de Reembolsos", refund_count: "Qtd de Reembolsos", top_customers: "Melhores Clientes", customer: "Cliente",
    total_spent: "Total Gasto", avg_order: "Pedido Medio", customer_segments: "Segmentos de Clientes", segment: "Segmento",
    new_customers: "Novos Clientes", returning_customers: "Clientes Recorrentes", metrics: "Metricas",
    avg_basket_size: "Tamanho Medio da Cesta", register_metrics: "Metricas de Caixas", register: "Caixa",
    avg_ticket: "Ticket Medio", sessions: "Sessoes", cash_variance: "Variacao de Caixa", expected: "Esperado",
    actual: "Real", variance: "Variacao", category_breakdown: "Detalhamento por Categoria", category: "Categoria",
    items_sold: "Itens Vendidos", top_products_by_category: "Principais Produtos por Categoria", discount_summary: "Resumo de Descontos",
    total_discounts: "Descontos Totais", orders_with_discount: "Pedidos com Desconto", avg_discount_pct: "% Desconto Medio",
    daily_discounts: "Descontos Diarios", discount_total: "Total Descontos", revenue_total: "Total Receita",
    discount_orders: "Pedidos com Desconto", inventory_turnover: "Giro de Estoque", sold: "Vendido", stock: "Estoque",
    turnover_rate: "Taxa de Giro", days_of_stock: "Dias de Estoque", cost_value: "Valor de Custo", total_products: "Total Produtos",
    avg_turnover_rate: "Taxa Media de Giro", fast_moving: "Mov. Rapido", slow_moving: "Mov. Lento", no_movement: "Sem Movimento",
    tax_summary: "Resumo de Impostos", total_tax_collected: "Total Impostos Arrecadados", avg_tax_per_order: "Imposto Medio por Pedido",
    effective_tax_rate: "Taxa Efetiva de Impostos", daily_tax: "Impostos Diarios", tax_total: "Total Impostos", subtotal: "Subtotal",
    tax_by_method: "Impostos por Metodo de Pagamento", order_count: "Qtd de Pedidos", peak_hours: "Horarios de Pico",
    busiest_day: "Dia Mais Movimentado", busiest_hour: "Hora Mais Movimentada", heatmap_data: "Dados do Mapa de Calor", day: "Dia",
    employee_rankings: "Ranking de Funcionarios", rank: "Posicao", name: "Nome", role: "Funcao", active_days: "Dias Ativos",
    orders_per_day: "Pedidos/Dia", total_employees: "Total Funcionarios", top_performer: "Melhor Funcionario",
    avg_revenue_per_employee: "Receita Media por Funcionario", financial_overview: "Resumo Financeiro",
    total_tax: "Total Impostos", net_revenue: "Receita Liquida", avg_order_value_short: "Valor Medio de Pedido",
    daily_financials: "Financas Diarias", tax: "Imposto", discounts: "Descontos",
    monthly_comparison: "Comparacao Mensal", month: "Mes", report_data: "Dados do Relatorio", key: "Chave",
    period: "Periodo", generated: "Gerado", page: "Pagina", of: "de",
    company: "Empresa", address: "Endereco", phone: "Telefone", tax_id: "CNPJ", report: "Relatorio",
  },
};

function t(key: string, language: string): string {
  return EXPORT_LABELS[language]?.[key] || EXPORT_LABELS.en[key] || key;
}

function getReportSections(reportType: string, data: any, currency: string, language: string): { title: string; headers: string[]; rows: (string | number)[][] }[] {
  const fmt = (v: number) => formatCurrencyValue(v, currency, language);
  const pct = (v: number) => formatPercent(v, language);
  const dt = (v: string) => formatDate(v, language);
  const sections: { title: string; headers: string[]; rows: (string | number)[][] }[] = [];

  const l = language;
  switch (reportType) {
    case "overview": {
      sections.push({
        title: t("summary", l),
        headers: [t("metric", l), t("value", l)],
        rows: [
          [t("total_sales", l), fmt(data.todaySales || 0)],
          [t("total_orders", l), data.todayOrders || 0],
          [t("avg_order_value", l), fmt(data.averageOrderValue || 0)],
          [t("sales_trend", l), pct(data.recentTrend || 0)],
        ],
      });
      if (data.topProducts?.length) {
        sections.push({
          title: t("top_products", l),
          headers: [t("product", l), t("quantity", l), t("revenue", l)],
          rows: data.topProducts.map((p: any) => [p.name, p.quantity, fmt(p.revenue)]),
        });
      }
      if (data.salesByHour?.length) {
        sections.push({
          title: t("sales_by_hour", l),
          headers: [t("hour", l), t("sales", l)],
          rows: data.salesByHour.filter((h: any) => h.sales > 0).map((h: any) => [h.hour, fmt(h.sales)]),
        });
      }
      break;
    }
    case "sales_trends": {
      if (data.salesTrends?.length) {
        sections.push({
          title: t("sales_trends", l),
          headers: [t("date", l), t("revenue", l), t("orders", l), t("profit", l)],
          rows: data.salesTrends.map((r: any) => [dt(r.date), fmt(r.revenue), r.orders, fmt(r.profit)]),
        });
      }
      if (data.productPerformance?.length) {
        sections.push({
          title: t("product_performance", l),
          headers: [t("product", l), t("qty", l), t("revenue", l), t("cost", l), t("profit", l), t("margin", l)],
          rows: data.productPerformance.map((p: any) => [p.name, p.quantity, fmt(p.revenue), fmt(p.cost), fmt(p.profit), pct(p.margin)]),
        });
      }
      if (data.profitAnalysis) {
        const pa = data.profitAnalysis;
        sections.push({
          title: t("profit_analysis", l),
          headers: [t("metric", l), t("value", l)],
          rows: [
            [t("total_revenue", l), fmt(pa.totalRevenue)],
            [t("total_cost", l), fmt(pa.totalCost)],
            [t("gross_profit", l), fmt(pa.grossProfit)],
            [t("gross_margin", l), pct(pa.grossMargin)],
          ],
        });
      }
      break;
    }
    case "payment_methods": {
      if (data.paymentBreakdown?.length) {
        sections.push({
          title: t("payment_breakdown", l),
          headers: [t("method", l), t("count", l), t("total", l), t("percentage", l)],
          rows: data.paymentBreakdown.map((p: any) => [p.method, p.count, fmt(p.total), pct(p.percentage)]),
        });
      }
      if (data.dailyPayments?.length) {
        sections.push({
          title: t("daily_payments", l),
          headers: [t("date", l), t("cash", l), t("card", l)],
          rows: data.dailyPayments.map((d: any) => [dt(d.date), fmt(d.cash), fmt(d.card)]),
        });
      }
      if (data.averageByMethod?.length) {
        sections.push({
          title: t("average_by_method", l),
          headers: [t("method", l), t("avg_amount", l)],
          rows: data.averageByMethod.map((a: any) => [a.method, fmt(a.avgAmount)]),
        });
      }
      if (data.refundSummary) {
        sections.push({
          title: t("refund_summary", l),
          headers: [t("metric", l), t("value", l)],
          rows: [
            [t("total_refunds", l), fmt(data.refundSummary.totalRefunds)],
            [t("refund_count", l), data.refundSummary.refundCount],
          ],
        });
      }
      break;
    }
    case "customer_analytics": {
      if (data.topCustomers?.length) {
        sections.push({
          title: t("top_customers", l),
          headers: [t("customer", l), t("orders", l), t("total_spent", l), t("avg_order", l)],
          rows: data.topCustomers.map((c: any) => [c.name, c.orderCount, fmt(c.totalSpent), fmt(c.avgOrder)]),
        });
      }
      if (data.newVsReturning) {
        sections.push({
          title: t("customer_segments", l),
          headers: [t("segment", l), t("count", l)],
          rows: [
            [t("new_customers", l), data.newVsReturning.newCustomers],
            [t("returning_customers", l), data.newVsReturning.returningCustomers],
          ],
        });
      }
      sections.push({
        title: t("metrics", l),
        headers: [t("metric", l), t("value", l)],
        rows: [[t("avg_basket_size", l), fmt(data.averageBasketSize || 0)]],
      });
      break;
    }
    case "register_performance": {
      if (data.registerMetrics?.length) {
        sections.push({
          title: t("register_metrics", l),
          headers: [t("register", l), t("sales", l), t("revenue", l), t("avg_ticket", l), t("sessions", l)],
          rows: data.registerMetrics.map((r: any) => [r.registerName, r.salesCount, fmt(r.totalRevenue), fmt(r.avgTicket), r.sessionsCount]),
        });
      }
      if (data.cashVariance?.length) {
        sections.push({
          title: t("cash_variance", l),
          headers: [t("register", l), t("expected", l), t("actual", l), t("variance", l)],
          rows: data.cashVariance.map((c: any) => [c.registerName, fmt(c.expectedCash), fmt(c.actualCash), fmt(c.variance)]),
        });
      }
      break;
    }
    case "sales_by_category": {
      if (data.categoryBreakdown?.length) {
        sections.push({
          title: t("category_breakdown", l),
          headers: [t("category", l), t("orders", l), t("items_sold", l), t("revenue", l), t("cost", l), t("profit", l), "%"],
          rows: data.categoryBreakdown.map((c: any) => [c.name, c.orderCount, c.itemsSold, fmt(c.revenue), fmt(c.cost), fmt(c.profit), pct(c.percentage)]),
        });
      }
      if (data.topCategoryProducts?.length) {
        sections.push({
          title: t("top_products_by_category", l),
          headers: [t("category", l), t("product", l), t("quantity", l), t("revenue", l)],
          rows: data.topCategoryProducts.map((p: any) => [p.category, p.productName, p.quantity, fmt(p.revenue)]),
        });
      }
      break;
    }
    case "discount_analysis": {
      if (data.discountSummary) {
        const ds = data.discountSummary;
        sections.push({
          title: t("discount_summary", l),
          headers: [t("metric", l), t("value", l)],
          rows: [
            [t("total_discounts", l), fmt(ds.totalDiscounts)],
            [t("orders_with_discount", l), ds.ordersWithDiscount],
            [t("total_orders", l), ds.totalOrders],
            [t("avg_discount_pct", l), pct(ds.avgDiscountPercent)],
          ],
        });
      }
      if (data.dailyDiscounts?.length) {
        sections.push({
          title: t("daily_discounts", l),
          headers: [t("date", l), t("discount_total", l), t("revenue_total", l), t("discount_orders", l)],
          rows: data.dailyDiscounts.map((d: any) => [dt(d.date), fmt(d.discountTotal), fmt(d.revenueTotal), d.discountOrders]),
        });
      }
      break;
    }
    case "inventory_turnover": {
      if (data.turnoverMetrics?.length) {
        sections.push({
          title: t("inventory_turnover", l),
          headers: [t("product", l), t("category", l), t("sold", l), t("stock", l), t("turnover_rate", l), t("days_of_stock", l), t("cost_value", l)],
          rows: data.turnoverMetrics.map((m: any) => [m.name, m.category, m.totalSold, m.stockOnHand, m.turnoverRate.toFixed(2), m.daysOfStock, fmt(m.costValue)]),
        });
      }
      if (data.summary) {
        sections.push({
          title: t("summary", l),
          headers: [t("metric", l), t("value", l)],
          rows: [
            [t("total_products", l), data.summary.totalProducts],
            [t("avg_turnover_rate", l), data.summary.avgTurnoverRate.toFixed(2)],
            [t("fast_moving", l), data.summary.fastMoving],
            [t("slow_moving", l), data.summary.slowMoving],
            [t("no_movement", l), data.summary.noMovement],
          ],
        });
      }
      break;
    }
    case "tax_summary": {
      if (data.taxSummary) {
        const ts = data.taxSummary;
        sections.push({
          title: t("tax_summary", l),
          headers: [t("metric", l), t("value", l)],
          rows: [
            [t("total_tax_collected", l), fmt(ts.totalTaxCollected)],
            [t("total_orders", l), ts.totalOrders],
            [t("avg_tax_per_order", l), fmt(ts.avgTaxPerOrder)],
            [t("effective_tax_rate", l), pct(ts.effectiveTaxRate)],
          ],
        });
      }
      if (data.dailyTax?.length) {
        sections.push({
          title: t("daily_tax", l),
          headers: [t("date", l), t("tax_total", l), t("subtotal", l), t("revenue", l)],
          rows: data.dailyTax.map((d: any) => [dt(d.date), fmt(d.taxTotal), fmt(d.subtotal), fmt(d.revenue)]),
        });
      }
      if (data.taxByMethod?.length) {
        sections.push({
          title: t("tax_by_method", l),
          headers: [t("method", l), t("tax_total", l), t("order_count", l)],
          rows: data.taxByMethod.map((tm: any) => [tm.method, fmt(tm.taxTotal), tm.orderCount]),
        });
      }
      break;
    }
    case "hourly_heatmap": {
      if (data.peakHours?.length) {
        sections.push({
          title: t("peak_hours", l),
          headers: [t("hour", l), t("orders", l), t("revenue", l)],
          rows: data.peakHours.map((h: any) => [h.hour, h.orderCount, fmt(h.revenue)]),
        });
      }
      if (data.summary) {
        sections.push({
          title: t("summary", l),
          headers: [t("metric", l), t("value", l)],
          rows: [
            [t("busiest_day", l), data.summary.busiestDay],
            [t("busiest_hour", l), data.summary.busiestHour],
            [t("total_sales", l), fmt(data.summary.totalSales)],
          ],
        });
      }
      if (data.heatmapData?.length) {
        sections.push({
          title: t("heatmap_data", l),
          headers: [t("day", l), t("hour", l), t("orders", l), t("revenue", l)],
          rows: data.heatmapData.map((h: any) => [h.dayName, h.hourLabel, h.orderCount, fmt(h.revenue)]),
        });
      }
      break;
    }
    case "employee_productivity": {
      if (data.employeeRankings?.length) {
        sections.push({
          title: t("employee_rankings", l),
          headers: [t("rank", l), t("name", l), t("role", l), t("orders", l), t("revenue", l), t("avg_order", l), t("active_days", l), t("orders_per_day", l)],
          rows: data.employeeRankings.map((e: any) => [e.rank, e.name, e.role, e.totalOrders, fmt(e.totalRevenue), fmt(e.avgOrderValue), e.activeDays, e.ordersPerDay]),
        });
      }
      if (data.summary) {
        sections.push({
          title: t("summary", l),
          headers: [t("metric", l), t("value", l)],
          rows: [
            [t("total_employees", l), data.summary.totalEmployees],
            [t("top_performer", l), data.summary.topPerformer],
            [t("avg_revenue_per_employee", l), fmt(data.summary.avgRevenuePerEmployee)],
          ],
        });
      }
      break;
    }
    case "financial_summary": {
      if (data.overview) {
        const ov = data.overview;
        sections.push({
          title: t("financial_overview", l),
          headers: [t("metric", l), t("value", l)],
          rows: [
            [t("total_revenue", l), fmt(ov.totalRevenue)],
            [t("total_cost", l), fmt(ov.totalCost)],
            [t("gross_profit", l), fmt(ov.grossProfit)],
            [t("gross_margin", l), pct(ov.grossMargin)],
            [t("total_tax", l), fmt(ov.totalTax)],
            [t("total_discounts", l), fmt(ov.totalDiscounts)],
            [t("net_revenue", l), fmt(ov.netRevenue)],
            [t("total_refunds", l), fmt(ov.totalRefunds)],
            [t("order_count", l), ov.orderCount],
            [t("avg_order_value_short", l), fmt(ov.avgOrderValue)],
          ],
        });
      }
      if (data.dailyFinancials?.length) {
        sections.push({
          title: t("daily_financials", l),
          headers: [t("date", l), t("revenue", l), t("cost", l), t("profit", l), t("tax", l), t("discounts", l), t("orders", l)],
          rows: data.dailyFinancials.map((d: any) => [dt(d.date), fmt(d.revenue), fmt(d.cost), fmt(d.profit), fmt(d.tax), fmt(d.discounts), d.orders]),
        });
      }
      if (data.monthlyComparison?.length) {
        sections.push({
          title: t("monthly_comparison", l),
          headers: [t("month", l), t("revenue", l), t("cost", l), t("profit", l), t("orders", l)],
          rows: data.monthlyComparison.map((m: any) => [m.month, fmt(m.revenue), fmt(m.cost), fmt(m.profit), m.orders]),
        });
      }
      break;
    }
    default:
      sections.push({
        title: t("report_data", l),
        headers: [t("key", l), t("value", l)],
        rows: Object.entries(data).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)]),
      });
  }

  return sections;
}

async function fetchImageAsBuffer(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

export async function generatePDF(request: ExportRequest): Promise<Buffer> {
  const { reportTitle, dateRange, data, tenant } = request;
  const currency = tenant.currency || "USD";
  const lang = request.language || "en";
  const sections = getReportSections(request.reportType, data, currency, lang);
  const taxIdLabel = lang === "pt" ? "CNPJ" : "NIT";

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      let logoBuffer: Buffer | null = null;
      const logoUrl = tenant.logoUrl;
      if (logoUrl) {
        logoBuffer = await fetchImageAsBuffer(logoUrl);
      }

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      let yPos = doc.y;

      if (logoBuffer) {
        try {
          doc.image(logoBuffer, doc.page.margins.left, yPos, { width: 80, height: 80, fit: [80, 80] });
          const infoX = doc.page.margins.left + 95;
          doc.fontSize(16).font("Helvetica-Bold").text(tenant.name, infoX, yPos + 5, { width: pageWidth - 95 });
          let infoY = yPos + 25;
          doc.fontSize(9).font("Helvetica");
          if (tenant.address) {
            doc.text(tenant.address, infoX, infoY, { width: pageWidth - 95 });
            infoY += 13;
          }
          if (tenant.phone) {
            doc.text(tenant.phone, infoX, infoY, { width: pageWidth - 95 });
            infoY += 13;
          }
          if (tenant.taxId) {
            doc.text(`${taxIdLabel}: ${tenant.taxId}`, infoX, infoY, { width: pageWidth - 95 });
            infoY += 13;
          }
          yPos = Math.max(yPos + 85, infoY + 5);
        } catch {
          doc.fontSize(16).font("Helvetica-Bold").text(tenant.name, doc.page.margins.left, yPos);
          yPos = doc.y + 5;
          doc.fontSize(9).font("Helvetica");
          if (tenant.address) { doc.text(tenant.address); yPos = doc.y; }
          if (tenant.phone) { doc.text(tenant.phone); yPos = doc.y; }
          if (tenant.taxId) { doc.text(`${taxIdLabel}: ${tenant.taxId}`); yPos = doc.y; }
          yPos += 10;
        }
      } else {
        doc.fontSize(16).font("Helvetica-Bold").text(tenant.name, doc.page.margins.left, yPos);
        yPos = doc.y + 3;
        doc.fontSize(9).font("Helvetica");
        if (tenant.address) { doc.text(tenant.address); yPos = doc.y; }
        if (tenant.phone) { doc.text(tenant.phone); yPos = doc.y; }
        if (tenant.taxId) { doc.text(`${taxIdLabel}: ${tenant.taxId}`); yPos = doc.y; }
        yPos += 10;
      }

      doc.moveTo(doc.page.margins.left, yPos).lineTo(doc.page.margins.left + pageWidth, yPos).stroke("#cccccc");
      yPos += 10;

      doc.fontSize(14).font("Helvetica-Bold").text(reportTitle, doc.page.margins.left, yPos);
      yPos = doc.y + 3;
      doc.fontSize(9).font("Helvetica").fillColor("#666666").text(`${t("period", lang)}: ${dateRange}`, doc.page.margins.left, yPos);
      yPos = doc.y + 3;
      doc.text(`${t("generated", lang)}: ${new Date().toLocaleDateString(getLocale(lang))}`, doc.page.margins.left, yPos);
      doc.fillColor("#000000");
      yPos = doc.y + 15;

      for (const section of sections) {
        if (yPos > doc.page.height - 120) {
          doc.addPage();
          yPos = doc.page.margins.top;
        }

        doc.fontSize(11).font("Helvetica-Bold").text(section.title, doc.page.margins.left, yPos);
        yPos = doc.y + 8;

        const colCount = section.headers.length;
        const colWidth = pageWidth / colCount;
        const rowHeight = 20;
        const cellPadding = 4;

        doc.rect(doc.page.margins.left, yPos, pageWidth, rowHeight).fill("#f0f0f0");
        doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold");
        for (let i = 0; i < colCount; i++) {
          doc.text(
            section.headers[i],
            doc.page.margins.left + i * colWidth + cellPadding,
            yPos + 5,
            { width: colWidth - cellPadding * 2, align: i === 0 ? "left" : "right" }
          );
        }
        yPos += rowHeight;

        doc.font("Helvetica").fontSize(8).fillColor("#000000");
        for (let rowIdx = 0; rowIdx < section.rows.length; rowIdx++) {
          if (yPos > doc.page.height - 60) {
            doc.addPage();
            yPos = doc.page.margins.top;
          }

          const row = section.rows[rowIdx];
          if (rowIdx % 2 === 1) {
            doc.rect(doc.page.margins.left, yPos, pageWidth, rowHeight).fill("#fafafa");
            doc.fillColor("#000000");
          }

          for (let i = 0; i < colCount; i++) {
            const cellValue = i < row.length ? String(row[i]) : "";
            doc.text(
              cellValue,
              doc.page.margins.left + i * colWidth + cellPadding,
              yPos + 5,
              { width: colWidth - cellPadding * 2, align: i === 0 ? "left" : "right" }
            );
          }
          yPos += rowHeight;
        }

        yPos += 15;
      }

      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.fontSize(7).fillColor("#999999").text(
          `${t("page", lang)} ${i + 1} ${t("of", lang)} ${totalPages}`,
          doc.page.margins.left,
          doc.page.height - 30,
          { width: pageWidth, align: "center" }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export function generateExcel(request: ExportRequest): Buffer {
  const { reportTitle, dateRange, data, tenant } = request;
  const currency = tenant.currency || "USD";
  const lang = request.language || "en";
  const sections = getReportSections(request.reportType, data, currency, lang);

  const wb = XLSX.utils.book_new();

  const infoSheet: (string | number)[][] = [
    [t("company", lang), tenant.name],
    [t("address", lang), tenant.address || ""],
    [t("phone", lang), tenant.phone || ""],
    [t("tax_id", lang), tenant.taxId || ""],
    [""],
    [t("report", lang), reportTitle],
    [t("period", lang), dateRange],
    [t("generated", lang), new Date().toLocaleDateString(getLocale(lang))],
  ];
  const infoWs = XLSX.utils.aoa_to_sheet(infoSheet);
  infoWs["!cols"] = [{ wch: 15 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, infoWs, "Info");

  for (const section of sections) {
    const sheetData: (string | number)[][] = [section.headers, ...section.rows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    const colWidths = section.headers.map((h, i) => {
      let maxLen = h.length;
      for (const row of section.rows) {
        if (i < row.length) {
          maxLen = Math.max(maxLen, String(row[i]).length);
        }
      }
      return { wch: Math.min(maxLen + 2, 30) };
    });
    ws["!cols"] = colWidths;

    let sheetName = section.title.substring(0, 31).replace(/[\\\/\?\*\[\]]/g, "");
    let suffix = 1;
    while (wb.SheetNames.includes(sheetName)) {
      sheetName = section.title.substring(0, 28) + ` ${suffix++}`;
    }
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}
