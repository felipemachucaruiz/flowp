import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePOS } from "@/lib/pos-context";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { printReceipt } from "@/lib/print-receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { Category, Product, Customer } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Banknote,
  CreditCard,
  Pause,
  Printer,
  X,
  ShoppingCart,
  Package,
  Receipt,
  Loader2,
  ScanBarcode,
  User,
  UserPlus,
  Check,
} from "lucide-react";

export default function POSPage() {
  const { toast } = useToast();
  const { t } = useI18n();
  const { tenant, user } = useAuth();
  const {
    cart,
    heldOrders,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    holdOrder,
    resumeOrder,
    getSubtotal,
    getTaxAmount,
    getTotal,
  } = usePOS();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [barcodeMode, setBarcodeMode] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerIdType, setNewCustomerIdType] = useState<string>("");
  const [newCustomerIdNumber, setNewCustomerIdNumber] = useState("");

  const taxRate = parseFloat(tenant?.taxRate?.toString() || "0");
  const barcodeBuffer = useRef("");
  const barcodeTimeout = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Move queries above the useEffect that uses them
  const { data: categories, isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers/search", customerSearchQuery],
    queryFn: async () => {
      const response = await fetch(`/api/customers/search?q=${encodeURIComponent(customerSearchQuery)}`, {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      return response.json();
    },
    enabled: !!tenant?.id,
  });

  // Create new customer mutation
  const createCustomerMutation = useMutation({
    mutationFn: async (data: { name: string; phone?: string; idType?: string; idNumber?: string }) => {
      return apiRequest("/api/customers", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (newCustomer: Customer) => {
      setSelectedCustomer(newCustomer);
      setShowNewCustomerForm(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerIdType("");
      setNewCustomerIdNumber("");
      queryClient.invalidateQueries({ queryKey: ["/api/customers/search"] });
      toast({
        title: "Customer created",
        description: `${newCustomer.name} has been added`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create customer",
        variant: "destructive",
      });
    },
  });

  // Barcode scanner handler - detects rapid keyboard input
  const handleBarcodeInput = useCallback((barcode: string, productsList: Product[] | undefined) => {
    if (!productsList || !barcode.trim()) return;
    
    const barcodeClean = barcode.trim().toLowerCase();
    
    // Find product by barcode field first, then SKU
    const product = productsList.find(
      (p) => (p.barcode?.toLowerCase() === barcodeClean || p.sku?.toLowerCase() === barcodeClean) && p.isActive
    );
    
    if (product) {
      addToCart(product);
      toast({
        title: t("pos.product_added"),
        description: `${product.name} ${t("pos.added_to_cart")}`,
      });
    } else {
      toast({
        title: t("pos.product_not_found"),
        description: `${t("pos.no_product_barcode")}: ${barcode}`,
        variant: "destructive",
      });
    }
    
    // Clear search after barcode scan
    setSearchQuery("");
  }, [addToCart, toast, t]);


  // Listen for barcode scanner input (rapid keypresses ending with Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in payment dialog
      if (showPaymentDialog) return;
      
      // If focus is on search input, let the input handle it
      if (document.activeElement === searchInputRef.current) return;
      
      // Check if Enter is pressed with buffered content
      if (e.key === "Enter" && barcodeBuffer.current.length > 0) {
        e.preventDefault();
        handleBarcodeInput(barcodeBuffer.current, products);
        barcodeBuffer.current = "";
        return;
      }
      
      // Capture alphanumeric and common barcode characters
      if (e.key.length === 1 && /[a-zA-Z0-9\-_]/.test(e.key)) {
        barcodeBuffer.current += e.key;
        
        // Clear buffer after 50ms of no input (barcode scanners are very fast)
        if (barcodeTimeout.current) {
          clearTimeout(barcodeTimeout.current);
        }
        barcodeTimeout.current = setTimeout(() => {
          // If buffer has enough characters, it's likely a barcode
          if (barcodeBuffer.current.length >= 3) {
            handleBarcodeInput(barcodeBuffer.current, products);
          }
          barcodeBuffer.current = "";
        }, 50);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (barcodeTimeout.current) {
        clearTimeout(barcodeTimeout.current);
      }
    };
  }, [products, showPaymentDialog, handleBarcodeInput]);

  const pendingReceiptData = useRef<{
    items: typeof cart;
    paymentMethod: string;
    subtotal: number;
    taxAmount: number;
    total: number;
    cashReceived?: number;
  } | null>(null);

  const createOrderMutation = useMutation({
    mutationFn: async (orderData: {
      items: typeof cart;
      paymentMethod: string;
      subtotal: number;
      taxAmount: number;
      total: number;
    }) => {
      const response = await apiRequest("POST", "/api/orders", orderData);
      return response.json() as Promise<{ id: string; orderNumber?: string }>;
    },
    onSuccess: (response) => {
      const receiptData = pendingReceiptData.current;
      if (receiptData) {
        printReceipt(tenant, {
          orderNumber: response.orderNumber || response.id.slice(-8).toUpperCase(),
          date: new Date(),
          items: receiptData.items.map(item => ({
            name: item.product.name,
            quantity: item.quantity,
            price: parseFloat(item.product.price),
            total: parseFloat(item.product.price) * item.quantity,
          })),
          subtotal: receiptData.subtotal,
          taxAmount: receiptData.taxAmount,
          taxRate: taxRate,
          total: receiptData.total,
          paymentMethod: receiptData.paymentMethod,
          cashReceived: receiptData.cashReceived,
          change: receiptData.cashReceived ? receiptData.cashReceived - receiptData.total : undefined,
          cashier: user?.name,
        });
        pendingReceiptData.current = null;
      }
      toast({
        title: t("pos.order_completed"),
        description: t("pos.order_success"),
      });
      clearCart();
      setShowPaymentDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: () => {
      pendingReceiptData.current = null;
      toast({
        title: t("common.error"),
        description: t("pos.order_error"),
        variant: "destructive",
      });
    },
  });

  const filteredProducts = products?.filter((product) => {
    const query = searchQuery.toLowerCase();
    const matchesName = product.name.toLowerCase().includes(query);
    const matchesSku = product.sku?.toLowerCase().includes(query);
    const matchesBarcode = product.barcode?.toLowerCase().includes(query);
    const matchesSearch = matchesName || matchesSku || matchesBarcode;
    const matchesCategory = !selectedCategory || product.categoryId === selectedCategory;
    return matchesSearch && matchesCategory && product.isActive;
  });

  // Handle Enter key in search input - auto-add on exact barcode/SKU match
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      e.preventDefault();
      
      // Try to find exact barcode/SKU match first
      const barcodeClean = searchQuery.trim().toLowerCase();
      const product = products?.find(
        (p) => (p.barcode?.toLowerCase() === barcodeClean || p.sku?.toLowerCase() === barcodeClean) && p.isActive
      );
      
      if (product) {
        addToCart(product);
        setSearchQuery("");
        toast({
          title: t("pos.product_added"),
          description: `${product.name} ${t("pos.added_to_cart")}`,
        });
      } else if (filteredProducts?.length === 1) {
        // If only one product matches, add it
        addToCart(filteredProducts[0]);
        setSearchQuery("");
        toast({
          title: t("pos.product_added"),
          description: `${filteredProducts[0].name} ${t("pos.added_to_cart")}`,
        });
      }
    }
  };

  const handlePayment = () => {
    if (cart.length === 0) return;
    if (!selectedCustomer) {
      toast({
        title: t("pos.customer_required"),
        description: t("pos.select_customer_first"),
        variant: "destructive",
      });
      return;
    }

    const orderData = {
      items: cart,
      paymentMethod,
      subtotal: getSubtotal(),
      taxAmount: getTaxAmount(taxRate),
      total: getTotal(taxRate),
      customerId: selectedCustomer.id,
    };

    pendingReceiptData.current = {
      ...orderData,
      cashReceived: paymentMethod === "cash" ? parseFloat(cashReceived || "0") : undefined,
      customer: selectedCustomer,
    };

    createOrderMutation.mutate(orderData);
  };

  const handleCreateCustomer = () => {
    if (!newCustomerName.trim()) return;
    createCustomerMutation.mutate({
      name: newCustomerName.trim(),
      phone: newCustomerPhone.trim() || undefined,
      idType: newCustomerIdType || undefined,
      idNumber: newCustomerIdNumber.trim() || undefined,
    });
  };

  const formatCurrency = (amount: number) => {
    const currency = tenant?.currency || "USD";
    // Map currency codes to locales for proper formatting
    const localeMap: Record<string, string> = {
      COP: "es-CO",
      MXN: "es-MX",
      ARS: "es-AR",
      PEN: "es-PE",
      CLP: "es-CL",
      EUR: "de-DE",
      GBP: "en-GB",
      JPY: "ja-JP",
      CNY: "zh-CN",
      KRW: "ko-KR",
      USD: "en-US",
      CAD: "en-CA",
      AUD: "en-AU",
      BRL: "pt-BR",
    };
    const locale = localeMap[currency] || "en-US";
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency,
        minimumFractionDigits: currency === "COP" || currency === "CLP" || currency === "JPY" || currency === "KRW" ? 0 : 2,
        maximumFractionDigits: currency === "COP" || currency === "CLP" || currency === "JPY" || currency === "KRW" ? 0 : 2,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  };

  const changeAmount = paymentMethod === "cash" && cashReceived
    ? parseFloat(cashReceived) - getTotal(taxRate)
    : 0;

  return (
    <div className="flex h-full">
      {/* Products Section */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search and Categories */}
        <div className="p-4 border-b space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder={t("pos.search_placeholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="pl-10"
                data-testid="input-search-products"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              title="Barcode scanner ready - just scan!"
              data-testid="button-barcode-indicator"
            >
              <ScanBarcode className="w-4 h-4" />
            </Button>
          </div>

          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-2">
              <Button
                variant={selectedCategory === null ? "default" : "secondary"}
                size="sm"
                onClick={() => setSelectedCategory(null)}
                data-testid="button-category-all"
              >
                {t("pos.all")}
              </Button>
              {categoriesLoading ? (
                <>
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-16" />
                </>
              ) : (
                categories?.filter(c => c.isActive).map((category) => (
                  <Button
                    key={category.id}
                    variant={selectedCategory === category.id ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setSelectedCategory(category.id)}
                    data-testid={`button-category-${category.id}`}
                  >
                    {category.name}
                  </Button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Products Grid */}
        <ScrollArea className="flex-1 p-4">
          {productsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
          ) : filteredProducts?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Package className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">{t("pos.no_products")}</p>
              <p className="text-sm">{t("pos.adjust_search")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts?.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="flex flex-col items-center justify-center p-3 rounded-lg border bg-card text-card-foreground hover-elevate active-elevate-2 transition-all min-h-[120px]"
                  data-testid={`button-product-${product.id}`}
                >
                  {product.image ? (
                    <img 
                      src={product.image} 
                      alt={product.name}
                      className="w-12 h-12 object-cover rounded mb-2"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-muted rounded mb-2 flex items-center justify-center">
                      <Package className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <span className="font-medium text-sm text-center line-clamp-2 mb-1">
                    {product.name}
                  </span>
                  <span className="text-primary font-semibold text-sm">
                    {formatCurrency(parseFloat(product.price))}
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Held Orders */}
        {heldOrders.length > 0 && (
          <div className="p-4 border-t bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Pause className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("pos.held_orders")}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {heldOrders.map((order, index) => (
                <Button
                  key={order.id}
                  variant="outline"
                  size="sm"
                  onClick={() => resumeOrder(order.id)}
                  data-testid={`button-held-order-${order.id}`}
                >
                  {t("pos.order")} #{index + 1} ({order.items.length} {t("pos.items")})
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Cart Section */}
      <div className="w-80 lg:w-[420px] border-l bg-card flex flex-col">
        <div className="p-4 pr-6 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" />
              <h2 className="font-semibold">{t("pos.current_order")}</h2>
            </div>
            {cart.length > 0 && (
              <Badge variant="secondary">{cart.length} {t("pos.items")}</Badge>
            )}
          </div>
        </div>

        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground">
            <Receipt className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-center font-medium">{t("pos.no_items")}</p>
            <p className="text-sm text-center mt-1">
              {t("pos.tap_products")}
            </p>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1">
              <div className="p-4 pr-6 space-y-3">
                {cart.map((item) => (
                  <Card key={item.id} className="p-3">
                    <div className="flex items-start gap-3">
                      {item.product.imageUrl ? (
                        <img
                          src={item.product.imageUrl}
                          alt={item.product.name}
                          className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                          <Package className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {item.product.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(parseFloat(item.product.price))} {t("pos.each")}
                        </p>
                        {item.modifiers.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.modifiers.map((mod) => (
                              <Badge key={mod.id} variant="secondary" className="text-xs">
                                {mod.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          data-testid={`button-decrease-${item.id}`}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-8 text-center font-medium text-sm">
                          {item.quantity}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          data-testid={`button-increase-${item.id}`}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeFromCart(item.id)}
                          data-testid={`button-remove-${item.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-right mt-2">
                      <span className="font-semibold">
                        {formatCurrency(parseFloat(item.product.price) * item.quantity)}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            {/* Order Summary */}
            <div className="border-t p-4 pr-6 space-y-3 bg-muted/30">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(getSubtotal())}</span>
                </div>
                {taxRate > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax ({taxRate}%)</span>
                    <span>{formatCurrency(getTaxAmount(taxRate))}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(getTotal(taxRate))}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={holdOrder}
                  data-testid="button-hold-order"
                >
                  <Pause className="w-4 h-4 mr-2" />
                  Hold
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={clearCart}
                  data-testid="button-clear-cart"
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={() => setShowPaymentDialog(true)}
                data-testid="button-checkout"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Checkout
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={(open) => {
        setShowPaymentDialog(open);
        if (!open) {
          setSelectedCustomer(null);
          setCustomerSearchQuery("");
          setShowNewCustomerForm(false);
          setNewCustomerName("");
          setNewCustomerPhone("");
          setNewCustomerIdType("");
          setNewCustomerIdNumber("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Payment</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="text-center mb-6">
              <p className="text-sm text-muted-foreground">Amount Due</p>
              <p className="text-4xl font-bold text-primary">
                {formatCurrency(getTotal(taxRate))}
              </p>
            </div>

            {/* Customer Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Customer (Optional)
              </Label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-primary/5 border-primary/30">
                  <div>
                    <p className="font-medium">{selectedCustomer.name}</p>
                    {selectedCustomer.phone && (
                      <p className="text-sm text-muted-foreground">{selectedCustomer.phone}</p>
                    )}
                    {selectedCustomer.idNumber && (
                      <p className="text-xs text-muted-foreground">
                        {selectedCustomer.idType?.replace("_", " ")}: {selectedCustomer.idNumber}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedCustomer(null)}
                    data-testid="button-remove-customer"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : showNewCustomerForm ? (
                <div className="space-y-3 p-3 rounded-lg border">
                  <Input
                    placeholder="Customer name *"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    data-testid="input-new-customer-name"
                  />
                  <Input
                    placeholder="Phone number"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    data-testid="input-new-customer-phone"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={newCustomerIdType} onValueChange={setNewCustomerIdType}>
                      <SelectTrigger data-testid="select-customer-id-type">
                        <SelectValue placeholder="ID Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cedula_ciudadania">Cédula Ciudadanía</SelectItem>
                        <SelectItem value="cedula_extranjeria">Cédula Extranjería</SelectItem>
                        <SelectItem value="pasaporte">Pasaporte</SelectItem>
                        <SelectItem value="nit">NIT</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="ID Number"
                      value={newCustomerIdNumber}
                      onChange={(e) => setNewCustomerIdNumber(e.target.value)}
                      data-testid="input-new-customer-id"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNewCustomerForm(false)}
                      className="flex-1"
                      data-testid="button-cancel-new-customer"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCreateCustomer}
                      disabled={!newCustomerName.trim() || createCustomerMutation.isPending}
                      className="flex-1"
                      data-testid="button-save-new-customer"
                    >
                      {createCustomerMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          Save
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search by name, phone, or ID..."
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      data-testid="input-customer-search"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowNewCustomerForm(true)}
                      title="Add new customer"
                      data-testid="button-add-new-customer"
                    >
                      <UserPlus className="w-4 h-4" />
                    </Button>
                  </div>
                  {customers && customers.length > 0 && customerSearchQuery && (
                    <div className="max-h-32 overflow-y-auto border rounded-lg divide-y">
                      {customers.slice(0, 5).map((customer) => (
                        <button
                          key={customer.id}
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setCustomerSearchQuery("");
                          }}
                          className="w-full px-3 py-2 text-left hover-elevate flex justify-between items-center"
                          data-testid={`button-select-customer-${customer.id}`}
                        >
                          <div>
                            <p className="font-medium text-sm">{customer.name}</p>
                            {customer.phone && (
                              <p className="text-xs text-muted-foreground">{customer.phone}</p>
                            )}
                          </div>
                          {customer.idNumber && (
                            <span className="text-xs text-muted-foreground">
                              {customer.idNumber}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPaymentMethod("cash")}
                className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2 hover-elevate ${
                  paymentMethod === "cash"
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
                data-testid="button-payment-cash"
              >
                <Banknote className={`w-8 h-8 ${paymentMethod === "cash" ? "text-primary" : "text-muted-foreground"}`} />
                <span className="font-medium">Cash</span>
              </button>
              <button
                onClick={() => setPaymentMethod("card")}
                className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2 hover-elevate ${
                  paymentMethod === "card"
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
                data-testid="button-payment-card"
              >
                <CreditCard className={`w-8 h-8 ${paymentMethod === "card" ? "text-primary" : "text-muted-foreground"}`} />
                <span className="font-medium">Card</span>
              </button>
            </div>

            {paymentMethod === "cash" && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Cash Received</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    className="text-lg"
                    data-testid="input-cash-received"
                  />
                </div>
                {changeAmount > 0 && (
                  <div className="p-3 rounded-lg bg-green-500/10 text-center">
                    <p className="text-sm text-muted-foreground">Change</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(changeAmount)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPaymentDialog(false)}
              data-testid="button-cancel-payment"
            >
              Cancel
            </Button>
            <Button
              onClick={handlePayment}
              disabled={
                createOrderMutation.isPending ||
                !selectedCustomer ||
                (paymentMethod === "cash" && parseFloat(cashReceived || "0") < getTotal(taxRate))
              }
              data-testid="button-complete-payment"
            >
              {createOrderMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4 mr-2" />
                  Complete & Print
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
