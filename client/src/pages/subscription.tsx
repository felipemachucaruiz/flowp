import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { formatCurrency } from "@/lib/currency";
import { useSubscription } from "@/lib/use-subscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Crown, Building2, Monitor, Users, CreditCard, Loader2, ShoppingBag, FileText, UtensilsCrossed, CookingPot, Warehouse, ArrowLeft, ExternalLink } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import type { SubscriptionPlan } from "@shared/schema";

const TIER_ORDER: Record<string, number> = { basic: 0, pro: 1, enterprise: 2 };

const FEATURE_TRANSLATION_KEYS: Record<string, string> = {
  user_management: "subscription.feature_user_management",
  inventory_advanced: "subscription.feature_advanced_inventory",
  reports_detailed: "subscription.feature_detailed_reports",
  label_designer: "subscription.feature_label_designer",
  multi_location: "subscription.feature_multi_location",
  reports_management: "subscription.feature_management_reports",
  ecommerce_integrations: "subscription.feature_ecommerce",
  security_audit: "subscription.feature_security_audit",
  kds_advanced: "subscription.feature_advanced_kds",
  floor_management: "subscription.feature_floor_management",
  modifiers_advanced: "subscription.feature_advanced_modifiers",
  ingredients_recipes: "subscription.feature_ingredients_recipes",
  tips_analytics: "subscription.feature_tips_analytics",
  "pos.core": "subscription.feature_pos_core",
  "inventory.core": "subscription.feature_inventory_core",
  "purchasing.core": "subscription.feature_purchasing_core",
  "customers.core": "subscription.feature_customers_core",
  "reporting.core": "subscription.feature_reporting_core",
  electronic_invoicing: "subscription.feature_electronic_invoicing",
  loyalty_program: "subscription.feature_loyalty_program",
  advanced_reporting: "subscription.feature_advanced_reporting",
  "retail.barcode": "subscription.feature_barcode",
  "retail.returns": "subscription.feature_returns",
  "retail.bulk_discounts": "subscription.feature_bulk_discounts",
};

export default function SubscriptionPage() {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { tenant, refreshTenant } = useAuth();
  const { tier: currentTier, businessType, isLoading: subLoading } = useSubscription();
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [payerEmail, setPayerEmail] = useState("");
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"recurring" | "onetime">("recurring");

  const fromParam = new URLSearchParams(searchString || "").get("from");
  const backPath = fromParam === "myplan" ? "/settings?tab=myplan" : "/pos";

  const { data: plans = [], isLoading } = useQuery<SubscriptionPlan[]>({
    queryKey: ["/api/subscription/plans"],
  });

  const activePlans = plans.filter((p) => p.isActive);

  const upgradePlans = activePlans.filter((p) => {
    const planTierOrder = TIER_ORDER[p.tier || "basic"] ?? 0;
    const currentTierOrder = TIER_ORDER[currentTier] ?? 0;
    return planTierOrder > currentTierOrder;
  });

  const createPreferenceMutation = useMutation({
    mutationFn: async (data: { planId: string; billingPeriod: string; payerEmail: string }) => {
      const res = await apiRequest("POST", "/api/subscription/create-preference", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.initPoint) {
        setIsRedirecting(true);
        window.location.href = data.initPoint;
      } else {
        toast({ title: t("subscription.payment_failed" as any), variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: t("subscription.payment_failed" as any), variant: "destructive" });
    },
  });

  const createOnetimeMutation = useMutation({
    mutationFn: async (data: { planId: string; billingPeriod: string; payerEmail: string }) => {
      const res = await apiRequest("POST", "/api/subscription/create-onetime-preference", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.initPoint) {
        setIsRedirecting(true);
        window.location.href = data.initPoint;
      } else {
        toast({ title: t("subscription.payment_failed" as any), variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: t("subscription.payment_failed" as any), variant: "destructive" });
    },
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: async (data: { preapprovalId: string; planId: string; billingPeriod: string; payerEmail: string }) => {
      const res = await apiRequest("POST", "/api/subscription/confirm-payment", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/my-plan"] });
      refreshTenant();
      toast({ title: t("subscription.activated_success" as any) });
      navigate(backPath);
    },
    onError: () => {
      toast({ title: t("subscription.activated_error" as any), variant: "destructive" });
    },
  });

  const confirmOnetimeMutation = useMutation({
    mutationFn: async (data: { planId: string; billingPeriod: string; payerEmail: string; paymentId?: string; status?: string }) => {
      const res = await apiRequest("POST", "/api/subscription/confirm-onetime-payment", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/my-plan"] });
      refreshTenant();
      toast({ title: t("subscription.activated_success" as any) });
      navigate(backPath);
    },
    onError: () => {
      toast({ title: t("subscription.activated_error" as any), variant: "destructive" });
    },
  });

  const selectPlanId = new URLSearchParams(searchString || "").get("select");

  useEffect(() => {
    if (!searchString) return;
    const params = new URLSearchParams(searchString);

    const mpStatus = params.get("mp_status");
    const preapprovalId = params.get("preapproval_id");
    const planId = params.get("plan_id");
    const period = params.get("billing_period");

    if (mpStatus === "returned" && preapprovalId && planId && period) {
      confirmPaymentMutation.mutate({
        preapprovalId,
        planId,
        billingPeriod: period,
        payerEmail: "",
      });
      navigate("/subscription", { replace: true });
      return;
    }

    const mpOnetime = params.get("mp_onetime");
    const onetimePlanId = params.get("plan_id");
    const onetimePeriod = params.get("billing_period");
    const onetimeEmail = params.get("payer_email") || "";
    const onetimePaymentId = params.get("payment_id") || params.get("collection_id") || "";

    if ((mpOnetime === "success" || mpOnetime === "pending") && onetimePlanId && onetimePeriod) {
      confirmOnetimeMutation.mutate({
        planId: onetimePlanId,
        billingPeriod: onetimePeriod,
        payerEmail: decodeURIComponent(onetimeEmail),
        paymentId: onetimePaymentId,
        status: mpOnetime === "success" ? "approved" : "pending",
      });
      navigate("/subscription", { replace: true });
      return;
    }

    if (mpOnetime === "failure") {
      toast({ title: t("subscription.payment_failed" as any), variant: "destructive" });
      navigate("/subscription", { replace: true });
    }
  }, [searchString]);

  useEffect(() => {
    if (selectPlanId && plans.length > 0 && !selectedPlan) {
      const plan = plans.find((p) => p.id === selectPlanId);
      if (plan) {
        setSelectedPlan(plan);
        setPayerEmail(tenant?.email || "");
        setShowPaymentDialog(true);
      }
    }
  }, [selectPlanId, plans]);

  const getPrice = (plan: SubscriptionPlan) => {
    if (billingPeriod === "yearly" && plan.priceYearly) {
      return parseFloat(plan.priceYearly);
    }
    return parseFloat(plan.priceMonthly);
  };

  const getMonthlyEquivalent = (plan: SubscriptionPlan) => {
    if (billingPeriod === "yearly" && plan.priceYearly) {
      return parseFloat(plan.priceYearly) / 12;
    }
    return parseFloat(plan.priceMonthly);
  };

  const getDiscount = (plan: SubscriptionPlan) => {
    if (!plan.priceYearly) return 0;
    const monthlyTotal = parseFloat(plan.priceMonthly) * 12;
    const yearlyTotal = parseFloat(plan.priceYearly);
    return Math.round(((monthlyTotal - yearlyTotal) / monthlyTotal) * 100);
  };

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setPayerEmail(tenant?.email || "");
    setShowPaymentDialog(true);
  };

  const handlePayWithMercadoPago = () => {
    if (!selectedPlan || !payerEmail) return;
    if (paymentMethod === "onetime") {
      createOnetimeMutation.mutate({
        planId: selectedPlan.id,
        billingPeriod,
        payerEmail,
      });
    } else {
      createPreferenceMutation.mutate({
        planId: selectedPlan.id,
        billingPeriod,
        payerEmail,
      });
    }
  };

  const translateFeature = (featureId: string): string => {
    const key = FEATURE_TRANSLATION_KEYS[featureId];
    if (key) {
      return t(key as any);
    }
    return featureId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getTierLabel = (tier: string) => {
    if (tier === "enterprise") return t("subscription.tier_enterprise" as any);
    if (tier === "pro") return "Pro";
    return "Starter";
  };

  if (isLoading || subLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-80 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (confirmPaymentMutation.isPending) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-lg font-medium">{t("subscription.confirming_payment" as any)}</p>
        <p className="text-sm text-muted-foreground">{t("subscription.please_wait" as any)}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto h-full overflow-auto">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(backPath)}
        data-testid="button-back"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("common.back" as any)}
      </Button>

      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-2">
          <Crown className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold" data-testid="text-subscription-title">
          {t("subscription.upgrade_title" as any)}
        </h1>
        <p className="text-muted-foreground">
          {t("subscription.upgrade_description" as any)}
        </p>
      </div>

      <Card data-testid="card-current-plan">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">{t("subscription.current_plan" as any)}</p>
            <p className="font-semibold text-lg">{getTierLabel(currentTier)}</p>
          </div>
          <Badge variant="secondary">{getTierLabel(currentTier)}</Badge>
        </CardContent>
      </Card>

      {activePlans.length > 0 && (
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-4 p-1 bg-muted rounded-lg">
            <Button
              variant={billingPeriod === "monthly" ? "default" : "ghost"}
              size="sm"
              onClick={() => setBillingPeriod("monthly")}
              data-testid="button-billing-monthly"
            >
              {t("subscription.monthly" as any)}
            </Button>
            <Button
              variant={billingPeriod === "yearly" ? "default" : "ghost"}
              size="sm"
              onClick={() => setBillingPeriod("yearly")}
              data-testid="button-billing-yearly"
            >
              {t("subscription.yearly" as any)}
              {activePlans.some((p) => getDiscount(p) > 0) && (
                <Badge variant="secondary" className="ml-2">
                  {t("subscription.save_up_to" as any)} {Math.max(...activePlans.map(getDiscount))}%
                </Badge>
              )}
            </Button>
          </div>
        </div>
      )}

      {activePlans.length === 0 ? (
        <Card data-testid="card-max-plan">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Crown className="h-12 w-12 text-primary mb-4" />
            <h3 className="text-lg font-medium mb-2" data-testid="text-max-plan">
              {t("subscription.already_max" as any)}
            </h3>
            <p className="text-muted-foreground text-center">
              {t("subscription.already_max_description" as any)}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className={`grid gap-6 ${activePlans.length === 1 ? "max-w-md mx-auto" : activePlans.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
          {activePlans.map((plan) => {
            const price = getPrice(plan);
            const monthlyEquivalent = getMonthlyEquivalent(plan);
            const discount = getDiscount(plan);
            const isCurrentPlan = (plan.tier || "basic") === currentTier;
            const isUpgrade = (TIER_ORDER[plan.tier || "basic"] ?? 0) > (TIER_ORDER[currentTier] ?? 0);

            return (
              <Card
                key={plan.id}
                className={`relative ${isCurrentPlan ? "border-primary" : ""}`}
                data-testid={`card-plan-${plan.tier}`}
              >
                {isCurrentPlan && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge>{t("subscription.current_plan" as any)}</Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>
                    <div className="mt-2">
                      <span className="text-3xl font-bold text-foreground">
                        {formatCurrency(billingPeriod === "yearly" ? monthlyEquivalent : price, plan.currency || "COP")}
                      </span>
                      <span className="text-muted-foreground">/{t("subscription.per_month" as any)}</span>
                    </div>
                    {billingPeriod === "yearly" && (
                      <div className="text-sm mt-1">
                        <span className="text-muted-foreground">
                          {formatCurrency(price, plan.currency || "COP")} {t("subscription.billed_annually" as any)}
                        </span>
                        {discount > 0 && (
                          <Badge variant="secondary" className="ml-2">
                            {t("subscription.save" as any)} {discount}%
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-2 text-sm text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{plan.maxLocations}</span>
                      <span className="text-xs text-muted-foreground">{t("subscription.limit_locations" as any)}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Monitor className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{plan.maxRegisters}</span>
                      <span className="text-xs text-muted-foreground">{t("subscription.limit_registers" as any)}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{plan.maxUsers}</span>
                      <span className="text-xs text-muted-foreground">{t("subscription.limit_users" as any)}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Warehouse className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{plan.maxWarehouses ?? 1}</span>
                      <span className="text-xs text-muted-foreground">{t("subscription.limit_warehouses" as any)}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{plan.maxProducts === -1 ? "\u221e" : (plan.maxProducts ?? 100)}</span>
                      <span className="text-xs text-muted-foreground">{t("subscription.limit_products" as any)}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{plan.maxDianDocuments ?? 200}</span>
                      <span className="text-xs text-muted-foreground">DIAN/{t("subscription.per_month" as any)}</span>
                    </div>
                    {(plan.maxTables != null && plan.maxTables > 0) && (
                      <div className="flex flex-col items-center gap-1">
                        <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{plan.maxTables}</span>
                        <span className="text-xs text-muted-foreground">{t("subscription.limit_tables" as any)}</span>
                      </div>
                    )}
                    {plan.maxRecipes !== undefined && plan.maxRecipes !== 0 && (
                      <div className="flex flex-col items-center gap-1">
                        <CookingPot className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{plan.maxRecipes === -1 ? "\u221e" : plan.maxRecipes}</span>
                        <span className="text-xs text-muted-foreground">{t("subscription.limit_recipes" as any)}</span>
                      </div>
                    )}
                  </div>

                  {plan.features && plan.features.length > 0 && (
                    <div className="space-y-2 pt-4 border-t">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t("subscription.included_features" as any)}
                      </p>
                      {plan.features.map((feature, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-primary shrink-0" />
                          <span>{translateFeature(feature)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={isCurrentPlan ? "secondary" : isUpgrade ? "default" : "outline"}
                    onClick={() => handleSelectPlan(plan)}
                    disabled={isCurrentPlan}
                    data-testid={`button-select-plan-${plan.tier}`}
                  >
                    {isCurrentPlan
                      ? t("subscription.current_plan" as any)
                      : isUpgrade
                        ? `${t("subscription.upgrade_to" as any)} ${plan.name}`
                        : `${t("subscription.select_plan" as any)}`}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("subscription.complete_subscription")}</DialogTitle>
            <DialogDescription>
              {selectedPlan && (
                <>
                  {t("subscription.subscribing_to" as any)} <strong>{selectedPlan.name}</strong> {t("subscription.for" as any)}{" "}
                  <strong>{formatCurrency(getPrice(selectedPlan), selectedPlan.currency || "COP")}</strong>{" "}
                  {billingPeriod === "yearly" ? t("subscription.per_year" as any) : t("subscription.per_month" as any)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("subscription.billing_period")}</Label>
              <RadioGroup
                value={billingPeriod}
                onValueChange={(v) => setBillingPeriod(v as "monthly" | "yearly")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="monthly" id="monthly" />
                  <Label htmlFor="monthly">{t("subscription.monthly")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yearly" id="yearly" />
                  <Label htmlFor="yearly">
                    {t("subscription.yearly" as any)}
                    {selectedPlan && getDiscount(selectedPlan) > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {t("subscription.save" as any)} {getDiscount(selectedPlan)}%
                      </Badge>
                    )}
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>{t("subscription.payment_method" as any)}</Label>
              <RadioGroup
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as "recurring" | "onetime")}
                className="grid gap-3"
              >
                <label
                  htmlFor="pm-recurring"
                  className={`flex items-start space-x-3 border rounded-md p-3 cursor-pointer ${paymentMethod === "recurring" ? "border-primary bg-primary/5" : ""}`}
                  data-testid="radio-payment-recurring"
                >
                  <RadioGroupItem value="recurring" id="pm-recurring" className="mt-0.5" />
                  <div className="flex-1">
                    <span className="font-medium text-sm">{t("subscription.pm_recurring_title" as any)}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("subscription.pm_recurring_desc" as any)}
                    </p>
                  </div>
                </label>
                <label
                  htmlFor="pm-onetime"
                  className={`flex items-start space-x-3 border rounded-md p-3 cursor-pointer ${paymentMethod === "onetime" ? "border-primary bg-primary/5" : ""}`}
                  data-testid="radio-payment-onetime"
                >
                  <RadioGroupItem value="onetime" id="pm-onetime" className="mt-0.5" />
                  <div className="flex-1">
                    <span className="font-medium text-sm">{t("subscription.pm_onetime_title" as any)}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("subscription.pm_onetime_desc" as any)}
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payer-email">{t("subscription.payer_email" as any)}</Label>
              <Input
                id="payer-email"
                type="email"
                value={payerEmail}
                onChange={(e) => setPayerEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                data-testid="input-payer-email"
              />
            </div>

            <div className="border rounded-md p-4 bg-muted/50">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <span>{t("subscription.total")}</span>
                <span className="text-xl font-bold">
                  {selectedPlan ? formatCurrency(getPrice(selectedPlan), selectedPlan.currency || "COP") : formatCurrency(0, "COP")}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{billingPeriod === "yearly" ? t("subscription.per_year" as any) : t("subscription.per_month" as any)}
                  </span>
                </span>
              </div>
              {paymentMethod === "onetime" && (
                <p className="text-xs text-muted-foreground mt-2">
                  {t("subscription.onetime_renewal_notice" as any)}
                </p>
              )}
            </div>

            {(createPreferenceMutation.isPending || createOnetimeMutation.isPending || isRedirecting) ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">
                  {isRedirecting ? t("subscription.redirecting_to_payment" as any) : t("subscription.processing" as any)}
                </span>
              </div>
            ) : (
              <div className="pt-4 space-y-3">
                <p className="text-sm text-muted-foreground text-center">
                  {t("subscription.pay_with_mercadopago" as any)}
                </p>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handlePayWithMercadoPago}
                  disabled={!payerEmail || !selectedPlan}
                  data-testid="button-pay-mercadopago"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  {paymentMethod === "onetime" ? t("subscription.pay_onetime" as any) : t("subscription.pay_now" as any)}
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  {t("subscription.mp_redirect_notice" as any)}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
