import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { useState, useMemo } from "react";
import { CalendarIcon } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import {
  BarChart3,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  PiggyBank,
  UserCheck,
  Crown,
  CreditCard,
  Landmark,
  Wallet,
  RefreshCw,
  Receipt,
  Tag,
  RotateCw,
  FileText,
  Clock,
  Award,
  Calculator,
} from "lucide-react";
import { useSubscription } from "@/lib/use-subscription";

interface DashboardStats {
  todaySales: number;
  todayOrders: number;
  averageOrderValue: number;
  topProducts: { name: string; quantity: number; revenue: number }[];
  salesByHour: { hour: string; sales: number }[];
  salesByCategory: { name: string; value: number }[];
  recentTrend: number;
}

interface AdvancedAnalytics {
  salesTrends: { date: string; revenue: number; orders: number; profit: number }[];
  productPerformance: { id: string; name: string | null; quantity: number; revenue: number; cost: number; profit: number; margin: number }[];
  employeeMetrics: { id: string; name: string | null; salesCount: number; revenue: number; avgOrderValue: number }[];
  profitAnalysis: { totalRevenue: number; totalCost: number; grossProfit: number; grossMargin: number; topProfitProducts: { name: string; profit: number; margin: number }[] };
}

interface PaymentMethodsReport {
  paymentBreakdown: { method: string; count: number; total: number; percentage: number }[];
  dailyPayments: { date: string; cash: number; card: number }[];
  averageByMethod: { method: string; avgAmount: number }[];
  refundSummary: { totalRefunds: number; refundCount: number; topRefundReasons: { reason: string; count: number }[] };
}

interface CustomerAnalyticsReport {
  topCustomers: { id: string; name: string; orderCount: number; totalSpent: number; avgOrder: number }[];
  newVsReturning: { newCustomers: number; returningCustomers: number };
  averageBasketSize: number;
}

interface RegisterPerformanceReport {
  registerMetrics: { registerId: string; registerName: string; salesCount: number; totalRevenue: number; avgTicket: number; sessionsCount: number }[];
  cashVariance: { registerId: string; registerName: string; expectedCash: number; actualCash: number; variance: number }[];
}

interface SalesByCategoryReport {
  categoryBreakdown: { id: string; name: string; orderCount: number; itemsSold: number; revenue: number; cost: number; profit: number; percentage: number }[];
  dailyCategoryTrends: Record<string, any>[];
  topCategoryProducts: { category: string; productName: string; quantity: number; revenue: number }[];
}

interface DiscountAnalysisReport {
  discountSummary: { totalDiscounts: number; ordersWithDiscount: number; totalOrders: number; avgDiscountPercent: number };
  dailyDiscounts: { date: string; discountTotal: number; revenueTotal: number; discountOrders: number }[];
  discountByHour: { hour: string; discountTotal: number; discountOrders: number }[];
}

interface InventoryTurnoverReport {
  turnoverMetrics: { id: string; name: string; category: string; totalSold: number; stockOnHand: number; turnoverRate: number; daysOfStock: number; costValue: number }[];
  summary: { totalProducts: number; avgTurnoverRate: number; fastMoving: number; slowMoving: number; noMovement: number };
}

interface TaxSummaryReport {
  taxSummary: { totalTaxCollected: number; totalOrders: number; avgTaxPerOrder: number; effectiveTaxRate: number };
  dailyTax: { date: string; taxTotal: number; subtotal: number; revenue: number }[];
  taxByMethod: { method: string; taxTotal: number; orderCount: number }[];
}

interface HourlyHeatmapReport {
  heatmapData: { dayOfWeek: number; dayName: string; hour: number; hourLabel: string; orderCount: number; revenue: number }[];
  peakHours: { hour: string; orderCount: number; revenue: number }[];
  summary: { busiestDay: string; busiestHour: string; totalSales: number };
}

interface EmployeeProductivityReport {
  employeeRankings: { id: string; name: string; role: string; rank: number; totalOrders: number; totalRevenue: number; avgOrderValue: number; activeDays: number; totalDiscountsGiven: number; cancelledOrders: number; ordersPerDay: number }[];
  dailyEmployeePerformance: Record<string, any>[];
  summary: { totalEmployees: number; topPerformer: string; avgRevenuePerEmployee: number };
}

interface FinancialSummaryReport {
  overview: { totalRevenue: number; totalCost: number; grossProfit: number; grossMargin: number; totalTax: number; totalDiscounts: number; netRevenue: number; totalRefunds: number; orderCount: number; avgOrderValue: number };
  dailyFinancials: { date: string; revenue: number; cost: number; profit: number; tax: number; discounts: number; orders: number }[];
  monthlyComparison: { month: string; revenue: number; cost: number; profit: number; orders: number }[];
}

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

export default function ReportsPage() {
  const { tenant } = useAuth();
  const { t, formatDate, language } = useI18n();
  const locale = language === "es" ? "es-ES" : language === "pt" ? "pt-BR" : "en-US";
  const [dateRange, setDateRange] = useState("7d");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  const [appliedStartDate, setAppliedStartDate] = useState<Date | undefined>(undefined);
  const [appliedEndDate, setAppliedEndDate] = useState<Date | undefined>(undefined);
  const [reportGroup, setReportGroup] = useState("basic");
  const [activeReport, setActiveReport] = useState("overview");

  const analyticsQueryKey = useMemo(() => {
    if (dateRange === "custom" && appliedStartDate && appliedEndDate) {
      return `/api/reports/analytics?startDate=${appliedStartDate.toISOString()}&endDate=${appliedEndDate.toISOString()}`;
    }
    return `/api/reports/analytics?range=${dateRange}`;
  }, [dateRange, appliedStartDate, appliedEndDate]);

  const dashboardQueryKey = useMemo(() => {
    if (dateRange === "custom" && appliedStartDate && appliedEndDate) {
      return `/api/reports/dashboard?startDate=${appliedStartDate.toISOString()}&endDate=${appliedEndDate.toISOString()}`;
    }
    return `/api/reports/dashboard?range=${dateRange}`;
  }, [dateRange, appliedStartDate, appliedEndDate]);

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: [dashboardQueryKey],
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AdvancedAnalytics>({
    queryKey: [analyticsQueryKey],
  });

  const { hasFeature } = useSubscription();

  const paymentMethodsQuery = useMemo(() => {
    if (dateRange === "custom" && appliedStartDate && appliedEndDate) {
      return `/api/reports/payment-methods?startDate=${appliedStartDate.toISOString()}&endDate=${appliedEndDate.toISOString()}`;
    }
    return `/api/reports/payment-methods?range=${dateRange}`;
  }, [dateRange, appliedStartDate, appliedEndDate]);

  const customerAnalyticsQuery = useMemo(() => {
    if (dateRange === "custom" && appliedStartDate && appliedEndDate) {
      return `/api/reports/customer-analytics?startDate=${appliedStartDate.toISOString()}&endDate=${appliedEndDate.toISOString()}`;
    }
    return `/api/reports/customer-analytics?range=${dateRange}`;
  }, [dateRange, appliedStartDate, appliedEndDate]);

  const registerPerformanceQuery = useMemo(() => {
    if (dateRange === "custom" && appliedStartDate && appliedEndDate) {
      return `/api/reports/register-performance?startDate=${appliedStartDate.toISOString()}&endDate=${appliedEndDate.toISOString()}`;
    }
    return `/api/reports/register-performance?range=${dateRange}`;
  }, [dateRange, appliedStartDate, appliedEndDate]);

  const salesByCategoryQuery = useMemo(() => {
    if (dateRange === "custom" && appliedStartDate && appliedEndDate) {
      return `/api/reports/sales-by-category?startDate=${appliedStartDate.toISOString()}&endDate=${appliedEndDate.toISOString()}`;
    }
    return `/api/reports/sales-by-category?range=${dateRange}`;
  }, [dateRange, appliedStartDate, appliedEndDate]);

  const discountAnalysisQuery = useMemo(() => {
    if (dateRange === "custom" && appliedStartDate && appliedEndDate) {
      return `/api/reports/discount-analysis?startDate=${appliedStartDate.toISOString()}&endDate=${appliedEndDate.toISOString()}`;
    }
    return `/api/reports/discount-analysis?range=${dateRange}`;
  }, [dateRange, appliedStartDate, appliedEndDate]);

  const inventoryTurnoverQuery = useMemo(() => {
    if (dateRange === "custom" && appliedStartDate && appliedEndDate) {
      return `/api/reports/inventory-turnover?startDate=${appliedStartDate.toISOString()}&endDate=${appliedEndDate.toISOString()}`;
    }
    return `/api/reports/inventory-turnover?range=${dateRange}`;
  }, [dateRange, appliedStartDate, appliedEndDate]);

  const taxSummaryQuery = useMemo(() => {
    if (dateRange === "custom" && appliedStartDate && appliedEndDate) {
      return `/api/reports/tax-summary?startDate=${appliedStartDate.toISOString()}&endDate=${appliedEndDate.toISOString()}`;
    }
    return `/api/reports/tax-summary?range=${dateRange}`;
  }, [dateRange, appliedStartDate, appliedEndDate]);

  const hourlyHeatmapQuery = useMemo(() => {
    if (dateRange === "custom" && appliedStartDate && appliedEndDate) {
      return `/api/reports/hourly-heatmap?startDate=${appliedStartDate.toISOString()}&endDate=${appliedEndDate.toISOString()}`;
    }
    return `/api/reports/hourly-heatmap?range=${dateRange}`;
  }, [dateRange, appliedStartDate, appliedEndDate]);

  const employeeProductivityQuery = useMemo(() => {
    if (dateRange === "custom" && appliedStartDate && appliedEndDate) {
      return `/api/reports/employee-productivity?startDate=${appliedStartDate.toISOString()}&endDate=${appliedEndDate.toISOString()}`;
    }
    return `/api/reports/employee-productivity?range=${dateRange}`;
  }, [dateRange, appliedStartDate, appliedEndDate]);

  const financialSummaryQuery = useMemo(() => {
    if (dateRange === "custom" && appliedStartDate && appliedEndDate) {
      return `/api/reports/financial-summary?startDate=${appliedStartDate.toISOString()}&endDate=${appliedEndDate.toISOString()}`;
    }
    return `/api/reports/financial-summary?range=${dateRange}`;
  }, [dateRange, appliedStartDate, appliedEndDate]);

  const hasProReports = hasFeature("reports_detailed");
  const hasEnterpriseReports = hasFeature("reports_management");

  const { data: paymentMethods, isLoading: pmLoading } = useQuery<PaymentMethodsReport>({
    queryKey: [paymentMethodsQuery],
    enabled: hasProReports,
    retry: (failureCount, error: any) => {
      if (error?.message?.startsWith("403")) return false;
      return failureCount < 3;
    },
  });

  const { data: customerAnalytics, isLoading: caLoading } = useQuery<CustomerAnalyticsReport>({
    queryKey: [customerAnalyticsQuery],
    enabled: hasProReports,
    retry: (failureCount, error: any) => {
      if (error?.message?.startsWith("403")) return false;
      return failureCount < 3;
    },
  });

  const { data: registerPerformance, isLoading: rpLoading } = useQuery<RegisterPerformanceReport>({
    queryKey: [registerPerformanceQuery],
    enabled: hasEnterpriseReports,
    retry: (failureCount, error: any) => {
      if (error?.message?.startsWith("403")) return false;
      return failureCount < 3;
    },
  });

  const { data: salesByCategory, isLoading: sbcLoading } = useQuery<SalesByCategoryReport>({
    queryKey: [salesByCategoryQuery],
    enabled: hasProReports,
    retry: (failureCount, error: any) => {
      if (error?.message?.startsWith("403")) return false;
      return failureCount < 3;
    },
  });

  const { data: discountAnalysis, isLoading: daLoading } = useQuery<DiscountAnalysisReport>({
    queryKey: [discountAnalysisQuery],
    enabled: hasProReports,
    retry: (failureCount, error: any) => {
      if (error?.message?.startsWith("403")) return false;
      return failureCount < 3;
    },
  });

  const { data: inventoryTurnover, isLoading: itLoading } = useQuery<InventoryTurnoverReport>({
    queryKey: [inventoryTurnoverQuery],
    enabled: hasProReports,
    retry: (failureCount, error: any) => {
      if (error?.message?.startsWith("403")) return false;
      return failureCount < 3;
    },
  });

  const { data: taxSummary, isLoading: tsLoading } = useQuery<TaxSummaryReport>({
    queryKey: [taxSummaryQuery],
    enabled: hasEnterpriseReports,
    retry: (failureCount, error: any) => {
      if (error?.message?.startsWith("403")) return false;
      return failureCount < 3;
    },
  });

  const { data: hourlyHeatmap, isLoading: hhLoading } = useQuery<HourlyHeatmapReport>({
    queryKey: [hourlyHeatmapQuery],
    enabled: hasEnterpriseReports,
    retry: (failureCount, error: any) => {
      if (error?.message?.startsWith("403")) return false;
      return failureCount < 3;
    },
  });

  const { data: employeeProductivity, isLoading: epLoading } = useQuery<EmployeeProductivityReport>({
    queryKey: [employeeProductivityQuery],
    enabled: hasEnterpriseReports,
    retry: (failureCount, error: any) => {
      if (error?.message?.startsWith("403")) return false;
      return failureCount < 3;
    },
  });

  const { data: financialSummary, isLoading: fsLoading } = useQuery<FinancialSummaryReport>({
    queryKey: [financialSummaryQuery],
    enabled: hasEnterpriseReports,
    retry: (failureCount, error: any) => {
      if (error?.message?.startsWith("403")) return false;
      return failureCount < 3;
    },
  });

  const handleApplyCustomRange = () => {
    if (customStartDate && customEndDate) {
      setAppliedStartDate(customStartDate);
      setAppliedEndDate(customEndDate);
    }
  };

  const handleDateRangeChange = (value: string) => {
    setDateRange(value);
    if (value !== "custom") {
      setAppliedStartDate(undefined);
      setAppliedEndDate(undefined);
    }
  };

  const currency = tenant?.currency || "USD";

  const formatChartDate = (dateStr: string) => {
    return formatDate(dateStr, { month: "short", day: "numeric" });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const defaultStats: DashboardStats = stats || {
    todaySales: 0,
    todayOrders: 0,
    averageOrderValue: 0,
    topProducts: [],
    salesByHour: [],
    salesByCategory: [],
    recentTrend: 0,
  };

  const defaultAnalytics: AdvancedAnalytics = analytics || {
    salesTrends: [],
    productPerformance: [],
    employeeMetrics: [],
    profitAnalysis: { totalRevenue: 0, totalCost: 0, grossProfit: 0, grossMargin: 0, topProfitProducts: [] },
  };

  return (
    <div className="h-full overflow-y-auto touch-scroll overscroll-contain">
    <div className="p-3 sm:p-6 pb-24 sm:pb-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t("reports.title")}</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {t("reports.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={dateRange} onValueChange={handleDateRangeChange}>
            <SelectTrigger className="w-[180px]" data-testid="select-date-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d" data-testid="option-7d">{t("reports.last_7_days")}</SelectItem>
              <SelectItem value="30d" data-testid="option-30d">{t("reports.last_30_days")}</SelectItem>
              <SelectItem value="90d" data-testid="option-90d">{t("reports.last_90_days")}</SelectItem>
              <SelectItem value="custom" data-testid="option-custom">{t("reports.custom_range")}</SelectItem>
            </SelectContent>
          </Select>
          
          {dateRange === "custom" && (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-[140px] justify-start text-left font-normal"
                    data-testid="button-start-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customStartDate ? formatDate(customStartDate) : t("reports.start_date")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customStartDate}
                    onSelect={setCustomStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-[140px] justify-start text-left font-normal"
                    data-testid="button-end-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customEndDate ? formatDate(customEndDate) : t("reports.end_date")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customEndDate}
                    onSelect={setCustomEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              
              <Button 
                onClick={handleApplyCustomRange}
                disabled={!customStartDate || !customEndDate}
                data-testid="button-apply-date-filter"
              >
                {t("reports.apply_filter")}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("reports.today_sales")}</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(defaultStats.todaySales, currency)}
                </p>
                {defaultStats.recentTrend !== 0 && (
                  <div className={`flex items-center gap-1 text-xs mt-1 ${
                    defaultStats.recentTrend > 0 ? "text-green-600" : "text-red-500"
                  }`}>
                    {defaultStats.recentTrend > 0 ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    {Math.abs(defaultStats.recentTrend)}% {t("reports.vs_yesterday")}
                  </div>
                )}
              </div>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("reports.gross_profit")}</p>
                <p className="text-2xl font-bold">{formatCurrency(defaultAnalytics.profitAnalysis.grossProfit, currency)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("reports.period_total")}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                <PiggyBank className="w-6 h-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("reports.gross_margin")}</p>
                <p className="text-2xl font-bold">{defaultAnalytics.profitAnalysis.grossMargin.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground mt-1">{t("reports.profit_percentage")}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Percent className="w-6 h-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("reports.orders")}</p>
                <p className="text-2xl font-bold">{defaultStats.todayOrders}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("reports.today")}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeReport} onValueChange={setActiveReport}>
        <div className="flex flex-col gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Select value={reportGroup} onValueChange={(val) => {
              setReportGroup(val);
              const firstTab = val === "basic" ? "overview" : val === "pro" ? "payments" : "registers";
              setActiveReport(firstTab);
            }}>
              <SelectTrigger className="w-[200px]" data-testid="select-report-group">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic" data-testid="option-basic">{t("reports.basic_reports")}</SelectItem>
                <SelectItem value="pro" data-testid="option-pro">
                  <span className="flex items-center gap-1">{!hasProReports && <Crown className="w-3 h-3 text-yellow-500" />}{t("reports.pro_reports")}</span>
                </SelectItem>
                <SelectItem value="enterprise" data-testid="option-enterprise">
                  <span className="flex items-center gap-1">{!hasEnterpriseReports && <Crown className="w-3 h-3 text-yellow-500" />}{t("reports.enterprise_reports")}</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto -mx-1 px-1">
            {reportGroup === "basic" && (
              <TabsList className="inline-flex w-auto min-w-full">
                <TabsTrigger value="overview" data-testid="tab-overview">{t("reports.overview")}</TabsTrigger>
                <TabsTrigger value="trends" data-testid="tab-trends">{t("reports.sales_trends")}</TabsTrigger>
                <TabsTrigger value="products" data-testid="tab-products">{t("reports.product_performance")}</TabsTrigger>
                <TabsTrigger value="employees" data-testid="tab-employees">{t("reports.employee_metrics")}</TabsTrigger>
                <TabsTrigger value="profit" data-testid="tab-profit">{t("reports.profit_analysis")}</TabsTrigger>
              </TabsList>
            )}
            {reportGroup === "pro" && (
              <TabsList className="inline-flex w-auto min-w-full">
                <TabsTrigger value="payments" data-testid="tab-payments">{t("reports.payment_methods")}</TabsTrigger>
                <TabsTrigger value="customers" data-testid="tab-customers">{t("reports.customer_analytics")}</TabsTrigger>
                <TabsTrigger value="categories" data-testid="tab-categories">{t("reports.sales_by_category_tab")}</TabsTrigger>
                <TabsTrigger value="discounts" data-testid="tab-discounts">{t("reports.discount_analysis_tab")}</TabsTrigger>
                <TabsTrigger value="turnover" data-testid="tab-turnover">{t("reports.inventory_turnover_tab")}</TabsTrigger>
              </TabsList>
            )}
            {reportGroup === "enterprise" && (
              <TabsList className="inline-flex w-auto min-w-full">
                <TabsTrigger value="registers" data-testid="tab-registers">{t("reports.register_performance")}</TabsTrigger>
                <TabsTrigger value="tax" data-testid="tab-tax">{t("reports.tax_summary_tab")}</TabsTrigger>
                <TabsTrigger value="heatmap" data-testid="tab-heatmap">{t("reports.hourly_heatmap_tab")}</TabsTrigger>
                <TabsTrigger value="productivity" data-testid="tab-productivity">{t("reports.employee_productivity_tab")}</TabsTrigger>
                <TabsTrigger value="financials" data-testid="tab-financials">{t("reports.financial_summary_tab")}</TabsTrigger>
              </TabsList>
            )}
          </div>
        </div>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  {t("reports.sales_by_hour")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {defaultStats.salesByHour.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={defaultStats.salesByHour}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="hour"
                        className="text-xs"
                        tick={{ fill: "hsl(var(--muted-foreground))" }}
                      />
                      <YAxis
                        className="text-xs"
                        tick={{ fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={(value) => `${tenant?.currency || "$"}${value}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "var(--radius)",
                        }}
                        formatter={(value: number) => [formatCurrency(value, currency), t("reports.sales")]}
                      />
                      <Bar
                        dataKey="sales"
                        fill="hsl(var(--primary))"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p>{t("reports.no_sales_data")}</p>
                      <p className="text-sm">{t("reports.make_sales_charts")}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  {t("reports.sales_by_category")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {defaultStats.salesByCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={defaultStats.salesByCategory}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {defaultStats.salesByCategory.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "var(--radius)",
                        }}
                        formatter={(value: number) => [formatCurrency(value, currency), t("reports.sales")]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p>{t("reports.no_category_data")}</p>
                      <p className="text-sm">{t("reports.category_sales_appear")}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                {t("reports.top_selling")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {defaultStats.topProducts.length > 0 ? (
                <div className="space-y-3">
                  {defaultStats.topProducts.map((product, index) => (
                    <div
                      key={product.name}
                      className="flex items-center gap-4 p-3 rounded-lg bg-muted/50"
                      data-testid={`top-product-${index}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{product.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {product.quantity} {t("reports.units_sold")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{formatCurrency(product.revenue, currency)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>{t("reports.no_sales_data")}</p>
                  <p className="text-sm">{t("reports.top_products_appear")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                {t("reports.revenue_profit_trends")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <Skeleton className="h-[350px]" />
              ) : defaultAnalytics.salesTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={defaultAnalytics.salesTrends}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatChartDate}
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(value) => `${tenant?.currency || "$"}${value}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                      }}
                      formatter={(value: number, name: string) => [
                        formatCurrency(value, currency),
                        name === "revenue" ? t("reports.revenue") : t("reports.profit"),
                      ]}
                      labelFormatter={formatChartDate}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#3B82F6"
                      fillOpacity={1}
                      fill="url(#colorRevenue)"
                      name={t("reports.revenue")}
                    />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      stroke="#10B981"
                      fillOpacity={1}
                      fill="url(#colorProfit)"
                      name={t("reports.profit")}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>{t("reports.no_trend_data")}</p>
                    <p className="text-sm">{t("reports.sales_trends_appear")}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                {t("reports.daily_orders")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <Skeleton className="h-[250px]" />
              ) : defaultAnalytics.salesTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={defaultAnalytics.salesTrends}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatChartDate}
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                      }}
                      labelFormatter={formatChartDate}
                    />
                    <Bar dataKey="orders" fill="#8B5CF6" radius={[4, 4, 0, 0]} name={t("reports.orders")} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>{t("reports.no_order_data")}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                {t("reports.product_performance_title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : defaultAnalytics.productPerformance.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 font-medium">{t("common.product")}</th>
                        <th className="text-right py-3 px-2 font-medium">{t("reports.qty_sold")}</th>
                        <th className="text-right py-3 px-2 font-medium">{t("reports.revenue")}</th>
                        <th className="text-right py-3 px-2 font-medium">{t("reports.cost")}</th>
                        <th className="text-right py-3 px-2 font-medium">{t("reports.profit")}</th>
                        <th className="text-right py-3 px-2 font-medium">{t("reports.margin")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {defaultAnalytics.productPerformance.map((product, index) => (
                        <tr key={product.id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                                {index + 1}
                              </div>
                              <span className="font-medium">{product.name || t("reports.unknown_product")}</span>
                            </div>
                          </td>
                          <td className="text-right py-3 px-2">{product.quantity}</td>
                          <td className="text-right py-3 px-2">{formatCurrency(product.revenue, currency)}</td>
                          <td className="text-right py-3 px-2 text-muted-foreground">{formatCurrency(product.cost, currency)}</td>
                          <td className="text-right py-3 px-2">
                            <span className={product.profit >= 0 ? "text-green-600" : "text-red-500"}>
                              {formatCurrency(product.profit, currency)}
                            </span>
                          </td>
                          <td className="text-right py-3 px-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              product.margin >= 30 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                              product.margin >= 15 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" :
                              "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                            }`}>
                              {product.margin.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-16 text-center text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="font-medium">{t("reports.no_product_data")}</p>
                  <p className="text-sm">{t("reports.product_data_appear")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employees" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                {t("reports.employee_performance")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              ) : defaultAnalytics.employeeMetrics.length > 0 ? (
                <div className="space-y-4">
                  {defaultAnalytics.employeeMetrics.map((employee, index) => (
                    <div
                      key={employee.id}
                      className="flex items-center gap-4 p-4 rounded-lg bg-muted/50"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <UserCheck className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{employee.name || t("reports.unknown_employee")}</p>
                        <p className="text-sm text-muted-foreground">
                          {employee.salesCount} {t("reports.sales_made")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{formatCurrency(employee.revenue, currency)}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("reports.avg")}: {formatCurrency(employee.avgOrderValue, currency)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-16 text-center text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="font-medium">{t("reports.no_employee_data")}</p>
                  <p className="text-sm">{t("reports.employee_data_appear")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profit" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">{t("reports.total_revenue")}</p>
                <p className="text-2xl font-bold">{formatCurrency(defaultAnalytics.profitAnalysis.totalRevenue, currency)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">{t("reports.total_cost")}</p>
                <p className="text-2xl font-bold text-muted-foreground">{formatCurrency(defaultAnalytics.profitAnalysis.totalCost, currency)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">{t("reports.gross_profit")}</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(defaultAnalytics.profitAnalysis.grossProfit, currency)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                {t("reports.top_profit_products")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {defaultAnalytics.profitAnalysis.topProfitProducts.length > 0 ? (
                <div className="space-y-4">
                  {defaultAnalytics.profitAnalysis.topProfitProducts.map((product, index) => (
                    <div
                      key={product.name}
                      className="flex items-center gap-4 p-3 rounded-lg bg-muted/50"
                    >
                      <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-600 font-bold">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{product.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {t("reports.margin")}: {product.margin.toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">{formatCurrency(product.profit, currency)}</p>
                        <p className="text-xs text-muted-foreground">{t("reports.profit")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-16 text-center text-muted-foreground">
                  <PiggyBank className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="font-medium">{t("reports.no_profit_data")}</p>
                  <p className="text-sm">{t("reports.add_product_costs")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pro: Payment Methods */}
        <TabsContent value="payments" className="space-y-6 mt-6">
          {!hasProReports ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Crown className="w-12 h-12 mx-auto mb-4 text-yellow-500 opacity-60" />
                  <p className="font-medium text-lg mb-2">{t("reports.pro_required")}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t("reports.pro_payments_desc")}</p>
                  <Button onClick={() => window.location.href = "/subscription"} data-testid="button-upgrade-payments">
                    {t("reports.upgrade_now")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : pmLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(paymentMethods?.paymentBreakdown || []).map((pm) => (
                  <Card key={pm.method}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground capitalize">{pm.method === "cash" ? t("reports.cash") : pm.method === "card" ? t("reports.card") : t("reports.split")}</p>
                          <p className="text-2xl font-bold">{formatCurrency(pm.total, currency)}</p>
                          <p className="text-xs text-muted-foreground mt-1">{pm.count} {t("reports.transactions")} ({pm.percentage.toFixed(1)}%)</p>
                        </div>
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                          {pm.method === "cash" ? <Wallet className="w-6 h-6 text-primary" /> : pm.method === "card" ? <CreditCard className="w-6 h-6 text-primary" /> : <RefreshCw className="w-6 h-6 text-primary" />}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    {t("reports.daily_payment_trends")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(paymentMethods?.dailyPayments || []).length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={paymentMethods?.dailyPayments}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tickFormatter={formatChartDate} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatCurrency(v, currency)} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }} labelFormatter={formatChartDate} formatter={(value: number, name: string) => [formatCurrency(value, currency), name === "cash" ? t("reports.cash") : t("reports.card")]} />
                        <Legend />
                        <Bar dataKey="cash" fill="#10B981" radius={[4, 4, 0, 0]} name={t("reports.cash")} />
                        <Bar dataKey="card" fill="#3B82F6" radius={[4, 4, 0, 0]} name={t("reports.card")} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p>{t("reports.no_payment_data")}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {paymentMethods?.refundSummary && paymentMethods.refundSummary.refundCount > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <RefreshCw className="w-5 h-5" />
                      {t("reports.refund_summary")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("reports.total_refunds")}</p>
                        <p className="text-2xl font-bold text-red-500">{formatCurrency(paymentMethods.refundSummary.totalRefunds, currency)}</p>
                        <p className="text-xs text-muted-foreground mt-1">{paymentMethods.refundSummary.refundCount} {t("reports.refunds_processed")}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">{t("reports.top_refund_reasons")}</p>
                        <div className="space-y-2">
                          {paymentMethods.refundSummary.topRefundReasons.map((r) => (
                            <div key={r.reason} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                              <span className="text-sm capitalize">{r.reason.replace(/_/g, " ")}</span>
                              <span className="text-sm font-medium">{r.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Pro: Customer Analytics */}
        <TabsContent value="customers" className="space-y-6 mt-6">
          {!hasProReports ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Crown className="w-12 h-12 mx-auto mb-4 text-yellow-500 opacity-60" />
                  <p className="font-medium text-lg mb-2">{t("reports.pro_required")}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t("reports.pro_customers_desc")}</p>
                  <Button onClick={() => window.location.href = "/subscription"} data-testid="button-upgrade-customers">
                    {t("reports.upgrade_now")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : caLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">{t("reports.new_customers")}</p>
                    <p className="text-2xl font-bold">{customerAnalytics?.newVsReturning.newCustomers || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("reports.in_period")}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">{t("reports.returning_customers")}</p>
                    <p className="text-2xl font-bold">{customerAnalytics?.newVsReturning.returningCustomers || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("reports.in_period")}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">{t("reports.avg_basket_size")}</p>
                    <p className="text-2xl font-bold">{formatCurrency(customerAnalytics?.averageBasketSize || 0, currency)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("reports.per_order")}</p>
                  </CardContent>
                </Card>
              </div>

              {customerAnalytics?.newVsReturning && (customerAnalytics.newVsReturning.newCustomers > 0 || customerAnalytics.newVsReturning.returningCustomers > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      {t("reports.customer_breakdown")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: t("reports.new_customers"), value: customerAnalytics.newVsReturning.newCustomers },
                            { name: t("reports.returning_customers"), value: customerAnalytics.newVsReturning.returningCustomers },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          <Cell fill="#3B82F6" />
                          <Cell fill="#10B981" />
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5" />
                    {t("reports.top_customers")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(customerAnalytics?.topCustomers || []).length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-2 font-medium">{t("reports.customer_name")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.orders")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.total_spent")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.avg_order")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customerAnalytics?.topCustomers.map((c, i) => (
                            <tr key={c.id} className="border-b last:border-0">
                              <td className="py-3 px-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">{i + 1}</div>
                                  <span className="font-medium">{c.name}</span>
                                </div>
                              </td>
                              <td className="text-right py-3 px-2">{c.orderCount}</td>
                              <td className="text-right py-3 px-2 font-medium">{formatCurrency(c.totalSpent, currency)}</td>
                              <td className="text-right py-3 px-2 text-muted-foreground">{formatCurrency(c.avgOrder, currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-16 text-center text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p className="font-medium">{t("reports.no_customer_data")}</p>
                      <p className="text-sm">{t("reports.customer_data_appear")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Enterprise: Register Performance */}
        <TabsContent value="registers" className="space-y-6 mt-6">
          {!hasEnterpriseReports ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Crown className="w-12 h-12 mx-auto mb-4 text-yellow-500 opacity-60" />
                  <p className="font-medium text-lg mb-2">{t("reports.enterprise_required")}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t("reports.enterprise_registers_desc")}</p>
                  <Button onClick={() => window.location.href = "/subscription"} data-testid="button-upgrade-registers">
                    {t("reports.upgrade_now")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : rpLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Landmark className="w-5 h-5" />
                    {t("reports.register_metrics")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(registerPerformance?.registerMetrics || []).length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-2 font-medium">{t("reports.register_name")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.sales_count")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.total_revenue")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.avg_ticket")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.sessions")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {registerPerformance?.registerMetrics.map((r) => (
                            <tr key={r.registerId} className="border-b last:border-0">
                              <td className="py-3 px-2 font-medium">{r.registerName}</td>
                              <td className="text-right py-3 px-2">{r.salesCount}</td>
                              <td className="text-right py-3 px-2 font-medium">{formatCurrency(r.totalRevenue, currency)}</td>
                              <td className="text-right py-3 px-2 text-muted-foreground">{formatCurrency(r.avgTicket, currency)}</td>
                              <td className="text-right py-3 px-2">{r.sessionsCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-16 text-center text-muted-foreground">
                      <Landmark className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p className="font-medium">{t("reports.no_register_data")}</p>
                      <p className="text-sm">{t("reports.register_data_appear")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {(registerPerformance?.cashVariance || []).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wallet className="w-5 h-5" />
                      {t("reports.cash_variance")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-2 font-medium">{t("reports.register_name")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.expected_cash")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.actual_cash")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.variance")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {registerPerformance?.cashVariance.map((r) => (
                            <tr key={r.registerId} className="border-b last:border-0">
                              <td className="py-3 px-2 font-medium">{r.registerName}</td>
                              <td className="text-right py-3 px-2">{formatCurrency(r.expectedCash, currency)}</td>
                              <td className="text-right py-3 px-2">{formatCurrency(r.actualCash, currency)}</td>
                              <td className="text-right py-3 px-2">
                                <span className={r.variance >= 0 ? "text-green-600" : "text-red-500"}>
                                  {r.variance >= 0 ? "+" : ""}{formatCurrency(r.variance, currency)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Pro: Sales by Category */}
        <TabsContent value="categories" className="space-y-6 mt-6">
          {!hasProReports ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Crown className="w-12 h-12 mx-auto mb-4 text-yellow-500 opacity-60" />
                  <p className="font-medium text-lg mb-2">{t("reports.pro_required")}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t("reports.pro_categories_desc")}</p>
                  <Button onClick={() => window.location.href = "/subscription"} data-testid="button-upgrade-categories">
                    {t("reports.upgrade_now")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : sbcLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(salesByCategory?.categoryBreakdown || []).slice(0, 3).map((cat) => (
                  <Card key={cat.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">{cat.name}</p>
                          <p className="text-2xl font-bold">{formatCurrency(cat.revenue, currency)}</p>
                          <p className="text-xs text-muted-foreground mt-1">{cat.itemsSold} {t("reports.units_sold")} ({cat.percentage.toFixed(1)}%)</p>
                        </div>
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Tag className="w-6 h-6 text-primary" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Tag className="w-5 h-5" />
                    {t("reports.category_revenue_share")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(salesByCategory?.categoryBreakdown || []).length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={salesByCategory?.categoryBreakdown.map((c) => ({ name: c.name, value: c.revenue }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {salesByCategory?.categoryBreakdown.map((_, index) => (
                            <Cell key={`cat-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }}
                          formatter={(value: number) => [formatCurrency(value, currency), t("reports.revenue")]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Tag className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p>{t("reports.no_category_data")}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    {t("reports.category_breakdown")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(salesByCategory?.categoryBreakdown || []).length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-2 font-medium">{t("reports.category_name")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.items_sold")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.revenue")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.cost")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.profit")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.percentage")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {salesByCategory?.categoryBreakdown.map((cat, index) => (
                            <tr key={cat.id} className="border-b last:border-0 hover:bg-muted/50" data-testid={`row-category-${index}`}>
                              <td className="py-3 px-2 font-medium">{cat.name}</td>
                              <td className="text-right py-3 px-2">{cat.itemsSold}</td>
                              <td className="text-right py-3 px-2">{formatCurrency(cat.revenue, currency)}</td>
                              <td className="text-right py-3 px-2 text-muted-foreground">{formatCurrency(cat.cost, currency)}</td>
                              <td className="text-right py-3 px-2">
                                <span className={cat.profit >= 0 ? "text-green-600" : "text-red-500"}>
                                  {formatCurrency(cat.profit, currency)}
                                </span>
                              </td>
                              <td className="text-right py-3 px-2">{cat.percentage.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-16 text-center text-muted-foreground">
                      <Tag className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p className="font-medium">{t("reports.no_category_data")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Pro: Discount Analysis */}
        <TabsContent value="discounts" className="space-y-6 mt-6">
          {!hasProReports ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Crown className="w-12 h-12 mx-auto mb-4 text-yellow-500 opacity-60" />
                  <p className="font-medium text-lg mb-2">{t("reports.pro_required")}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t("reports.pro_discounts_desc")}</p>
                  <Button onClick={() => window.location.href = "/subscription"} data-testid="button-upgrade-discounts">
                    {t("reports.upgrade_now")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : daLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("reports.total_discounts")}</p>
                        <p className="text-2xl font-bold">{formatCurrency(discountAnalysis?.discountSummary.totalDiscounts || 0, currency)}</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Percent className="w-6 h-6 text-primary" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("reports.orders_with_discount")}</p>
                        <p className="text-2xl font-bold">{discountAnalysis?.discountSummary.ordersWithDiscount || 0}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t("reports.of")} {discountAnalysis?.discountSummary.totalOrders || 0} {t("reports.total_orders")}</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <Receipt className="w-6 h-6 text-blue-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("reports.avg_discount_rate")}</p>
                        <p className="text-2xl font-bold">{(discountAnalysis?.discountSummary.avgDiscountPercent || 0).toFixed(1)}%</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                        <Tag className="w-6 h-6 text-yellow-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    {t("reports.daily_discount_trends")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(discountAnalysis?.dailyDiscounts || []).length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={discountAnalysis?.dailyDiscounts}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tickFormatter={formatChartDate} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatCurrency(v, currency)} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }} labelFormatter={formatChartDate} formatter={(value: number, name: string) => [formatCurrency(value, currency), name === "discountTotal" ? t("reports.discounts") : t("reports.revenue")]} />
                        <Legend />
                        <Bar dataKey="discountTotal" fill="#F59E0B" radius={[4, 4, 0, 0]} name={t("reports.discounts")} />
                        <Bar dataKey="revenueTotal" fill="#3B82F6" radius={[4, 4, 0, 0]} name={t("reports.revenue")} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Percent className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p>{t("reports.no_discount_data")}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    {t("reports.discounts_by_hour")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(discountAnalysis?.discountByHour || []).length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={discountAnalysis?.discountByHour}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="hour" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatCurrency(v, currency)} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }} formatter={(value: number) => [formatCurrency(value, currency), t("reports.discounts")]} />
                        <Bar dataKey="discountTotal" fill="#F59E0B" radius={[4, 4, 0, 0]} name={t("reports.discounts")} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p>{t("reports.no_discount_data")}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Pro: Inventory Turnover */}
        <TabsContent value="turnover" className="space-y-6 mt-6">
          {!hasProReports ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Crown className="w-12 h-12 mx-auto mb-4 text-yellow-500 opacity-60" />
                  <p className="font-medium text-lg mb-2">{t("reports.pro_required")}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t("reports.pro_turnover_desc")}</p>
                  <Button onClick={() => window.location.href = "/subscription"} data-testid="button-upgrade-turnover">
                    {t("reports.upgrade_now")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : itLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">{t("reports.avg_turnover_rate")}</p>
                    <p className="text-2xl font-bold">{(inventoryTurnover?.summary.avgTurnoverRate || 0).toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">{t("reports.fast_moving")}</p>
                    <p className="text-2xl font-bold text-green-600">{inventoryTurnover?.summary.fastMoving || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">{t("reports.slow_moving")}</p>
                    <p className="text-2xl font-bold text-yellow-600">{inventoryTurnover?.summary.slowMoving || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">{t("reports.no_movement")}</p>
                    <p className="text-2xl font-bold text-red-500">{inventoryTurnover?.summary.noMovement || 0}</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RotateCw className="w-5 h-5" />
                    {t("reports.product_turnover_metrics")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(inventoryTurnover?.turnoverMetrics || []).length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-2 font-medium">{t("common.product")}</th>
                            <th className="text-left py-3 px-2 font-medium">{t("reports.category_name")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.total_sold")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.stock_on_hand")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.turnover_rate")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.days_of_stock")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.stock_value")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inventoryTurnover?.turnoverMetrics.map((item, index) => (
                            <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50" data-testid={`row-turnover-${index}`}>
                              <td className="py-3 px-2 font-medium">{item.name}</td>
                              <td className="py-3 px-2 text-muted-foreground">{item.category}</td>
                              <td className="text-right py-3 px-2">{item.totalSold}</td>
                              <td className="text-right py-3 px-2">{item.stockOnHand}</td>
                              <td className="text-right py-3 px-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  item.turnoverRate >= 5 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                                  item.turnoverRate >= 1 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" :
                                  "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                }`}>
                                  {item.turnoverRate.toFixed(2)}
                                </span>
                              </td>
                              <td className="text-right py-3 px-2">{item.daysOfStock.toFixed(0)}</td>
                              <td className="text-right py-3 px-2">{formatCurrency(item.costValue, currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-16 text-center text-muted-foreground">
                      <RotateCw className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p className="font-medium">{t("reports.no_turnover_data")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Enterprise: Tax Summary */}
        <TabsContent value="tax" className="space-y-6 mt-6">
          {!hasEnterpriseReports ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Crown className="w-12 h-12 mx-auto mb-4 text-yellow-500 opacity-60" />
                  <p className="font-medium text-lg mb-2">{t("reports.enterprise_required")}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t("reports.enterprise_tax_desc")}</p>
                  <Button onClick={() => window.location.href = "/subscription"} data-testid="button-upgrade-tax">
                    {t("reports.upgrade_now")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : tsLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("reports.total_tax_collected")}</p>
                        <p className="text-2xl font-bold">{formatCurrency(taxSummary?.taxSummary.totalTaxCollected || 0, currency)}</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Calculator className="w-6 h-6 text-primary" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("reports.avg_tax_per_order")}</p>
                        <p className="text-2xl font-bold">{formatCurrency(taxSummary?.taxSummary.avgTaxPerOrder || 0, currency)}</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <Receipt className="w-6 h-6 text-blue-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("reports.effective_tax_rate")}</p>
                        <p className="text-2xl font-bold">{(taxSummary?.taxSummary.effectiveTaxRate || 0).toFixed(1)}%</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                        <Percent className="w-6 h-6 text-green-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="w-5 h-5" />
                    {t("reports.daily_tax_collection")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(taxSummary?.dailyTax || []).length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={taxSummary?.dailyTax}>
                        <defs>
                          <linearGradient id="colorTax" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tickFormatter={formatChartDate} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatCurrency(v, currency)} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }} labelFormatter={formatChartDate} formatter={(value: number) => [formatCurrency(value, currency), t("reports.tax")]} />
                        <Area type="monotone" dataKey="taxTotal" stroke="#8B5CF6" fillOpacity={1} fill="url(#colorTax)" name={t("reports.tax")} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Calculator className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p>{t("reports.no_tax_data")}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {(taxSummary?.taxByMethod || []).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="w-5 h-5" />
                      {t("reports.tax_by_payment_method")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {taxSummary?.taxByMethod.map((tm) => (
                        <div key={tm.method} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-3">
                            {tm.method === "cash" ? <Wallet className="w-5 h-5 text-muted-foreground" /> : <CreditCard className="w-5 h-5 text-muted-foreground" />}
                            <span className="font-medium capitalize">{tm.method === "cash" ? t("reports.cash") : tm.method === "card" ? t("reports.card") : tm.method}</span>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{formatCurrency(tm.taxTotal, currency)}</p>
                            <p className="text-xs text-muted-foreground">{tm.orderCount} {t("reports.orders")}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Enterprise: Hourly Heatmap */}
        <TabsContent value="heatmap" className="space-y-6 mt-6">
          {!hasEnterpriseReports ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Crown className="w-12 h-12 mx-auto mb-4 text-yellow-500 opacity-60" />
                  <p className="font-medium text-lg mb-2">{t("reports.enterprise_required")}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t("reports.enterprise_heatmap_desc")}</p>
                  <Button onClick={() => window.location.href = "/subscription"} data-testid="button-upgrade-heatmap">
                    {t("reports.upgrade_now")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : hhLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("reports.busiest_day")}</p>
                        <p className="text-2xl font-bold">{(() => {
                          const englishDay = hourlyHeatmap?.summary.busiestDay || "";
                          if (!englishDay) return "-";
                          const dayMap: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
                          const dayIdx = dayMap[englishDay];
                          if (dayIdx === undefined) return englishDay;
                          const baseDate = new Date(2024, 0, 7 + dayIdx);
                          return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(baseDate);
                        })()}</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <BarChart3 className="w-6 h-6 text-primary" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("reports.peak_hour")}</p>
                        <p className="text-2xl font-bold">{hourlyHeatmap?.summary.busiestHour || "-"}</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <Clock className="w-6 h-6 text-blue-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("reports.total_sales")}</p>
                        <p className="text-2xl font-bold">{formatCurrency(hourlyHeatmap?.summary.totalSales || 0, currency)}</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                        <DollarSign className="w-6 h-6 text-green-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    {t("reports.sales_heatmap")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(hourlyHeatmap?.heatmapData || []).length > 0 ? (() => {
                    const maxOrders = Math.max(...(hourlyHeatmap?.heatmapData || []).map((d) => d.orderCount), 1);
                    const days = Array.from({ length: 7 }, (_, i) => {
                      const d = new Date(2024, 0, i + 1);
                      return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d);
                    });
                    const hours = Array.from({ length: 24 }, (_, i) => i);
                    const dataMap = new Map((hourlyHeatmap?.heatmapData || []).map((d) => [`${d.dayOfWeek}-${d.hour}`, d]));
                    return (
                      <div className="overflow-x-auto">
                        <div className="min-w-[700px]">
                          <div className="flex gap-0.5 mb-1 ml-12">
                            {hours.map((h) => (
                              <div key={h} className="flex-1 text-center text-xs text-muted-foreground">{h}</div>
                            ))}
                          </div>
                          {days.map((day, dayIdx) => (
                            <div key={day} className="flex gap-0.5 mb-0.5 items-center">
                              <div className="w-12 text-xs text-muted-foreground text-right pr-2">{day}</div>
                              {hours.map((hour) => {
                                const cell = dataMap.get(`${dayIdx}-${hour}`);
                                const count = cell?.orderCount || 0;
                                const opacity = count > 0 ? Math.max(0.1, count / maxOrders) : 0;
                                return (
                                  <div
                                    key={`${dayIdx}-${hour}`}
                                    className="flex-1 aspect-square rounded-sm"
                                    style={{ backgroundColor: count > 0 ? `hsl(var(--primary) / ${opacity})` : "hsl(var(--muted))" }}
                                    title={`${day} ${hour}:00 - ${count} ${t("reports.orders")}, ${formatCurrency(cell?.revenue || 0, currency)}`}
                                    data-testid={`heatmap-cell-${dayIdx}-${hour}`}
                                  />
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })() : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p>{t("reports.no_heatmap_data")}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {(hourlyHeatmap?.peakHours || []).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      {t("reports.peak_hours")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-2 font-medium">{t("reports.hour")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.orders")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.revenue")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hourlyHeatmap?.peakHours.map((ph, index) => (
                            <tr key={ph.hour} className="border-b last:border-0" data-testid={`row-peak-hour-${index}`}>
                              <td className="py-3 px-2 font-medium">{ph.hour}</td>
                              <td className="text-right py-3 px-2">{ph.orderCount}</td>
                              <td className="text-right py-3 px-2 font-medium">{formatCurrency(ph.revenue, currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Enterprise: Employee Productivity */}
        <TabsContent value="productivity" className="space-y-6 mt-6">
          {!hasEnterpriseReports ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Crown className="w-12 h-12 mx-auto mb-4 text-yellow-500 opacity-60" />
                  <p className="font-medium text-lg mb-2">{t("reports.enterprise_required")}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t("reports.enterprise_productivity_desc")}</p>
                  <Button onClick={() => window.location.href = "/subscription"} data-testid="button-upgrade-productivity">
                    {t("reports.upgrade_now")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : epLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("reports.total_employees")}</p>
                        <p className="text-2xl font-bold">{employeeProductivity?.summary.totalEmployees || 0}</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Users className="w-6 h-6 text-primary" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("reports.top_performer")}</p>
                        <p className="text-2xl font-bold">{employeeProductivity?.summary.topPerformer || "-"}</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                        <Award className="w-6 h-6 text-yellow-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("reports.avg_revenue_per_employee")}</p>
                        <p className="text-2xl font-bold">{formatCurrency(employeeProductivity?.summary.avgRevenuePerEmployee || 0, currency)}</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                        <DollarSign className="w-6 h-6 text-green-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="w-5 h-5" />
                    {t("reports.employee_rankings")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(employeeProductivity?.employeeRankings || []).length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-2 font-medium">#</th>
                            <th className="text-left py-3 px-2 font-medium">{t("reports.employee_name")}</th>
                            <th className="text-left py-3 px-2 font-medium">{t("reports.role")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.orders")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.revenue")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.avg_order")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.active_days")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.orders_per_day")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.discounts_given")}</th>
                            <th className="text-right py-3 px-2 font-medium">{t("reports.cancelled")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {employeeProductivity?.employeeRankings.map((emp) => (
                            <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/50" data-testid={`row-employee-${emp.id}`}>
                              <td className="py-3 px-2">
                                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                                  {emp.rank}
                                </div>
                              </td>
                              <td className="py-3 px-2 font-medium">{emp.name}</td>
                              <td className="py-3 px-2 text-muted-foreground capitalize">{emp.role}</td>
                              <td className="text-right py-3 px-2">{emp.totalOrders}</td>
                              <td className="text-right py-3 px-2 font-medium">{formatCurrency(emp.totalRevenue, currency)}</td>
                              <td className="text-right py-3 px-2 text-muted-foreground">{formatCurrency(emp.avgOrderValue, currency)}</td>
                              <td className="text-right py-3 px-2">{emp.activeDays}</td>
                              <td className="text-right py-3 px-2">{emp.ordersPerDay.toFixed(1)}</td>
                              <td className="text-right py-3 px-2">{formatCurrency(emp.totalDiscountsGiven, currency)}</td>
                              <td className="text-right py-3 px-2">{emp.cancelledOrders}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-16 text-center text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p className="font-medium">{t("reports.no_employee_data")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Enterprise: Financial Summary */}
        <TabsContent value="financials" className="space-y-6 mt-6">
          {!hasEnterpriseReports ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Crown className="w-12 h-12 mx-auto mb-4 text-yellow-500 opacity-60" />
                  <p className="font-medium text-lg mb-2">{t("reports.enterprise_required")}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t("reports.enterprise_financials_desc")}</p>
                  <Button onClick={() => window.location.href = "/subscription"} data-testid="button-upgrade-financials">
                    {t("reports.upgrade_now")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : fsLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">{t("reports.total_revenue")}</p>
                    <p className="text-2xl font-bold">{formatCurrency(financialSummary?.overview.totalRevenue || 0, currency)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">{t("reports.total_cost")}</p>
                    <p className="text-2xl font-bold text-muted-foreground">{formatCurrency(financialSummary?.overview.totalCost || 0, currency)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">{t("reports.gross_profit")}</p>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(financialSummary?.overview.grossProfit || 0, currency)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">{t("reports.gross_margin")}</p>
                    <p className="text-2xl font-bold">{(financialSummary?.overview.grossMargin || 0).toFixed(1)}%</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">{t("reports.total_tax")}</p>
                    <p className="text-2xl font-bold">{formatCurrency(financialSummary?.overview.totalTax || 0, currency)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">{t("reports.total_discounts")}</p>
                    <p className="text-2xl font-bold text-yellow-600">{formatCurrency(financialSummary?.overview.totalDiscounts || 0, currency)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">{t("reports.net_revenue")}</p>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(financialSummary?.overview.netRevenue || 0, currency)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">{t("reports.total_refunds")}</p>
                    <p className="text-2xl font-bold text-red-500">{formatCurrency(financialSummary?.overview.totalRefunds || 0, currency)}</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    {t("reports.daily_financials")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(financialSummary?.dailyFinancials || []).length > 0 ? (
                    <ResponsiveContainer width="100%" height={350}>
                      <AreaChart data={financialSummary?.dailyFinancials}>
                        <defs>
                          <linearGradient id="colorFinRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorFinCost" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorFinProfit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tickFormatter={formatChartDate} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatCurrency(v, currency)} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }} labelFormatter={formatChartDate} formatter={(value: number, name: string) => [formatCurrency(value, currency), name === "revenue" ? t("reports.revenue") : name === "cost" ? t("reports.cost") : t("reports.profit")]} />
                        <Legend />
                        <Area type="monotone" dataKey="revenue" stroke="#3B82F6" fillOpacity={1} fill="url(#colorFinRevenue)" name={t("reports.revenue")} />
                        <Area type="monotone" dataKey="cost" stroke="#EF4444" fillOpacity={1} fill="url(#colorFinCost)" name={t("reports.cost")} />
                        <Area type="monotone" dataKey="profit" stroke="#10B981" fillOpacity={1} fill="url(#colorFinProfit)" name={t("reports.profit")} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p>{t("reports.no_financial_data")}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {(financialSummary?.monthlyComparison || []).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      {t("reports.monthly_comparison")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={financialSummary?.monthlyComparison}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatCurrency(v, currency)} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }} formatter={(value: number, name: string) => [formatCurrency(value, currency), name === "revenue" ? t("reports.revenue") : t("reports.cost")]} />
                        <Legend />
                        <Bar dataKey="revenue" fill="#3B82F6" radius={[4, 4, 0, 0]} name={t("reports.revenue")} />
                        <Bar dataKey="cost" fill="#EF4444" radius={[4, 4, 0, 0]} name={t("reports.cost")} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </div>
  );
}
