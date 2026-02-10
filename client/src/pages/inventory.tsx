import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { Product, StockMovement } from "@shared/schema";
import {
  Package,
  Search,
  Plus,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  History,
  Loader2,
  ArrowLeftRight,
  Warehouse,
} from "lucide-react";
import type { Category } from "@shared/schema";

const adjustmentSchema = z.object({
  type: z.enum(["adjustment", "purchase", "waste"]),
  quantity: z.number().int().min(1),
  notes: z.string().optional(),
});

type AdjustmentFormData = z.infer<typeof adjustmentSchema>;

const transferSchema = z.object({
  productId: z.string().min(1),
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  quantity: z.number().int().min(1),
  notes: z.string().optional(),
});

type TransferFormData = z.infer<typeof transferSchema>;

export default function InventoryPage() {
  const { toast } = useToast();
  const { t, formatDate } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [adjustmentDirection, setAdjustmentDirection] = useState<"add" | "remove">("add");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("all");
  const [showTransferDialog, setShowTransferDialog] = useState(false);

  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: warehouses } = useQuery<any[]>({
    queryKey: ["/api/warehouses"],
  });

  useEffect(() => {
    if (warehouses && warehouses.length > 0 && selectedWarehouseId === "all") {
      const defaultWh = warehouses.find((w: any) => w.isDefault) || warehouses[0];
      if (defaultWh) {
        setSelectedWarehouseId(defaultWh.id);
      }
    }
  }, [warehouses]);

  const levelsUrl = selectedWarehouseId !== "all"
    ? `/api/inventory/levels?warehouseId=${selectedWarehouseId}`
    : "/api/inventory/levels";

  const movementsUrl = selectedWarehouseId !== "all"
    ? `/api/inventory/movements?warehouseId=${selectedWarehouseId}`
    : "/api/inventory/movements";

  const { data: stockLevels } = useQuery<Record<string, number>>({
    queryKey: [levelsUrl],
  });

  const { data: movements, isLoading: movementsLoading } = useQuery<StockMovement[]>({
    queryKey: [movementsUrl],
  });

  const adjustStockMutation = useMutation({
    mutationFn: async (data: {
      productId: string;
      type: string;
      quantity: number;
      notes?: string;
      warehouseId?: string;
    }) => {
      return apiRequest("POST", "/api/inventory/adjust", data);
    },
    onSuccess: () => {
      toast({
        title: t("inventory.stock_adjusted"),
        description: t("inventory.stock_updated_success"),
      });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/inventory/levels") });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/inventory/movements") });
      setShowAdjustmentDialog(false);
      setSelectedProduct(null);
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("inventory.stock_adjust_error"),
        variant: "destructive",
      });
    },
  });

  const transferMutation = useMutation({
    mutationFn: async (data: TransferFormData) => {
      return apiRequest("POST", "/api/inventory/transfer", data);
    },
    onSuccess: () => {
      toast({ title: t("inventory.transfer_success") });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/inventory/levels") });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/inventory/movements") });
      setShowTransferDialog(false);
      transferForm.reset();
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("inventory.transfer_error"),
        variant: "destructive",
      });
    },
  });

  const form = useForm<AdjustmentFormData>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      type: "adjustment",
      quantity: 1,
      notes: "",
    },
  });

  const transferForm = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      productId: "",
      fromWarehouseId: "",
      toWarehouseId: "",
      quantity: 1,
      notes: "",
    },
  });

  const filteredProducts = products?.filter((product) =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.barcode?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStockLevel = (productId: string) => stockLevels?.[productId] || 0;

  const getStockStatus = (level: number) => {
    if (level <= 0) return { color: "bg-red-500", label: t("inventory.out_of_stock") };
    if (level <= 10) return { color: "bg-yellow-500", label: t("inventory.low_stock") };
    return { color: "bg-green-500", label: t("inventory.in_stock") };
  };

  const handleAdjustStock = (product: Product, direction: "add" | "remove") => {
    setSelectedProduct(product);
    setAdjustmentDirection(direction);
    form.reset({
      type: direction === "add" ? "purchase" : "adjustment",
      quantity: 1,
      notes: "",
    });
    setShowAdjustmentDialog(true);
  };

  const onSubmitAdjustment = (data: AdjustmentFormData) => {
    if (!selectedProduct) return;

    adjustStockMutation.mutate({
      productId: selectedProduct.id,
      type: data.type,
      quantity: adjustmentDirection === "add" ? data.quantity : -data.quantity,
      notes: data.notes,
      warehouseId: selectedWarehouseId !== "all" ? selectedWarehouseId : undefined,
    });
  };

  const onSubmitTransfer = (data: TransferFormData) => {
    if (data.fromWarehouseId === data.toWarehouseId) {
      toast({ title: t("common.error"), description: t("inventory.transfer_error"), variant: "destructive" });
      return;
    }
    transferMutation.mutate(data);
  };

  const getMovementIcon = (type: string) => {
    switch (type) {
      case "sale":
        return <ArrowDownRight className="w-4 h-4 text-red-500" />;
      case "purchase":
        return <ArrowUpRight className="w-4 h-4 text-green-500" />;
      case "adjustment":
        return <TrendingUp className="w-4 h-4 text-blue-500" />;
      case "waste":
        return <TrendingDown className="w-4 h-4 text-orange-500" />;
      case "transfer":
        return <ArrowLeftRight className="w-4 h-4 text-purple-500" />;
      default:
        return <History className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const stats = {
    totalProducts: products?.filter((p) => p.trackInventory).length || 0,
    lowStock: products?.filter((p) => p.trackInventory && getStockLevel(p.id) <= 10 && getStockLevel(p.id) > 0).length || 0,
    outOfStock: products?.filter((p) => p.trackInventory && getStockLevel(p.id) <= 0).length || 0,
  };

  const hasMultipleWarehouses = warehouses && warehouses.length > 1;
  const trackedProducts = products?.filter((p) => p.trackInventory) || [];

  return (
    <div className="h-full overflow-y-auto touch-scroll overscroll-contain">
    <div className="p-3 sm:p-6 pb-24 sm:pb-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t("inventory.title")}</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {t("inventory.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {warehouses && warehouses.length > 0 && (
            <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
              <SelectTrigger className="w-[180px]" data-testid="select-warehouse-filter">
                <Warehouse className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder={t("inventory.select_warehouse")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="select-warehouse-all">{t("inventory.all_warehouses")}</SelectItem>
                {warehouses.map((wh: any) => (
                  <SelectItem key={wh.id} value={wh.id} data-testid={`select-warehouse-${wh.id}`}>
                    {wh.name}{wh.isDefault ? ` (${t("warehouses.default")})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {hasMultipleWarehouses && (
            <Button
              variant="outline"
              onClick={() => {
                transferForm.reset({
                  productId: "",
                  fromWarehouseId: warehouses![0]?.id || "",
                  toWarehouseId: warehouses![1]?.id || "",
                  quantity: 1,
                  notes: "",
                });
                setShowTransferDialog(true);
              }}
              data-testid="button-transfer-stock"
            >
              <ArrowLeftRight className="w-4 h-4 mr-2" />
              {t("inventory.transfer")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("inventory.total_products")}</p>
                <p className="text-2xl font-bold">{stats.totalProducts}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("inventory.low_stock")}</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.lowStock}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("inventory.out_of_stock")}</p>
                <p className="text-2xl font-bold text-red-500">{stats.outOfStock}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products" data-testid="tab-products">{t("nav.products")}</TabsTrigger>
          <TabsTrigger value="movements" data-testid="tab-movements">{t("inventory.history")}</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4 space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("inventory.search_placeholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-inventory"
            />
          </div>

          {productsLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : filteredProducts?.filter((p) => p.trackInventory).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Package className="w-12 h-12 mb-4 opacity-30" />
              <p className="font-medium">{t("inventory.no_products")}</p>
              <p className="text-sm">{t("inventory.adjust_search")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProducts?.filter((p) => p.trackInventory).map((product) => {
                const stockLevel = getStockLevel(product.id);
                const status = getStockStatus(stockLevel);

                return (
                  <Card key={product.id} className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-medium truncate">{product.name}</h3>
                          <Badge variant="secondary" className="text-xs">
                            {product.sku || t("inventory.no_sku")}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          {product.barcode && (
                            <span>{t("inventory.barcode")}: {product.barcode}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${status.color}`} />
                            <span className="font-bold text-lg">{stockLevel}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{status.label}</p>
                        </div>

                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => handleAdjustStock(product, "add")}
                            data-testid={`button-add-stock-${product.id}`}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => handleAdjustStock(product, "remove")}
                            disabled={stockLevel <= 0}
                            data-testid={`button-remove-stock-${product.id}`}
                          >
                            <Minus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="movements" className="mt-4">
          {movementsLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : movements?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <History className="w-12 h-12 mb-4 opacity-30" />
              <p className="font-medium">{t("inventory.no_movements")}</p>
              <p className="text-sm">{t("inventory.movements_appear_here")}</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {movements?.slice(0, 50).map((movement) => {
                  const product = products?.find((p) => p.id === movement.productId);
                  const wh = warehouses?.find((w: any) => w.id === (movement as any).warehouseId);
                  return (
                    <Card key={movement.id} className="p-3">
                      <div className="flex items-center gap-3">
                        {product?.image ? (
                          <img 
                            src={product.image} 
                            alt={product.name}
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                            {getMovementIcon(movement.type)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">
                              {product?.name || t("inventory.unknown_product")}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {t(`inventory.movement_${movement.type}`)}
                            </Badge>
                            {wh && (
                              <Badge variant="outline" className="text-xs">
                                {wh.name}
                              </Badge>
                            )}
                          </div>
                          {movement.notes && (
                            <p className="text-xs text-muted-foreground truncate">
                              {movement.notes}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span
                            className={`font-bold ${
                              movement.quantity > 0 ? "text-green-600" : "text-red-500"
                            }`}
                          >
                            {movement.quantity > 0 ? "+" : ""}
                            {movement.quantity}
                          </span>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(new Date(movement.createdAt!))}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showAdjustmentDialog} onOpenChange={setShowAdjustmentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjustmentDirection === "add" ? t("inventory.add_stock") : t("inventory.remove_stock")}
            </DialogTitle>
          </DialogHeader>

          {selectedProduct && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitAdjustment)} className="space-y-4">
                <div className="p-3 rounded-lg bg-muted">
                  <p className="font-medium">{selectedProduct.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("inventory.current_stock")}: {getStockLevel(selectedProduct.id)}
                  </p>
                  {selectedWarehouseId !== "all" && warehouses && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {warehouses.find((w: any) => w.id === selectedWarehouseId)?.name}
                    </p>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("inventory.reason")}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-adjustment-type">
                            <SelectValue placeholder={t("inventory.select_reason")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {adjustmentDirection === "add" ? (
                            <>
                              <SelectItem value="purchase">{t("inventory.purchase")}</SelectItem>
                              <SelectItem value="adjustment">{t("inventory.adjustment")}</SelectItem>
                            </>
                          ) : (
                            <>
                              <SelectItem value="adjustment">{t("inventory.adjustment")}</SelectItem>
                              <SelectItem value="waste">{t("inventory.waste")}</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("inventory.quantity")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                          data-testid="input-adjustment-quantity"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("inventory.notes")} ({t("common.optional")})</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t("inventory.notes_placeholder")}
                          {...field}
                          data-testid="input-adjustment-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAdjustmentDialog(false)}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="submit"
                    disabled={adjustStockMutation.isPending}
                    data-testid="button-submit-adjustment"
                  >
                    {adjustStockMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t("common.saving")}
                      </>
                    ) : (
                      <>
                        {adjustmentDirection === "add" ? (
                          <Plus className="w-4 h-4 mr-2" />
                        ) : (
                          <Minus className="w-4 h-4 mr-2" />
                        )}
                        {adjustmentDirection === "add" ? t("inventory.add_stock") : t("inventory.remove_stock")}
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5" />
              {t("inventory.transfer_stock")}
            </DialogTitle>
          </DialogHeader>

          <Form {...transferForm}>
            <form onSubmit={transferForm.handleSubmit(onSubmitTransfer)} className="space-y-4">
              <FormField
                control={transferForm.control}
                name="productId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nav.products")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-transfer-product">
                          <SelectValue placeholder={t("inventory.select_product")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {trackedProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={transferForm.control}
                  name="fromWarehouseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("inventory.from_warehouse")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-transfer-from">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {warehouses?.map((wh: any) => (
                            <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={transferForm.control}
                  name="toWarehouseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("inventory.to_warehouse")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-transfer-to">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {warehouses?.map((wh: any) => (
                            <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={transferForm.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inventory.quantity")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        data-testid="input-transfer-quantity"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={transferForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inventory.notes")} ({t("common.optional")})</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t("inventory.notes_placeholder")}
                        {...field}
                        data-testid="input-transfer-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowTransferDialog(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={transferMutation.isPending}
                  data-testid="button-submit-transfer"
                >
                  {transferMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowLeftRight className="w-4 h-4 mr-2" />
                  )}
                  {t("inventory.transfer")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
