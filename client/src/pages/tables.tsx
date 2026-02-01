import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePOS } from "@/lib/pos-context";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Floor, Table, Order, OrderItem, Product } from "@shared/schema";
import {
  LayoutGrid,
  Users,
  Clock,
  CircleDot,
  ChefHat,
  Plus,
  Send,
  CreditCard,
  X,
  Trash2,
  Receipt,
  Minus,
  Loader2,
} from "lucide-react";

type TabWithItems = Order & { items: OrderItem[] };

export default function TablesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t, formatCurrency } = useI18n();
  const { tenant } = useAuth();
  const { setSelectedTable } = usePOS();
  const [activeFloor, setActiveFloor] = useState<string | null>(null);
  const [selectedTableForTab, setSelectedTableForTab] = useState<Table | null>(null);
  const [showTabDialog, setShowTabDialog] = useState(false);
  const [showCloseTabDialog, setShowCloseTabDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");

  const statusColors: Record<string, { bg: string; text: string; label: string }> = {
    free: { bg: "bg-green-500/10", text: "text-green-600", label: t("tables.available") },
    occupied: { bg: "bg-blue-500/10", text: "text-blue-600", label: t("tables.occupied") },
    dirty: { bg: "bg-orange-500/10", text: "text-orange-600", label: t("tables.needs_cleaning") },
    reserved: { bg: "bg-purple-500/10", text: "text-purple-600", label: t("tables.reserved") },
  };

  const { data: floors, isLoading: floorsLoading } = useQuery<Floor[]>({
    queryKey: ["/api/floors"],
  });

  const { data: tables, isLoading: tablesLoading } = useQuery<Table[]>({
    queryKey: ["/api/tables"],
  });

  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: currentTab, refetch: refetchTab, isLoading: tabLoading, isFetching: tabFetching } = useQuery<TabWithItems | null>({
    queryKey: ["/api/tabs/table", selectedTableForTab?.id],
    queryFn: async () => {
      if (!selectedTableForTab) return null;
      const res = await fetch(`/api/tabs/table/${selectedTableForTab.id}`, {
        headers: {
          "x-tenant-id": tenant?.id || "",
        },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedTableForTab && showTabDialog,
  });

  const updateTableMutation = useMutation({
    mutationFn: async ({ tableId, status }: { tableId: string; status: string }) => {
      return apiRequest("PATCH", `/api/tables/${tableId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
    },
  });

  const openTabMutation = useMutation({
    mutationFn: async (tableId: string) => {
      return apiRequest("POST", "/api/tabs", { tableId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      refetchTab();
    },
  });

  const sendToKitchenMutation = useMutation({
    mutationFn: async (tabId: string) => {
      return apiRequest("POST", `/api/tabs/${tabId}/send-to-kitchen`, {});
    },
    onSuccess: (data: any) => {
      refetchTab();
      toast({
        title: t("tabs.sent_to_kitchen"),
        description: t("tabs.items_sent", { count: data.itemsSent }),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("tabs.send_failed"),
        variant: "destructive",
      });
    },
  });

  const closeTabMutation = useMutation({
    mutationFn: async ({ tabId, paymentMethod }: { tabId: string; paymentMethod: string }) => {
      return apiRequest("POST", `/api/tabs/${tabId}/close`, { paymentMethod });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      setShowCloseTabDialog(false);
      setShowTabDialog(false);
      setSelectedTableForTab(null);
      toast({
        title: t("tabs.tab_closed"),
        description: t("tabs.payment_processed"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("tabs.close_failed"),
        variant: "destructive",
      });
    },
  });

  const cancelTabMutation = useMutation({
    mutationFn: async (tabId: string) => {
      return apiRequest("POST", `/api/tabs/${tabId}/cancel`, { reason: "Cancelled by user" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      setShowTabDialog(false);
      setSelectedTableForTab(null);
      toast({
        title: t("tabs.tab_cancelled"),
      });
    },
  });

  // Set default floor when data loads
  if (floors?.length && !activeFloor) {
    setActiveFloor(floors[0].id);
  }

  const currentFloorTables = tables?.filter((t) => t.floorId === activeFloor) || [];

  const handleTableClick = async (table: Table) => {
    if (table.status === "free") {
      // Open new tab for this table
      setSelectedTableForTab(table);
      try {
        await openTabMutation.mutateAsync(table.id);
        setShowTabDialog(true);
      } catch (error) {
        console.error("Failed to open tab:", error);
      }
    } else if (table.status === "occupied") {
      // Show existing tab
      setSelectedTableForTab(table);
      setShowTabDialog(true);
    } else if (table.status === "dirty") {
      // Mark as clean
      updateTableMutation.mutate({ tableId: table.id, status: "free" });
      toast({
        title: t("tables.table_cleaned"),
        description: `${table.name} ${t("tables.now_available")}`,
      });
    }
  };

  const handleAddItems = () => {
    if (selectedTableForTab) {
      setSelectedTable(selectedTableForTab.id);
      navigate("/pos");
    }
  };

  const handleSendToKitchen = () => {
    if (currentTab) {
      sendToKitchenMutation.mutate(currentTab.id);
    }
  };

  const handleCloseTab = () => {
    setShowCloseTabDialog(true);
  };

  const confirmCloseTab = () => {
    if (currentTab) {
      closeTabMutation.mutate({ tabId: currentTab.id, paymentMethod });
    }
  };

  const handleCancelTab = () => {
    if (currentTab && confirm(t("tabs.confirm_cancel"))) {
      cancelTabMutation.mutate(currentTab.id);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "free":
        return <CircleDot className="w-4 h-4" />;
      case "occupied":
        return <Users className="w-4 h-4" />;
      case "dirty":
        return <Clock className="w-4 h-4" />;
      case "reserved":
        return <Clock className="w-4 h-4" />;
      default:
        return <CircleDot className="w-4 h-4" />;
    }
  };

  const getProductName = (productId: string) => {
    const product = products?.find((p) => p.id === productId);
    return product?.name || t("common.unknown");
  };

  const stats = {
    total: tables?.filter((t) => t.floorId === activeFloor).length || 0,
    free: currentFloorTables.filter((t) => t.status === "free").length,
    occupied: currentFloorTables.filter((t) => t.status === "occupied").length,
    dirty: currentFloorTables.filter((t) => t.status === "dirty").length,
  };

  const unsentItems = currentTab?.items?.filter((item) => !item.sentToKitchen) || [];
  const sentItems = currentTab?.items?.filter((item) => item.sentToKitchen) || [];

  if (floorsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!floors?.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground">
        <LayoutGrid className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-xl font-medium mb-2">{t("tables.no_floors")}</p>
        <p className="text-center mb-6">
          {t("tables.setup_floors")}
        </p>
        <Button onClick={() => navigate("/settings")} data-testid="button-goto-settings">
          <Plus className="w-4 h-4 mr-2" />
          {t("tables.add_floors")}
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto touch-scroll overscroll-contain">
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight truncate">{t("tables.title")}</h1>
          <p className="text-sm text-muted-foreground truncate">
            {t("tables.subtitle")}
          </p>
        </div>
        <Button onClick={() => navigate("/kitchen")} variant="outline" size="sm" data-testid="button-goto-kitchen">
          <ChefHat className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">{t("tables.kitchen_view")}</span>
        </Button>
      </div>

      {/* Floor Tabs */}
      <Tabs value={activeFloor || ""} onValueChange={setActiveFloor}>
        <TabsList className="h-9">
          {floors.map((floor) => (
            <TabsTrigger
              key={floor.id}
              value={floor.id}
              className="text-sm px-3"
              data-testid={`tab-floor-${floor.id}`}
            >
              {floor.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-4 mt-4">
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs lg:text-sm text-muted-foreground">{t("tables.total_tables")}</p>
                  <p className="text-xl lg:text-2xl font-bold">{stats.total}</p>
                </div>
                <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-muted flex items-center justify-center">
                  <LayoutGrid className="w-4 h-4 lg:w-5 lg:h-5 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs lg:text-sm text-muted-foreground">{t("tables.available")}</p>
                  <p className="text-xl lg:text-2xl font-bold text-green-600">{stats.free}</p>
                </div>
                <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CircleDot className="w-4 h-4 lg:w-5 lg:h-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs lg:text-sm text-muted-foreground">{t("tables.occupied")}</p>
                  <p className="text-xl lg:text-2xl font-bold text-blue-600">{stats.occupied}</p>
                </div>
                <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Users className="w-4 h-4 lg:w-5 lg:h-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs lg:text-sm text-muted-foreground">{t("tables.needs_cleaning")}</p>
                  <p className="text-xl lg:text-2xl font-bold text-orange-600">{stats.dirty}</p>
                </div>
                <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Clock className="w-4 h-4 lg:w-5 lg:h-5 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tables Grid */}
        {floors.map((floor) => (
          <TabsContent key={floor.id} value={floor.id} className="mt-4">
            {tablesLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 lg:gap-4">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-28 lg:h-32" />
                ))}
              </div>
            ) : currentFloorTables.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <LayoutGrid className="w-10 h-10 mb-3 opacity-30" />
                <p className="font-medium text-sm">{t("tables.no_tables_floor")}</p>
                <p className="text-xs">{t("tables.add_tables_settings")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 lg:gap-4">
                {currentFloorTables.map((table) => {
                  const status = statusColors[table.status || "free"];
                  return (
                    <button
                      key={table.id}
                      onClick={() => handleTableClick(table)}
                      className={`relative p-4 rounded-lg border-2 transition-all hover-elevate active-elevate-2 text-left ${status.bg} border-transparent hover:border-primary/50`}
                      data-testid={`button-table-${table.id}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-bold text-lg">{table.name}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {table.capacity} {t("tables.seats")}
                        </Badge>
                      </div>
                      <div className={`flex items-center gap-2 ${status.text}`}>
                        {getStatusIcon(table.status || "free")}
                        <span className="text-sm font-medium">{status.label}</span>
                      </div>
                      {table.status === "occupied" && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {t("tabs.tap_to_manage")}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 pt-4 border-t">
        <span className="text-sm text-muted-foreground">{t("tables.legend_status")}</span>
        {Object.entries(statusColors).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${value.bg}`} />
            <span className="text-sm">{value.label}</span>
          </div>
        ))}
      </div>
    </div>

    {/* Tab Management Dialog */}
    <Dialog open={showTabDialog} onOpenChange={setShowTabDialog}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            {selectedTableForTab?.name} - {t("tabs.open_tab")}
          </DialogTitle>
          <DialogDescription>
            {currentTab ? `${t("tabs.order")} #${currentTab.orderNumber}` : t("tabs.new_tab")}
          </DialogDescription>
        </DialogHeader>

        {(tabLoading || tabFetching) && !currentTab && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!tabLoading && !tabFetching && !currentTab && (
          <div className="space-y-4">
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t("tabs.no_items")}</p>
              <p className="text-sm">{t("tabs.add_items_hint")}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddItems} className="flex-1" data-testid="button-add-items-new">
                <Plus className="w-4 h-4 mr-2" />
                {t("tabs.add_items")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowTabDialog(false);
                  setSelectedTableForTab(null);
                }}
                data-testid="button-close-dialog"
              >
                {t("common.close")}
              </Button>
            </div>
          </div>
        )}

        {currentTab && (
          <div className="space-y-4">
            {/* Unsent Items */}
            {unsentItems.length > 0 && (
              <div>
                <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  {t("tabs.pending_items")}
                </h4>
                <div className="space-y-2 bg-orange-500/5 rounded-lg p-3">
                  {unsentItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium">{item.quantity}x</span>{" "}
                        {getProductName(item.productId)}
                      </div>
                      <span>{formatCurrency(parseFloat(item.unitPrice) * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sent Items */}
            {sentItems.length > 0 && (
              <div>
                <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                  <ChefHat className="w-4 h-4 text-green-500" />
                  {t("tabs.sent_items")}
                </h4>
                <div className="space-y-2 bg-green-500/5 rounded-lg p-3">
                  {sentItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium">{item.quantity}x</span>{" "}
                        {getProductName(item.productId)}
                      </div>
                      <span>{formatCurrency(parseFloat(item.unitPrice) * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {currentTab.items?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>{t("tabs.no_items")}</p>
                <p className="text-sm">{t("tabs.add_items_hint")}</p>
              </div>
            )}

            {/* Totals */}
            <div className="border-t pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span>{t("pos.subtotal")}</span>
                <span>{formatCurrency(parseFloat(currentTab.subtotal))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>{t("pos.tax")}</span>
                <span>{formatCurrency(parseFloat(currentTab.taxAmount))}</span>
              </div>
              <div className="flex justify-between font-bold text-lg">
                <span>{t("pos.total")}</span>
                <span>{formatCurrency(parseFloat(currentTab.total))}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button onClick={handleAddItems} variant="outline" data-testid="button-add-items">
                <Plus className="w-4 h-4 mr-2" />
                {t("tabs.add_items")}
              </Button>
              <Button
                onClick={handleSendToKitchen}
                variant="outline"
                disabled={unsentItems.length === 0 || sendToKitchenMutation.isPending}
                data-testid="button-send-kitchen"
              >
                <Send className="w-4 h-4 mr-2" />
                {t("tabs.send_to_kitchen")}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleCancelTab}
                variant="destructive"
                disabled={cancelTabMutation.isPending}
                data-testid="button-cancel-tab"
              >
                <X className="w-4 h-4 mr-2" />
                {t("tabs.cancel_tab")}
              </Button>
              <Button
                onClick={handleCloseTab}
                disabled={parseFloat(currentTab.total) === 0 || closeTabMutation.isPending}
                data-testid="button-close-tab"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                {t("tabs.close_tab")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Close Tab / Payment Dialog */}
    <Dialog open={showCloseTabDialog} onOpenChange={setShowCloseTabDialog}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("tabs.close_tab")}</DialogTitle>
          <DialogDescription>
            {t("tabs.total_amount")}: {currentTab && formatCurrency(parseFloat(currentTab.total))}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">{t("pos.payment_method")}</label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as "cash" | "card")}>
              <SelectTrigger data-testid="select-payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{t("pos.cash")}</SelectItem>
                <SelectItem value="card">{t("pos.card")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowCloseTabDialog(false)}
              data-testid="button-cancel-payment"
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="flex-1"
              onClick={confirmCloseTab}
              disabled={closeTabMutation.isPending}
              data-testid="button-confirm-payment"
            >
              {closeTabMutation.isPending ? t("common.processing") : t("tabs.confirm_payment")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </div>
  );
}
