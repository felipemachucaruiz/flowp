import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/ui/phone-input";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Order, LoyaltyTransaction, LoyaltyReward, Product } from "@shared/schema";
import { DIAN_COUNTRIES } from "@shared/dianCountries";
import { DIAN_MUNICIPALITIES } from "@shared/dianMunicipalities";
import { DIAN_ORGANIZATION_TYPES, DIAN_TAX_REGIMES, DIAN_TAX_LIABILITIES } from "@shared/dianTaxTypes";
import {
  Search,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  ShoppingBag,
  Star,
  Gift,
  Plus,
  Edit,
  Trash2,
  TrendingUp,
  Clock,
  CreditCard,
  ChevronRight,
  Users,
  History,
} from "lucide-react";

interface CustomerWithOrders extends Customer {
  orders?: Order[];
  loyaltyTransactions?: LoyaltyTransaction[];
}

export default function CustomersPage() {
  const { tenant } = useAuth();
  const { t, formatDate, formatDateTime } = useI18n();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [showMobileDetails, setShowMobileDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithOrders | null>(null);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [customerForm, setCustomerForm] = useState({
    name: "",
    email: "",
    phone: "",
    phoneCountryCode: "57",
    address: "",
    countryCode: "45",
    municipalityId: "1",
    organizationTypeId: "2",
    taxRegimeId: "2",
    taxLiabilityId: "117",
    idType: "",
    idNumber: "",
    notes: "",
    defaultDiscount: "",
  });
  
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");

  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers", searchQuery],
    queryFn: async () => {
      const response = await fetch(`/api/customers/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      return response.json();
    },
    enabled: !!tenant?.id,
  });

  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    enabled: !!tenant?.id,
  });

  const { data: customerDetails, isLoading: detailsLoading } = useQuery<CustomerWithOrders>({
    queryKey: ["/api/customers", selectedCustomer?.id, "details"],
    queryFn: async () => {
      const response = await fetch(`/api/customers/${selectedCustomer?.id}/details`, {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      return response.json();
    },
    enabled: !!selectedCustomer?.id && !!tenant?.id,
  });

  const createCustomerMutation = useMutation({
    mutationFn: async (data: typeof customerForm) => {
      return apiRequest("POST", "/api/customers", data);
    },
    onSuccess: () => {
      toast({ title: t("customers.customer_created") });
      setShowCustomerDialog(false);
      resetCustomerForm();
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
    onError: () => {
      toast({ title: t("customers.customer_error"), variant: "destructive" });
    },
  });

  const updateCustomerMutation = useMutation({
    mutationFn: async (data: typeof customerForm & { id: string }) => {
      const { id, ...rest } = data;
      return apiRequest("PATCH", `/api/customers/${id}`, rest);
    },
    onSuccess: () => {
      toast({ title: t("customers.customer_updated") });
      setShowCustomerDialog(false);
      setEditingCustomer(null);
      resetCustomerForm();
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
    onError: () => {
      toast({ title: t("customers.update_error"), variant: "destructive" });
    },
  });

  const resetCustomerForm = () => {
    setCustomerForm({
      name: "",
      email: "",
      phone: "",
      phoneCountryCode: "57",
      address: "",
      countryCode: "45",
      municipalityId: "1",
      organizationTypeId: "2",
      taxRegimeId: "2",
      taxLiabilityId: "117",
      idType: "",
      idNumber: "",
      notes: "",
      defaultDiscount: "",
    });
  };

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

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setCustomerForm({
      name: customer.name,
      email: customer.email || "",
      phone: customer.phone || "",
      phoneCountryCode: customer.phoneCountryCode || "57",
      address: customer.address || "",
      countryCode: customer.countryCode || "45",
      municipalityId: String(customer.municipalityId || 1),
      organizationTypeId: String(customer.organizationTypeId || 2),
      taxRegimeId: String(customer.taxRegimeId || 2),
      taxLiabilityId: String(customer.taxLiabilityId || 117),
      idType: customer.idType || "",
      idNumber: customer.idNumber || "",
      notes: customer.notes || "",
      defaultDiscount: customer.defaultDiscount || "",
    });
    setShowCustomerDialog(true);
  };

  const handleSaveCustomer = () => {
    const formData = {
      ...customerForm,
      municipalityId: parseInt(customerForm.municipalityId, 10) || 1,
      organizationTypeId: parseInt(customerForm.organizationTypeId, 10) || 2,
      taxRegimeId: parseInt(customerForm.taxRegimeId, 10) || 2,
      taxLiabilityId: parseInt(customerForm.taxLiabilityId, 10) || 117,
      defaultDiscount: customerForm.defaultDiscount || "0",
    };
    if (editingCustomer) {
      updateCustomerMutation.mutate({ ...formData, id: editingCustomer.id });
    } else {
      createCustomerMutation.mutate(formData);
    }
  };

  const idTypeLabels: Record<string, string> = {
    cedula_ciudadania: "CC - Cédula de Ciudadanía",
    cedula_extranjeria: "CE - Cédula de Extranjería",
    nit: "NIT - Número de Identificación Tributaria",
    tarjeta_identidad: "TI - Tarjeta de Identidad",
    pasaporte: "PP - Pasaporte",
    consumidor_final: "Consumidor Final",
    registro_civil: "RC - Registro Civil",
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Customer List - Full width on mobile, sidebar on desktop */}
      <div className={`${isMobile ? 'w-full' : 'w-80 lg:w-96'} border-r flex flex-col bg-card`}>
        <div className="p-3 sm:p-4 border-b space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <h1 className="text-base sm:text-lg font-semibold">{t("nav.customers")}</h1>
            </div>
            <Button
              size="sm"
              onClick={() => {
                resetCustomerForm();
                setEditingCustomer(null);
                setShowCustomerDialog(true);
              }}
              data-testid="button-add-customer"
            >
              <Plus className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">{t("customers.add")}</span>
              <span className="sm:hidden">{t("common.add")}</span>
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("customers.search_placeholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-customers"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto touch-scroll overscroll-contain pb-24 sm:pb-0">
          {customersLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : customers && customers.length > 0 ? (
            <div className="p-2">
              {customers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => {
                    setSelectedCustomer(customer);
                    setIsEditingNotes(false);
                    setNotesText("");
                    if (isMobile) setShowMobileDetails(true);
                  }}
                  className={`w-full p-3 rounded-lg text-left hover-elevate transition-colors ${
                    selectedCustomer?.id === customer.id && !isMobile ? "bg-primary/10 border border-primary/30" : ""
                  }`}
                  data-testid={`button-customer-${customer.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{customer.name}</p>
                      {customer.phone && (
                        <p className="text-sm text-muted-foreground truncate">+{customer.phoneCountryCode || "57"} {customer.phone}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          <Star className="w-3 h-3 mr-1" />
                          {customer.loyaltyPoints || 0} pts
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {customer.orderCount || 0} {t("customers.orders_count")}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Users className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">{t("customers.no_customers")}</p>
              <p className="text-sm">{t("customers.add_first")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Customer Details - Hidden on mobile */}
      {!isMobile && (
        <div className="flex-1 overflow-hidden">
          {selectedCustomer ? (
            <div className="h-full flex flex-col">
              <div className="p-6 border-b bg-card">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">{selectedCustomer.name}</h2>
                      <div className="flex items-center gap-4 mt-1 text-muted-foreground">
                        {selectedCustomer.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-4 h-4" />
                            +{selectedCustomer.phoneCountryCode || "57"} {selectedCustomer.phone}
                          </span>
                        )}
                        {selectedCustomer.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            {selectedCustomer.email}
                          </span>
                        )}
                      </div>
                      {selectedCustomer.idType && selectedCustomer.idNumber && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {idTypeLabels[selectedCustomer.idType] || selectedCustomer.idType}: {selectedCustomer.idNumber}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEditCustomer(selectedCustomer)}
                  data-testid="button-edit-customer"
                >
                  <Edit className="w-4 h-4 mr-1" />
                  {t("customers.edit")}
                </Button>
              </div>

              {/* Stats Cards */}
              <div className="space-y-3 mt-6">
                {/* Total Spent - Full Width */}
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <TrendingUp className="w-4 h-4 shrink-0" />
                      <span className="text-xs">{t("customers.total_spent")}</span>
                    </div>
                    <p className="text-2xl font-bold">
                      {formatCurrency(selectedCustomer.totalSpent || 0)}
                    </p>
                  </CardContent>
                </Card>
                
                {/* Other Stats - 2 columns for better fit */}
                <div className="grid grid-cols-2 gap-2">
                  <Card>
                    <CardContent className="p-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
                        <Star className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-[10px] truncate">{t("customers.pts")}</span>
                      </div>
                      <p className="text-lg font-bold text-primary">
                        {selectedCustomer.loyaltyPoints || 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
                        <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-[10px] truncate">{t("customers.orders")}</span>
                      </div>
                      <p className="text-lg font-bold">{selectedCustomer.orderCount || 0}</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>

            <Tabs defaultValue="history" className="flex-1 overflow-hidden">
              <div className="px-6 border-b">
                <TabsList className="h-12">
                  <TabsTrigger value="history" className="gap-2" data-testid="tab-history">
                    <History className="w-4 h-4" />
                    {t("customers.tabs_orders")}
                  </TabsTrigger>
                  <TabsTrigger value="loyalty" className="gap-2" data-testid="tab-loyalty">
                    <Star className="w-4 h-4" />
                    {t("customers.tabs_points")}
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="gap-2" data-testid="tab-notes">
                    <Edit className="w-4 h-4" />
                    {t("customers.tabs_notes")}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="history" className="flex-1 p-6 overflow-auto m-0">
                {detailsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : customerDetails?.orders && customerDetails.orders.length > 0 ? (
                  <div className="space-y-3">
                    {customerDetails.orders.map((order) => (
                      <Card key={order.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{t("customers.order_number")} #{order.orderNumber}</p>
                              <p className="text-sm text-muted-foreground">
                                {formatDateTime(new Date(order.createdAt!))}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-lg">{formatCurrency(order.total || 0)}</p>
                              <Badge variant={order.status === "completed" ? "default" : "secondary"}>
                                {t(`customers.status_${order.status}`)}
                              </Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <ShoppingBag className="w-12 h-12 mb-3 opacity-30" />
                    <p className="font-medium">{t("customers.no_orders")}</p>
                    <p className="text-sm">{t("customers.no_orders_desc")}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="loyalty" className="flex-1 p-6 overflow-auto m-0">
                {detailsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : customerDetails?.loyaltyTransactions && customerDetails.loyaltyTransactions.length > 0 ? (
                  <div className="space-y-3">
                    {customerDetails.loyaltyTransactions.map((transaction) => (
                      <Card key={transaction.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                transaction.type === "earned" ? "bg-green-100 text-green-600" :
                                transaction.type === "redeemed" ? "bg-purple-100 text-purple-600" :
                                "bg-gray-100 text-gray-600"
                              }`}>
                                {transaction.type === "earned" ? <TrendingUp className="w-5 h-5" /> :
                                 transaction.type === "redeemed" ? <Gift className="w-5 h-5" /> :
                                 <Star className="w-5 h-5" />}
                              </div>
                              <div>
                                <p className="font-medium">
                                  {transaction.type === "earned" ? t("customers.loyalty_earned") :
                                   transaction.type === "redeemed" ? t("customers.loyalty_redeemed") :
                                   t("customers.loyalty_adjusted")}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {transaction.type === "earned" 
                                    ? `${t("customers.points_earned_from_order")}${transaction.orderId ? ` #${transaction.orderId.slice(-4)}` : ''}`
                                    : transaction.type === "redeemed" 
                                    ? t("customers.points_redeemed_for_reward")
                                    : t("customers.points_adjusted")}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-bold text-lg ${
                                transaction.type === "earned" ? "text-green-600" :
                                transaction.type === "redeemed" ? "text-purple-600" :
                                ""
                              }`}>
                                {transaction.type === "earned" ? "+" : "-"}{transaction.points} pts
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(new Date(transaction.createdAt!))}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <Star className="w-12 h-12 mb-3 opacity-30" />
                    <p className="font-medium">{t("customers.no_loyalty_activity")}</p>
                    <p className="text-sm">{t("customers.loyalty_activity_desc")}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="notes" className="flex-1 p-6 overflow-auto m-0">
                <Card>
                  <CardContent className="p-4 space-y-4">
                    {isEditingNotes ? (
                      <div className="space-y-3">
                        <Textarea
                          value={notesText}
                          onChange={(e) => setNotesText(e.target.value)}
                          placeholder={t("customers.notes_placeholder")}
                          rows={6}
                          data-testid="textarea-customer-notes"
                        />
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsEditingNotes(false);
                              setNotesText(selectedCustomer.notes || "");
                            }}
                            data-testid="button-cancel-notes"
                          >
                            {t("customers.cancel")}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              updateCustomerMutation.mutate({
                                id: selectedCustomer.id,
                                name: selectedCustomer.name,
                                phone: selectedCustomer.phone || "",
                                phoneCountryCode: selectedCustomer.phoneCountryCode || "57",
                                email: selectedCustomer.email || "",
                                address: selectedCustomer.address || "",
                                countryCode: selectedCustomer.countryCode || "45",
                                municipalityId: selectedCustomer.municipalityId || 1,
                                organizationTypeId: selectedCustomer.organizationTypeId || 2,
                                taxRegimeId: selectedCustomer.taxRegimeId || 2,
                                taxLiabilityId: selectedCustomer.taxLiabilityId || 117,
                                idType: selectedCustomer.idType || "",
                                idNumber: selectedCustomer.idNumber || "",
                                notes: notesText,
                                defaultDiscount: selectedCustomer.defaultDiscount || "",
                              });
                              setIsEditingNotes(false);
                            }}
                            disabled={updateCustomerMutation.isPending}
                            data-testid="button-save-notes"
                          >
                            {t("customers.save_notes")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className={selectedCustomer.notes ? "whitespace-pre-wrap" : "text-muted-foreground"}>
                          {selectedCustomer.notes || t("customers.no_notes")}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setNotesText(selectedCustomer.notes || "");
                            setIsEditingNotes(true);
                          }}
                          data-testid="button-edit-notes"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          {selectedCustomer.notes ? t("customers.edit_notes") : t("customers.add_notes")}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <User className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">{t("customers.select_customer")}</p>
            <p className="text-sm">{t("customers.choose_customer")}</p>
          </div>
        )}
      </div>
      )}

      {/* Mobile Customer Details Sheet */}
      {isMobile && selectedCustomer && (
        <Sheet open={showMobileDetails} onOpenChange={setShowMobileDetails}>
          <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
            <SheetHeader className="p-4 border-b">
              <SheetTitle className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-semibold">{selectedCustomer.name}</div>
                  <div className="text-sm text-muted-foreground font-normal">{selectedCustomer.phone ? `+${selectedCustomer.phoneCountryCode || "57"} ${selectedCustomer.phone}` : ""}</div>
                </div>
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto touch-scroll p-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Card>
                    <CardContent className="p-3 text-center">
                      <Star className="w-5 h-5 mx-auto mb-1 text-primary" />
                      <p className="text-lg font-bold">{selectedCustomer.loyaltyPoints || 0}</p>
                      <p className="text-xs text-muted-foreground">{t("customers.loyalty_points")}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <ShoppingBag className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-lg font-bold">{selectedCustomer.orderCount || 0}</p>
                      <p className="text-xs text-muted-foreground">{t("customers.orders_count")}</p>
                    </CardContent>
                  </Card>
                </div>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-sm text-muted-foreground mb-1">{t("customers.total_spent")}</p>
                    <p className="text-xl font-bold">{formatCurrency(selectedCustomer.totalSpent || 0)}</p>
                  </CardContent>
                </Card>
                <div className="flex gap-2">
                  <Button 
                    className="flex-1" 
                    variant="outline"
                    onClick={() => {
                      handleEditCustomer(selectedCustomer);
                      setShowMobileDetails(false);
                    }}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    {t("customers.edit")}
                  </Button>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Customer Dialog */}
      <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? t("customers.edit_customer") : t("customers.add_customer")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{t("customers.name")} *</Label>
              <Input
                value={customerForm.name}
                onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                placeholder={t("customers.name_placeholder")}
                data-testid="input-customer-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("customers.phone")} *</Label>
                <PhoneInput
                  value={customerForm.phone}
                  countryCode={customerForm.phoneCountryCode}
                  onPhoneChange={(phone) => setCustomerForm({ ...customerForm, phone })}
                  onCountryCodeChange={(phoneCountryCode) => setCustomerForm({ ...customerForm, phoneCountryCode })}
                  placeholder={t("customers.phone_placeholder")}
                  data-testid="input-customer-phone"
                />
              </div>
              <div>
                <Label>{t("customers.email")} *</Label>
                <Input
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                  placeholder={t("customers.email_placeholder")}
                  data-testid="input-customer-email"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("customers.id_type")} *</Label>
                <Select
                  value={customerForm.idType}
                  onValueChange={(value) => setCustomerForm({ ...customerForm, idType: value })}
                >
                  <SelectTrigger data-testid="select-customer-id-type">
                    <SelectValue placeholder={t("customers.select_type")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cedula_ciudadania">CC - Cédula de Ciudadanía</SelectItem>
                    <SelectItem value="cedula_extranjeria">CE - Cédula de Extranjería</SelectItem>
                    <SelectItem value="nit">NIT - Número de Identificación Tributaria</SelectItem>
                    <SelectItem value="tarjeta_identidad">TI - Tarjeta de Identidad</SelectItem>
                    <SelectItem value="pasaporte">PP - Pasaporte</SelectItem>
                    <SelectItem value="consumidor_final">Consumidor Final</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("customers.id_number")} *</Label>
                <Input
                  value={customerForm.idNumber}
                  onChange={(e) => setCustomerForm({ ...customerForm, idNumber: e.target.value })}
                  placeholder={t("customers.id_placeholder")}
                  data-testid="input-customer-id-number"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("customers.address")}</Label>
                <Input
                  value={customerForm.address}
                  onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                  placeholder={t("customers.address_placeholder")}
                  data-testid="input-customer-address"
                />
              </div>
              <div>
                <Label>{t("customers.country")}</Label>
                <Select
                  value={customerForm.countryCode}
                  onValueChange={(value) => setCustomerForm({ ...customerForm, countryCode: value })}
                >
                  <SelectTrigger data-testid="select-customer-country">
                    <SelectValue placeholder={t("customers.select_country")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {DIAN_COUNTRIES.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {customerForm.countryCode === "45" && (
                <div>
                  <Label>{t("customers.municipality")}</Label>
                  <Select
                    value={customerForm.municipalityId}
                    onValueChange={(value) => setCustomerForm({ ...customerForm, municipalityId: value })}
                  >
                    <SelectTrigger data-testid="select-customer-municipality">
                      <SelectValue placeholder={t("customers.select_municipality")} />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {DIAN_MUNICIPALITIES.map((municipality) => (
                        <SelectItem key={municipality.code} value={String(municipality.code)}>
                          {municipality.name}, {municipality.department}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>{t("customers.organization_type")}</Label>
                <Select
                  value={customerForm.organizationTypeId}
                  onValueChange={(value) => setCustomerForm({ ...customerForm, organizationTypeId: value })}
                >
                  <SelectTrigger data-testid="select-customer-org-type">
                    <SelectValue placeholder={t("customers.select_org_type")} />
                  </SelectTrigger>
                  <SelectContent>
                    {DIAN_ORGANIZATION_TYPES.map((org) => (
                      <SelectItem key={org.id} value={String(org.id)}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("customers.tax_regime")}</Label>
                <Select
                  value={customerForm.taxRegimeId}
                  onValueChange={(value) => setCustomerForm({ ...customerForm, taxRegimeId: value })}
                >
                  <SelectTrigger data-testid="select-customer-tax-regime">
                    <SelectValue placeholder={t("customers.select_tax_regime")} />
                  </SelectTrigger>
                  <SelectContent>
                    {DIAN_TAX_REGIMES.map((regime) => (
                      <SelectItem key={regime.id} value={String(regime.id)}>
                        {regime.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("customers.tax_liability")}</Label>
                <Select
                  value={customerForm.taxLiabilityId}
                  onValueChange={(value) => setCustomerForm({ ...customerForm, taxLiabilityId: value })}
                >
                  <SelectTrigger data-testid="select-customer-tax-liability">
                    <SelectValue placeholder={t("customers.select_tax_liability")} />
                  </SelectTrigger>
                  <SelectContent>
                    {DIAN_TAX_LIABILITIES.map((liability) => (
                      <SelectItem key={liability.id} value={String(liability.id)}>
                        {liability.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("customers.default_discount")}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={customerForm.defaultDiscount}
                  onChange={(e) => setCustomerForm({ ...customerForm, defaultDiscount: e.target.value })}
                  placeholder={t("customers.default_discount_placeholder")}
                  data-testid="input-customer-discount"
                />
              </div>
            </div>
            <div>
              <Label>{t("customers.notes")}</Label>
              <Textarea
                value={customerForm.notes}
                onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })}
                placeholder={t("customers.notes_placeholder")}
                rows={3}
                data-testid="input-customer-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomerDialog(false)}>
              {t("customers.cancel")}
            </Button>
            <Button
              onClick={handleSaveCustomer}
              disabled={
                !customerForm.name.trim() || 
                !customerForm.phone.trim() || 
                !customerForm.email.trim() || 
                !customerForm.idType || 
                !customerForm.idNumber.trim() || 
                createCustomerMutation.isPending || 
                updateCustomerMutation.isPending
              }
              data-testid="button-save-customer"
            >
              {editingCustomer ? t("customers.save") : t("customers.add_customer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </div>
  );
}
