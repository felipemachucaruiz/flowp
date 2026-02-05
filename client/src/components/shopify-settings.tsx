import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ShoppingBag,
  Link2,
  Unlink,
  RefreshCw,
  Package,
  DollarSign,
  ArrowRightLeft,
  Loader2,
} from "lucide-react";

const shopifyConfigSchema = z.object({
  shopDomain: z.string().min(1, "Shop domain is required").regex(/^[a-z0-9-]+\.myshopify\.com$/, "Invalid Shopify domain format (e.g., my-store.myshopify.com)"),
  accessToken: z.string().min(1, "Access token is required"),
  syncInventory: z.boolean().default(true),
  syncPrices: z.boolean().default(true),
  generateDianDocuments: z.boolean().default(true),
  shopifyLocationId: z.string().optional(),
});

type ShopifyConfigFormData = z.infer<typeof shopifyConfigSchema>;

interface ShopifyStatus {
  configured: boolean;
  isActive: boolean;
  shopName?: string;
  syncInventory?: boolean;
  syncPrices?: boolean;
  generateDianDocuments?: boolean;
  lastSyncAt?: string;
  stats?: {
    totalOrders: number;
    completedOrders: number;
    failedOrders: number;
    pendingOrders: number;
  };
}

interface ShopifyLocation {
  id: number;
  name: string;
  active: boolean;
  address1?: string;
  city?: string;
}

interface ProductMapping {
  id: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  shopifyTitle: string | null;
  shopifyVariantTitle: string | null;
  shopifySku: string | null;
  flowpProductId: string | null;
  flowpProductName?: string;
  flowpProductSku?: string | null;
  autoMatched: boolean;
  isActive: boolean;
  lastInventorySync: string | null;
  lastPriceSync: string | null;
}

interface ShopifyOrder {
  id: string;
  shopifyOrderId: string;
  shopifyOrderNumber: string;
  shopifyOrderName: string;
  status: string;
  totalPrice: string;
  currency: string;
  customerEmail?: string;
  flowpOrderId?: string;
  errorMessage?: string;
  createdAt: string;
}

export function ShopifySettings() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = user?.tenantId;

  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showMappingsDialog, setShowMappingsDialog] = useState(false);
  const [showOrdersDialog, setShowOrdersDialog] = useState(false);
  const [isSyncing, setIsSyncing] = useState<"inventory" | "prices" | null>(null);

  const { data: status, isLoading: statusLoading } = useQuery<ShopifyStatus>({
    queryKey: ["/api/shopify/status"],
    enabled: !!tenantId,
  });

  const { data: locations } = useQuery<{ locations: ShopifyLocation[] }>({
    queryKey: ["/api/shopify/locations"],
    enabled: !!tenantId && status?.configured,
  });

  const { data: mappings } = useQuery<{ mappings: ProductMapping[] }>({
    queryKey: ["/api/shopify/mappings"],
    enabled: !!tenantId && status?.configured,
  });

  const { data: orders } = useQuery<{ orders: ShopifyOrder[] }>({
    queryKey: ["/api/shopify/orders"],
    enabled: !!tenantId && status?.configured,
  });

  const configForm = useForm<ShopifyConfigFormData>({
    resolver: zodResolver(shopifyConfigSchema),
    defaultValues: {
      shopDomain: "",
      accessToken: "",
      syncInventory: true,
      syncPrices: true,
      generateDianDocuments: true,
      shopifyLocationId: "",
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (data: ShopifyConfigFormData) => {
      const res = await apiRequest("POST", "/api/shopify/config", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/locations"] });
      setShowConfigDialog(false);
      toast({
        title: "Configuration saved",
        description: "Shopify integration has been configured successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || "Failed to save configuration",
        variant: "destructive",
      });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<ShopifyConfigFormData>) => {
      const res = await apiRequest("PATCH", "/api/shopify/config", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/status"] });
      toast({
        title: t("common.success"),
        description: "Settings updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/shopify/disconnect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/status"] });
      toast({
        title: "Disconnected",
        description: "Shopify integration has been disconnected.",
      });
    },
  });

  const autoMapMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/shopify/mappings/auto");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/mappings"] });
      toast({
        title: "Products mapped",
        description: `${data.mappingsCreated || 0} new mappings created, ${data.mappingsUpdated || 0} updated`,
      });
    },
  });

  const syncInventoryMutation = useMutation({
    mutationFn: async () => {
      setIsSyncing("inventory");
      const res = await apiRequest("POST", "/api/shopify/sync/inventory");
      return res.json();
    },
    onSuccess: (data: any) => {
      setIsSyncing(null);
      toast({
        title: "Inventory synced",
        description: `${data.itemsProcessed || 0} items synced to Shopify`,
      });
    },
    onError: () => {
      setIsSyncing(null);
    },
  });

  const syncPricesMutation = useMutation({
    mutationFn: async () => {
      setIsSyncing("prices");
      const res = await apiRequest("POST", "/api/shopify/sync/prices");
      return res.json();
    },
    onSuccess: (data: any) => {
      setIsSyncing(null);
      toast({
        title: "Prices synced",
        description: `${data.itemsProcessed || 0} prices synced to Shopify`,
      });
    },
    onError: () => {
      setIsSyncing(null);
    },
  });

  const onSubmitConfig = (data: ShopifyConfigFormData) => {
    saveConfigMutation.mutate(data);
  };

  if (statusLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <ShoppingBag className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                {t("shopify.title")}
                {status?.configured && (
                  <Badge variant={status.isActive ? "default" : "secondary"}>
                    {status.isActive ? t("common.active") : t("common.inactive")}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {status?.configured 
                  ? (status.shopName || t("shopify.connected_desc"))
                  : t("shopify.not_configured")}
              </CardDescription>
            </div>
          </div>
          {status?.configured ? (
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                data-testid="button-disconnect-shopify"
              >
                <Unlink className="w-4 h-4 mr-2" />
                {t("common.disconnect")}
              </Button>
            </div>
          ) : (
            <Button 
              onClick={() => setShowConfigDialog(true)}
              data-testid="button-connect-shopify"
            >
              <Link2 className="w-4 h-4 mr-2" />
              {t("shopify.connect")}
            </Button>
          )}
        </CardHeader>
        
        {status?.configured && status.stats && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{status.stats.totalOrders}</div>
                <div className="text-sm text-muted-foreground">{t("shopify.total_orders")}</div>
              </div>
              <div className="text-center p-3 bg-green-500/10 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{status.stats.completedOrders}</div>
                <div className="text-sm text-muted-foreground">{t("shopify.completed")}</div>
              </div>
              <div className="text-center p-3 bg-yellow-500/10 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{status.stats.pendingOrders}</div>
                <div className="text-sm text-muted-foreground">{t("shopify.pending")}</div>
              </div>
              <div className="text-center p-3 bg-red-500/10 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{status.stats.failedOrders}</div>
                <div className="text-sm text-muted-foreground">{t("shopify.failed")}</div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {status?.configured && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" />
              {t("shopify.sync_settings")}
            </CardTitle>
            <CardDescription>
              {t("shopify.sync_settings_desc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-medium">
                  <Package className="w-4 h-4" />
                  {t("shopify.sync_inventory")}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("shopify.sync_inventory_desc")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={status.syncInventory}
                  onCheckedChange={(checked) => updateSettingsMutation.mutate({ syncInventory: checked })}
                  data-testid="switch-sync-inventory"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncInventoryMutation.mutate()}
                  disabled={isSyncing !== null}
                  data-testid="button-sync-inventory"
                >
                  {isSyncing === "inventory" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-medium">
                  <DollarSign className="w-4 h-4" />
                  {t("shopify.sync_prices")}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("shopify.sync_prices_desc")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={status.syncPrices}
                  onCheckedChange={(checked) => updateSettingsMutation.mutate({ syncPrices: checked })}
                  data-testid="switch-sync-prices"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncPricesMutation.mutate()}
                  disabled={isSyncing !== null}
                  data-testid="button-sync-prices"
                >
                  {isSyncing === "prices" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-medium">
                  <ShoppingBag className="w-4 h-4" />
                  {t("shopify.generate_dian")}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("shopify.generate_dian_desc")}
                </p>
              </div>
              <Switch
                checked={status.generateDianDocuments}
                onCheckedChange={(checked) => updateSettingsMutation.mutate({ generateDianDocuments: checked })}
                data-testid="switch-generate-dian"
              />
            </div>

            {locations?.locations && locations.locations.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("shopify.location")}</label>
                  <Select
                    defaultValue=""
                    onValueChange={(value) => updateSettingsMutation.mutate({ shopifyLocationId: value })}
                  >
                    <SelectTrigger data-testid="select-shopify-location">
                      <SelectValue placeholder={t("shopify.select_location")} />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.locations.map((loc) => (
                        <SelectItem key={loc.id} value={String(loc.id)}>
                          {loc.name} {loc.city && `(${loc.city})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t("shopify.location_desc")}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {status?.configured && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                {t("shopify.product_mappings")}
              </CardTitle>
              <CardDescription>
                {t("shopify.product_mappings_desc")}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => autoMapMutation.mutate()}
                disabled={autoMapMutation.isPending}
                data-testid="button-auto-map"
              >
                {autoMapMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {t("shopify.auto_map")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMappingsDialog(true)}
                data-testid="button-view-mappings"
              >
                {t("common.view_all")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              {mappings?.mappings?.length || 0} {t("shopify.products_mapped_count")}
            </div>
          </CardContent>
        </Card>
      )}

      {status?.configured && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5" />
                {t("shopify.recent_orders")}
              </CardTitle>
              <CardDescription>
                {t("shopify.recent_orders_desc")}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOrdersDialog(true)}
              data-testid="button-view-orders"
            >
              {t("common.view_all")}
            </Button>
          </CardHeader>
          <CardContent>
            {orders?.orders && orders.orders.length > 0 ? (
              <div className="space-y-2">
                {orders.orders.slice(0, 5).map((order) => (
                  <div 
                    key={order.id}
                    className="flex items-center justify-between p-2 bg-muted rounded-lg"
                  >
                    <div>
                      <span className="font-medium">{order.shopifyOrderName}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        {order.currency} {order.totalPrice}
                      </span>
                      <Badge variant={
                        order.status === "completed" ? "default" :
                        order.status === "failed" ? "destructive" : "secondary"
                      }>
                        {order.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("shopify.no_orders")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              {t("shopify.connect_title")}
            </DialogTitle>
            <DialogDescription>
              {t("shopify.connect_desc")}
            </DialogDescription>
          </DialogHeader>
          <Form {...configForm}>
            <form onSubmit={configForm.handleSubmit(onSubmitConfig)} className="space-y-4">
              <FormField
                control={configForm.control}
                name="shopDomain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("shopify.shop_domain")}</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="my-store.myshopify.com"
                        data-testid="input-shop-domain"
                      />
                    </FormControl>
                    <FormDescription>
                      {t("shopify.shop_domain_help")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={configForm.control}
                name="accessToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("shopify.access_token")}</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="password"
                        placeholder="shpat_..."
                        data-testid="input-access-token"
                      />
                    </FormControl>
                    <FormDescription>
                      {t("shopify.access_token_help")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-3 pt-2">
                <FormField
                  control={configForm.control}
                  name="syncInventory"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>{t("shopify.sync_inventory")}</FormLabel>
                        <FormDescription className="text-xs">
                          {t("shopify.sync_inventory_desc")}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-form-sync-inventory"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={configForm.control}
                  name="syncPrices"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>{t("shopify.sync_prices")}</FormLabel>
                        <FormDescription className="text-xs">
                          {t("shopify.sync_prices_desc")}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-form-sync-prices"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={configForm.control}
                  name="generateDianDocuments"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>{t("shopify.generate_dian")}</FormLabel>
                        <FormDescription className="text-xs">
                          {t("shopify.generate_dian_desc")}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-form-generate-dian"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowConfigDialog(false)}
                  data-testid="button-cancel-shopify-config"
                >
                  {t("common.cancel")}
                </Button>
                <Button 
                  type="submit" 
                  disabled={saveConfigMutation.isPending}
                  data-testid="button-save-shopify-config"
                >
                  {saveConfigMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={showMappingsDialog} onOpenChange={setShowMappingsDialog}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t("shopify.product_mappings")}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("shopify.shopify_product")}</TableHead>
                  <TableHead>{t("shopify.flowp_product")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("shopify.last_sync")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings?.mappings?.map((mapping) => (
                  <TableRow key={mapping.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{mapping.shopifyTitle}</div>
                        {mapping.shopifyVariantTitle && (
                          <div className="text-sm text-muted-foreground">{mapping.shopifyVariantTitle}</div>
                        )}
                        {mapping.shopifySku && (
                          <div className="text-xs text-muted-foreground">SKU: {mapping.shopifySku}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {mapping.flowpProductName ? (
                        <div>
                          <div className="font-medium">{mapping.flowpProductName}</div>
                          {mapping.flowpProductSku && (
                            <div className="text-xs text-muted-foreground">SKU: {mapping.flowpProductSku}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">{t("shopify.not_mapped")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={mapping.isActive ? "default" : "secondary"}>
                        {mapping.autoMatched ? t("shopify.auto") : t("shopify.manual")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {mapping.lastInventorySync 
                        ? new Date(mapping.lastInventorySync).toLocaleString()
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
                {(!mappings?.mappings || mappings.mappings.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      {t("shopify.no_mappings")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={showOrdersDialog} onOpenChange={setShowOrdersDialog}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t("shopify.shopify_orders")}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("shopify.order_name")}</TableHead>
                  <TableHead>{t("shopify.customer")}</TableHead>
                  <TableHead>{t("shopify.total")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders?.orders?.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.shopifyOrderName}</TableCell>
                    <TableCell>{order.customerEmail || "-"}</TableCell>
                    <TableCell>{order.currency} {order.totalPrice}</TableCell>
                    <TableCell>
                      <Badge variant={
                        order.status === "completed" ? "default" :
                        order.status === "failed" ? "destructive" : "secondary"
                      }>
                        {order.status}
                      </Badge>
                      {order.errorMessage && (
                        <div className="text-xs text-destructive mt-1">{order.errorMessage}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(order.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {(!orders?.orders || orders.orders.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {t("shopify.no_orders")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
