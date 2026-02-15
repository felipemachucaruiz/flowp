import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/currency";
import { CurrencyInput } from "@/components/currency-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import type { Supplier, PurchaseOrder, PurchaseOrderItem, Product, Ingredient } from "@shared/schema";
import {
  Truck, Plus, Search, Edit, Trash2, Package, CheckCircle,
  ShoppingCart, Loader2, Leaf,
  RefreshCw, Send, FileText, Warehouse,
} from "lucide-react";

type SupplierFormData = {
  name: string;
  contactName?: string;
  documentType?: string;
  identification?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  paymentTermsType?: string;
  paymentTermsDays?: number;
  currency?: string;
  notes?: string;
  isActive: boolean;
};

type PurchaseOrderFormData = {
  supplierId: string;
  destinationWarehouseId?: string;
  expectedDate?: string;
  notes?: string;
};

type OrderItemFormData = {
  itemType: "product" | "ingredient";
  productId?: string;
  ingredientId?: string;
  quantity: number;
  unitCost: number;
};

interface PurchaseOrderWithItems extends PurchaseOrder {
  items?: PurchaseOrderItem[];
}

type ReceiptData = {
  id: string;
  receiptNumber: string;
  warehouseId?: string;
  receivedBy?: string;
  notes?: string;
  receivedAt: string;
  items: Array<{
    id: string;
    productId?: string;
    ingredientId?: string;
    quantityReceived: number;
    unitCost: string;
  }>;
};

type ReorderSuggestion = {
  type: "product" | "ingredient";
  id: string;
  name: string;
  currentStock: number;
  reorderPoint: number;
  suggestedQty: number;
  preferredSupplierId?: string;
  preferredSupplierName?: string;
  unit?: string;
};

const localeMap: Record<string, string> = { en: "en-US", es: "es-ES", pt: "pt-BR" };

export default function PurchasingPage() {
  const { toast } = useToast();
  const { t, formatDate, language } = useI18n();
  const { tenant } = useAuth();

  const currency = tenant?.currency || "USD";

  const supplierSchema = z.object({
    name: z.string().min(1, t("common.required")),
    contactName: z.string().optional(),
    documentType: z.string().optional(),
    identification: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    address: z.string().optional(),
    taxId: z.string().optional(),
    paymentTermsType: z.string().optional(),
    paymentTermsDays: z.coerce.number().min(0).optional(),
    currency: z.string().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().default(true),
  });

  const purchaseOrderSchema = z.object({
    supplierId: z.string().min(1, t("common.required")),
    destinationWarehouseId: z.string().optional(),
    expectedDate: z.string().optional(),
    notes: z.string().optional(),
  });

  const orderItemSchema = z.object({
    itemType: z.enum(["product", "ingredient"]),
    productId: z.string().optional(),
    ingredientId: z.string().optional(),
    quantity: z.number().min(1, t("common.required")),
    unitCost: z.number().min(0, t("common.required")),
  }).refine(data => (data.itemType === "product" && data.productId) || (data.itemType === "ingredient" && data.ingredientId), {
    message: t("common.required"), path: ["productId"],
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
  const [receiveCosts, setReceiveCosts] = useState<Record<string, number>>({});
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiveWarehouseId, setReceiveWarehouseId] = useState<string>("");
  const [itemType, setItemType] = useState<"product" | "ingredient">("product");
  const [selectedReorderItems, setSelectedReorderItems] = useState<Set<string>>(new Set());
  const [reorderQuantities, setReorderQuantities] = useState<Record<string, number>>({});
  const [reorderSupplierId, setReorderSupplierId] = useState<string>("");
  const [orderDetailTab, setOrderDetailTab] = useState<string>("items");
  const [showDeleteOrderDialog, setShowDeleteOrderDialog] = useState(false);
  const [orderDetailsLoading, setOrderDetailsLoading] = useState(false);

  const { data: suppliers, isLoading: suppliersLoading } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const { data: purchaseOrders, isLoading: ordersLoading } = useQuery<PurchaseOrder[]>({ queryKey: ["/api/purchase-orders"] });
  const { data: products } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: ingredients } = useQuery<Ingredient[]>({ queryKey: ["/api/ingredients"], enabled: tenant?.type === "restaurant" });
  const { data: warehouses } = useQuery<any[]>({ queryKey: ["/api/warehouses"] });

  const { data: receipts } = useQuery<ReceiptData[]>({
    queryKey: ["/api/purchase-orders", selectedOrder?.id, "receipts"],
    enabled: !!selectedOrder?.id,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/purchase-orders/${selectedOrder!.id}/receipts`);
      return res.json();
    },
  });

  const { data: reorderSuggestions, isLoading: reorderLoading, refetch: refetchReorder } = useQuery<ReorderSuggestion[]>({ queryKey: ["/api/reorder-suggestions"] });

  const supplierForm = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: "", contactName: "", documentType: "", identification: "", email: "", phone: "", address: "", taxId: "", paymentTermsType: "cash", paymentTermsDays: 0, currency: "", notes: "", isActive: true },
  });
  const orderForm = useForm<PurchaseOrderFormData>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: { supplierId: "", destinationWarehouseId: "", expectedDate: "", notes: "" },
  });
  const itemForm = useForm<OrderItemFormData>({
    resolver: zodResolver(orderItemSchema),
    defaultValues: { itemType: "product", productId: "", ingredientId: "", quantity: 1, unitCost: 0 },
  });

  const createSupplierMutation = useMutation({
    mutationFn: async (data: SupplierFormData) => { const res = await apiRequest("POST", "/api/suppliers", data); return res.json(); },
    onSuccess: () => { toast({ title: t("purchasing.supplier_created") }); queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] }); setShowSupplierDialog(false); supplierForm.reset(); },
  });
  const updateSupplierMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: SupplierFormData }) => { const res = await apiRequest("PATCH", `/api/suppliers/${id}`, data); return res.json(); },
    onSuccess: () => { toast({ title: t("purchasing.supplier_updated") }); queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] }); setShowSupplierDialog(false); setEditingSupplier(null); supplierForm.reset(); },
  });
  const deleteSupplierMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/suppliers/${id}`); },
    onSuccess: () => { toast({ title: t("purchasing.supplier_deleted") }); queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] }); setShowDeleteSupplierDialog(false); setSupplierToDelete(null); },
  });
  const createOrderMutation = useMutation({
    mutationFn: async (data: PurchaseOrderFormData) => {
      const res = await apiRequest("POST", "/api/purchase-orders", {
        ...data, expectedDate: data.expectedDate ? new Date(data.expectedDate).toISOString() : null,
        destinationWarehouseId: data.destinationWarehouseId || null, status: "draft",
      });
      return res.json();
    },
    onSuccess: () => { toast({ title: t("purchasing.order_created") }); queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] }); setShowOrderDialog(false); orderForm.reset(); },
  });
  const addItemMutation = useMutation({
    mutationFn: async ({ orderId, data }: { orderId: string; data: OrderItemFormData }) => {
      const payload = { productId: data.itemType === "product" ? data.productId : null, ingredientId: data.itemType === "ingredient" ? data.ingredientId : null, quantity: data.quantity, unitCost: data.unitCost };
      const res = await apiRequest("POST", `/api/purchase-orders/${orderId}/items`, payload);
      return res.json();
    },
    onSuccess: () => { toast({ title: t("purchasing.order_updated") }); if (selectedOrder) fetchOrderDetails(selectedOrder.id); setShowAddItemDialog(false); itemForm.reset(); setItemType("product"); },
  });
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => { await apiRequest("DELETE", `/api/purchase-order-items/${itemId}`); },
    onSuccess: () => { if (selectedOrder) fetchOrderDetails(selectedOrder.id); },
  });
  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => { const res = await apiRequest("PATCH", `/api/purchase-orders/${id}`, { status }); return res.json(); },
    onSuccess: () => { toast({ title: t("purchasing.order_updated") }); queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] }); if (selectedOrder) fetchOrderDetails(selectedOrder.id); },
  });
  const receiveStockMutation = useMutation({
    mutationFn: async ({ orderId, items, warehouseId, notes }: { orderId: string; items: Array<{ itemId: string; receivedQuantity: number; unitCost?: number }>; warehouseId?: string; notes?: string }) => {
      const res = await apiRequest("POST", `/api/purchase-orders/${orderId}/receive`, { items, warehouseId, notes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("purchasing.receipt_created") });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/levels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ingredients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", selectedOrder?.id, "receipts"] });
      setShowReceiveDialog(false); setReceiveQuantities({}); setReceiveCosts({}); setReceiveNotes("");
      if (selectedOrder) fetchOrderDetails(selectedOrder.id);
    },
  });
  const deleteOrderMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/purchase-orders/${id}`); },
    onSuccess: () => { toast({ title: t("purchasing.order_deleted") }); queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] }); setShowOrderDetailsDialog(false); setSelectedOrder(null); },
  });
  const createReorderMutation = useMutation({
    mutationFn: async (data: { supplierId: string; items: Array<{ type: "product" | "ingredient"; id: string; quantity: number; unitCost: number }> }) => {
      const res = await apiRequest("POST", "/api/reorder-suggestions/create-order", data);
      return res.json();
    },
    onSuccess: () => { toast({ title: t("purchasing.order_created") }); queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] }); queryClient.invalidateQueries({ queryKey: ["/api/reorder-suggestions"] }); setSelectedReorderItems(new Set()); setReorderQuantities({}); setReorderSupplierId(""); },
  });

  const fetchOrderDetails = async (orderId: string) => {
    setOrderDetailsLoading(true);
    try {
      const res = await apiRequest("GET", `/api/purchase-orders/${orderId}`);
      const order = await res.json();
      setSelectedOrder(order);
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
    } finally {
      setOrderDetailsLoading(false);
    }
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    supplierForm.reset({
      name: supplier.name, contactName: supplier.contactName || "",
      documentType: (supplier as any).documentType || "", identification: (supplier as any).identification || "",
      email: supplier.email || "", phone: supplier.phone || "", address: supplier.address || "",
      taxId: supplier.taxId || "", paymentTermsType: (supplier as any).paymentTermsType || "cash",
      paymentTermsDays: (supplier as any).paymentTermsDays || 0, currency: (supplier as any).currency || "",
      notes: supplier.notes || "", isActive: supplier.isActive ?? true,
    });
    setShowSupplierDialog(true);
  };

  const handleSupplierSubmit = (data: SupplierFormData) => {
    if (editingSupplier) updateSupplierMutation.mutate({ id: editingSupplier.id, data });
    else createSupplierMutation.mutate(data);
  };

  const handleViewOrder = (order: PurchaseOrder) => {
    fetchOrderDetails(order.id);
    setOrderDetailTab("items");
    setShowOrderDetailsDialog(true);
  };

  const handleReceiveStock = () => {
    if (!selectedOrder || !selectedOrder.items) return;
    const itemsToReceive = Object.entries(receiveQuantities).filter(([, qty]) => qty > 0).map(([itemId, receivedQuantity]) => {
      const unitCost = receiveCosts[itemId];
      return { itemId, receivedQuantity, ...(unitCost !== undefined ? { unitCost } : {}) };
    });
    if (itemsToReceive.length === 0) return;
    receiveStockMutation.mutate({ orderId: selectedOrder.id, items: itemsToReceive, warehouseId: receiveWarehouseId || undefined, notes: receiveNotes || undefined });
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      draft: { label: t("purchasing.status_draft"), variant: "secondary" },
      sent: { label: t("purchasing.status_sent"), variant: "default" },
      partial: { label: t("purchasing.status_partial"), variant: "outline" },
      received: { label: t("purchasing.status_received"), variant: "default" },
      cancelled: { label: t("purchasing.status_cancelled"), variant: "destructive" },
    };
    const s = statusMap[status] || { label: status, variant: "secondary" as const };
    return <Badge variant={s.variant} data-testid={`badge-status-${status}`}>{s.label}</Badge>;
  };

  const getSupplierName = (supplierId?: string | null) => !supplierId || !suppliers ? "-" : suppliers.find(s => s.id === supplierId)?.name || "-";
  const getProductName = (productId?: string | null) => !productId || !products ? "-" : products.find(p => p.id === productId)?.name || "-";
  const getIngredientName = (ingredientId?: string | null) => !ingredientId || !ingredients ? "-" : ingredients.find(i => i.id === ingredientId)?.name || "-";
  const getWarehouseName = (warehouseId?: string | null) => !warehouseId || !warehouses ? "-" : warehouses.find(w => w.id === warehouseId)?.name || "-";

  const filteredSuppliers = suppliers?.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || (s.contactName && s.contactName.toLowerCase().includes(searchQuery.toLowerCase()))) || [];
  const filteredOrders = purchaseOrders?.filter(o => o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) || getSupplierName(o.supplierId).toLowerCase().includes(searchQuery.toLowerCase())) || [];

  return (
    <div className="flex flex-col h-full" data-testid="page-purchasing">
      <div className="flex items-center justify-between gap-2 p-4 border-b flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">{t("purchasing.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("purchasing.subtitle")}</p>
        </div>
      </div>

      <Tabs defaultValue="suppliers" className="flex-1 flex flex-col">
        <div className="px-4 pt-2">
          <TabsList data-testid="tabs-purchasing">
            <TabsTrigger value="suppliers" data-testid="tab-suppliers"><Truck className="w-4 h-4 mr-1" />{t("purchasing.suppliers")}</TabsTrigger>
            <TabsTrigger value="orders" data-testid="tab-orders"><ShoppingCart className="w-4 h-4 mr-1" />{t("purchasing.purchase_orders")}</TabsTrigger>
            <TabsTrigger value="reorder" data-testid="tab-reorder"><RefreshCw className="w-4 h-4 mr-1" />{t("purchasing.quick_reorder")}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="suppliers" className="flex-1 p-4">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder={t("common.search")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" data-testid="input-search-suppliers" />
            </div>
            <Button onClick={() => { setEditingSupplier(null); supplierForm.reset(); setShowSupplierDialog(true); }} data-testid="button-new-supplier">
              <Plus className="w-4 h-4 mr-1" />{t("purchasing.new_supplier")}
            </Button>
          </div>
          {suppliersLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : filteredSuppliers.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center justify-center py-12">
              <Truck className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">{t("purchasing.no_suppliers")}</p>
              <p className="text-sm text-muted-foreground mb-4">{t("purchasing.add_first_supplier")}</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {filteredSuppliers.map(supplier => (
                <Card key={supplier.id} data-testid={`card-supplier-${supplier.id}`}>
                  <CardContent className="flex items-center justify-between gap-3 p-4 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium" data-testid={`text-supplier-name-${supplier.id}`}>{supplier.name}</span>
                        {!supplier.isActive && <Badge variant="secondary">{t("common.inactive")}</Badge>}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
                        {supplier.contactName && <span>{supplier.contactName}</span>}
                        {supplier.phone && <span>{supplier.phone}</span>}
                        {supplier.email && <span>{supplier.email}</span>}
                        {(supplier as any).documentType && <span>{t(`purchasing.doc_type_${(supplier as any).documentType}` as any)}: {(supplier as any).identification}</span>}
                        {(supplier as any).paymentTermsType && (
                          <span>{t(`purchasing.payment_terms_${(supplier as any).paymentTermsType}` as any)}
                            {(supplier as any).paymentTermsType === "credit" && ` (${(supplier as any).paymentTermsDays || 0} ${t("purchasing.payment_terms_days")})`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleEditSupplier(supplier)} data-testid={`button-edit-supplier-${supplier.id}`}><Edit className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => { setSupplierToDelete(supplier); setShowDeleteSupplierDialog(true); }} data-testid={`button-delete-supplier-${supplier.id}`}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="flex-1 p-4">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder={t("common.search")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" data-testid="input-search-orders" />
            </div>
            <Button onClick={() => { orderForm.reset(); setShowOrderDialog(true); }} data-testid="button-new-order">
              <Plus className="w-4 h-4 mr-1" />{t("purchasing.new_order")}
            </Button>
          </div>
          {ordersLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : filteredOrders.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center justify-center py-12">
              <ShoppingCart className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">{t("purchasing.no_orders")}</p>
              <p className="text-sm text-muted-foreground mb-4">{t("purchasing.add_first_order")}</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {filteredOrders.map(order => (
                <Card key={order.id} className="hover-elevate cursor-pointer" onClick={() => handleViewOrder(order)} data-testid={`card-order-${order.id}`}>
                  <CardContent className="flex items-center justify-between gap-3 p-4 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{order.orderNumber}</span>
                        {getStatusBadge(order.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
                        <span>{getSupplierName(order.supplierId)}</span>
                        {order.expectedDate && <span>{formatDate(new Date(order.expectedDate))}</span>}
                        {(order as any).destinationWarehouseId && (
                          <span className="flex items-center gap-1"><Warehouse className="w-3 h-3" />{getWarehouseName((order as any).destinationWarehouseId)}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right"><span className="font-medium">{formatCurrency(parseFloat(order.total || "0"), currency)}</span></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reorder" className="flex-1 p-4">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div>
              <h3 className="text-lg font-medium">{t("purchasing.reorder_suggestions")}</h3>
              <p className="text-sm text-muted-foreground">{t("purchasing.low_stock_items")}</p>
            </div>
            <Button variant="outline" onClick={() => refetchReorder()} data-testid="button-refresh-reorder">
              <RefreshCw className="w-4 h-4 mr-1" />{t("common.refresh")}
            </Button>
          </div>
          {reorderLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : !reorderSuggestions || reorderSuggestions.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">{t("purchasing.no_reorder_suggestions")}</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {selectedReorderItems.size > 0 && (
                <Card className="mb-4"><CardContent className="p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={reorderSupplierId} onValueChange={setReorderSupplierId}>
                      <SelectTrigger className="w-[200px]" data-testid="select-reorder-supplier"><SelectValue placeholder={t("purchasing.select_supplier")} /></SelectTrigger>
                      <SelectContent>{suppliers?.filter(s => s.isActive).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button disabled={!reorderSupplierId || createReorderMutation.isPending} onClick={() => {
                      const items = Array.from(selectedReorderItems).map(key => {
                        const suggestion = reorderSuggestions.find(s => `${s.type}-${s.id}` === key);
                        let cost = 0;
                        if (suggestion!.type === "product") { const p = products?.find(pr => pr.id === suggestion!.id); cost = p?.cost ? parseFloat(p.cost.toString()) : 0; }
                        else { const ing = ingredients?.find(i => i.id === suggestion!.id); cost = ing?.costPerBase ? parseFloat(ing.costPerBase.toString()) : 0; }
                        return { type: suggestion!.type, id: suggestion!.id, quantity: reorderQuantities[key] || suggestion!.suggestedQty, unitCost: cost };
                      });
                      createReorderMutation.mutate({ supplierId: reorderSupplierId, items });
                    }} data-testid="button-create-reorder-po">
                      {createReorderMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                      {t("purchasing.create_po_from_suggestions")}
                    </Button>
                  </div>
                </CardContent></Card>
              )}
              {reorderSuggestions.map(suggestion => {
                const key = `${suggestion.type}-${suggestion.id}`;
                const isSelected = selectedReorderItems.has(key);
                return (
                  <Card key={key} data-testid={`card-reorder-${key}`}>
                    <CardContent className="flex items-center justify-between gap-3 p-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={isSelected} onChange={(e) => {
                          const next = new Set(selectedReorderItems);
                          if (e.target.checked) next.add(key); else next.delete(key);
                          setSelectedReorderItems(next);
                        }} data-testid={`checkbox-reorder-${key}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            {suggestion.type === "ingredient" ? <Leaf className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                            <span className="font-medium">{suggestion.name}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                            <span>{t("purchasing.current_stock")}: {suggestion.currentStock}</span>
                            <span>{t("purchasing.reorder_point")}: {suggestion.reorderPoint}</span>
                            {suggestion.preferredSupplierName && <span>{t("purchasing.supplier")}: {suggestion.preferredSupplierName}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm">{t("purchasing.suggested_qty")}:</Label>
                        <Input type="number" className="w-20" value={reorderQuantities[key] ?? suggestion.suggestedQty}
                          onFocus={e => e.target.select()}
                          onChange={(e) => setReorderQuantities(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))} data-testid={`input-reorder-qty-${key}`} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showSupplierDialog} onOpenChange={setShowSupplierDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingSupplier ? t("purchasing.edit") : t("purchasing.new_supplier")}</DialogTitle></DialogHeader>
          <Form {...supplierForm}>
            <form onSubmit={supplierForm.handleSubmit(handleSupplierSubmit)} className="space-y-4">
              <FormField control={supplierForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>{t("purchasing.supplier_name")}</FormLabel><FormControl><Input {...field} data-testid="input-supplier-name" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={supplierForm.control} name="documentType" render={({ field }) => (
                  <FormItem><FormLabel>{t("purchasing.document_type")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger data-testid="select-supplier-doc-type"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent><SelectItem value="nit">{t("purchasing.doc_type_nit")}</SelectItem><SelectItem value="cc">{t("purchasing.doc_type_cc")}</SelectItem><SelectItem value="other">{t("purchasing.doc_type_other")}</SelectItem></SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={supplierForm.control} name="identification" render={({ field }) => (
                  <FormItem><FormLabel>{t("purchasing.identification")}</FormLabel><FormControl><Input {...field} data-testid="input-supplier-identification" /></FormControl></FormItem>
                )} />
              </div>
              <FormField control={supplierForm.control} name="contactName" render={({ field }) => (
                <FormItem><FormLabel>{t("purchasing.contact_name")}</FormLabel><FormControl><Input {...field} data-testid="input-supplier-contact" /></FormControl></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={supplierForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>{t("purchasing.email")}</FormLabel><FormControl><Input {...field} type="email" data-testid="input-supplier-email" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={supplierForm.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>{t("purchasing.phone")}</FormLabel><FormControl><Input {...field} data-testid="input-supplier-phone" /></FormControl></FormItem>
                )} />
              </div>
              <FormField control={supplierForm.control} name="address" render={({ field }) => (
                <FormItem><FormLabel>{t("purchasing.address")}</FormLabel><FormControl><Input {...field} data-testid="input-supplier-address" /></FormControl></FormItem>
              )} />
              <FormField control={supplierForm.control} name="taxId" render={({ field }) => (
                <FormItem><FormLabel>{t("purchasing.tax_id")}</FormLabel><FormControl><Input {...field} data-testid="input-supplier-tax-id" /></FormControl></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={supplierForm.control} name="paymentTermsType" render={({ field }) => (
                  <FormItem><FormLabel>{t("purchasing.payment_terms")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger data-testid="select-supplier-payment-terms"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent><SelectItem value="cash">{t("purchasing.payment_terms_cash")}</SelectItem><SelectItem value="credit">{t("purchasing.payment_terms_credit")}</SelectItem></SelectContent>
                    </Select>
                  </FormItem>
                )} />
                {supplierForm.watch("paymentTermsType") === "credit" && (
                  <FormField control={supplierForm.control} name="paymentTermsDays" render={({ field }) => (
                    <FormItem><FormLabel>{t("purchasing.payment_terms_days")}</FormLabel><FormControl><Input {...field} type="number" min="0" data-testid="input-supplier-payment-days" onFocus={e => e.target.select()} onChange={e => field.onChange(Math.max(0, parseInt(e.target.value) || 0))} /></FormControl></FormItem>
                  )} />
                )}
              </div>
              <FormField control={supplierForm.control} name="currency" render={({ field }) => (
                <FormItem><FormLabel>{t("purchasing.supplier_currency")}</FormLabel><Select value={field.value || ""} onValueChange={field.onChange}><FormControl><SelectTrigger data-testid="select-supplier-currency"><SelectValue placeholder="COP" /></SelectTrigger></FormControl><SelectContent><SelectItem value="COP">COP - Peso Colombiano</SelectItem><SelectItem value="USD">USD - US Dollar</SelectItem><SelectItem value="EUR">EUR - Euro</SelectItem><SelectItem value="MXN">MXN - Peso Mexicano</SelectItem><SelectItem value="ARS">ARS - Peso Argentino</SelectItem><SelectItem value="BRL">BRL - Real Brasileño</SelectItem><SelectItem value="PEN">PEN - Sol Peruano</SelectItem><SelectItem value="CLP">CLP - Peso Chileno</SelectItem><SelectItem value="GBP">GBP - Libra Esterlina</SelectItem></SelectContent></Select></FormItem>
              )} />
              <FormField control={supplierForm.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>{t("purchasing.notes")}</FormLabel><FormControl><Textarea {...field} data-testid="input-supplier-notes" /></FormControl></FormItem>
              )} />
              <FormField control={supplierForm.control} name="isActive" render={({ field }) => (
                <FormItem className="flex items-center gap-2"><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-supplier-active" /></FormControl><FormLabel className="!mt-0">{t("purchasing.active")}</FormLabel></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowSupplierDialog(false)} data-testid="button-cancel-supplier">{t("purchasing.cancel")}</Button>
                <Button type="submit" disabled={createSupplierMutation.isPending || updateSupplierMutation.isPending} data-testid="button-save-supplier">
                  {(createSupplierMutation.isPending || updateSupplierMutation.isPending) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{t("purchasing.save")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteSupplierDialog} onOpenChange={setShowDeleteSupplierDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("purchasing.delete_supplier")}</DialogTitle><DialogDescription>{t("purchasing.delete_supplier_confirm")}</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteSupplierDialog(false)} data-testid="button-cancel-delete-supplier">{t("purchasing.cancel")}</Button>
            <Button variant="destructive" onClick={() => supplierToDelete && deleteSupplierMutation.mutate(supplierToDelete.id)} data-testid="button-confirm-delete-supplier">
              {deleteSupplierMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{t("purchasing.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("purchasing.new_order")}</DialogTitle></DialogHeader>
          <Form {...orderForm}>
            <form onSubmit={orderForm.handleSubmit((data) => createOrderMutation.mutate(data))} className="space-y-4">
              <FormField control={orderForm.control} name="supplierId" render={({ field }) => (
                <FormItem><FormLabel>{t("purchasing.supplier")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger data-testid="select-order-supplier"><SelectValue placeholder={t("purchasing.select_supplier")} /></SelectTrigger></FormControl>
                    <SelectContent>{suppliers?.filter(s => s.isActive).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={orderForm.control} name="destinationWarehouseId" render={({ field }) => (
                <FormItem><FormLabel>{t("purchasing.destination_warehouse")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger data-testid="select-order-warehouse"><SelectValue placeholder={t("purchasing.select_warehouse")} /></SelectTrigger></FormControl>
                    <SelectContent>{warehouses?.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={orderForm.control} name="expectedDate" render={({ field }) => (
                <FormItem><FormLabel>{t("purchasing.expected_date")}</FormLabel><FormControl><Input {...field} type="date" data-testid="input-order-expected-date" /></FormControl></FormItem>
              )} />
              <FormField control={orderForm.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>{t("purchasing.notes")}</FormLabel><FormControl><Textarea {...field} data-testid="input-order-notes" /></FormControl></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowOrderDialog(false)} data-testid="button-cancel-order">{t("purchasing.cancel")}</Button>
                <Button type="submit" disabled={createOrderMutation.isPending} data-testid="button-save-order">
                  {createOrderMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{t("purchasing.save")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={showOrderDetailsDialog} onOpenChange={(open) => { setShowOrderDetailsDialog(open); if (!open) setSelectedOrder(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {orderDetailsLoading || !selectedOrder ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
              <DialogHeader><DialogTitle>{t("purchasing.order_details")}</DialogTitle></DialogHeader>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">{selectedOrder.orderNumber} {getStatusBadge(selectedOrder.status)}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div><span className="text-muted-foreground">{t("purchasing.supplier")}:</span> <span className="ml-1 font-medium">{getSupplierName(selectedOrder.supplierId)}</span></div>
                {(selectedOrder as any).destinationWarehouseId && (
                  <div><span className="text-muted-foreground">{t("purchasing.destination_warehouse")}:</span> <span className="ml-1 font-medium">{getWarehouseName((selectedOrder as any).destinationWarehouseId)}</span></div>
                )}
                {selectedOrder.expectedDate && (
                  <div><span className="text-muted-foreground">{t("purchasing.expected_date")}:</span> <span className="ml-1">{formatDate(new Date(selectedOrder.expectedDate))}</span></div>
                )}
                <div><span className="text-muted-foreground">{t("purchasing.total")}:</span> <span className="ml-1 font-medium">{formatCurrency(parseFloat(selectedOrder.total || "0"), currency)}</span></div>
              </div>
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {selectedOrder.status === "draft" && (
                  <>
                    <Button size="sm" onClick={() => updateOrderStatusMutation.mutate({ id: selectedOrder.id, status: "sent" })} data-testid="button-send-order"><Send className="w-4 h-4 mr-1" />{t("purchasing.send_order")}</Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAddItemDialog(true)} data-testid="button-add-item"><Plus className="w-4 h-4 mr-1" />{t("purchasing.add_item")}</Button>
                  </>
                )}
                {(selectedOrder.status === "sent" || selectedOrder.status === "partial") && (
                  <Button size="sm" onClick={() => { setReceiveQuantities({}); setReceiveCosts({}); setReceiveNotes(""); setReceiveWarehouseId((selectedOrder as any).destinationWarehouseId || ""); if (selectedOrder?.items) { const costs: Record<string, number> = {}; selectedOrder.items.forEach(item => { costs[item.id] = parseFloat(item.unitCost || "0"); }); setReceiveCosts(costs); } setShowReceiveDialog(true); }} data-testid="button-receive-stock">
                    <Package className="w-4 h-4 mr-1" />{t("purchasing.receive_stock")}
                  </Button>
                )}
                {selectedOrder.status === "draft" && (
                  <Button size="sm" variant="destructive" onClick={() => setShowDeleteOrderDialog(true)} data-testid="button-delete-order"><Trash2 className="w-4 h-4 mr-1" />{t("purchasing.delete")}</Button>
                )}
                {selectedOrder.status !== "cancelled" && selectedOrder.status !== "received" && (
                  <Button size="sm" variant="outline" onClick={() => updateOrderStatusMutation.mutate({ id: selectedOrder.id, status: "cancelled" })} data-testid="button-cancel-order-status">{t("purchasing.status_cancelled")}</Button>
                )}
              </div>

              <Tabs value={orderDetailTab} onValueChange={setOrderDetailTab}>
                <TabsList data-testid="tabs-order-detail">
                  <TabsTrigger value="items" data-testid="tab-order-items">{t("purchasing.items_count")}</TabsTrigger>
                  <TabsTrigger value="receipts" data-testid="tab-order-receipts">{t("purchasing.receipts")}</TabsTrigger>
                </TabsList>

                <TabsContent value="items">
                  {selectedOrder.items && selectedOrder.items.length > 0 ? (
                    <div className="space-y-2">
                      {selectedOrder.items.map(item => (
                        <Card key={item.id} data-testid={`card-order-item-${item.id}`}>
                          <CardContent className="flex items-center justify-between gap-2 p-3 flex-wrap">
                            <div className="flex-1 min-w-[150px]">
                              <div className="flex items-center gap-2">
                                {item.productId ? <Package className="w-4 h-4" /> : <Leaf className="w-4 h-4" />}
                                <span className="font-medium">{item.productId ? getProductName(item.productId) : getIngredientName(item.ingredientId)}</span>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                {t("purchasing.quantity")}: {item.quantity} | {t("purchasing.unit_cost")}: {formatCurrency(parseFloat(item.unitCost), currency)} | {t("purchasing.received")}: {item.receivedQuantity || 0}/{item.quantity}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{formatCurrency(item.quantity * parseFloat(item.unitCost), currency)}</span>
                              {selectedOrder.status === "draft" && (
                                <Button size="icon" variant="ghost" onClick={() => deleteItemMutation.mutate(item.id)} data-testid={`button-delete-item-${item.id}`}><Trash2 className="w-4 h-4" /></Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      <div className="flex justify-end gap-4 pt-2 text-sm flex-wrap">
                        <span>{t("purchasing.subtotal")}: {formatCurrency(parseFloat(selectedOrder.subtotal || "0"), currency)}</span>
                        <span className="font-medium">{t("purchasing.total")}: {formatCurrency(parseFloat(selectedOrder.total || "0"), currency)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground"><Package className="w-8 h-8 mx-auto mb-2" /><p>{t("purchasing.add_first_order")}</p></div>
                  )}
                </TabsContent>

                <TabsContent value="receipts">
                  {receipts && receipts.length > 0 ? (
                    <div className="space-y-2">
                      {receipts.map(receipt => (
                        <Card key={receipt.id} data-testid={`card-receipt-${receipt.id}`}>
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2"><FileText className="w-4 h-4" /><span className="font-medium">{receipt.receiptNumber}</span></div>
                              <span className="text-sm text-muted-foreground">{formatDate(new Date(receipt.receivedAt))}</span>
                            </div>
                            {receipt.warehouseId && <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1"><Warehouse className="w-3 h-3" />{getWarehouseName(receipt.warehouseId)}</div>}
                            {receipt.notes && <p className="text-sm text-muted-foreground mt-1">{receipt.notes}</p>}
                            <div className="mt-2 space-y-1">
                              {receipt.items.map(ri => (
                                <div key={ri.id} className="flex items-center justify-between text-sm">
                                  <span>{ri.productId ? getProductName(ri.productId) : getIngredientName(ri.ingredientId)}</span>
                                  <span>{ri.quantityReceived} x {formatCurrency(parseFloat(ri.unitCost), currency)}</span>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground"><FileText className="w-8 h-8 mx-auto mb-2" /><p>{t("purchasing.no_receipts")}</p></div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteOrderDialog} onOpenChange={setShowDeleteOrderDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("purchasing.delete_order")}</DialogTitle><DialogDescription>{t("purchasing.delete_order_confirm")}</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteOrderDialog(false)} data-testid="button-cancel-delete-order">{t("purchasing.cancel")}</Button>
            <Button variant="destructive" onClick={() => { if (selectedOrder) deleteOrderMutation.mutate(selectedOrder.id); setShowDeleteOrderDialog(false); }} data-testid="button-confirm-delete-order">
              {deleteOrderMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{t("purchasing.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddItemDialog} onOpenChange={setShowAddItemDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("purchasing.add_item")}</DialogTitle></DialogHeader>
          <Form {...itemForm}>
            <form onSubmit={itemForm.handleSubmit((data) => { if (selectedOrder) addItemMutation.mutate({ orderId: selectedOrder.id, data }); })} className="space-y-4">
              {tenant?.type === "restaurant" && (
                <FormField control={itemForm.control} name="itemType" render={({ field }) => (
                  <FormItem><FormLabel>{t("purchasing.item_type")}</FormLabel>
                    <Select onValueChange={(val) => { field.onChange(val); setItemType(val as any); }} value={field.value}><FormControl><SelectTrigger data-testid="select-item-type"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent><SelectItem value="product">{t("purchasing.product")}</SelectItem><SelectItem value="ingredient">{t("ingredients.title")}</SelectItem></SelectContent>
                    </Select>
                  </FormItem>
                )} />
              )}
              {itemType === "product" ? (
                <FormField control={itemForm.control} name="productId" render={({ field }) => (
                  <FormItem><FormLabel>{t("purchasing.product")}</FormLabel>
                    <Select onValueChange={(val) => { field.onChange(val); const p = products?.find(pr => pr.id === val); if (p?.cost) itemForm.setValue("unitCost", parseFloat(p.cost.toString())); }} value={field.value}><FormControl><SelectTrigger data-testid="select-product"><SelectValue placeholder={t("purchasing.select_product")} /></SelectTrigger></FormControl>
                      <SelectContent>{products?.filter(p => p.isActive).map(p => <SelectItem key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ""}</SelectItem>)}</SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />
              ) : (
                <FormField control={itemForm.control} name="ingredientId" render={({ field }) => (
                  <FormItem><FormLabel>{t("ingredients.title")}</FormLabel>
                    <Select onValueChange={(val) => { field.onChange(val); const ing = ingredients?.find(i => i.id === val); if (ing?.costPerBase) itemForm.setValue("unitCost", parseFloat(ing.costPerBase.toString())); }} value={field.value}><FormControl><SelectTrigger data-testid="select-ingredient"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{ingredients?.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />
              )}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={itemForm.control} name="quantity" render={({ field }) => (
                  <FormItem><FormLabel>{t("purchasing.quantity")}</FormLabel><FormControl><Input type="number" {...field} onFocus={e => e.target.select()} onChange={e => field.onChange(parseInt(e.target.value) || 0)} data-testid="input-item-quantity" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={itemForm.control} name="unitCost" render={({ field }) => (
                  <FormItem><FormLabel>{t("purchasing.unit_cost")}</FormLabel><FormControl><CurrencyInput value={field.value} onChange={(val) => field.onChange(parseFloat(val) || 0)} currency={currency} data-testid="input-item-cost" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowAddItemDialog(false)} data-testid="button-cancel-add-item">{t("purchasing.cancel")}</Button>
                <Button type="submit" disabled={addItemMutation.isPending} data-testid="button-save-item">
                  {addItemMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{t("purchasing.add_item")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("purchasing.receive_stock")}</DialogTitle>
            <DialogDescription>{selectedOrder?.orderNumber}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("purchasing.destination_warehouse")}</Label>
              <Select value={receiveWarehouseId} onValueChange={setReceiveWarehouseId}>
                <SelectTrigger data-testid="select-receive-warehouse"><SelectValue placeholder={t("purchasing.select_warehouse")} /></SelectTrigger>
                <SelectContent>{warehouses?.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">{t("purchasing.cost_auto_update_note")}</p>
            {selectedOrder?.items?.map(item => {
              const pending = item.quantity - (item.receivedQuantity || 0);
              if (pending <= 0) return null;
              return (
                <Card key={item.id} data-testid={`card-receive-item-${item.id}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <span className="font-medium">{item.productId ? getProductName(item.productId) : getIngredientName(item.ingredientId)}</span>
                      <Badge variant="outline">{t("purchasing.pending_qty")}: {pending}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm whitespace-nowrap">{t("purchasing.qty_to_receive")}:</Label>
                        <Input type="number" min={0} max={pending} value={receiveQuantities[item.id] ?? 0}
                          onFocus={e => e.target.select()}
                          onChange={(e) => { const val = Math.min(parseInt(e.target.value) || 0, pending); setReceiveQuantities(prev => ({ ...prev, [item.id]: val })); }}
                          className="w-24" data-testid={`input-receive-qty-${item.id}`} />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm whitespace-nowrap">{t("purchasing.receive_unit_cost")}:</Label>
                        <Input type="number" step="0.01" min={0} value={receiveCosts[item.id] ?? parseFloat(item.unitCost || "0")}
                          onFocus={e => e.target.select()}
                          onChange={(e) => { setReceiveCosts(prev => ({ ...prev, [item.id]: parseFloat(e.target.value) || 0 })); }}
                          className="w-24" data-testid={`input-receive-cost-${item.id}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            <div>
              <Label>{t("purchasing.notes")}</Label>
              <Textarea value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} data-testid="input-receive-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReceiveDialog(false)} data-testid="button-cancel-receive">{t("purchasing.cancel")}</Button>
            <Button onClick={handleReceiveStock} disabled={receiveStockMutation.isPending || Object.values(receiveQuantities).every(q => !q || q <= 0)} data-testid="button-confirm-receive">
              {receiveStockMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{t("purchasing.create_receipt")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
