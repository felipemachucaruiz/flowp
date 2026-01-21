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
import type { Category, Product } from "@shared/schema";
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

  // Barcode scanner handler - detects rapid keyboard input
  const handleBarcodeInput = useCallback((barcode: string, productsList: Product[] | undefined) => {
    if (!productsList) return;
    
    // Find product by SKU/barcode
    const product = productsList.find(
      (p) => p.sku?.toLowerCase() === barcode.toLowerCase() && p.isActive
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
  }, [addToCart, toast]);

  // Listen for barcode scanner input (rapid keypresses ending with Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in payment dialog or other inputs
      if (showPaymentDialog) return;
      
      // Check if we're in barcode mode or if rapid input is detected
      if (e.key === "Enter" && barcodeBuffer.current.length > 0) {
        e.preventDefault();
        handleBarcodeInput(barcodeBuffer.current, products);
        barcodeBuffer.current = "";
        return;
      }
      
      // Only capture alphanumeric characters for barcode
      if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
        // Focus is not on the search input, treat as barcode scan
        if (document.activeElement !== searchInputRef.current) {
          barcodeBuffer.current += e.key;
          
          // Clear buffer after 100ms of no input (barcode scanners are fast)
          if (barcodeTimeout.current) {
            clearTimeout(barcodeTimeout.current);
          }
          barcodeTimeout.current = setTimeout(() => {
            // If buffer has enough characters, it's likely a barcode
            if (barcodeBuffer.current.length >= 4) {
              handleBarcodeInput(barcodeBuffer.current, products);
            }
            barcodeBuffer.current = "";
          }, 100);
        }
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
    const matchesSearch = matchesName || matchesSku;
    const matchesCategory = !selectedCategory || product.categoryId === selectedCategory;
    return matchesSearch && matchesCategory && product.isActive;
  });

  const handlePayment = () => {
    if (cart.length === 0) return;

    const orderData = {
      items: cart,
      paymentMethod,
      subtotal: getSubtotal(),
      taxAmount: getTaxAmount(taxRate),
      total: getTotal(taxRate),
    };

    pendingReceiptData.current = {
      ...orderData,
      cashReceived: paymentMethod === "cash" ? parseFloat(cashReceived || "0") : undefined,
    };

    createOrderMutation.mutate(orderData);
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
      <div className="w-80 lg:w-96 border-l bg-card flex flex-col">
        <div className="p-4 border-b">
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
              <div className="p-4 space-y-3">
                {cart.map((item) => (
                  <Card key={item.id} className="p-3">
                    <div className="flex items-start gap-3">
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
            <div className="border-t p-4 space-y-3 bg-muted/30">
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
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
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
