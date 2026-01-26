import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { printReceipt } from "@/lib/print-receipt";
import type { Order, Customer } from "@shared/schema";
import {
  Search,
  Calendar,
  User,
  Receipt,
  Printer,
  Filter,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  Clock,
  CreditCard,
  Banknote,
} from "lucide-react";
import { format } from "date-fns";

interface OrderWithItems extends Order {
  items?: {
    id: string;
    productId: string;
    quantity: number;
    unitPrice: string;
    productName?: string;
  }[];
  customer?: Customer | null;
  payments?: {
    id: string;
    method: string;
    amount: string;
  }[];
}

export default function SalesHistoryPage() {
  const { tenant } = useAuth();
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "all">("today");
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);

  const { data: orders, isLoading } = useQuery<OrderWithItems[]>({
    queryKey: ["/api/orders/history", dateFilter],
    queryFn: async () => {
      const response = await fetch(`/api/orders/history?filter=${dateFilter}`, {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      return response.json();
    },
    enabled: !!tenant?.id,
  });

  const formatCurrency = (amount: number | string) => {
    const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
    const currency = tenant?.currency || "USD";
    const localeMap: Record<string, string> = {
      COP: "es-CO", MXN: "es-MX", ARS: "es-AR", PEN: "es-PE", CLP: "es-CL",
      EUR: "de-DE", GBP: "en-GB", JPY: "ja-JP", CNY: "zh-CN", KRW: "ko-KR",
      USD: "en-US", CAD: "en-CA", AUD: "en-AU", BRL: "pt-BR",
    };
    const locale = localeMap[currency] || "en-US";
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency,
        minimumFractionDigits: ["COP", "CLP", "JPY", "KRW"].includes(currency) ? 0 : 2,
        maximumFractionDigits: ["COP", "CLP", "JPY", "KRW"].includes(currency) ? 0 : 2,
      }).format(numAmount);
    } catch {
      return `${currency} ${numAmount.toFixed(2)}`;
    }
  };

  const toggleOrderExpansion = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const handlePrintReceipt = (order: OrderWithItems) => {
    if (!tenant) return;
    
    const items = order.items?.map(item => {
      const unitPrice = parseFloat(item.unitPrice);
      return {
        name: item.productName || "Product",
        quantity: item.quantity,
        price: unitPrice,
        total: unitPrice * item.quantity,
      };
    }) || [];

    const taxRate = parseFloat(tenant.taxRate?.toString() || "0");
    
    printReceipt(tenant, {
      orderNumber: order.orderNumber.toString(),
      date: order.createdAt ? new Date(order.createdAt) : new Date(),
      items,
      subtotal: parseFloat(order.subtotal),
      taxAmount: parseFloat(order.taxAmount || "0"),
      taxRate,
      total: parseFloat(order.total),
      paymentMethod: order.payments?.[0]?.method || "cash",
      cashReceived: undefined,
      change: undefined,
      cashier: undefined,
    });
  };

  const filteredOrders = orders?.filter((order) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const customerMatch = order.customer?.name?.toLowerCase().includes(query) ||
      order.customer?.phone?.includes(query) ||
      order.customer?.idNumber?.includes(query);
    const orderMatch = order.orderNumber.toString().includes(query);
    return customerMatch || orderMatch;
  });

  const groupedByCustomer = filteredOrders?.reduce((acc, order) => {
    const customerKey = order.customer?.id || "anonymous";
    if (!acc[customerKey]) {
      acc[customerKey] = {
        customer: order.customer,
        orders: [],
        totalSpent: 0,
      };
    }
    acc[customerKey].orders.push(order);
    acc[customerKey].totalSpent += parseFloat(order.total);
    return acc;
  }, {} as Record<string, { customer: Customer | null | undefined; orders: OrderWithItems[]; totalSpent: number }>);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="flex gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Receipt className="w-6 h-6" />
          {t("sales.title")}
        </h1>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("sales.search_placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-sales-search"
          />
        </div>
        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as typeof dateFilter)}>
          <SelectTrigger className="w-[180px]" data-testid="select-date-filter">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder={t("sales.filter_today")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">{t("sales.filter_today")}</SelectItem>
            <SelectItem value="week">{t("sales.filter_week")}</SelectItem>
            <SelectItem value="month">{t("sales.filter_month")}</SelectItem>
            <SelectItem value="all">{t("sales.filter_all")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <ShoppingBag className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("sales.total_orders")}</p>
              <p className="text-2xl font-bold">{filteredOrders?.length || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-green-500/10">
              <CreditCard className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("sales.total_revenue")}</p>
              <p className="text-2xl font-bold">
                {formatCurrency(filteredOrders?.reduce((sum, o) => sum + parseFloat(o.total), 0) || 0)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-blue-500/10">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("sales.unique_customers")}</p>
              <p className="text-2xl font-bold">
                {Object.keys(groupedByCustomer || {}).filter(k => k !== "anonymous").length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <ScrollArea className="h-[calc(100vh-380px)]">
        <div className="space-y-4">
          {filteredOrders && filteredOrders.length > 0 ? (
            filteredOrders.map((order) => (
              <Card key={order.id} className="overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover-elevate"
                  onClick={() => toggleOrderExpansion(order.id)}
                  data-testid={`card-order-${order.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-muted">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{t("sales.order_number")}{order.orderNumber}</span>
                          <Badge variant={order.status === "completed" ? "default" : "secondary"}>
                            {order.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {order.createdAt && format(new Date(order.createdAt), "PPp")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {order.customer && (
                        <div className="text-right">
                          <p className="text-sm font-medium flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {order.customer.name}
                          </p>
                          {order.customer.phone && (
                            <p className="text-xs text-muted-foreground">{order.customer.phone}</p>
                          )}
                        </div>
                      )}
                      <div className="text-right">
                        <p className="font-bold text-lg">{formatCurrency(order.total)}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                          {order.payments?.[0]?.method === "card" ? (
                            <CreditCard className="w-3 h-3" />
                          ) : (
                            <Banknote className="w-3 h-3" />
                          )}
                          {order.payments?.[0]?.method || "cash"}
                        </div>
                      </div>
                      {expandedOrders.has(order.id) ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </div>
                {expandedOrders.has(order.id) && (
                  <div className="px-4 pb-4 border-t bg-muted/30">
                    <div className="pt-4 space-y-3">
                      {order.items && order.items.length > 0 ? (
                        <div className="space-y-2">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span>
                                {item.quantity}x {item.productName || "Product"}
                              </span>
                              <span className="font-medium">
                                {formatCurrency(parseFloat(item.unitPrice) * item.quantity)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t("sales.no_items")}</p>
                      )}
                      <Separator />
                      <div className="flex justify-between text-sm">
                        <span>{t("sales.subtotal")}</span>
                        <span>{formatCurrency(order.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>{t("sales.tax")}</span>
                        <span>{formatCurrency(order.taxAmount || "0")}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>{t("sales.total")}</span>
                        <span>{formatCurrency(order.total)}</span>
                      </div>
                      <div className="pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrintReceipt(order);
                          }}
                          data-testid={`button-print-order-${order.id}`}
                        >
                          <Printer className="w-4 h-4 mr-2" />
                          {t("sales.reprint_receipt")}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <Receipt className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">{t("sales.no_orders_found")}</h3>
                <p className="text-muted-foreground">
                  {searchQuery
                    ? t("sales.no_match_message")
                    : t("sales.no_orders_message")}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
