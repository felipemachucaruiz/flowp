import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ShoppingBag, UtensilsCrossed, Building2, User, Lock, ArrowRight, ArrowLeft, Loader2, CheckCircle2, Globe, MapPin } from "lucide-react";
import { FlowpLogo } from "@/components/flowp-logo";
import { countries } from "@/lib/countries";

const registerSchema = z.object({
  businessName: z.string().min(2, "Business name must be at least 2 characters"),
  businessType: z.enum(["retail", "restaurant"]),
  country: z.string().min(1, "Please select a country"),
  city: z.string().min(2, "Please enter your city"),
  address: z.string().min(5, "Please enter a valid address"),
  businessPhone: z.string().min(7, "Please enter a valid business phone number"),
  adminName: z.string().min(2, "Name must be at least 2 characters"),
  adminEmail: z.string().email("Please enter a valid email address"),
  adminPhone: z.string().min(10, "Please enter a valid phone number"),
  adminUsername: z.string().min(3, "Username must be at least 3 characters"),
  adminPassword: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.adminPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      businessName: "",
      businessType: "retail",
      country: "",
      city: "",
      address: "",
      businessPhone: "",
      adminName: "",
      adminEmail: "",
      adminPhone: "",
      adminUsername: "",
      adminPassword: "",
      confirmPassword: "",
    },
  });

  const businessType = form.watch("businessType");

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || t("register.failed"));
      }

      toast({
        title: t("register.success"),
        description: t("register.success_message"),
      });
      navigate("/login");
    } catch (error) {
      toast({
        title: t("register.failed"),
        description: error instanceof Error ? error.message : t("common.error"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const nextStep = async () => {
    const fieldsToValidate = step === 1 
      ? ["businessName", "businessType", "country", "city", "address", "businessPhone"] as const
      : ["adminName", "adminEmail", "adminPhone", "adminUsername", "adminPassword", "confirmPassword"] as const;
    
    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) setStep(step + 1);
  };

  return (
    <div className="min-h-screen min-h-dvh flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4 safe-area-inset">
      <div className="w-full max-w-lg space-y-6">
        {/* Logo and branding */}
        <div className="text-center space-y-2">
          <FlowpLogo className="h-12 mx-auto mb-4" />
          <p className="text-muted-foreground">
            {t("register.title")}
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`flex items-center gap-2 ${s < step ? "text-primary" : s === step ? "text-primary" : "text-muted-foreground"}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  s < step
                    ? "bg-primary text-primary-foreground"
                    : s === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s < step ? <CheckCircle2 className="w-5 h-5" /> : s}
              </div>
              {s < 2 && (
                <div className={`w-12 h-0.5 ${s < step ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">
              {step === 1 ? t("register.step_business") : t("register.step_admin")}
            </CardTitle>
            <CardDescription>
              {step === 1
                ? t("register.business_prompt")
                : t("register.admin_prompt")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {step === 1 && (
                  <>
                    <FormField
                      control={form.control}
                      name="businessName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("register.business_name")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                {...field}
                                placeholder={t("register.business_name_placeholder")}
                                className="pl-10"
                                data-testid="input-business-name"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="businessType"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormLabel>{t("register.business_type")}</FormLabel>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              className="grid grid-cols-2 gap-4"
                            >
                              <label
                                className={`relative flex flex-col items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all hover-elevate ${
                                  businessType === "retail"
                                    ? "border-primary bg-primary/5"
                                    : "border-border"
                                }`}
                                data-testid="radio-retail"
                              >
                                <RadioGroupItem
                                  value="retail"
                                  className="sr-only"
                                />
                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                                  businessType === "retail"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground"
                                }`}>
                                  <ShoppingBag className="w-6 h-6" />
                                </div>
                                <div className="text-center">
                                  <div className="font-medium">{t("register.type_retail")}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {t("register.type_retail_desc")}
                                  </div>
                                </div>
                              </label>

                              <label
                                className={`relative flex flex-col items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all hover-elevate ${
                                  businessType === "restaurant"
                                    ? "border-primary bg-primary/5"
                                    : "border-border"
                                }`}
                                data-testid="radio-restaurant"
                              >
                                <RadioGroupItem
                                  value="restaurant"
                                  className="sr-only"
                                />
                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                                  businessType === "restaurant"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground"
                                }`}>
                                  <UtensilsCrossed className="w-6 h-6" />
                                </div>
                                <div className="text-center">
                                  <div className="font-medium">{t("register.type_restaurant")}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {t("register.type_restaurant_desc")}
                                  </div>
                                </div>
                              </label>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("register.country")}</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-country">
                                <div className="flex items-center gap-2">
                                  <Globe className="w-4 h-4 text-muted-foreground" />
                                  <SelectValue placeholder={t("register.country_placeholder")} />
                                </div>
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-[300px]">
                              {countries.map((country) => (
                                <SelectItem key={country.code} value={country.code}>
                                  {country.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("register.city")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                {...field}
                                placeholder={t("register.city_placeholder")}
                                className="pl-10"
                                data-testid="input-city"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("register.address")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder={t("register.address_placeholder")}
                              data-testid="input-address"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="businessPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("register.business_phone")} *</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder={t("register.business_phone")}
                              data-testid="input-business-phone"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="button"
                      className="w-full"
                      onClick={nextStep}
                      data-testid="button-next"
                    >
                      {t("common.continue")}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </>
                )}

                {step === 2 && (
                  <>
                    <FormField
                      control={form.control}
                      name="adminName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("register.your_name")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                {...field}
                                placeholder={t("register.your_name_placeholder")}
                                className="pl-10"
                                data-testid="input-admin-name"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="adminEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("register.email")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="email"
                              placeholder={t("register.email_placeholder")}
                              data-testid="input-admin-email"
                              autoComplete="email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="adminPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("register.phone")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="tel"
                              placeholder={t("register.phone_placeholder")}
                              data-testid="input-admin-phone"
                              autoComplete="tel"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="adminUsername"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("register.username")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                {...field}
                                placeholder={t("register.username_placeholder")}
                                className="pl-10"
                                data-testid="input-admin-username"
                                autoComplete="username"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="adminPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("register.password")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                {...field}
                                type="password"
                                placeholder={t("register.password_placeholder")}
                                className="pl-10"
                                data-testid="input-admin-password"
                                autoComplete="new-password"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("register.confirm_password")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                {...field}
                                type="password"
                                placeholder={t("register.confirm_password_placeholder")}
                                className="pl-10"
                                data-testid="input-confirm-password"
                                autoComplete="new-password"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setStep(1)}
                        data-testid="button-back"
                      >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        {t("common.back")}
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1"
                        disabled={isLoading}
                        data-testid="button-register"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            {t("register.creating")}
                          </>
                        ) : (
                          <>
                            {t("register.create_account")}
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            {t("register.have_account")}{" "}
            <button
              onClick={() => navigate("/login")}
              className="text-primary hover:underline font-medium"
              data-testid="link-login"
            >
              {t("register.sign_in_link")}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
