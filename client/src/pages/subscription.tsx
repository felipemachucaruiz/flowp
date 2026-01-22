import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Building2, Monitor, Users, CreditCard, Loader2 } from "lucide-react";
import PayPalButton from "@/components/PayPalButton";
import type { SubscriptionPlan } from "@shared/schema";

export default function SubscriptionPage() {
  const { tenant, refreshTenant } = useAuth();
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const { data: plans = [], isLoading } = useQuery<SubscriptionPlan[]>({
    queryKey: ["/api/subscription/plans"],
  });

  const activePlans = plans.filter((p) => p.isActive);

  const subscribeMutation = useMutation({
    mutationFn: async (data: { planId: string; billingPeriod: string; paypalOrderId: string }) => {
      const res = await apiRequest("POST", "/api/subscription/subscribe", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/current"] });
      refreshTenant();
      setShowPaymentDialog(false);
      setSelectedPlan(null);
      toast({ title: "Subscription activated successfully!" });
    },
    onError: () => {
      toast({ title: "Failed to activate subscription", variant: "destructive" });
    },
  });

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
    setShowPaymentDialog(true);
  };

  const handlePaymentSuccess = (orderData: any) => {
    if (selectedPlan) {
      subscribeMutation.mutate({
        planId: selectedPlan.id,
        billingPeriod,
        paypalOrderId: orderData.id,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-80 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold" data-testid="text-subscription-title">
          Choose Your Plan
        </h1>
        <p className="text-muted-foreground">
          Select the perfect plan for your business
        </p>
      </div>

      <div className="flex justify-center">
        <div className="inline-flex items-center gap-4 p-1 bg-muted rounded-lg">
          <Button
            variant={billingPeriod === "monthly" ? "default" : "ghost"}
            size="sm"
            onClick={() => setBillingPeriod("monthly")}
            data-testid="button-billing-monthly"
          >
            Monthly
          </Button>
          <Button
            variant={billingPeriod === "yearly" ? "default" : "ghost"}
            size="sm"
            onClick={() => setBillingPeriod("yearly")}
            data-testid="button-billing-yearly"
          >
            Yearly
            {activePlans.some((p) => getDiscount(p) > 0) && (
              <Badge variant="secondary" className="ml-2">Save up to {Math.max(...activePlans.map(getDiscount))}%</Badge>
            )}
          </Button>
        </div>
      </div>

      {activePlans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Plans Available</h3>
            <p className="text-muted-foreground text-center">
              Subscription plans are being configured. Please check back later.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
          {activePlans.map((plan, index) => {
            const price = getPrice(plan);
            const monthlyEquivalent = getMonthlyEquivalent(plan);
            const discount = getDiscount(plan);
            const isPopular = index === 1 && activePlans.length >= 3;

            return (
              <Card
                key={plan.id}
                className={isPopular ? "border-primary shadow-lg relative" : ""}
                data-testid={`card-plan-${plan.id}`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge>Most Popular</Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>
                    <div className="mt-2">
                      <span className="text-3xl font-bold text-foreground">
                        ${billingPeriod === "yearly" ? monthlyEquivalent.toFixed(2) : price.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    {billingPeriod === "yearly" && (
                      <div className="text-sm mt-1">
                        <span className="text-muted-foreground">
                          ${price.toFixed(2)} billed annually
                        </span>
                        {discount > 0 && (
                          <Badge variant="secondary" className="ml-2">
                            Save {discount}%
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
                      <span className="text-xs text-muted-foreground">Locations</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Monitor className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{plan.maxRegisters}</span>
                      <span className="text-xs text-muted-foreground">Registers</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{plan.maxUsers}</span>
                      <span className="text-xs text-muted-foreground">Users</span>
                    </div>
                  </div>

                  {plan.features && plan.features.length > 0 && (
                    <div className="space-y-2 pt-4 border-t">
                      {plan.features.map((feature, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500 shrink-0" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={isPopular ? "default" : "outline"}
                    onClick={() => handleSelectPlan(plan)}
                    data-testid={`button-select-plan-${plan.id}`}
                  >
                    Select Plan
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
            <DialogTitle>Complete Your Subscription</DialogTitle>
            <DialogDescription>
              {selectedPlan && (
                <>
                  You're subscribing to <strong>{selectedPlan.name}</strong> for{" "}
                  <strong>${getPrice(selectedPlan).toFixed(2)}</strong>{" "}
                  {billingPeriod === "yearly" ? "per year" : "per month"}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Billing Period</Label>
              <RadioGroup
                value={billingPeriod}
                onValueChange={(v) => setBillingPeriod(v as "monthly" | "yearly")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="monthly" id="monthly" />
                  <Label htmlFor="monthly">Monthly</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yearly" id="yearly" />
                  <Label htmlFor="yearly">
                    Yearly
                    {selectedPlan && getDiscount(selectedPlan) > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        Save {getDiscount(selectedPlan)}%
                      </Badge>
                    )}
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="border rounded-lg p-4 bg-muted/50">
              <div className="flex justify-between items-center">
                <span>Total</span>
                <span className="text-xl font-bold">
                  ${selectedPlan ? getPrice(selectedPlan).toFixed(2) : "0.00"}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    {billingPeriod === "yearly" ? "/year" : "/month"}
                  </span>
                </span>
              </div>
            </div>

            {subscribeMutation.isPending ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">Processing...</span>
              </div>
            ) : (
              <div className="pt-4">
                <p className="text-sm text-muted-foreground mb-4 text-center">
                  Pay securely with PayPal
                </p>
                {selectedPlan && (
                  <PayPalButton
                    amount={getPrice(selectedPlan).toFixed(2)}
                    currency={selectedPlan.currency || "USD"}
                    intent="CAPTURE"
                    onSuccess={handlePaymentSuccess}
                    onError={(error) => {
                      console.error("Payment error:", error);
                      toast({ title: "Payment failed", variant: "destructive" });
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
