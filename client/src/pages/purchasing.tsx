import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Supplier, PurchaseOrder, PurchaseOrderItem, Product } from "@shared/schema";
import {
  Truck,
  Plus,
  Search,
  Edit,
  Trash2,
  Package,
  CheckCircle,
  Clock,
  AlertTriangle,
  ShoppingCart,
  Eye,
  Loader2,
} from "lucide-react";

type SupplierFormData = {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
};

type PurchaseOrderFormData = {
  supplierId: string;
  expectedDate?: string;
  notes?: string;
};

type OrderItemFormData = {
  productId: string;
  quantity: number;
  unitCost: number;
};

interface PurchaseOrderWithItems extends PurchaseOrder {
  items?: PurchaseOrderItem[];
}

const localeMap: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  pt: "pt-BR",
};

export default function PurchasingPage() {
  const { toast } = useToast();
  const { t, formatDate, language } = useI18n();
  const { tenant } = useAuth();
  
  const formatCurrency = (amount: number) => {
    const locale = localeMap[language] || "en-US";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: tenant?.currency || "USD",
    }).format(amount);
  };
  
  const supplierSchema = z.object({
    name: z.string().min(1, t("common.required")),
    contactName: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    address: z.string().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().default(true),
  });

  const purchaseOrderSchema = z.object({
    supplierId: z.string().min(1, t("common.required")),
    expectedDate: z.string().optional(),
    notes: z.string().optional(),
  });

  const orderItemSchema = z.object({
    productId: z.string().min(1, t("common.required")),
    quantity: z.number().min(1, t("common.required")),
    unitCost: z.number().min(0, t("common.required")),
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showDeleteSupplierDialog, setShowDeleteSupplierDialog] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [showOrderDetailsDialog, setShowOrderDetailsDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrderWithItems | null>(null);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});

  const { data: suppliers, isLoading: suppliersLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const { data: purchaseOrders, isLoading: ordersLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders"],
  });

  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const supplierForm = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: "",
      contactName: "",
      email: "",
      phone: "",
      address: "",
      notes: "",
      isActive: true,
    },
  });

  const orderForm = useForm<PurchaseOrderFormData>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      supplierId: "",
      expectedDate: "",
      notes: "",
    },
  });

  const itemForm = useForm<OrderItemFormData>({
    resolver: zodResolver(orderItemSchema),
    defaultValues: {
      productId: "",
      quantity: 1,
      unitCost: 0,
    },
  });

  const createSupplierMutation = useMutation({
    mutationFn: async (data: SupplierFormData) => {
      const res = await apiRequest("POST", "/api/suppliers", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("purchasing.supplier_created") });
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      setShowSupplierDialog(false);
      supplierForm.reset();
    },
  });

  const updateSupplierMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: SupplierFormData }) => {
      const res = await apiRequest("PATCH", `/api/suppliers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("purchasing.supplier_updated") });
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      setShowSupplierDialog(false);
      setEditingSupplier(null);
      supplierForm.reset();
    },
  });

  const deleteSupplierMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/suppliers/${id}`);
    },
    onSuccess: () => {
      toast({ title: t("purchasing.supplier_deleted") });
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      setShowDeleteSupplierDialog(false);
      setSupplierToDelete(null);
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (data: PurchaseOrderFormData) => {
      const res = await apiRequest("POST", "/api/purchase-orders", {
        ...data,
        expectedDate: data.expectedDate ? new Date(data.expectedDate).toISOString() : null,
        status: "draft",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("purchasing.order_created") });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setShowOrderDialog(false);
      orderForm.reset();
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async ({ orderId, data }: { orderId: string; data: OrderItemFormData }) => {
      const res = await apiRequest("POST", `/api/purchase-orders/${orderId}/items`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("purchasing.order_updated") });
      if (selectedOrder) {
        fetchOrderDetails(selectedOrder.id);
      }
      setShowAddItemDialog(false);
      itemForm.reset();
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("DELETE", `/api/purchase-order-items/${itemId}`);
    },
    onSuccess: () => {
      if (selectedOrder) {
        fetchOrderDetails(selectedOrder.id);
      }
    },
  });

  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/purchase-orders/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("purchasing.order_updated") });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      if (selectedOrder) {
        fetchOrderDetails(selectedOrder.id);
      }
    },
  });

  const receiveStockMutation = useMutation({
    mutationFn: async ({ orderId, items }: { orderId: string; items: Array<{ itemId: string; receivedQuantity: number }> }) => {
      const res = await apiRequest("POST", `/api/purchase-orders/${orderId}/receive`, { items });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("purchasing.stock_received") });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/levels"] });
      setShowReceiveDialog(false);
      setReceiveQuantities({});
      if (selectedOrder) {
        fetchOrderDetails(selectedOrder.id);
      }
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/purchase-orders/${id}`);
    },
    onSuccess: () => {
      toast({ title: t("purchasing.order_deleted") });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setShowOrderDetailsDialog(false);
      setSelectedOrder(null);
    },
  });

  const fetchOrderDetails = async (orderId: string) => {
    const res = await fetch(`/api/purchase-orders/${orderId}`, {
      headers: { "x-tenant-id": localStorage.getItem("tenantId") || "" },
    });
    if (res.ok) {
      const order = await res.json();
      setSelectedOrder(order);
    }
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    supplierForm.reset({
      name: supplier.name,
      contactName: supplier.contactName || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
      notes: supplier.notes || "",
      isActive: supplier.isActive ?? true,
    });
    setShowSupplierDialog(true);
  };

  const handleSupplierSubmit = (data: SupplierFormData) => {
    if (editingSupplier) {
      updateSupplierMutation.mutate({ id: editingSupplier.id, data });
    } else {
      createSupplierMutation.mutate(data);
    }
  };

  const handleViewOrder = (order: PurchaseOrder) => {
    fetchOrderDetails(order.id);
    setShowOrderDetailsDialog(true);
  };

  const handleAddItem = (data: OrderItemFormData) => {
    if (selectedOrder) {
      addItemMutation.mutate({ orderId: selectedOrder.id, data });
    }
  };

  const handleReceiveStock = () => {
    if (!selectedOrder || !selectedOrder.items) return;
    
    const itemsToReceive = Object.entries(receiveQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, receivedQuantity]) => ({ itemId, receivedQuantity }));
    
    if (itemsToReceive.length > 0) {
      receiveStockMutation.mutate({ orderId: selectedOrder.id, items: itemsToReceive });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
      draft: { variant: "secondary", icon: Clock },
      pending: { variant: "outline", icon: Clock },
      ordered: { variant: "default", icon: ShoppingCart },
      partial: { variant: "outline", icon: AlertTriangle },
      received: { variant: "default", icon: CheckCircle },
      cancelled: { variant: "destructive", icon: AlertTriangle },
    };
    
    const config = statusConfig[status] || statusConfig.draft;
    const Icon = config.icon;
    const translationKey = `purchasing.status_${status}` as keyof typeof t;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {t(translationKey) || status}
      </Badge>
    );
  };

  const getSupplierName = (supplierId: string | null) => {
    if (!supplierId) return "-";
    return suppliers?.find(s => s.id === supplierId)?.name || "-";
  };

  const getProductName = (productId: string) => {
    return products?.find(p => p.id === productId)?.name || "-";
  };

  const calculateOrderTotal = (items?: PurchaseOrderItem[]) => {
    if (!items) return 0;
    return items.reduce((sum, item) => {
      const cost = parseFloat(item.unitCost || "0");
      return sum + cost * item.quantity;
    }, 0);
  };

  const filteredSuppliers = suppliers?.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.contactName && s.contactName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredOrders = purchaseOrders?.filter(o =>
    o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    getSupplierName(o.supplierId).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto touch-scroll overscroll-contain">
      <div className="p-4 md:p-6 pb-24 md:pb-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-purchasing-title">{t("purchasing.title")}</h1>
          <p className="text-muted-foreground">{t("purchasing.subtitle")}</p>
        </div>

        <Tabs defaultValue="suppliers" className="space-y-4">
          <TabsList>
            <TabsTrigger value="suppliers" data-testid="tab-suppliers">
              <Truck className="h-4 w-4 mr-2" />
              {t("purchasing.suppliers")}
            </TabsTrigger>
            <TabsTrigger value="orders" data-testid="tab-orders">
              <Package className="h-4 w-4 mr-2" />
              {t("purchasing.purchase_orders")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="suppliers" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("customers.search_placeholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-supplier-search"
                />
              </div>
              <Button
                onClick={() => {
                  setEditingSupplier(null);
                  supplierForm.reset();
                  setShowSupplierDialog(true);
                }}
                data-testid="button-new-supplier"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t("purchasing.new_supplier")}
              </Button>
            </div>

            {suppliersLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map(i => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-6 w-32 mb-2" />
                      <Skeleton className="h-4 w-24" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredSuppliers && filteredSuppliers.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredSuppliers.map(supplier => (
                  <Card key={supplier.id} className="hover-elevate" data-testid={`card-supplier-${supplier.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h3 className="font-semibold">{supplier.name}</h3>
                          {supplier.contactName && (
                            <p className="text-sm text-muted-foreground">{supplier.contactName}</p>
                          )}
                          {supplier.email && (
                            <p className="text-sm text-muted-foreground">{supplier.email}</p>
                          )}
                          {supplier.phone && (
                            <p className="text-sm text-muted-foreground">{supplier.phone}</p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditSupplier(supplier)}
                            data-testid={`button-edit-supplier-${supplier.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSupplierToDelete(supplier);
                              setShowDeleteSupplierDialog(true);
                            }}
                            data-testid={`button-delete-supplier-${supplier.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {!supplier.isActive && (
                        <Badge variant="secondary" className="mt-2">{t("purchasing.active")}: No</Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Truck className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">{t("purchasing.no_suppliers")}</p>
                  <p className="text-muted-foreground">{t("purchasing.add_first_supplier")}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="orders" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("customers.search_placeholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-order-search"
                />
              </div>
              <Button
                onClick={() => {
                  orderForm.reset();
                  setShowOrderDialog(true);
                }}
                disabled={!suppliers || suppliers.length === 0}
                data-testid="button-new-order"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t("purchasing.new_order")}
              </Button>
            </div>

            {ordersLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-6 w-48 mb-2" />
                      <Skeleton className="h-4 w-32" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredOrders && filteredOrders.length > 0 ? (
              <div className="space-y-3">
                {filteredOrders.map(order => (
                  <Card
                    key={order.id}
                    className="hover-elevate cursor-pointer"
                    onClick={() => handleViewOrder(order)}
                    data-testid={`card-order-${order.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{order.orderNumber}</h3>
                            {getStatusBadge(order.status)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {t("purchasing.supplier")}: {getSupplierName(order.supplierId)}
                          </p>
                          {order.expectedDate && (
                            <p className="text-sm text-muted-foreground">
                              {t("purchasing.expected_date")}: {formatDate(new Date(order.expectedDate))}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" data-testid={`button-view-order-${order.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">{t("purchasing.no_orders")}</p>
                  <p className="text-muted-foreground">{t("purchasing.add_first_order")}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={showSupplierDialog} onOpenChange={setShowSupplierDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingSupplier ? t("purchasing.edit") : t("purchasing.new_supplier")}
              </DialogTitle>
            </DialogHeader>
            <Form {...supplierForm}>
              <form onSubmit={supplierForm.handleSubmit(handleSupplierSubmit)} className="space-y-4">
                <FormField
                  control={supplierForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("purchasing.supplier_name")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-supplier-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={supplierForm.control}
                  name="contactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("purchasing.contact_name")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-supplier-contact" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={supplierForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("purchasing.email")}</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} data-testid="input-supplier-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={supplierForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("purchasing.phone")}</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-supplier-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={supplierForm.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("purchasing.address")}</FormLabel>
                      <FormControl>
                        <Textarea {...field} data-testid="input-supplier-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={supplierForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("purchasing.notes")}</FormLabel>
                      <FormControl>
                        <Textarea {...field} data-testid="input-supplier-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={supplierForm.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-supplier-active"
                        />
                      </FormControl>
                      <Label>{t("purchasing.active")}</Label>
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowSupplierDialog(false)}>
                    {t("purchasing.cancel")}
                  </Button>
                  <Button
                    type="submit"
                    disabled={createSupplierMutation.isPending || updateSupplierMutation.isPending}
                    data-testid="button-save-supplier"
                  >
                    {(createSupplierMutation.isPending || updateSupplierMutation.isPending) && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {t("purchasing.save")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={showDeleteSupplierDialog} onOpenChange={setShowDeleteSupplierDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("purchasing.delete_supplier")}</DialogTitle>
              <DialogDescription>{t("purchasing.delete_supplier_confirm")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteSupplierDialog(false)}>
                {t("purchasing.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => supplierToDelete && deleteSupplierMutation.mutate(supplierToDelete.id)}
                disabled={deleteSupplierMutation.isPending}
                data-testid="button-confirm-delete-supplier"
              >
                {deleteSupplierMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("purchasing.delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("purchasing.new_order")}</DialogTitle>
            </DialogHeader>
            <Form {...orderForm}>
              <form onSubmit={orderForm.handleSubmit((data) => createOrderMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={orderForm.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("purchasing.supplier")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-order-supplier">
                            <SelectValue placeholder={t("purchasing.select_supplier")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {suppliers?.filter(s => s.isActive).map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={orderForm.control}
                  name="expectedDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("purchasing.expected_date")}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-order-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={orderForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("purchasing.notes")}</FormLabel>
                      <FormControl>
                        <Textarea {...field} data-testid="input-order-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowOrderDialog(false)}>
                    {t("purchasing.cancel")}
                  </Button>
                  <Button type="submit" disabled={createOrderMutation.isPending} data-testid="button-create-order">
                    {createOrderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {t("purchasing.save")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={showOrderDetailsDialog} onOpenChange={setShowOrderDetailsDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {t("purchasing.order_details")} - {selectedOrder?.orderNumber}
                {selectedOrder && getStatusBadge(selectedOrder.status)}
              </DialogTitle>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t("purchasing.supplier")}:</span>{" "}
                    {getSupplierName(selectedOrder.supplierId)}
                  </div>
                  {selectedOrder.expectedDate && (
                    <div>
                      <span className="text-muted-foreground">{t("purchasing.expected_date")}:</span>{" "}
                      {formatDate(new Date(selectedOrder.expectedDate))}
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">{t("purchasing.created_on")}:</span>{" "}
                    {formatDate(new Date(selectedOrder.createdAt!))}
                  </div>
                </div>

                <div className="border rounded-md">
                  <div className="p-3 bg-muted/50 border-b flex items-center justify-between">
                    <h4 className="font-medium">{t("purchasing.items_count")}</h4>
                    {selectedOrder.status === "draft" && (
                      <Button size="sm" onClick={() => setShowAddItemDialog(true)} data-testid="button-add-item">
                        <Plus className="h-4 w-4 mr-1" />
                        {t("purchasing.add_item")}
                      </Button>
                    )}
                  </div>
                  <div className="p-3">
                    {selectedOrder.items && selectedOrder.items.length > 0 ? (
                      <div className="space-y-2">
                        {selectedOrder.items.map(item => (
                          <div key={item.id} className="flex items-center justify-between p-2 border rounded">
                            <div>
                              <p className="font-medium">{getProductName(item.productId)}</p>
                              <p className="text-sm text-muted-foreground">
                                {t("purchasing.quantity")}: {item.quantity} | {t("purchasing.unit_cost")}: {formatCurrency(parseFloat(item.unitCost || "0"))}
                              </p>
                              {(item.receivedQuantity || 0) > 0 && (
                                <p className="text-sm text-green-600">
                                  {t("purchasing.received")}: {item.receivedQuantity}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {formatCurrency(parseFloat(item.unitCost || "0") * item.quantity)}
                              </span>
                              {selectedOrder.status === "draft" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteItemMutation.mutate(item.id)}
                                  data-testid={`button-delete-item-${item.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-end pt-2 border-t">
                          <span className="font-semibold">
                            {t("purchasing.total")}: {formatCurrency(calculateOrderTotal(selectedOrder.items))}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-4">{t("purchasing.add_item")}</p>
                    )}
                  </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                  {selectedOrder.status === "draft" && selectedOrder.items && selectedOrder.items.length > 0 && (
                    <Button
                      onClick={() => updateOrderStatusMutation.mutate({ id: selectedOrder.id, status: "ordered" })}
                      disabled={updateOrderStatusMutation.isPending}
                      data-testid="button-place-order"
                    >
                      {t("purchasing.place_order")}
                    </Button>
                  )}
                  {(selectedOrder.status === "ordered" || selectedOrder.status === "partial") && (
                    <Button onClick={() => setShowReceiveDialog(true)} data-testid="button-receive-stock">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {t("purchasing.receive_stock")}
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    onClick={() => deleteOrderMutation.mutate(selectedOrder.id)}
                    disabled={deleteOrderMutation.isPending}
                    data-testid="button-delete-order"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("purchasing.delete")}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showAddItemDialog} onOpenChange={setShowAddItemDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("purchasing.add_item")}</DialogTitle>
            </DialogHeader>
            <Form {...itemForm}>
              <form onSubmit={itemForm.handleSubmit(handleAddItem)} className="space-y-4">
                <FormField
                  control={itemForm.control}
                  name="productId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("purchasing.product")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-item-product">
                            <SelectValue placeholder={t("purchasing.select_product")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {products?.map(p => (
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
                    control={itemForm.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("purchasing.quantity")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                            data-testid="input-item-quantity"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={itemForm.control}
                    name="unitCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("purchasing.unit_cost")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            data-testid="input-item-cost"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowAddItemDialog(false)}>
                    {t("purchasing.cancel")}
                  </Button>
                  <Button type="submit" disabled={addItemMutation.isPending} data-testid="button-save-item">
                    {addItemMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {t("purchasing.save")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("purchasing.receiving_stock")}</DialogTitle>
            </DialogHeader>
            {selectedOrder?.items && (
              <div className="space-y-4">
                {selectedOrder.items
                  .filter(item => (item.receivedQuantity || 0) < item.quantity)
                  .map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 border rounded">
                      <div>
                        <p className="font-medium">{getProductName(item.productId)}</p>
                        <p className="text-sm text-muted-foreground">
                          {t("purchasing.quantity")}: {item.quantity} | {t("purchasing.received")}: {item.receivedQuantity || 0}
                        </p>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={item.quantity - (item.receivedQuantity || 0)}
                        value={receiveQuantities[item.id] || 0}
                        onChange={(e) => setReceiveQuantities(prev => ({
                          ...prev,
                          [item.id]: parseInt(e.target.value) || 0,
                        }))}
                        className="w-24"
                        data-testid={`input-receive-qty-${item.id}`}
                      />
                    </div>
                  ))}
                {selectedOrder.items.every(item => (item.receivedQuantity || 0) >= item.quantity) && (
                  <p className="text-center text-green-600">{t("purchasing.all_received")}</p>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowReceiveDialog(false)}>
                    {t("purchasing.cancel")}
                  </Button>
                  <Button
                    onClick={handleReceiveStock}
                    disabled={receiveStockMutation.isPending || Object.values(receiveQuantities).every(q => q === 0)}
                    data-testid="button-confirm-receive"
                  >
                    {receiveStockMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {t("purchasing.receive")}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
