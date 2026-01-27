import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Order, LoyaltyTransaction, LoyaltyReward, Product } from "@shared/schema";
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
  Award,
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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithOrders | null>(null);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showRewardDialog, setShowRewardDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [customerForm, setCustomerForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    idType: "",
    idNumber: "",
    notes: "",
    defaultDiscount: "",
  });
  
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");

  const [rewardForm, setRewardForm] = useState({
    name: "",
    description: "",
    pointsCost: "",
    rewardType: "discount" as "discount" | "product",
    discountType: "fixed",
    discountValue: "",
    productId: "",
  });

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

  const { data: rewards, isLoading: rewardsLoading } = useQuery<LoyaltyReward[]>({
    queryKey: ["/api/loyalty/rewards"],
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

  const createRewardMutation = useMutation({
    mutationFn: async (data: typeof rewardForm) => {
      return apiRequest("POST", "/api/loyalty/rewards", {
        name: data.name,
        description: data.description,
        pointsCost: parseInt(data.pointsCost),
        rewardType: data.rewardType,
        discountType: data.rewardType === "discount" ? data.discountType : null,
        discountValue: data.rewardType === "discount" ? parseFloat(data.discountValue) : null,
        productId: data.rewardType === "product" ? data.productId : null,
      });
    },
    onSuccess: () => {
      toast({ title: t("customers.reward_created") });
      setShowRewardDialog(false);
      resetRewardForm();
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty/rewards"] });
    },
    onError: () => {
      toast({ title: t("customers.reward_error"), variant: "destructive" });
    },
  });

  const resetCustomerForm = () => {
    setCustomerForm({
      name: "",
      email: "",
      phone: "",
      address: "",
      idType: "",
      idNumber: "",
      notes: "",
      defaultDiscount: "",
    });
  };

  const resetRewardForm = () => {
    setRewardForm({
      name: "",
      description: "",
      pointsCost: "",
      rewardType: "discount",
      discountType: "fixed",
      discountValue: "",
      productId: "",
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
      address: customer.address || "",
      idType: customer.idType || "",
      idNumber: customer.idNumber || "",
      notes: customer.notes || "",
      defaultDiscount: customer.defaultDiscount || "",
    });
    setShowCustomerDialog(true);
  };

  const handleSaveCustomer = () => {
    if (editingCustomer) {
      updateCustomerMutation.mutate({ ...customerForm, id: editingCustomer.id });
    } else {
      createCustomerMutation.mutate(customerForm);
    }
  };

  const idTypeLabels: Record<string, string> = {
    cedula_ciudadania: t("customers.id_cedula"),
    cedula_extranjeria: t("customers.id_cedula_ext"),
    pasaporte: t("customers.id_passport"),
    nit: "NIT",
  };

  return (
    <div className="flex h-full">
      {/* Customer List Sidebar */}
      <div className="w-80 lg:w-96 border-r flex flex-col bg-card">
        <div className="p-4 border-b space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-semibold">{t("nav.customers")}</h1>
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
              {t("customers.add")}
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

        <ScrollArea className="flex-1">
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
                  }}
                  className={`w-full p-3 rounded-lg text-left hover-elevate transition-colors ${
                    selectedCustomer?.id === customer.id ? "bg-primary/10 border border-primary/30" : ""
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
                        <p className="text-sm text-muted-foreground truncate">{customer.phone}</p>
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
        </ScrollArea>
      </div>

      {/* Customer Details */}
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
                          {selectedCustomer.phone}
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
                
                {/* Other Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Star className="w-4 h-4 shrink-0" />
                        <span className="text-xs">{t("customers.loyalty_points")}</span>
                      </div>
                      <p className="text-xl font-bold text-primary">
                        {selectedCustomer.loyaltyPoints || 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <ShoppingBag className="w-4 h-4 shrink-0" />
                        <span className="text-xs">{t("customers.total_orders")}</span>
                      </div>
                      <p className="text-xl font-bold">{selectedCustomer.orderCount || 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Clock className="w-4 h-4 shrink-0" />
                        <span className="text-xs">{t("customers.member_since")}</span>
                      </div>
                      <p className="text-base font-semibold">
                        {selectedCustomer.lastPurchaseAt
                          ? formatDate(new Date(selectedCustomer.lastPurchaseAt))
                          : "-"}
                      </p>
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
                                  {transaction.description || (
                                    transaction.type === "earned" ? t("customers.points_earned_from_order") :
                                    transaction.type === "redeemed" ? t("customers.points_redeemed_for_reward") :
                                    t("customers.points_adjusted")
                                  )}
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
                                ...customerForm,
                                id: selectedCustomer.id,
                                name: selectedCustomer.name,
                                phone: selectedCustomer.phone || "",
                                email: selectedCustomer.email || "",
                                address: selectedCustomer.address || "",
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

      {/* Rewards Panel */}
      <div className="w-72 border-l bg-card flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-primary" />
              <h2 className="font-semibold">{t("customers.loyalty_rewards")}</h2>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowRewardDialog(true)}
              data-testid="button-add-reward"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          {rewardsLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : rewards && rewards.length > 0 ? (
            <div className="p-4 space-y-3">
              {rewards.map((reward) => (
                <Card key={reward.id} className="hover-elevate">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Award className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{reward.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {reward.description || "No description"}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            <Star className="w-3 h-3 mr-1" />
                            {reward.pointsCost} pts
                          </Badge>
                          <span className="text-xs text-green-600 font-medium">
                            {reward.discountType === "percentage"
                              ? `${reward.discountValue}% off`
                              : formatCurrency(reward.discountValue || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 p-4 text-muted-foreground text-center">
              <Gift className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-medium text-sm">{t("customers.no_rewards")}</p>
              <p className="text-xs">{t("customers.create_rewards")}</p>
            </div>
          )}
        </ScrollArea>
      </div>

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
                <Input
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
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
                    <SelectItem value="cedula_ciudadania">{t("customers.id_cedula")}</SelectItem>
                    <SelectItem value="cedula_extranjeria">{t("customers.id_cedula_ext")}</SelectItem>
                    <SelectItem value="pasaporte">{t("customers.id_passport")}</SelectItem>
                    <SelectItem value="nit">NIT</SelectItem>
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

      {/* Reward Dialog */}
      <Dialog open={showRewardDialog} onOpenChange={setShowRewardDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("customers.create_loyalty_reward")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{t("customers.reward_name")} *</Label>
              <Input
                value={rewardForm.name}
                onChange={(e) => setRewardForm({ ...rewardForm, name: e.target.value })}
                placeholder={t("customers.reward_name_placeholder")}
                data-testid="input-reward-name"
              />
            </div>
            <div>
              <Label>{t("customers.description")}</Label>
              <Textarea
                value={rewardForm.description}
                onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })}
                placeholder={t("customers.reward_description_placeholder")}
                rows={2}
                data-testid="input-reward-description"
              />
            </div>
            <div>
              <Label>{t("customers.points_required")} *</Label>
              <Input
                type="number"
                value={rewardForm.pointsCost}
                onChange={(e) => setRewardForm({ ...rewardForm, pointsCost: e.target.value })}
                placeholder="100"
                data-testid="input-reward-points"
              />
            </div>
            
            {/* Reward Type Selection */}
            <div>
              <Label>{t("customers.reward_type")}</Label>
              <Select
                value={rewardForm.rewardType}
                onValueChange={(value: "discount" | "product") => setRewardForm({ ...rewardForm, rewardType: value, productId: "", discountValue: "" })}
              >
                <SelectTrigger data-testid="select-reward-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discount">{t("customers.reward_type_discount")}</SelectItem>
                  <SelectItem value="product">{t("customers.reward_type_product")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Discount Fields */}
            {rewardForm.rewardType === "discount" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("customers.discount_type")}</Label>
                  <Select
                    value={rewardForm.discountType}
                    onValueChange={(value) => setRewardForm({ ...rewardForm, discountType: value })}
                  >
                    <SelectTrigger data-testid="select-discount-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">{t("customers.fixed_amount")}</SelectItem>
                      <SelectItem value="percentage">{t("customers.percentage")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("customers.discount_value")} *</Label>
                  <Input
                    type="number"
                    value={rewardForm.discountValue}
                    onChange={(e) => setRewardForm({ ...rewardForm, discountValue: e.target.value })}
                    placeholder={rewardForm.discountType === "percentage" ? "10" : "5000"}
                    data-testid="input-reward-value"
                  />
                </div>
              </div>
            )}

            {/* Product Selection */}
            {rewardForm.rewardType === "product" && (
              <div>
                <Label>{t("customers.select_product")} *</Label>
                <Select
                  value={rewardForm.productId}
                  onValueChange={(value) => setRewardForm({ ...rewardForm, productId: value })}
                >
                  <SelectTrigger data-testid="select-reward-product">
                    <SelectValue placeholder={t("customers.select_product_placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.filter(p => p.isActive).map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} - {formatCurrency(product.price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("customers.free_product_hint")}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRewardDialog(false)}>
              {t("customers.cancel")}
            </Button>
            <Button
              onClick={() => createRewardMutation.mutate(rewardForm)}
              disabled={
                !rewardForm.name.trim() || 
                !rewardForm.pointsCost || 
                (rewardForm.rewardType === "discount" && !rewardForm.discountValue) ||
                (rewardForm.rewardType === "product" && !rewardForm.productId) ||
                createRewardMutation.isPending
              }
              data-testid="button-save-reward"
            >
              {t("customers.create_reward")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
