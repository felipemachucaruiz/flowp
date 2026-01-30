import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Package, Clock, Crown, CheckCircle, Bell, RefreshCw } from "lucide-react";
import type { IngredientAlert, Ingredient, IngredientLot } from "@shared/schema";
import { format, differenceInDays } from "date-fns";

export default function AlertsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [requiresUpgrade, setRequiresUpgrade] = useState(false);

  const { data: alerts = [], isLoading, error } = useQuery<IngredientAlert[]>({
    queryKey: ["/api/ingredient-alerts"],
    retry: (failureCount, error: any) => {
      if (error?.requiresUpgrade) return false;
      return failureCount < 3;
    },
  });

  const { data: ingredients = [] } = useQuery<Ingredient[]>({
    queryKey: ["/api/ingredients"],
  });

  const { data: lots = [] } = useQuery<IngredientLot[]>({
    queryKey: ["/api/ingredient-lots"],
  });

  const generateAlertsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ingredient-alerts/generate"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ingredient-alerts"] });
      toast({ title: t("alerts.alerts_generated") });
    },
    onError: (error: any) => {
      if (error?.requiresUpgrade) {
        setRequiresUpgrade(true);
      } else {
        toast({ title: t("alerts.generate_failed"), variant: "destructive" });
      }
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (alertId: string) => apiRequest("POST", `/api/ingredient-alerts/${alertId}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ingredient-alerts"] });
      toast({ title: t("alerts.alert_acknowledged") });
    },
  });

  if ((error as any)?.requiresUpgrade || requiresUpgrade) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md text-center">
          <CardHeader>
            <Crown className="w-12 h-12 mx-auto mb-2 text-amber-500" />
            <CardTitle>{t("ingredients.pro_required")}</CardTitle>
            <CardDescription>
              {t("ingredients.pro_required_description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="default" className="bg-amber-500" data-testid="button-upgrade-pro">
              {t("common.upgrade")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getEntityName = (entityType: string, entityId: string) => {
    if (entityType === "ingredient") {
      return ingredients.find(i => i.id === entityId)?.name || entityId;
    }
    if (entityType === "lot") {
      const lot = lots.find(l => l.id === entityId);
      if (lot) {
        const ingredient = ingredients.find(i => i.id === lot.ingredientId);
        return `${ingredient?.name || ""} - ${lot.lotCode || "Lot"}`;
      }
    }
    return entityId;
  };

  const getLotForAlert = (entityType: string, entityId: string) => {
    if (entityType === "lot") {
      return lots.find(l => l.id === entityId);
    }
    return undefined;
  };

  const unacknowledgedAlerts = alerts.filter(a => !a.isAcknowledged);
  const acknowledgedAlerts = alerts.filter(a => a.isAcknowledged);

  const lowStockAlerts = unacknowledgedAlerts.filter(a => a.alertType === "low_stock");
  const expiringAlerts = unacknowledgedAlerts.filter(a => a.alertType === "expiring_soon");
  const expiredAlerts = unacknowledgedAlerts.filter(a => a.alertType === "expired");

  const getAlertBadge = (type: string) => {
    switch (type) {
      case "low_stock":
        return <Badge variant="secondary" className="bg-amber-500/20 text-amber-600">{t("alerts.low_stock")}</Badge>;
      case "expiring_soon":
        return <Badge variant="secondary" className="bg-orange-500/20 text-orange-600">{t("alerts.expiring_soon")}</Badge>;
      case "expired":
        return <Badge variant="destructive">{t("alerts.expired")}</Badge>;
      default:
        return <Badge>{type}</Badge>;
    }
  };

  const getExpiryText = (lot: IngredientLot | undefined) => {
    if (!lot?.expiresAt) return "";
    const expiryDate = new Date(lot.expiresAt);
    const days = differenceInDays(expiryDate, new Date());
    if (days < 0) {
      return `${t("alerts.expired")} ${Math.abs(days)} ${t("common.days_ago")}`;
    }
    if (days === 0) {
      return t("alerts.expires_today_text");
    }
    return `${days} ${t("common.days_remaining")}`;
  };

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="w-6 h-6" />
            {t("alerts.title")}
          </h1>
          <p className="text-muted-foreground">{t("alerts.description")}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => generateAlertsMutation.mutate()}
          disabled={generateAlertsMutation.isPending}
          data-testid="button-generate-alerts"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${generateAlertsMutation.isPending ? 'animate-spin' : ''}`} />
          {t("alerts.refresh_alerts")}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-500/20 rounded-full">
                <Package className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{lowStockAlerts.length}</p>
                <p className="text-sm text-muted-foreground">{t("alerts.low_stock")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-500/20 rounded-full">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{expiringAlerts.length}</p>
                <p className="text-sm text-muted-foreground">{t("alerts.expiring_soon")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-destructive/20 rounded-full">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{expiredAlerts.length}</p>
                <p className="text-sm text-muted-foreground">{t("alerts.expired")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="active">
        <TabsList data-testid="tabs-alerts">
          <TabsTrigger value="active" data-testid="tab-active-alerts">
            {t("alerts.active_alerts")} ({unacknowledgedAlerts.length})
          </TabsTrigger>
          <TabsTrigger value="acknowledged" data-testid="tab-acknowledged-alerts">
            {t("alerts.acknowledged_alerts")} ({acknowledgedAlerts.length})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="active" className="mt-4">
          {unacknowledgedAlerts.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <p className="text-muted-foreground">{t("alerts.no_active_alerts")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {unacknowledgedAlerts.map(alert => {
                const lot = getLotForAlert(alert.entityType, alert.entityId);
                return (
                  <Card key={alert.id} data-testid={`card-alert-${alert.id}`}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4">
                          {getAlertBadge(alert.alertType)}
                          <div>
                            <p className="font-medium">{getEntityName(alert.entityType, alert.entityId)}</p>
                            <p className="text-sm text-muted-foreground">
                              {alert.message}
                              {lot && alert.alertType !== "low_stock" && (
                                <span className="ml-2">• {getExpiryText(lot)}</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => acknowledgeMutation.mutate(alert.id)}
                          disabled={acknowledgeMutation.isPending}
                          data-testid={`button-acknowledge-${alert.id}`}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          {t("alerts.acknowledge")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="acknowledged" className="mt-4">
          {acknowledgedAlerts.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">{t("alerts.no_acknowledged_alerts")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {acknowledgedAlerts.map(alert => (
                <Card key={alert.id} className="opacity-60" data-testid={`card-alert-acknowledged-${alert.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-4">
                      {getAlertBadge(alert.alertType)}
                      <div>
                        <p className="font-medium">{getEntityName(alert.entityType, alert.entityId)}</p>
                        <p className="text-sm text-muted-foreground">
                          {alert.message}
                          {alert.acknowledgedAt && (
                            <span className="ml-2">
                              • {t("alerts.acknowledged_on_date")} {format(new Date(alert.acknowledgedAt), 'PPp')}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
