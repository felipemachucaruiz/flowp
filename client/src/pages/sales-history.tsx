import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions";
import { printReceipt } from "@/lib/print-receipt";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  RotateCcw,
  Minus,
  Plus,
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

interface ReturnableItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  returnedQuantity: number;
  returnableQuantity: number;
  returnQuantity: number;
}

export default function SalesHistoryPage() {
  const { tenant, user } = useAuth();
  const { t, formatDateTime } = useI18n();
  const { toast } = useToast();
  const { can, isOwner, isAdmin, isManager } = usePermissions();
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "all">("today");
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnOrder, setReturnOrder] = useState<OrderWithItems | null>(null);
  const [returnableItems, setReturnableItems] = useState<ReturnableItem[]>([]);
  const [returnReason, setReturnReason] = useState<string>("customer_changed_mind");
  const [returnNotes, setReturnNotes] = useState("");
  const [refundMethod, setRefundMethod] = useState<string>("cash");
  const [restockItems, setRestockItems] = useState(true);
  const [isLoadingReturnable, setIsLoadingReturnable] = useState(false);

  const canProcessReturns = isOwner || isAdmin || isManager;

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

    // Calculate tax rate from stored order amounts (tax rate was applied at time of sale)
    const subtotal = parseFloat(order.subtotal);
    const taxAmount = parseFloat(order.taxAmount || "0");
    const taxRate = subtotal > 0 ? (taxAmount / subtotal) * 100 : 0;
    
    printReceipt(tenant, {
      orderNumber: order.orderNumber.toString(),
      date: order.createdAt ? new Date(order.createdAt) : new Date(),
      items,
      subtotal,
      taxAmount,
      taxRate,
      total: parseFloat(order.total),
      paymentMethod: order.payments?.[0]?.method || "cash",
      cashReceived: undefined,
      change: undefined,
      cashier: undefined,
    });
  };

  const openReturnDialog = async (order: OrderWithItems) => {
    if (!tenant) return;
    setReturnOrder(order);
    setIsLoadingReturnable(true);
    setReturnDialogOpen(true);
    setReturnReason("customer_changed_mind");
    setReturnNotes("");
    setRefundMethod(order.payments?.[0]?.method || "cash");
    setRestockItems(true);

    try {
      const response = await fetch(`/api/orders/${order.id}/returnable`, {
        headers: { "x-tenant-id": tenant.id },
      });
      if (response.ok) {
        const data = await response.json();
        setReturnableItems(data.items.map((item: any) => ({
          ...item,
          returnQuantity: 0,
        })));
      } else {
        toast({ title: t("returns.error_loading"), variant: "destructive" });
        setReturnDialogOpen(false);
      }
    } catch {
      toast({ title: t("returns.error_loading"), variant: "destructive" });
      setReturnDialogOpen(false);
    } finally {
      setIsLoadingReturnable(false);
    }
  };

  const updateReturnQuantity = (itemId: string, delta: number) => {
    setReturnableItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const newQty = Math.max(0, Math.min(item.returnableQuantity, item.returnQuantity + delta));
        return { ...item, returnQuantity: newQty };
      }
      return item;
    }));
  };

  const returnMutation = useMutation({
    mutationFn: async (data: {
      orderId: string;
      reason: string;
      reasonNotes: string;
      refundMethod: string;
      restockItems: boolean;
      items: { orderItemId: string; quantity: number }[];
    }) => {
      return apiRequest("POST", "/api/returns", data);
    },
    onSuccess: () => {
      toast({ title: t("returns.success") });
      setReturnDialogOpen(false);
      setReturnOrder(null);
      setReturnableItems([]);
      queryClient.invalidateQueries({ queryKey: ["/api/orders/history"] });
    },
    onError: () => {
      toast({ title: t("returns.error"), variant: "destructive" });
    },
  });

  const handleProcessReturn = () => {
    if (!returnOrder) return;
    
    const itemsToReturn = returnableItems
      .filter(item => item.returnQuantity > 0)
      .map(item => ({
        orderItemId: item.id,
        quantity: item.returnQuantity,
      }));

    if (itemsToReturn.length === 0) {
      toast({ title: t("returns.select_items"), variant: "destructive" });
      return;
    }

    returnMutation.mutate({
      orderId: returnOrder.id,
      reason: returnReason,
      reasonNotes: returnNotes,
      refundMethod,
      restockItems,
      items: itemsToReturn,
    });
  };

  const calculateReturnTotal = () => {
    const taxRate = tenant?.taxRate ? parseFloat(tenant.taxRate) / 100 : 0;
    const subtotal = returnableItems.reduce((sum, item) => {
      return sum + (parseFloat(item.unitPrice) * item.returnQuantity);
    }, 0);
    const tax = subtotal * taxRate;
    return subtotal + tax;
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
    <>
    <div className="h-full overflow-y-auto touch-scroll overscroll-contain">
    <div className="p-3 sm:p-6 pb-24 sm:pb-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Receipt className="w-5 h-5 sm:w-6 sm:h-6" />
          {t("sales.title")}
        </h1>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
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

      <div className="flex-1 overflow-y-auto touch-scroll">
        <div className="space-y-4">
          {filteredOrders && filteredOrders.length > 0 ? (
            filteredOrders.map((order) => (
              <Card key={order.id} className="overflow-hidden">
                <div
                  className="p-3 sm:p-4 cursor-pointer hover-elevate"
                  onClick={() => toggleOrderExpansion(order.id)}
                  data-testid={`card-order-${order.id}`}
                >
                  {/* Mobile Layout - Row based like reference */}
                  <div className="flex sm:hidden items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted shrink-0">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{t("sales.order_number")}{order.orderNumber}</span>
                        <Badge variant={order.status === "completed" ? "default" : "secondary"} className="text-xs">
                          {t(`sales.status_${order.status || "pending"}` as any)}
                        </Badge>
                        {order.customer && (
                          <span className="text-sm font-medium">{order.customer.name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <Clock className="w-3 h-3" />
                        {order.createdAt && formatDateTime(new Date(order.createdAt))}
                        {order.customer?.phone && (
                          <span className="ml-1">{order.customer.phone}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-base">{formatCurrency(order.total)}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                        {order.payments?.[0]?.method === "card" ? (
                          <CreditCard className="w-3 h-3" />
                        ) : (
                          <Banknote className="w-3 h-3" />
                        )}
                        {order.payments?.[0]?.method || "cash"}
                      </div>
                    </div>
                  </div>
                  
                  {/* Desktop Layout */}
                  <div className="hidden sm:flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-muted">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{t("sales.order_number")}{order.orderNumber}</span>
                          <Badge variant={order.status === "completed" ? "default" : "secondary"}>
                            {t(`sales.status_${order.status || "pending"}` as any)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {order.createdAt && formatDateTime(new Date(order.createdAt))}
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
                      <div className="pt-2 flex flex-wrap gap-2">
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
                        {canProcessReturns && order.status === "completed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openReturnDialog(order);
                            }}
                            data-testid={`button-return-order-${order.id}`}
                          >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            {t("returns.process_return")}
                          </Button>
                        )}
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
      </div>
    </div>
    </div>

      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5" />
              {t("returns.title")} - #{returnOrder?.orderNumber}
            </DialogTitle>
          </DialogHeader>

          {isLoadingReturnable ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : returnableItems.length === 0 ? (
            <div className="text-center py-6">
              <RotateCcw className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">{t("returns.no_returnable_items")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("returns.select_items_to_return")}</Label>
                {returnableItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("returns.max_returnable")}: {item.returnableQuantity} @ {formatCurrency(item.unitPrice)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateReturnQuantity(item.id, -1)}
                        disabled={item.returnQuantity === 0}
                        data-testid={`button-decrease-${item.id}`}
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="w-8 text-center font-medium">{item.returnQuantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateReturnQuantity(item.id, 1)}
                        disabled={item.returnQuantity >= item.returnableQuantity}
                        data-testid={`button-increase-${item.id}`}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="return-reason">{t("returns.reason")}</Label>
                <Select value={returnReason} onValueChange={setReturnReason}>
                  <SelectTrigger id="return-reason" data-testid="select-return-reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer_changed_mind">{t("returns.reason_changed_mind")}</SelectItem>
                    <SelectItem value="defective">{t("returns.reason_defective")}</SelectItem>
                    <SelectItem value="wrong_item">{t("returns.reason_wrong_item")}</SelectItem>
                    <SelectItem value="damaged">{t("returns.reason_damaged")}</SelectItem>
                    <SelectItem value="expired">{t("returns.reason_expired")}</SelectItem>
                    <SelectItem value="other">{t("returns.reason_other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="return-notes">{t("returns.notes")}</Label>
                <Textarea
                  id="return-notes"
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder={t("returns.notes_placeholder")}
                  rows={2}
                  data-testid="textarea-return-notes"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="refund-method">{t("returns.refund_method")}</Label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger id="refund-method" data-testid="select-refund-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{t("payment.cash")}</SelectItem>
                    <SelectItem value="card">{t("payment.card")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="restock-items"
                  checked={restockItems}
                  onCheckedChange={(checked) => setRestockItems(checked as boolean)}
                  data-testid="checkbox-restock"
                />
                <Label htmlFor="restock-items" className="text-sm cursor-pointer">
                  {t("returns.restock_items")}
                </Label>
              </div>

              <Separator />

              <div className="flex justify-between items-center font-bold">
                <span>{t("returns.refund_total")}</span>
                <span className="text-lg">{formatCurrency(calculateReturnTotal())}</span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReturnDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleProcessReturn}
              disabled={returnMutation.isPending || returnableItems.every(i => i.returnQuantity === 0)}
              data-testid="button-confirm-return"
            >
              {returnMutation.isPending ? t("common.processing") : t("returns.confirm_return")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
