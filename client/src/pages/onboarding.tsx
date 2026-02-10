import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Check, ChevronRight, ChevronLeft, Globe, Building2, DollarSign, Receipt, Loader2, ImageIcon, X, CreditCard, Package, Users, Monitor, ShoppingBag, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import flowpLogo from "@assets/flowp_logoball_1769460779650.webp";
import { useUpload } from "@/hooks/use-upload";

const LANGUAGES = [
  { value: "en", labelKey: "onboarding.lang_english" },
  { value: "es", labelKey: "onboarding.lang_spanish" },
  { value: "pt", labelKey: "onboarding.lang_portuguese" },
];

const CURRENCIES = [
  { value: "USD", labelKey: "currency.usd", symbol: "$" },
  { value: "EUR", labelKey: "currency.eur", symbol: "€" },
  { value: "COP", labelKey: "currency.cop", symbol: "$" },
  { value: "MXN", labelKey: "currency.mxn", symbol: "$" },
  { value: "BRL", labelKey: "currency.brl", symbol: "R$" },
  { value: "ARS", labelKey: "currency.ars", symbol: "$" },
  { value: "PEN", labelKey: "currency.pen", symbol: "S/" },
  { value: "CLP", labelKey: "currency.clp", symbol: "$" },
];

const COUNTRIES = [
  { value: "CO", labelKey: "country.co", taxIdLabel: "NIT" },
  { value: "MX", labelKey: "country.mx", taxIdLabel: "RFC" },
  { value: "AR", labelKey: "country.ar", taxIdLabel: "CUIT" },
  { value: "PE", labelKey: "country.pe", taxIdLabel: "RUC" },
  { value: "CL", labelKey: "country.cl", taxIdLabel: "RUT" },
  { value: "BR", labelKey: "country.br", taxIdLabel: "CNPJ" },
  { value: "US", labelKey: "country.us", taxIdLabel: "EIN" },
  { value: "ES", labelKey: "country.es", taxIdLabel: "CIF/NIF" },
];

const STEPS = [
  { id: "language", icon: Globe },
  { id: "plan", icon: CreditCard },
  { id: "business", icon: Building2 },
  { id: "currency", icon: DollarSign },
  { id: "receipt", icon: Receipt },
];

type PlanFeature = { key: string; count?: number };

const PLAN_OPTIONS: Array<{
  tier: string;
  labelKey: string;
  descKey: string;
  recommended?: boolean;
  color: string;
  selectedColor: string;
  features: PlanFeature[];
  restaurantFeatures: PlanFeature[];
}> = [
  {
    tier: "basic",
    labelKey: "onboarding.plan_starter",
    descKey: "onboarding.plan_starter_desc",
    color: "border-border",
    selectedColor: "border-primary bg-primary/5",
    features: [
      { key: "registers", count: 1 },
      { key: "users", count: 1 },
      { key: "products", count: 100 },
      { key: "warehouses", count: 1 },
    ],
    restaurantFeatures: [
      { key: "registers", count: 1 },
      { key: "users", count: 2 },
      { key: "products", count: 50 },
      { key: "tables", count: 10 },
    ],
  },
  {
    tier: "pro",
    labelKey: "onboarding.plan_pro",
    descKey: "onboarding.plan_pro_desc",
    recommended: true,
    color: "border-border",
    selectedColor: "border-primary bg-primary/5",
    features: [
      { key: "registers", count: 2 },
      { key: "users", count: 3 },
      { key: "products", count: 250 },
      { key: "warehouses", count: 2 },
      { key: "label_designer" },
      { key: "reports" },
    ],
    restaurantFeatures: [
      { key: "registers", count: 2 },
      { key: "users", count: 5 },
      { key: "products", count: 200 },
      { key: "tables", count: 30 },
      { key: "recipes", count: 50 },
      { key: "kds" },
    ],
  },
  {
    tier: "enterprise",
    labelKey: "onboarding.plan_advanced",
    descKey: "onboarding.plan_advanced_desc",
    color: "border-border",
    selectedColor: "border-primary bg-primary/5",
    features: [
      { key: "registers", count: 5 },
      { key: "users", count: 10 },
      { key: "unlimited_products" },
      { key: "locations", count: 3 },
      { key: "warehouses", count: 5 },
      { key: "multi_location" },
      { key: "ecommerce" },
    ],
    restaurantFeatures: [
      { key: "registers", count: 5 },
      { key: "users", count: 15 },
      { key: "unlimited_products" },
      { key: "tables", count: 100 },
      { key: "unlimited_recipes" },
      { key: "multi_location" },
    ],
  },
];

export default function OnboardingPage() {
  const { t, setLanguage } = useI18n();
  const { toast } = useToast();
  const { tenant, refreshTenant } = useAuth();
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  
  const [formData, setFormData] = useState({
    language: tenant?.language || "en",
    subscriptionTier: (tenant as any)?.subscriptionTier || "pro",
    name: tenant?.name || "",
    country: tenant?.country || "",
    city: tenant?.city || "",
    address: tenant?.address || "",
    phone: tenant?.phone || "",
    currency: tenant?.currency || "USD",
    taxRate: tenant?.taxRate || "0",
    receiptTaxId: tenant?.receiptTaxId || "",
    receiptHeaderText: tenant?.receiptHeaderText || "",
    receiptFooterText: tenant?.receiptFooterText || "",
    receiptShowAddress: tenant?.receiptShowAddress ?? true,
    receiptShowPhone: tenant?.receiptShowPhone ?? true,
    logo: tenant?.logo || "",
    receiptLogo: tenant?.receiptLogo || "",
    receiptShowLogo: tenant?.receiptShowLogo ?? true,
  });

  const { uploadFile: uploadLogo, isUploading: isUploadingLogo } = useUpload({
    onSuccess: (response) => {
      setFormData({ ...formData, logo: response.objectPath });
      toast({ title: t("onboarding.logo_uploaded") });
    },
    onError: (error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const { uploadFile: uploadReceiptLogo, isUploading: isUploadingReceiptLogo } = useUpload({
    onSuccess: (response) => {
      setFormData({ ...formData, receiptLogo: response.objectPath });
      toast({ title: t("onboarding.receipt_logo_uploaded") });
    },
    onError: (error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { onboardingComplete?: boolean }) => {
      return apiRequest("PATCH", "/api/settings", data);
    },
    onSuccess: () => {
      refreshTenant();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/tenant"] });
    },
  });

  const handleLanguageChange = async (lang: string) => {
    setFormData({ ...formData, language: lang });
    setLanguage(lang as "en" | "es" | "pt");
    await saveMutation.mutateAsync({ ...formData, language: lang });
  };

  const handleNext = async () => {
    await saveMutation.mutateAsync(formData);
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    try {
      await saveMutation.mutateAsync({ ...formData, onboardingComplete: true });
      await refreshTenant();
      toast({
        title: t("onboarding.complete_title"),
        description: t("onboarding.complete_message"),
      });
      navigate("/pos");
    } catch (error) {
      toast({
        title: t("common.error"),
        description: t("common.save_error"),
        variant: "destructive",
      });
    }
  };

  const selectedCountry = COUNTRIES.find(c => c.value === formData.country);
  const isRestaurant = tenant?.type === "restaurant";

  const getFeatureLabel = (feat: PlanFeature): string => {
    const i18nKey = `onboarding.plan_feat_${feat.key}` as any;
    const label = t(i18nKey);
    if (feat.count !== undefined) {
      return label.replace("{count}", String(feat.count));
    }
    return label;
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">{t("onboarding.language_title")}</h2>
              <p className="text-muted-foreground">{t("onboarding.language_description")}</p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => handleLanguageChange(lang.value)}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-lg border-2 transition-all hover-elevate",
                    formData.language === lang.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                  data-testid={`button-language-${lang.value}`}
                >
                  <Globe className="w-6 h-6 text-primary" />
                  <span className="text-lg font-medium">{t(lang.labelKey as any)}</span>
                  {formData.language === lang.value && (
                    <Check className="ml-auto w-5 h-5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-4">
              <h2 className="text-2xl font-bold mb-2">{t("onboarding.plan_title")}</h2>
              <p className="text-muted-foreground text-sm">{t("onboarding.plan_description")}</p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {PLAN_OPTIONS.map((plan) => {
                const features = isRestaurant ? plan.restaurantFeatures : plan.features;
                const isSelected = formData.subscriptionTier === plan.tier;
                return (
                  <button
                    key={plan.tier}
                    onClick={() => setFormData({ ...formData, subscriptionTier: plan.tier })}
                    className={cn(
                      "relative flex flex-col p-4 rounded-lg border-2 transition-all hover-elevate text-left",
                      isSelected ? plan.selectedColor : plan.color + " hover:border-primary/50"
                    )}
                    data-testid={`button-plan-${plan.tier}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">{t(plan.labelKey as any)}</span>
                        {plan.recommended && (
                          <Badge variant="default" className="text-xs">
                            {t("onboarding.plan_recommended")}
                          </Badge>
                        )}
                      </div>
                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-4 h-4 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{t(plan.descKey as any)}</p>
                    <div className="flex flex-wrap gap-2">
                      {features.slice(0, 4).map((f, i) => (
                        <span key={i} className="text-xs bg-muted px-2 py-1 rounded-md">
                          {getFeatureLabel(f)}
                        </span>
                      ))}
                      {features.length > 4 && (
                        <span className="text-xs text-muted-foreground">
                          +{features.length - 4}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {t("onboarding.plan_trial_note")}
            </p>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">{t("onboarding.business_title")}</h2>
              <p className="text-muted-foreground">{t("onboarding.business_description")}</p>
            </div>
            <div className="space-y-4">
              <div className="flex flex-col items-center mb-4">
                <Label className="mb-2">{t("onboarding.business_logo")}</Label>
                <div className="w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center overflow-hidden bg-muted/50 relative">
                  {formData.logo ? (
                    <>
                      <img
                        src={`/objects${formData.logo}`}
                        alt="Business logo"
                        className="w-full h-full object-contain"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6"
                        onClick={() => setFormData({ ...formData, logo: "" })}
                        data-testid="button-remove-logo"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </>
                  ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={isUploadingLogo}
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*";
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) uploadLogo(file);
                    };
                    input.click();
                  }}
                  data-testid="button-upload-logo"
                >
                  {isUploadingLogo ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  {t("onboarding.upload_logo")}
                </Button>
              </div>

              <div>
                <Label htmlFor="name">{t("settings.company_name")}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t("settings.company_name")}
                  data-testid="input-business-name"
                />
              </div>
              <div>
                <Label htmlFor="country">{t("settings.country")}</Label>
                <Select
                  value={formData.country}
                  onValueChange={(value) => setFormData({ ...formData, country: value })}
                >
                  <SelectTrigger data-testid="select-country">
                    <SelectValue placeholder={t("settings.select_country")} />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((country) => (
                      <SelectItem key={country.value} value={country.value}>
                        {t(country.labelKey as any)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="city">{t("settings.city")}</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder={t("settings.city")}
                  data-testid="input-city"
                />
              </div>
              <div>
                <Label htmlFor="address">{t("settings.address")}</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder={t("settings.address")}
                  data-testid="input-address"
                />
              </div>
              <div>
                <Label htmlFor="phone">{t("settings.phone")}</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder={t("settings.phone")}
                  data-testid="input-phone"
                />
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">{t("onboarding.currency_title")}</h2>
              <p className="text-muted-foreground">{t("onboarding.currency_description")}</p>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="currency">{t("settings.currency")}</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData({ ...formData, currency: value })}
                >
                  <SelectTrigger data-testid="select-currency">
                    <SelectValue placeholder={t("settings.select_currency")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((curr) => (
                      <SelectItem key={curr.value} value={curr.value}>
                        {curr.symbol} - {t(curr.labelKey as any)} ({curr.value})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="taxRate">{t("settings.tax_rate")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="taxRate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={formData.taxRate}
                    onChange={(e) => setFormData({ ...formData, taxRate: e.target.value })}
                    className="flex-1"
                    data-testid="input-tax-rate"
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("onboarding.tax_rate_hint")}
                </p>
              </div>
              {selectedCountry && (
                <div>
                  <Label htmlFor="taxId">{selectedCountry.taxIdLabel}</Label>
                  <Input
                    id="taxId"
                    value={formData.receiptTaxId}
                    onChange={(e) => setFormData({ ...formData, receiptTaxId: e.target.value })}
                    placeholder={selectedCountry.taxIdLabel}
                    data-testid="input-tax-id"
                  />
                </div>
              )}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">{t("onboarding.receipt_title")}</h2>
              <p className="text-muted-foreground">{t("onboarding.receipt_description")}</p>
            </div>
            <div className="space-y-4">
              <div className="flex flex-col items-center mb-4">
                <Label className="mb-2">{t("onboarding.receipt_logo")}</Label>
                <div className="w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center overflow-hidden bg-muted/50 relative">
                  {formData.receiptLogo ? (
                    <>
                      <img
                        src={`/objects${formData.receiptLogo}`}
                        alt="Receipt logo"
                        className="w-full h-full object-contain"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6"
                        onClick={() => setFormData({ ...formData, receiptLogo: "" })}
                        data-testid="button-remove-receipt-logo"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </>
                  ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={isUploadingReceiptLogo}
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*";
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) uploadReceiptLogo(file);
                    };
                    input.click();
                  }}
                  data-testid="button-upload-receipt-logo"
                >
                  {isUploadingReceiptLogo ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  {t("onboarding.upload_logo")}
                </Button>
                <div className="flex items-center gap-2 mt-2">
                  <Label className="text-sm">{t("settings.show_logo_receipt")}</Label>
                  <Button
                    variant={formData.receiptShowLogo ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFormData({ ...formData, receiptShowLogo: !formData.receiptShowLogo })}
                    data-testid="button-toggle-show-logo"
                  >
                    {formData.receiptShowLogo ? t("common.yes") : t("common.no")}
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="headerText">{t("settings.receipt_header")}</Label>
                <Input
                  id="headerText"
                  value={formData.receiptHeaderText}
                  onChange={(e) => setFormData({ ...formData, receiptHeaderText: e.target.value })}
                  placeholder={t("onboarding.receipt_header_placeholder")}
                  data-testid="input-receipt-header"
                />
              </div>
              <div>
                <Label htmlFor="footerText">{t("settings.receipt_footer")}</Label>
                <Input
                  id="footerText"
                  value={formData.receiptFooterText}
                  onChange={(e) => setFormData({ ...formData, receiptFooterText: e.target.value })}
                  placeholder={t("onboarding.receipt_footer_placeholder")}
                  data-testid="input-receipt-footer"
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <Label>{t("settings.show_address_receipt")}</Label>
                <Button
                  variant={formData.receiptShowAddress ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormData({ ...formData, receiptShowAddress: !formData.receiptShowAddress })}
                  data-testid="button-toggle-show-address"
                >
                  {formData.receiptShowAddress ? t("common.yes") : t("common.no")}
                </Button>
              </div>
              <div className="flex items-center justify-between py-2">
                <Label>{t("settings.show_phone_receipt")}</Label>
                <Button
                  variant={formData.receiptShowPhone ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormData({ ...formData, receiptShowPhone: !formData.receiptShowPhone })}
                  data-testid="button-toggle-show-phone"
                >
                  {formData.receiptShowPhone ? t("common.yes") : t("common.no")}
                </Button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4 safe-area-inset overflow-y-auto">
      <Card className="w-full max-w-lg my-auto max-h-[calc(100dvh-2rem)] flex flex-col">
        <CardHeader className="text-center shrink-0">
          <div className="mx-auto mb-4">
            <img src={flowpLogo} alt="Flowp" className="w-16 h-16" />
          </div>
          <CardTitle className="text-2xl">{t("onboarding.welcome")}</CardTitle>
          <CardDescription>{t("onboarding.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col min-h-0 flex-1">
          <div className="flex justify-center mb-8 shrink-0">
            {STEPS.map((step, index) => {
              const StepIcon = step.icon;
              return (
                <div key={step.id} className="flex items-center">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                      index < currentStep
                        ? "bg-primary text-primary-foreground"
                        : index === currentStep
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {index < currentStep ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <StepIcon className="w-5 h-5" />
                    )}
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className={cn(
                        "w-8 h-1 mx-1",
                        index < currentStep ? "bg-primary" : "bg-muted"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {renderStep()}
          </div>

          <div className="flex justify-between gap-2 mt-8 shrink-0 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 0 || saveMutation.isPending}
              data-testid="button-back"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              {t("common.back")}
            </Button>
            {currentStep < STEPS.length - 1 ? (
              <Button
                onClick={handleNext}
                disabled={saveMutation.isPending}
                data-testid="button-next"
              >
                {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t("common.next")}
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleComplete}
                disabled={saveMutation.isPending}
                data-testid="button-complete"
              >
                {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t("onboarding.complete")}
                <Check className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
