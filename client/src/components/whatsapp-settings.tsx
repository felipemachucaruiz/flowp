import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MessageCircle,
  Send,
  Settings,
  Package,
  BarChart3,
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface WhatsAppConfig {
  configured: boolean;
  enabled?: boolean;
  gupshupAppName?: string;
  senderPhone?: string;
  hasApiKey?: boolean;
  approvedTemplates?: string[];
  notifyOnSale?: boolean;
  notifyOnLowStock?: boolean;
  notifyDailySummary?: boolean;
  businessHours?: string;
  supportInfo?: string;
  lastError?: string;
  errorCount?: number;
}

interface WhatsAppUsage {
  subscription: {
    id: string;
    messagesUsed: number;
    messageLimit: number;
    remaining: number;
    status: string;
    renewalDate: string;
    expiresAt?: string;
  } | null;
  package: {
    name: string;
    messageLimit: number;
    price: number;
  } | null;
  totalMessagesSent: number;
}

interface WhatsAppPackage {
  id: string;
  name: string;
  messageLimit: number;
  price: number;
  active: boolean;
  sortOrder?: number;
}

interface MessageLog {
  id: string;
  tenantId: string;
  direction: string;
  phone: string;
  messageType: string;
  messageBody: string;
  status: string;
  createdAt: string;
}

interface LogsResponse {
  logs: MessageLog[];
  total: number;
}

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function WhatsAppSettings() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { tenant } = useAuth();
  const queryClient = useQueryClient();

  const [configLoaded, setConfigLoaded] = useState(false);

  const [notifyOnSale, setNotifyOnSale] = useState(false);
  const [notifyOnLowStock, setNotifyOnLowStock] = useState(false);
  const [notifyDailySummary, setNotifyDailySummary] = useState(false);
  const [businessHours, setBusinessHours] = useState("");
  const [supportInfo, setSupportInfo] = useState("");

  const [logsPage, setLogsPage] = useState(0);

  const { data: config, isLoading: configLoading } = useQuery<WhatsAppConfig>({
    queryKey: ["whatsapp", "config"],
    queryFn: async () => {
      const res = await fetch("/api/whatsapp/config", {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      if (!res.ok) throw new Error("Failed to load config");
      return res.json();
    },
    enabled: !!tenant?.id,
  });

  if (config && !configLoaded) {
    if (config.configured) {
      setNotifyOnSale(config.notifyOnSale || false);
      setNotifyOnLowStock(config.notifyOnLowStock || false);
      setNotifyDailySummary(config.notifyDailySummary || false);
      setBusinessHours(config.businessHours || "");
      setSupportInfo(config.supportInfo || "");
    }
    setConfigLoaded(true);
  }

  const { data: usage, isLoading: usageLoading } = useQuery<WhatsAppUsage>({
    queryKey: ["whatsapp", "usage"],
    queryFn: async () => {
      const res = await fetch("/api/whatsapp/usage", {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      if (!res.ok) throw new Error("Failed to load usage");
      return res.json();
    },
    enabled: !!tenant?.id && !!config?.configured,
  });

  const { data: packages, isLoading: packagesLoading } = useQuery<WhatsAppPackage[]>({
    queryKey: ["whatsapp", "packages"],
    queryFn: async () => {
      const res = await fetch("/api/whatsapp/packages", {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      if (!res.ok) throw new Error("Failed to load packages");
      return res.json();
    },
    enabled: !!tenant?.id,
  });

  const { data: logsData, isLoading: logsLoading } = useQuery<LogsResponse>({
    queryKey: ["whatsapp", "logs", logsPage],
    queryFn: async () => {
      const res = await fetch(
        `/api/whatsapp/logs?limit=50&offset=${logsPage * 50}`,
        { headers: { "x-tenant-id": tenant?.id || "" } }
      );
      if (!res.ok) throw new Error("Failed to load logs");
      return res.json();
    },
    enabled: !!tenant?.id && !!config?.configured,
  });

  const subscribeMutation = useMutation({
    mutationFn: async (packageId: string) => {
      const res = await apiRequest("POST", "/api/whatsapp/subscribe", { packageId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "usage"] });
      toast({
        title: t("common.success" as any) || "Success",
        description: t("whatsapp.subscribed" as any) || "Subscribed to message package successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error" as any) || "Error",
        description: error.message || "Failed to subscribe",
        variant: "destructive",
      });
    },
  });

  const savePreferencesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/whatsapp/config", {
        notifyOnSale,
        notifyOnLowStock,
        notifyDailySummary,
        businessHours,
        supportInfo,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "config"] });
      toast({
        title: t("common.success" as any) || "Success",
        description: t("whatsapp.preferencesSaved" as any) || "Notification preferences saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error" as any) || "Error",
        description: error.message || "Failed to save preferences",
        variant: "destructive",
      });
    },
  });

  if (configLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" data-testid="skeleton-config" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const totalPages = logsData ? Math.ceil(logsData.total / 50) : 0;
  const usagePercent =
    usage?.subscription
      ? Math.min(
          (usage.subscription.messagesUsed / usage.subscription.messageLimit) * 100,
          100
        )
      : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <MessageCircle className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2 flex-wrap">
                {t("whatsapp.title" as any) || "WhatsApp Notifications"}
                {config?.configured && (
                  <Badge
                    variant={config.enabled ? "default" : "secondary"}
                    data-testid="badge-whatsapp-status"
                  >
                    {config.enabled
                      ? t("common.active" as any) || "Active"
                      : t("common.inactive" as any) || "Inactive"}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("whatsapp.tenantSubtitle" as any) || "WhatsApp notifications are sent from Flowp's verified account"}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {config?.configured && config.enabled ? (
            <div className="flex items-start gap-2 p-3 bg-green-500/10 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium">
                  {t("whatsapp.serviceActive" as any) || "WhatsApp service is active"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("whatsapp.serviceActiveDesc" as any) || "Notifications are being sent from Flowp's WhatsApp. Configure your preferences below."}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <MessageCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">
                  {t("whatsapp.serviceInactive" as any) || "WhatsApp service is not active"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("whatsapp.serviceInactiveDesc" as any) || "Subscribe to a message package below to start receiving WhatsApp notifications."}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5" />
            <CardTitle>
              {t("whatsapp.messagePackages" as any) || "Message Packages"}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {usage?.subscription && (
            <div className="space-y-2 p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium">
                    {t("whatsapp.currentSubscription" as any) || "Current Subscription"}
                    {usage.package && (
                      <span className="ml-1 text-muted-foreground">
                        - {usage.package.name}
                      </span>
                    )}
                  </span>
                </div>
                <Badge variant={usage.subscription.status === "active" ? "default" : "secondary"} data-testid="badge-subscription-status">
                  {usage.subscription.status}
                </Badge>
              </div>
              <Progress value={usagePercent} className="h-2" data-testid="progress-usage" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span data-testid="text-messages-used">
                  {usage.subscription.messagesUsed} / {usage.subscription.messageLimit}{" "}
                  {t("whatsapp.messagesUsed" as any) || "messages used"}
                </span>
                <span data-testid="text-messages-remaining">
                  {usage.subscription.remaining}{" "}
                  {t("whatsapp.remaining" as any) || "remaining"}
                </span>
              </div>
              {usage.subscription.renewalDate && (
                <p className="text-xs text-muted-foreground">
                  {t("whatsapp.renewalDate" as any) || "Renewal"}:{" "}
                  {new Date(usage.subscription.renewalDate).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          {usageLoading || packagesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {packages?.map((pkg) => (
                <div
                  key={pkg.id}
                  className="p-4 border rounded-lg space-y-2"
                  data-testid={`card-package-${pkg.id}`}
                >
                  <div className="font-medium">{pkg.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {pkg.messageLimit.toLocaleString()}{" "}
                    {t("whatsapp.messages" as any) || "messages"}
                  </div>
                  <div className="text-lg font-bold">{copFormatter.format(pkg.price)}</div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => subscribeMutation.mutate(pkg.id)}
                    disabled={subscribeMutation.isPending || !!usage?.subscription}
                    data-testid={`button-subscribe-${pkg.id}`}
                  >
                    {subscribeMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Package className="w-4 h-4 mr-2" />
                    )}
                    {t("whatsapp.subscribe" as any) || "Subscribe"}
                  </Button>
                </div>
              ))}
              {packages?.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full">
                  {t("whatsapp.noPackages" as any) || "No packages available at this time."}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {config?.configured && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5" />
              <CardTitle>
                {t("whatsapp.notificationPreferences" as any) || "Notification Preferences"}
              </CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => savePreferencesMutation.mutate()}
              disabled={savePreferencesMutation.isPending}
              data-testid="button-save-preferences"
            >
              {savePreferencesMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {t("common.save" as any) || "Save"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">
                  {t("whatsapp.notifyOnSale" as any) || "Send receipt on sale completion"}
                </span>
                <p className="text-xs text-muted-foreground">
                  {t("whatsapp.notifyOnSaleDesc" as any) || "Automatically send receipt via WhatsApp when a sale is completed"}
                </p>
              </div>
              <Switch
                checked={notifyOnSale}
                onCheckedChange={setNotifyOnSale}
                data-testid="switch-notify-on-sale"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">
                  {t("whatsapp.notifyOnLowStock" as any) || "Send low stock alerts"}
                </span>
                <p className="text-xs text-muted-foreground">
                  {t("whatsapp.notifyOnLowStockDesc" as any) || "Receive alerts when product stock is running low"}
                </p>
              </div>
              <Switch
                checked={notifyOnLowStock}
                onCheckedChange={setNotifyOnLowStock}
                data-testid="switch-notify-low-stock"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">
                  {t("whatsapp.notifyDailySummary" as any) || "Send daily sales summary"}
                </span>
                <p className="text-xs text-muted-foreground">
                  {t("whatsapp.notifyDailySummaryDesc" as any) || "Receive a daily summary of sales via WhatsApp"}
                </p>
              </div>
              <Switch
                checked={notifyDailySummary}
                onCheckedChange={setNotifyDailySummary}
                data-testid="switch-notify-daily-summary"
              />
            </div>

            <Separator />

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="business-hours">
                {t("whatsapp.businessHours" as any) || "Business Hours Text"}
              </label>
              <p className="text-xs text-muted-foreground">
                {t("whatsapp.businessHoursDesc" as any) || 'Shown when a customer sends "HORARIO"'}
              </p>
              <Textarea
                id="business-hours"
                value={businessHours}
                onChange={(e) => setBusinessHours(e.target.value)}
                placeholder="Lun-Vie 8:00-18:00, Sab 9:00-13:00"
                rows={3}
                data-testid="textarea-business-hours"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="support-info">
                {t("whatsapp.supportInfo" as any) || "Support Info Text"}
              </label>
              <p className="text-xs text-muted-foreground">
                {t("whatsapp.supportInfoDesc" as any) || 'Shown when a customer sends "AYUDA"'}
              </p>
              <Textarea
                id="support-info"
                value={supportInfo}
                onChange={(e) => setSupportInfo(e.target.value)}
                placeholder="Para soporte contacta a nuestro equipo..."
                rows={3}
                data-testid="textarea-support-info"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {config?.configured && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5" />
              <CardTitle>
                {t("whatsapp.messageLogs" as any) || "Message Log"}
              </CardTitle>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ["whatsapp", "logs", logsPage],
                })
              }
              data-testid="button-refresh-logs"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : logsData?.logs && logsData.logs.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("whatsapp.logDate" as any) || "Date"}</TableHead>
                        <TableHead>{t("whatsapp.logPhone" as any) || "Phone"}</TableHead>
                        <TableHead>{t("whatsapp.logDirection" as any) || "Direction"}</TableHead>
                        <TableHead>{t("whatsapp.logType" as any) || "Type"}</TableHead>
                        <TableHead>{t("whatsapp.logStatus" as any) || "Status"}</TableHead>
                        <TableHead>{t("whatsapp.logMessage" as any) || "Message"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logsData.logs.map((log) => (
                        <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm">{log.phone}</TableCell>
                          <TableCell>
                            <Badge
                              variant={log.direction === "inbound" ? "secondary" : "default"}
                              data-testid={`badge-direction-${log.id}`}
                            >
                              {log.direction === "inbound"
                                ? t("whatsapp.inbound" as any) || "Inbound"
                                : t("whatsapp.outbound" as any) || "Outbound"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{log.messageType}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                log.status === "delivered" || log.status === "read"
                                  ? "default"
                                  : log.status === "failed"
                                    ? "destructive"
                                    : "secondary"
                              }
                              data-testid={`badge-status-${log.id}`}
                            >
                              {log.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate" data-testid={`text-message-${log.id}`}>
                            {log.messageBody}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-xs text-muted-foreground" data-testid="text-log-total">
                      {logsData.total} {t("whatsapp.totalMessages" as any) || "total messages"}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={logsPage === 0}
                        onClick={() => setLogsPage((p) => Math.max(0, p - 1))}
                        data-testid="button-logs-prev"
                      >
                        {t("common.previous" as any) || "Previous"}
                      </Button>
                      <span className="text-sm flex items-center" data-testid="text-log-page">
                        {logsPage + 1} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={logsPage >= totalPages - 1}
                        onClick={() => setLogsPage((p) => p + 1)}
                        data-testid="button-logs-next"
                      >
                        {t("common.next" as any) || "Next"}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-no-logs">
                {t("whatsapp.noLogs" as any) || "No message logs found."}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
