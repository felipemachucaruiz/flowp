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
  Lock,
  Crown,
} from "lucide-react";
import { useLocation } from "wouter";

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

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

export default function ReportsPage() {
  const { tenant } = useAuth();
  const { t, formatDate } = useI18n();
  const [, setLocation] = useLocation();
  const [dateRange, setDateRange] = useState("7d");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  const [appliedStartDate, setAppliedStartDate] = useState<Date | undefined>(undefined);
  const [appliedEndDate, setAppliedEndDate] = useState<Date | undefined>(undefined);

  const analyticsQueryKey = useMemo(() => {
    if (dateRange === "custom" && appliedStartDate && appliedEndDate) {
      return `/api/reports/analytics?startDate=${appliedStartDate.toISOString()}&endDate=${appliedEndDate.toISOString()}`;
    }
    return `/api/reports/analytics?range=${dateRange}`;
  }, [dateRange, appliedStartDate, appliedEndDate]);

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/reports/dashboard"],
  });

  const { data: analytics, isLoading: analyticsLoading, error: analyticsError } = useQuery<AdvancedAnalytics>({
    queryKey: [analyticsQueryKey],
    retry: (failureCount, error: any) => {
      if (error?.message?.startsWith("403")) return false;
      return failureCount < 3;
    },
  });

  const analyticsRequiresUpgrade = analyticsError?.message?.startsWith("403");

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
                {analyticsRequiresUpgrade ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Pro</span>
                  </div>
                ) : (
                  <>
                    <p className="text-2xl font-bold">{formatCurrency(defaultAnalytics.profitAnalysis.grossProfit, currency)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("reports.period_total")}</p>
                  </>
                )}
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
                {analyticsRequiresUpgrade ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Pro</span>
                  </div>
                ) : (
                  <>
                    <p className="text-2xl font-bold">{defaultAnalytics.profitAnalysis.grossMargin.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("reports.profit_percentage")}</p>
                  </>
                )}
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

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" data-testid="tab-overview">{t("reports.overview")}</TabsTrigger>
          <TabsTrigger value="trends" data-testid="tab-trends">{t("reports.sales_trends")}</TabsTrigger>
          <TabsTrigger value="products" data-testid="tab-products">{t("reports.product_performance")}</TabsTrigger>
          <TabsTrigger value="employees" data-testid="tab-employees">{t("reports.employee_metrics")}</TabsTrigger>
          <TabsTrigger value="profit" data-testid="tab-profit">{t("reports.profit_analysis")}</TabsTrigger>
        </TabsList>

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
          {analyticsRequiresUpgrade ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Crown className="w-12 h-12 mx-auto mb-4 text-yellow-500 opacity-60" />
                  <p className="font-medium text-lg mb-2">{t("reports.pro_required")}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t("reports.pro_required_desc")}</p>
                  <Button onClick={() => setLocation("/subscription")} data-testid="button-upgrade-reports">
                    {t("reports.upgrade_now")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
          <>
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
          </>
          )}
        </TabsContent>

        <TabsContent value="products" className="mt-6">
          {analyticsRequiresUpgrade ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Crown className="w-12 h-12 mx-auto mb-4 text-yellow-500 opacity-60" />
                  <p className="font-medium text-lg mb-2">{t("reports.pro_required")}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t("reports.pro_required_desc")}</p>
                  <Button onClick={() => setLocation("/subscription")} data-testid="button-upgrade-products">
                    {t("reports.upgrade_now")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
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
          )}
        </TabsContent>

        <TabsContent value="employees" className="mt-6">
          {analyticsRequiresUpgrade ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Crown className="w-12 h-12 mx-auto mb-4 text-yellow-500 opacity-60" />
                  <p className="font-medium text-lg mb-2">{t("reports.pro_required")}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t("reports.pro_required_desc")}</p>
                  <Button onClick={() => setLocation("/subscription")} data-testid="button-upgrade-employees">
                    {t("reports.upgrade_now")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
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
          )}
        </TabsContent>

        <TabsContent value="profit" className="space-y-6 mt-6">
          {analyticsRequiresUpgrade ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center">
                  <Crown className="w-12 h-12 mx-auto mb-4 text-yellow-500 opacity-60" />
                  <p className="font-medium text-lg mb-2">{t("reports.pro_required")}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t("reports.pro_required_desc")}</p>
                  <Button onClick={() => setLocation("/subscription")} data-testid="button-upgrade-profit">
                    {t("reports.upgrade_now")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
          <>
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
          </>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </div>
  );
}
