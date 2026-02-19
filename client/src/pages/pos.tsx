import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { usePOS } from "@/lib/pos-context";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { printReceipt } from "@/lib/print-receipt";
import { printBridge } from "@/lib/print-bridge";
import { formatCurrency, formatCurrencyInput } from "@/lib/currency";
import { CurrencyInput } from "@/components/currency-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Skeleton } from "@/components/ui/skeleton";
import type { Category, Product, Customer, LoyaltyReward, User as UserType, TaxRate } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneInput } from "@/components/ui/phone-input";
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
  Gift,
  ScanBarcode,
  User,
  UserPlus,
  Check,
  UserCheck,
  Lock,
} from "lucide-react";
import { NetworkStatusIndicator } from "@/components/network-status-indicator";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { saveOfflineOrder } from "@/lib/offline-storage";
import { syncManager } from "@/lib/sync-manager";
import { CameraBarcodeScanner } from "@/components/camera-barcode-scanner";
import { StoreClosingAlert } from "@/components/store-closing-alert";

export default function POSPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useI18n();
  const { tenant, user } = useAuth();
  const {
    cart,
    heldOrders,
    selectedTable,
    setSelectedTable,
    addToCart,
    removeFromCart,
    removeFreeItems,
    updateQuantity,
    clearCart,
    holdOrder,
    resumeOrder,
    getSubtotal,
    getTaxAmount,
    getTotal,
  } = usePOS();

  const { data: activeSession, isLoading: sessionLoading, isError: sessionError } = useQuery({
    queryKey: ["/api/register-sessions/active"],
    refetchInterval: 30000,
    retry: 2,
  });

  const registerOpen = !!activeSession && !sessionError;

  const isMobile = useIsMobile();
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [barcodeMode, setBarcodeMode] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  
  // Split payment state
  interface PaymentEntry {
    id: string;
    type: "cash" | "card";
    amount: string;
    transactionId?: string;
  }
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([]);
  const [currentPaymentType, setCurrentPaymentType] = useState<"cash" | "card">("cash");
  const [currentPaymentAmount, setCurrentPaymentAmount] = useState("");
  const [currentTransactionId, setCurrentTransactionId] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerPhoneCountryCode, setNewCustomerPhoneCountryCode] = useState("57");
  const [newCustomerIdType, setNewCustomerIdType] = useState<string>("");
  const [newCustomerIdNumber, setNewCustomerIdNumber] = useState("");
  const [discountPercent, setDiscountPercent] = useState<string>("0");
  const [fixedDiscountAmount, setFixedDiscountAmount] = useState<number>(0);
  const [appliedReward, setAppliedReward] = useState<LoyaltyReward | null>(null);
  const [freeProductItemId, setFreeProductItemId] = useState<string | null>(null);
  const [selectedSalesRep, setSelectedSalesRep] = useState<UserType | null>(null);

  const discountRate = parseFloat(discountPercent || "0");
  
  // Calculate discount amount based on subtotal (percentage + fixed)
  const getDiscountAmount = () => {
    const subtotal = getSubtotal();
    const percentageDiscount = (subtotal * discountRate) / 100;
    return percentageDiscount + fixedDiscountAmount;
  };
  
  // Calculate total with discount applied before tax
  const getTotalWithDiscount = (taxRateVal: number) => {
    const subtotal = getSubtotal();
    const discountAmount = getDiscountAmount();
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = (afterDiscount * taxRateVal) / 100;
    return afterDiscount + taxAmount;
  };
  
  const getTaxAmountWithDiscount = (taxRateVal: number) => {
    const subtotal = getSubtotal();
    const discountAmount = getDiscountAmount();
    const afterDiscount = subtotal - discountAmount;
    return (afterDiscount * taxRateVal) / 100;
  };
  
  // Split payment helpers
  const getTotalPaid = () => {
    return paymentEntries.reduce((sum, entry) => sum + parseFloat(entry.amount || "0"), 0);
  };
  
  const getRemainingAmount = () => {
    return Math.max(0, getTotalWithDiscount(taxRate) - getTotalPaid());
  };
  
  const getChangeAmount = () => {
    const overpaid = getTotalPaid() - getTotalWithDiscount(taxRate);
    return overpaid > 0 ? overpaid : 0;
  };
  
  const addPaymentEntry = () => {
    const amount = parseFloat(currentPaymentAmount || "0");
    if (amount <= 0) return;
    
    // Require transaction ID for card payments
    if (currentPaymentType === "card" && !currentTransactionId.trim()) {
      toast({
        title: t("pos.transaction_id_required"),
        description: t("pos.enter_transaction_id"),
        variant: "destructive",
      });
      return;
    }
    
    const newEntry: PaymentEntry = {
      id: Date.now().toString(),
      type: currentPaymentType,
      amount: currentPaymentAmount,
      transactionId: currentPaymentType === "card" ? currentTransactionId.trim() : undefined,
    };
    
    setPaymentEntries([...paymentEntries, newEntry]);
    setCurrentPaymentAmount("");
    setCurrentTransactionId("");
  };
  
  const removePaymentEntry = (id: string) => {
    setPaymentEntries(paymentEntries.filter(entry => entry.id !== id));
  };
  
  const resetPaymentState = () => {
    setPaymentEntries([]);
    setCurrentPaymentType("cash");
    setCurrentPaymentAmount("");
    setCurrentTransactionId("");
  };
  
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

  // Tables query for tab mode display
  const { data: tables } = useQuery<any[]>({
    queryKey: ["/api/tables"],
    enabled: !!tenant?.id && !!selectedTable,
  });

  const { data: loyaltyRewards } = useQuery<LoyaltyReward[]>({
    queryKey: ["/api/loyalty/rewards"],
    enabled: !!tenant?.id,
  });

  const { data: salesReps } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    enabled: !!tenant?.id,
  });

  const { data: taxRates } = useQuery<TaxRate[]>({
    queryKey: ["/api/tax-rates"],
    enabled: !!tenant?.id,
  });

  const { data: stockLevels } = useQuery<Record<string, number>>({
    queryKey: ["/api/inventory/levels"],
    enabled: !!tenant?.id,
  });

  // Query for open tab when table is selected (restaurant dine-in)
  const { data: openTab, refetch: refetchTab, isLoading: tabLoading, isFetching: tabFetching } = useQuery<any>({
    queryKey: ["/api/tabs/table", selectedTable],
    queryFn: async () => {
      if (!selectedTable) return null;
      const res = await fetch(`/api/tabs/table/${selectedTable}`, {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedTable && !!tenant?.id,
    staleTime: 0, // Always refetch when navigating
  });
  
  // Tab mode is active when a table is selected
  const isTabMode = !!selectedTable;

  // Mutation to create/open a tab for a table
  const openTabMutation = useMutation({
    mutationFn: async (tableId: string) => {
      return apiRequest("POST", `/api/tabs/open`, { tableId });
    },
    onSuccess: () => {
      refetchTab();
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Auto-create tab when entering tab mode if no tab exists
  useEffect(() => {
    if (isTabMode && selectedTable && !openTab && !tabLoading && !tabFetching && !openTabMutation.isPending) {
      openTabMutation.mutate(selectedTable);
    }
  }, [isTabMode, selectedTable, openTab, tabLoading, tabFetching, openTabMutation.isPending]);

  // Mutation to add items to tab
  const addToTabMutation = useMutation({
    mutationFn: async (items: any[]) => {
      if (!openTab) throw new Error("No open tab");
      return apiRequest("POST", `/api/tabs/${openTab.id}/items`, { items });
    },
    onSuccess: () => {
      refetchTab();
      clearCart();
      toast({
        title: t("tabs.items_added"),
        description: t("tabs.items_added_desc"),
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

  // Check if a product can be added to cart based on stock settings
  const canAddToCart = (product: Product): boolean => {
    // If zero stock sales are allowed, always allow
    if (tenant?.allowZeroStockSales !== false) return true;
    // If product doesn't track inventory, allow
    if (product.trackInventory === false) return true;
    // Check stock level
    const stock = stockLevels?.[product.id] ?? 0;
    return stock > 0;
  };

  const getProductStock = (productId: string): number => {
    return stockLevels?.[productId] ?? 0;
  };

  // Get individual active tax rates for display
  const activeTaxRates = taxRates?.filter(t => t.isActive) || [];

  // Calculate total tax rate from active tax rates only - no fallback to legacy tenant.taxRate
  // If no taxes are configured in tax chart, tax is 0
  const taxRate = activeTaxRates.reduce((sum, t) => sum + parseFloat(t.rate || "0"), 0);

  const getAvailableRewards = (points: number) => {
    if (!loyaltyRewards) return [];
    return loyaltyRewards
      .filter(reward => reward.isActive && reward.pointsCost <= points)
      .sort((a, b) => b.pointsCost - a.pointsCost);
  };

  // Helper to clear any applied reward
  const clearAppliedReward = () => {
    // Remove all free items from cart (both tracked and legacy)
    removeFreeItems();
    setFreeProductItemId(null);
    // Clear all discount values
    setDiscountPercent("0");
    setFixedDiscountAmount(0);
    setAppliedReward(null);
  };

  // Apply a loyalty reward
  const applyLoyaltyReward = (reward: LoyaltyReward) => {
    if (appliedReward?.id === reward.id) {
      // Remove the reward if already applied
      clearAppliedReward();
      toast({ title: t("pos.loyalty_reward_removed") });
      return;
    }

    // Clear any previously applied reward first
    clearAppliedReward();

    if (reward.rewardType === "product") {
      // Find the product and add it to cart for free
      const product = products?.find(p => p.id === reward.productId);
      if (product) {
        // Create a unique ID for tracking this free item in the cart
        const freeItemId = `free-${Date.now()}`;
        // Create a copy of the product with price = 0 for free item
        // Store the original product ID for order submission
        const freeProduct = { 
          ...product, 
          id: freeItemId, 
          originalProductId: product.id,
          price: "0", 
          name: `${product.name} (${t("pos.free_item")})` 
        };
        addToCart(freeProduct);
        setFreeProductItemId(freeItemId);
        setAppliedReward(reward);
        toast({ title: `${product.name} ${t("pos.added_free")}` });
      } else {
        toast({ title: t("pos.product_unavailable"), variant: "destructive" });
      }
    } else {
      // Apply discount - clear both types first, then apply the appropriate one
      if (reward.discountType === "percentage") {
        setDiscountPercent(reward.discountValue?.toString() || "0");
      } else {
        setFixedDiscountAmount(parseFloat(reward.discountValue?.toString() || "0"));
      }
      setAppliedReward(reward);
      toast({ title: `${reward.name} ${t("pos.applied")}` });
    }
  };

  // Create new customer mutation
  const createCustomerMutation = useMutation({
    mutationFn: async (data: { name: string; email?: string; phone?: string; phoneCountryCode?: string; idType?: string; idNumber?: string }) => {
      const response = await apiRequest("POST", "/api/customers", data);
      return response.json() as Promise<Customer>;
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
        title: t("pos.customer_created"),
        description: `${newCustomer.name}`,
      });
    },
    onError: () => {
      toast({
        title: t("pos.customer_error"),
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


  // Auto-focus search input on mount and keep focus for barcode scanning
  useEffect(() => {
    const focusSearchInput = () => {
      if (searchInputRef.current && !showPaymentDialog) {
        searchInputRef.current.focus();
      }
    };
    
    // Focus on mount
    focusSearchInput();
    
    // Refocus when clicking anywhere on the page (for continuous barcode scanning)
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't refocus if clicking on interactive elements (buttons, inputs, etc.)
      if (target.closest('button, input, textarea, select, [role="button"], [data-testid*="button"]')) {
        return;
      }
      // Refocus after a short delay to allow other click handlers to complete
      setTimeout(focusSearchInput, 100);
    };
    
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [showPaymentDialog]);

  // Listen for barcode scanner input (rapid keypresses ending with Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in payment dialog
      if (showPaymentDialog) return;
      
      // If focus is on search input, let the input handle it naturally
      // The search input's onKeyDown will handle Enter for barcode submission
      if (document.activeElement === searchInputRef.current) return;
      
      // Check if Enter is pressed with buffered content
      if (e.key === "Enter" && barcodeBuffer.current.length > 0) {
        e.preventDefault();
        handleBarcodeInput(barcodeBuffer.current, products);
        barcodeBuffer.current = "";
        // Refocus search input after barcode scan
        searchInputRef.current?.focus();
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
            // Refocus search input after barcode scan
            searchInputRef.current?.focus();
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
    payments?: Array<{ type: string; amount: number; transactionId?: string }>;
    subtotal: number;
    discount?: number;
    discountAmount?: number;
    taxAmount: number;
    total: number;
    cashReceived?: number;
    customer?: Customer;
  } | null>(null);

  const { isOnline } = useOfflineSync();

  const createOrderMutation = useMutation({
    mutationFn: async (orderData: {
      items: typeof cart;
      paymentMethod: string;
      payments?: Array<{ type: string; amount: number; transactionId?: string }>;
      subtotal: number;
      discount?: number;
      discountAmount?: number;
      taxAmount: number;
      total: number;
      customerId?: string;
    }) => {
      if (!isOnline) {
        const offlineOrderData = { ...orderData, tenantId: tenant?.id };
        const offlineId = await saveOfflineOrder(offlineOrderData);
        await syncManager.refreshPendingCount();
        return { id: offlineId, orderNumber: `OFF-${offlineId.slice(-6).toUpperCase()}`, offline: true };
      }
      const response = await apiRequest("POST", "/api/orders", orderData);
      return response.json() as Promise<{ id: string; orderNumber?: string; cufe?: string; qrCode?: string; prefix?: string; resolutionNumber?: string; resolutionStartDate?: string; resolutionEndDate?: string; authRangeFrom?: number; authRangeTo?: number }>;
    },
    onSuccess: (response: { id: string; orderNumber?: string; offline?: boolean; cufe?: string; qrCode?: string; prefix?: string; resolutionNumber?: string; resolutionStartDate?: string; resolutionEndDate?: string; authRangeFrom?: number; authRangeTo?: number }) => {
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
          taxes: activeTaxRates.map(tax => ({
            name: tax.name,
            rate: parseFloat(tax.rate || "0"),
            amount: (receiptData.subtotal - (receiptData.discountAmount || 0)) * parseFloat(tax.rate || "0") / 100,
          })),
          total: receiptData.total,
          paymentMethod: receiptData.paymentMethod,
          payments: receiptData.payments?.map(p => ({
            type: p.type as "cash" | "card",
            amount: p.amount,
            transactionId: p.transactionId,
          })),
          cashReceived: receiptData.cashReceived,
          change: receiptData.cashReceived ? receiptData.cashReceived - receiptData.total : undefined,
          cashier: user?.name,
          customerInfo: receiptData.customer ? {
            name: receiptData.customer.name,
            idNumber: receiptData.customer.idNumber,
            idType: receiptData.customer.idType,
            phone: receiptData.customer.phone,
            email: receiptData.customer.email,
            loyaltyPoints: receiptData.customer.loyaltyPoints,
          } : undefined,
          electronicBilling: response.cufe ? {
            cufe: response.cufe,
            qrCode: response.qrCode,
            documentNumber: response.dianDocNumber || response.orderNumber,
            prefix: response.prefix,
            resolutionNumber: response.resolutionNumber,
            resolutionStartDate: response.resolutionStartDate,
            resolutionEndDate: response.resolutionEndDate,
            authRangeFrom: response.authRangeFrom,
            authRangeTo: response.authRangeTo,
          } : undefined,
        });
        
        // Open cash drawer for cash payments if enabled
        const hasCashPayment = receiptData.paymentMethod === 'cash' || 
          receiptData.payments?.some(p => p.type === 'cash');
        if (hasCashPayment && tenant?.openCashDrawer) {
          printBridge.openCashDrawer().catch(() => {
            // Silently fail - cash drawer is optional
          });
        }
        
        pendingReceiptData.current = null;
      }
      if (response.offline) {
        toast({
          title: t("pos.order_saved_offline"),
          description: t("pos.order_sync_when_online"),
        });
      } else {
        toast({
          title: t("pos.order_completed"),
          description: t("pos.order_success"),
        });
      }
      clearCart();
      setSelectedCustomer(null);
      setSelectedSalesRep(null);
      setAppliedReward(null);
      setFreeProductItemId(null);
      setFixedDiscountAmount(0);
      setDiscountPercent("0");
      resetPaymentState();
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
    if (e.key === "Enter") {
      e.preventDefault();
      
      // Get the current value directly from the input (more reliable for barcode scanners)
      const inputValue = (e.target as HTMLInputElement).value.trim();
      if (!inputValue) return;
      
      const barcodeClean = inputValue.toLowerCase();
      
      // Try to find exact barcode/SKU match first
      const product = products?.find(
        (p) => (p.barcode?.toLowerCase() === barcodeClean || p.sku?.toLowerCase() === barcodeClean) && p.isActive
      );
      
      if (product) {
        addToCart(product);
        setSearchQuery("");
        // Keep focus on input for continuous scanning
        searchInputRef.current?.focus();
        toast({
          title: t("pos.product_added"),
          description: `${product.name} ${t("pos.added_to_cart")}`,
        });
      } else if (filteredProducts?.length === 1) {
        // If only one product matches, add it
        addToCart(filteredProducts[0]);
        setSearchQuery("");
        searchInputRef.current?.focus();
        toast({
          title: t("pos.product_added"),
          description: `${filteredProducts[0].name} ${t("pos.added_to_cart")}`,
        });
      } else {
        // No match found - show error and keep the search for debugging
        toast({
          title: t("pos.product_not_found"),
          description: `${t("pos.no_product_barcode")}: ${inputValue}`,
          variant: "destructive",
        });
        setSearchQuery("");
        searchInputRef.current?.focus();
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
    
    if (paymentEntries.length === 0) {
      toast({
        title: t("pos.payment_required"),
        description: t("pos.add_payment_first"),
        variant: "destructive",
      });
      return;
    }

    // Determine primary payment method (the one with highest amount)
    const primaryPayment = paymentEntries.reduce((max, entry) => 
      parseFloat(entry.amount) > parseFloat(max.amount) ? entry : max
    , paymentEntries[0]);

    // Transform cart items to use original product IDs for free items
    // For legacy items without originalProductId, look up the product by name
    const orderItems = cart.map(item => {
      const productWithOriginal = item.product as { originalProductId?: string };
      let productId = item.product.id;
      
      // If this is a free item (ID starts with "free-"), use the original product ID
      if (item.id.startsWith("free-") || item.product.id.startsWith("free-")) {
        if (productWithOriginal.originalProductId) {
          productId = productWithOriginal.originalProductId;
        } else {
          // Legacy: Find the actual product by matching name (without the "(GRATIS)" suffix)
          const cleanName = item.product.name.replace(/\s*\([^)]*GRATIS[^)]*\)\s*$/i, "").replace(/\s*\([^)]*FREE[^)]*\)\s*$/i, "").trim();
          const matchingProduct = products?.find(p => p.name === cleanName);
          if (matchingProduct) {
            productId = matchingProduct.id;
          }
        }
      }
      
      return {
        ...item,
        product: {
          ...item.product,
          id: productId,
        }
      };
    });

    const orderData = {
      items: orderItems,
      paymentMethod: paymentEntries.length > 1 ? "split" : primaryPayment.type,
      payments: paymentEntries.map(e => ({
        type: e.type,
        amount: parseFloat(e.amount),
        transactionId: e.transactionId,
      })),
      subtotal: getSubtotal(),
      discount: discountRate,
      discountAmount: getDiscountAmount(),
      taxAmount: getTaxAmountWithDiscount(taxRate),
      total: getTotalWithDiscount(taxRate),
      customerId: selectedCustomer.id,
      salesRepId: selectedSalesRep?.id,
      appliedRewardId: appliedReward?.id,
      appliedRewardPoints: appliedReward?.pointsCost,
    };

    const totalCashReceived = paymentEntries
      .filter(e => e.type === "cash")
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);

    pendingReceiptData.current = {
      ...orderData,
      cashReceived: totalCashReceived > 0 ? totalCashReceived : undefined,
      customer: selectedCustomer,
    };

    createOrderMutation.mutate(orderData);
  };

  // Handler for adding items to an open tab (restaurant dine-in)
  const handleAddToTab = () => {
    if (cart.length === 0) return;
    if (!openTab) return;

    const items = cart.map(item => ({
      productId: item.product.id,
      quantity: item.quantity,
      unitPrice: item.product.price,
      modifiers: item.modifiers,
      notes: item.notes,
    }));

    addToTabMutation.mutate(items);
  };

  // Handler to go back to tables page
  const handleBackToTables = () => {
    setSelectedTable(null);
    clearCart();
    navigate("/tables");
  };

  const handleCreateCustomer = () => {
    if (!newCustomerName.trim() || !newCustomerEmail.trim()) return;
    createCustomerMutation.mutate({
      name: newCustomerName.trim(),
      email: newCustomerEmail.trim(),
      phone: newCustomerPhone.trim() || undefined,
      phoneCountryCode: newCustomerPhoneCountryCode,
      idType: newCustomerIdType || undefined,
      idNumber: newCustomerIdNumber.trim() || undefined,
    });
  };

  const currency = tenant?.currency || "USD";

  
  const CartContent = () => (
    <>
      <div className="p-3 border-b">
        {isTabMode && (
          <div className="mb-2 p-2 bg-primary/10 rounded-md flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              {t("tabs.adding_to_table")} {tables?.find(t => t.id === selectedTable)?.name || selectedTable}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <ShoppingCart className="w-4 h-4 text-primary shrink-0" />
            <h2 className="font-semibold text-sm truncate">{t("pos.current_order")}</h2>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <NetworkStatusIndicator />
            {cart.length > 0 && (
              <Badge variant="secondary" className="text-xs">{cart.length}</Badge>
            )}
          </div>
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
            <div className="p-3 space-y-2">
              {cart.map((item) => (
                <Card key={item.id} className="p-2">
                  <div className="flex items-start gap-2">
                    {item.product.image ? (
                      <img
                        src={item.product.image}
                        alt={item.product.name}
                        className="w-10 h-10 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <Package className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm leading-tight line-clamp-2">
                        {item.product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(parseFloat(item.product.price), currency)} {t("pos.each")}
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
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-border/50">
                    <div className="flex items-center gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        data-testid={`button-decrease-${item.id}`}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </Button>
                      <span className="w-6 text-center font-medium text-sm">
                        {item.quantity}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        data-testid={`button-increase-${item.id}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeFromCart(item.id)}
                        data-testid={`button-remove-${item.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <span className="font-semibold text-sm">
                      {formatCurrency(parseFloat(item.product.price) * item.quantity, currency)}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>

          <div className="border-t p-3 space-y-2 bg-muted/30">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("pos.subtotal")}</span>
                <span>{formatCurrency(getSubtotal(), currency)}</span>
              </div>
              <div className="flex justify-between items-center gap-1">
                <span className="text-muted-foreground shrink-0">{t("pos.discount")}</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    onFocus={e => e.target.select()}
                    className="w-12 h-6 text-right text-xs px-1"
                    data-testid="input-discount-percent"
                  />
                  <span className="text-muted-foreground text-xs">%</span>
                </div>
              </div>
              {taxRate > 0 && (
                <div className="space-y-1">
                  {activeTaxRates.length > 1 ? (
                    activeTaxRates.map((tax) => {
                      const taxAmount = getTaxAmountWithDiscount(parseFloat(tax.rate || "0"));
                      return (
                        <div key={tax.id} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{tax.name} ({tax.rate}%)</span>
                          <span>{formatCurrency(taxAmount, currency)}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("pos.tax")} ({taxRate.toFixed(2)}%)</span>
                      <span>{formatCurrency(getTaxAmountWithDiscount(taxRate), currency)}</span>
                    </div>
                  )}
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>{t("pos.total")}</span>
                <span className="text-primary">{formatCurrency(getTotalWithDiscount(taxRate), currency)}</span>
              </div>
            </div>

            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => { holdOrder(); if (isMobile) setShowMobileCart(false); }}
                data-testid="button-hold-order"
              >
                <Pause className="w-3.5 h-3.5 mr-1" />
                {t("pos.hold")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => { clearCart(); if (isMobile) setShowMobileCart(false); }}
                data-testid="button-clear-cart"
              >
                <X className="w-3.5 h-3.5 mr-1" />
                {t("pos.clear")}
              </Button>
            </div>

            {isTabMode ? (
              /* Tab mode: Add to Tab and Back buttons */
              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={handleAddToTab}
                  disabled={cart.length === 0 || addToTabMutation.isPending || openTabMutation.isPending || tabLoading || tabFetching || !openTab}
                  data-testid="button-add-to-tab"
                >
                  {(addToTabMutation.isPending || openTabMutation.isPending || tabLoading || tabFetching) ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-1.5" />
                  )}
                  {t("tabs.add_to_tab")}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleBackToTables}
                  data-testid="button-back-to-tables"
                >
                  {t("tabs.back_to_tables")}
                </Button>
              </div>
            ) : (
              /* Regular mode: Checkout button */
              <Button
                className="w-full"
                onClick={() => { setShowPaymentDialog(true); if (isMobile) setShowMobileCart(false); }}
                data-testid="button-checkout"
              >
                <CreditCard className="w-4 h-4 mr-1.5" />
                {t("pos.checkout")}
              </Button>
            )}
          </div>
        </>
      )}
    </>
  );

  if (sessionLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!registerOpen) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 text-center max-w-md px-6">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
            <Lock className="w-10 h-10 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold" data-testid="text-register-closed-title">
              {t("pos.register_closed_title" as any)}
            </h2>
            <p className="text-muted-foreground" data-testid="text-register-closed-description">
              {t("pos.register_closed_description" as any)}
            </p>
          </div>
          <Button
            onClick={() => navigate("/cash-register")}
            data-testid="button-open-register"
          >
            {t("pos.open_register" as any)}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full relative overflow-hidden bg-background">
      <StoreClosingAlert />
      {/* Products Section */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Search and Categories */}
        <div className="px-2 sm:p-4 py-2 border-b space-y-2 sm:space-y-4">
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
              title={t("pos.barcode_ready")}
              onClick={() => setShowCameraScanner(true)}
              data-testid="button-barcode-scan"
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
        <div 
          data-tour="pos-products"
          className="flex-1 overflow-y-auto p-0 sm:p-4 pb-28 sm:pb-4 overscroll-contain touch-scroll"
        >
          {productsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-px sm:gap-2 bg-border">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-32 sm:h-28 bg-card" />
              ))}
            </div>
          ) : filteredProducts?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Package className="w-10 h-10 mb-3 opacity-50" />
              <p className="text-base font-medium">{t("pos.no_products")}</p>
              <p className="text-sm">{t("pos.adjust_search")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-px sm:gap-2 bg-border sm:bg-transparent">
              {filteredProducts?.map((product) => {
                const inStock = canAddToCart(product);
                const stock = getProductStock(product.id);
                const showOutOfStock = !inStock && product.trackInventory !== false;
                return (
                  <button
                    key={product.id}
                    onClick={() => {
                      if (!canAddToCart(product)) {
                        toast({
                          title: t("pos.out_of_stock"),
                          description: t("pos.out_of_stock_description"),
                          variant: "destructive",
                        });
                        return;
                      }
                      addToCart(product);
                    }}
                    className={`flex flex-col items-center justify-center p-3 sm:p-2 sm:rounded-md sm:border bg-card text-card-foreground hover-elevate active-elevate-2 transition-all min-h-[120px] sm:min-h-[100px] ${showOutOfStock ? 'opacity-50' : ''}`}
                    data-testid={`button-product-${product.id}`}
                  >
                    {product.image ? (
                      <img 
                        src={product.image} 
                        alt={product.name}
                        className="w-14 h-14 sm:w-12 sm:h-12 object-cover rounded-lg mb-2"
                      />
                    ) : (
                      <div className="w-14 h-14 sm:w-12 sm:h-12 bg-muted rounded-lg mb-2 flex items-center justify-center">
                        <Package className="w-7 h-7 sm:w-6 sm:h-6 text-muted-foreground" />
                      </div>
                    )}
                    <span className="font-medium text-sm sm:text-sm text-center line-clamp-2 mb-1">
                      {product.name}
                    </span>
                    <span className="text-primary font-semibold text-sm sm:text-sm">
                      {formatCurrency(parseFloat(product.price), currency)}
                    </span>
                    {showOutOfStock && (
                      <span className="text-xs text-destructive font-medium">
                        {t("pos.no_stock")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Held Orders */}
        {heldOrders.length > 0 && (
          <div 
            className="p-3 sm:p-4 border-t bg-muted/30"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Pause className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("pos.held_orders")}</span>
            </div>
            <div className="flex gap-2 flex-wrap pb-16 sm:pb-0">
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

      {/* Desktop Cart Section - Hidden on mobile, responsive width */}
      {!isMobile && (
        <div data-tour="pos-cart" className="w-72 lg:w-80 xl:w-96 2xl:w-[420px] border-l bg-card flex flex-col">
          <CartContent />
        </div>
      )}

      {/* Mobile Cart FAB - Fixed at bottom right, hidden when cart is open */}
      {isMobile && !showMobileCart && (
        <div 
          className="fixed right-4 z-[9999]"
          style={{ 
            bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <button
            className="h-16 w-16 rounded-full shadow-2xl bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform"
            onClick={() => setShowMobileCart(true)}
            data-testid="button-mobile-cart"
          >
            <ShoppingCart className="w-7 h-7" />
            {cart.length > 0 && (
              <span className="absolute -top-1 -right-1 h-7 w-7 rounded-full bg-destructive text-destructive-foreground text-sm font-bold flex items-center justify-center">
                {cart.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Mobile Cart Sheet */}
      <Sheet open={showMobileCart} onOpenChange={setShowMobileCart}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("pos.current_order")}</SheetTitle>
          </SheetHeader>
          <CartContent />
        </SheetContent>
      </Sheet>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={(open) => {
        setShowPaymentDialog(open);
        if (!open) {
          setSelectedCustomer(null);
          setSelectedSalesRep(null);
          setDiscountPercent("0");
          setCustomerSearchQuery("");
          setShowNewCustomerForm(false);
          setNewCustomerName("");
          setNewCustomerPhone("");
          setNewCustomerIdType("");
          setNewCustomerIdNumber("");
          resetPaymentState();
        }
      }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("pos.complete_payment")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="text-center mb-6">
              <p className="text-sm text-muted-foreground">{t("pos.amount_due")}</p>
              <p className="text-4xl font-bold text-primary">
                {formatCurrency(getTotalWithDiscount(taxRate), currency)}
              </p>
              {discountRate > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {t("pos.discount")}: {discountRate}% (-{formatCurrency(getDiscountAmount(), currency)})
                </p>
              )}
            </div>

            {/* Sales Rep Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <UserCheck className="w-4 h-4" />
                {t("pos.sales_rep")}
              </Label>
              <Select
                value={selectedSalesRep?.id || ""}
                onValueChange={(value) => {
                  const rep = salesReps?.find(r => r.id === value);
                  setSelectedSalesRep(rep || null);
                }}
              >
                <SelectTrigger data-testid="select-sales-rep">
                  <SelectValue placeholder={t("pos.select_sales_rep")} />
                </SelectTrigger>
                <SelectContent>
                  {salesReps?.filter(rep => rep.isActive).map((rep) => (
                    <SelectItem key={rep.id} value={rep.id}>
                      {rep.name} {rep.id === user?.id ? `(${t("pos.you")})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Customer Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <User className="w-4 h-4" />
                {t("pos.customer_optional")}
              </Label>
              {selectedCustomer ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-primary/5 border-primary/30">
                    <div>
                      <p className="font-medium">{selectedCustomer.name}</p>
                      {selectedCustomer.phone && (
                        <p className="text-sm text-muted-foreground">+{selectedCustomer.phoneCountryCode || "57"} {selectedCustomer.phone}</p>
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
                      onClick={() => {
                        setSelectedCustomer(null);
                        setDiscountPercent("0");
                      }}
                      data-testid="button-remove-customer"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  {/* Loyalty Points Display */}
                  <div className="p-3 rounded-lg border bg-accent/30 border-accent/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{t("pos.loyalty_points")}</span>
                      <Badge variant="secondary" className="text-base font-bold">
                        {selectedCustomer.loyaltyPoints || 0} {t("pos.points")}
                      </Badge>
                    </div>
                    {appliedReward && (
                      <div className="flex items-center justify-between p-2 rounded-md bg-green-500/10 border border-green-500/30 mb-2">
                        <div className="flex items-center gap-2">
                          <Gift className="w-4 h-4 text-green-500" />
                          <span className="text-xs font-medium text-green-600 dark:text-green-400">
                            {t("pos.reward_applied")}: {appliedReward.name}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => clearAppliedReward()}
                          data-testid="button-remove-reward"
                        >
                          {t("customers.cancel")}
                        </Button>
                      </div>
                    )}
                    {(selectedCustomer.loyaltyPoints || 0) > 0 && getAvailableRewards(selectedCustomer.loyaltyPoints || 0).length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">{t("pos.available_rewards")} ({t("pos.click_to_redeem")}):</p>
                        <div className="flex flex-wrap gap-1">
                          {getAvailableRewards(selectedCustomer.loyaltyPoints || 0).slice(0, 5).map(reward => (
                            <Badge 
                              key={reward.id} 
                              variant={appliedReward?.id === reward.id ? "default" : "outline"}
                              className={`text-xs cursor-pointer hover-elevate ${reward.rewardType === "product" ? "border-green-500/50" : ""}`}
                              onClick={() => applyLoyaltyReward(reward)}
                              data-testid={`badge-reward-${reward.id}`}
                            >
                              {reward.rewardType === "product" ? <Gift className="w-3 h-3 mr-1 inline" /> : <Banknote className="w-3 h-3 mr-1 inline" />}
                              {reward.name} ({reward.pointsCost} pts)
                            </Badge>
                          ))}
                          {getAvailableRewards(selectedCustomer.loyaltyPoints || 0).length > 5 && (
                            <Badge variant="outline" className="text-xs">
                              +{getAvailableRewards(selectedCustomer.loyaltyPoints || 0).length - 5} {t("pos.more")}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ) : (selectedCustomer.loyaltyPoints || 0) > 0 ? (
                      <p className="text-xs text-muted-foreground">{t("pos.not_enough_points")}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("pos.no_points_yet")}</p>
                    )}
                  </div>
                </div>
              ) : showNewCustomerForm ? (
                <div className="space-y-3 p-3 rounded-lg border">
                  <Input
                    placeholder={`${t("customers.name")} *`}
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    data-testid="input-new-customer-name"
                  />
                  <Input
                    type="email"
                    placeholder={`${t("customers.email")} *`}
                    value={newCustomerEmail}
                    onChange={(e) => setNewCustomerEmail(e.target.value)}
                    data-testid="input-new-customer-email"
                  />
                  <PhoneInput
                    value={newCustomerPhone}
                    countryCode={newCustomerPhoneCountryCode}
                    onPhoneChange={setNewCustomerPhone}
                    onCountryCodeChange={setNewCustomerPhoneCountryCode}
                    placeholder={`${t("customers.phone")} *`}
                    data-testid="input-new-customer-phone"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={newCustomerIdType} onValueChange={setNewCustomerIdType}>
                      <SelectTrigger data-testid="select-customer-id-type">
                        <SelectValue placeholder={`${t("customers.id_type")} *`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cedula_ciudadania">{t("customers.id_cedula")}</SelectItem>
                        <SelectItem value="cedula_extranjeria">{t("customers.id_cedula_ext")}</SelectItem>
                        <SelectItem value="pasaporte">{t("customers.id_passport")}</SelectItem>
                        <SelectItem value="nit">NIT</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder={`${t("customers.id_number")} *`}
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
                      {t("customers.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCreateCustomer}
                      disabled={!newCustomerName.trim() || !newCustomerEmail.trim() || !newCustomerPhone.trim() || !newCustomerIdType || !newCustomerIdNumber.trim() || createCustomerMutation.isPending}
                      className="flex-1"
                      data-testid="button-save-new-customer"
                    >
                      {createCustomerMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          {t("pos.save")}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder={t("pos.search_customer")}
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      data-testid="input-customer-search"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowNewCustomerForm(true)}
                      title={t("pos.add_new_customer")}
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
                            // Apply customer's default discount (always set, including 0)
                            setDiscountPercent(customer.defaultDiscount?.toString() || "0");
                            setCustomerSearchQuery("");
                          }}
                          className="w-full px-3 py-2 text-left hover-elevate flex justify-between items-center"
                          data-testid={`button-select-customer-${customer.id}`}
                        >
                          <div>
                            <p className="font-medium text-sm">{customer.name}</p>
                            {customer.phone && (
                              <p className="text-xs text-muted-foreground">+{customer.phoneCountryCode || "57"} {customer.phone}</p>
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

            {/* Added Payments List */}
            {paymentEntries.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("pos.payments_added")}</label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {paymentEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        {entry.type === "cash" ? (
                          <Banknote className="w-4 h-4 text-green-600" />
                        ) : (
                          <CreditCard className="w-4 h-4 text-blue-600" />
                        )}
                        <span className="font-medium">{formatCurrency(parseFloat(entry.amount), currency)}</span>
                        {entry.transactionId && (
                          <span className="text-xs text-muted-foreground">
                            (ID: {entry.transactionId})
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removePaymentEntry(entry.id)}
                        data-testid={`button-remove-payment-${entry.id}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                
                {/* Remaining / Change display */}
                {getRemainingAmount() > 0 ? (
                  <div className="p-2 rounded-lg bg-orange-500/10 text-center">
                    <p className="text-sm text-muted-foreground">{t("pos.remaining")}</p>
                    <p className="text-xl font-bold text-orange-600">
                      {formatCurrency(getRemainingAmount(), currency)}
                    </p>
                  </div>
                ) : getChangeAmount() > 0 ? (
                  <div className="p-2 rounded-lg bg-green-500/10 text-center">
                    <p className="text-sm text-muted-foreground">{t("pos.change")}</p>
                    <p className="text-xl font-bold text-green-600">
                      {formatCurrency(getChangeAmount(), currency)}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            <Separator />

            {/* Add New Payment */}
            <div className="space-y-3">
              <label className="text-sm font-medium">{t("pos.add_payment")}</label>
              
              {/* Payment Type Selection */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setCurrentPaymentType("cash")}
                  className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 hover-elevate ${
                    currentPaymentType === "cash"
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                  data-testid="button-payment-cash"
                >
                  <Banknote className={`w-6 h-6 ${currentPaymentType === "cash" ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="font-medium text-sm">{t("pos.cash")}</span>
                </button>
                <button
                  onClick={() => setCurrentPaymentType("card")}
                  className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 hover-elevate ${
                    currentPaymentType === "card"
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                  data-testid="button-payment-card"
                >
                  <CreditCard className={`w-6 h-6 ${currentPaymentType === "card" ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="font-medium text-sm">{t("pos.card")}</span>
                </button>
              </div>

              {/* Payment Amount */}
              <div>
                <label className="text-sm font-medium">{t("pos.payment_amount")}</label>
                <div className="flex gap-2">
                  <CurrencyInput
                    value={currentPaymentAmount}
                    onChange={(val) => setCurrentPaymentAmount(val)}
                    currency={currency}
                    placeholder={formatCurrencyInput(getRemainingAmount(), currency)}
                    className="flex-1"
                    data-testid="input-payment-amount"
                  />
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPaymentAmount(getRemainingAmount().toString())}
                    className="shrink-0"
                    data-testid="button-fill-remaining"
                  >
                    {t("pos.fill_remaining")}
                  </Button>
                </div>
              </div>

              {/* Transaction ID for Card */}
              {currentPaymentType === "card" && (
                <div>
                  <label className="text-sm font-medium">{t("pos.transaction_id")}</label>
                  <Input
                    type="text"
                    placeholder={t("pos.transaction_id_placeholder")}
                    value={currentTransactionId}
                    onChange={(e) => setCurrentTransactionId(e.target.value)}
                    data-testid="input-transaction-id"
                  />
                </div>
              )}

              {/* Add Payment Button */}
              <Button
                onClick={addPaymentEntry}
                disabled={!currentPaymentAmount || parseFloat(currentPaymentAmount) <= 0}
                className="w-full"
                variant="outline"
                data-testid="button-add-payment"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t("pos.add_payment_button")}
              </Button>
            </div>
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
                paymentEntries.length === 0 ||
                getRemainingAmount() > 0
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

      {/* Camera Barcode Scanner */}
      <CameraBarcodeScanner
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onScan={(barcode) => {
          handleBarcodeInput(barcode, products);
          setShowCameraScanner(false);
        }}
      />
    </div>
  );
}
