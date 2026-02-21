import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { WhatsAppTemplateManager } from "@/components/whatsapp-template-manager";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  User,
  Save,
  Camera,
  Upload,
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
  catalogId?: string;
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
  const { t, language } = useI18n();
  const locale = language === "es" ? "es-ES" : language === "pt" ? "pt-BR" : "en-US";
  const { toast } = useToast();
  const { tenant } = useAuth();
  const queryClient = useQueryClient();

  const [configLoaded, setConfigLoaded] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileAbout, setProfileAbout] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [profileDescription, setProfileDescription] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileVertical, setProfileVertical] = useState("");
  const [profileWebsites, setProfileWebsites] = useState("");

  const [notifyOnSale, setNotifyOnSale] = useState(false);
  const [notifyOnLowStock, setNotifyOnLowStock] = useState(false);
  const [notifyDailySummary, setNotifyDailySummary] = useState(false);
  const [businessHours, setBusinessHours] = useState("");
  const [supportInfo, setSupportInfo] = useState("");
  const [catalogId, setCatalogId] = useState("");

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
      setCatalogId(config.catalogId || "");
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
    enabled: !!tenant?.id,
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

  const { data: profileData, isLoading: profileLoading } = useQuery<any>({
    queryKey: ["whatsapp", "profile"],
    queryFn: async () => {
      const res = await fetch("/api/whatsapp/profile", {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
    enabled: !!tenant?.id && !!config?.configured,
  });

  if (profileData && !profileLoaded) {
    setProfileAbout(profileData.about || "");
    setProfileDescription(profileData.description || "");
    setProfileAddress(profileData.address || "");
    setProfileEmail(profileData.email || "");
    setProfileVertical(profileData.vertical || "");
    setProfileWebsites(Array.isArray(profileData.websites) ? profileData.websites.join(", ") : profileData.websites || "");
    setProfileLoaded(true);
  }

  const profileMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("PUT", "/api/whatsapp/profile", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "profile"] });
      toast({
        title: t("common.success" as any) || "Success",
        description: t("whatsapp.profileUpdated" as any) || "Business profile updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error" as any) || "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const { data: profilePhotoData } = useQuery<any>({
    queryKey: ["whatsapp", "profile", "photo"],
    queryFn: async () => {
      const res = await fetch("/api/whatsapp/profile/photo", {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!tenant?.id && !!config?.configured,
  });

  const profilePhotoUrl = profilePhotoData?.message || profilePhotoData?.url || null;

  const photoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/whatsapp/profile/photo", {
        method: "PUT",
        headers: { "x-tenant-id": tenant?.id || "" },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Failed to upload profile photo");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "profile", "photo"] });
      toast({
        title: t("common.success" as any) || "Success",
        description: t("whatsapp.profilePhotoUpdated" as any) || "Profile photo updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error" as any) || "Error",
        description: error.message || "Failed to upload profile photo",
        variant: "destructive",
      });
    },
  });

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t("common.error" as any) || "Error",
        description: t("whatsapp.profilePhotoTooLarge" as any) || "Image must be less than 5 MB.",
        variant: "destructive",
      });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({
        title: t("common.error" as any) || "Error",
        description: t("whatsapp.profilePhotoInvalidType" as any) || "Please select an image file (JPEG or PNG).",
        variant: "destructive",
      });
      return;
    }
    photoMutation.mutate(file);
  };

  const handleProfileSave = () => {
    const websites = profileWebsites
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);
    profileMutation.mutate({
      about: profileAbout,
      description: profileDescription,
      address: profileAddress,
      email: profileEmail,
      vertical: profileVertical,
      websites,
    });
  };

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
    enabled: !!tenant?.id,
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
        catalogId,
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
                  {new Date(usage.subscription.renewalDate).toLocaleDateString(locale)}
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

            <Separator />

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="catalog-id">
                {t("whatsapp.catalogId" as any) || "WhatsApp Catalog ID"}
              </label>
              <p className="text-xs text-muted-foreground">
                {t("whatsapp.catalogIdDesc" as any) || "Your Meta Commerce catalog ID for sending product lists via WhatsApp"}
              </p>
              <Input
                id="catalog-id"
                value={catalogId}
                onChange={(e) => setCatalogId(e.target.value)}
                placeholder="123456789012345"
                data-testid="input-catalog-id"
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
                            {new Date(log.createdAt).toLocaleString(locale)}
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

      {config?.configured && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              {t("whatsapp.businessProfile" as any) || "Business Profile"}
            </CardTitle>
            <CardDescription>
              {t("whatsapp.businessProfileDesc" as any) || "Manage your WhatsApp Business profile information visible to customers."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profileLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-6 pb-4 border-b">
                  <div className="relative group">
                    <div className="w-20 h-20 rounded-full overflow-hidden bg-muted flex items-center justify-center border-2 border-border">
                      {profilePhotoUrl ? (
                        <img
                          src={profilePhotoUrl}
                          alt={t("whatsapp.profilePhoto" as any) || "Profile photo"}
                          className="w-full h-full object-cover"
                          data-testid="img-profile-photo"
                        />
                      ) : (
                        <User className="w-8 h-8 text-muted-foreground" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoMutation.isPending}
                      className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                      data-testid="button-change-profile-photo"
                    >
                      {photoMutation.isPending ? (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      ) : (
                        <Camera className="w-5 h-5 text-white" />
                      )}
                    </button>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/jpg"
                      onChange={handlePhotoSelect}
                      className="hidden"
                      data-testid="input-profile-photo"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {t("whatsapp.profilePhoto" as any) || "Profile Photo"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("whatsapp.profilePhotoHint" as any) || "JPEG or PNG, max 5 MB. This photo will be visible to your WhatsApp contacts."}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoMutation.isPending}
                      data-testid="button-upload-profile-photo"
                    >
                      {photoMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <Upload className="w-3 h-3 mr-1" />
                      )}
                      {t("whatsapp.uploadPhoto" as any) || "Upload Photo"}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profile-about" data-testid="label-profile-about">
                      {t("whatsapp.profileAbout" as any) || "About"}
                    </Label>
                    <Input
                      id="profile-about"
                      value={profileAbout}
                      onChange={(e) => setProfileAbout(e.target.value)}
                      placeholder={t("whatsapp.profileAboutPlaceholder" as any) || "Short description about your business"}
                      maxLength={139}
                      data-testid="input-profile-about"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-email" data-testid="label-profile-email">
                      {t("whatsapp.profileEmail" as any) || "Email"}
                    </Label>
                    <Input
                      id="profile-email"
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      placeholder="contact@example.com"
                      data-testid="input-profile-email"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-description" data-testid="label-profile-description">
                    {t("whatsapp.profileDescription" as any) || "Description"}
                  </Label>
                  <Textarea
                    id="profile-description"
                    value={profileDescription}
                    onChange={(e) => setProfileDescription(e.target.value)}
                    placeholder={t("whatsapp.profileDescriptionPlaceholder" as any) || "Detailed description of your business"}
                    rows={3}
                    maxLength={512}
                    data-testid="input-profile-description"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profile-address" data-testid="label-profile-address">
                      {t("whatsapp.profileAddress" as any) || "Address"}
                    </Label>
                    <Input
                      id="profile-address"
                      value={profileAddress}
                      onChange={(e) => setProfileAddress(e.target.value)}
                      placeholder={t("whatsapp.profileAddressPlaceholder" as any) || "Business address"}
                      maxLength={256}
                      data-testid="input-profile-address"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-vertical" data-testid="label-profile-vertical">
                      {t("whatsapp.profileVertical" as any) || "Business Category"}
                    </Label>
                    <Select value={profileVertical} onValueChange={setProfileVertical}>
                      <SelectTrigger id="profile-vertical" data-testid="select-profile-vertical">
                        <SelectValue placeholder={t("whatsapp.profileVerticalPlaceholder" as any) || "Select a category"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AUTOMOTIVE">{t("whatsapp.verticalAutomotive" as any) || "Automotive"}</SelectItem>
                        <SelectItem value="BEAUTY">{t("whatsapp.verticalBeauty" as any) || "Beauty, Spa & Salon"}</SelectItem>
                        <SelectItem value="APPAREL">{t("whatsapp.verticalApparel" as any) || "Clothing & Apparel"}</SelectItem>
                        <SelectItem value="EDU">{t("whatsapp.verticalEdu" as any) || "Education"}</SelectItem>
                        <SelectItem value="ENTERTAIN">{t("whatsapp.verticalEntertain" as any) || "Entertainment"}</SelectItem>
                        <SelectItem value="EVENT_PLAN">{t("whatsapp.verticalEventPlan" as any) || "Event Planning"}</SelectItem>
                        <SelectItem value="FINANCE">{t("whatsapp.verticalFinance" as any) || "Finance"}</SelectItem>
                        <SelectItem value="GROCERY">{t("whatsapp.verticalGrocery" as any) || "Grocery"}</SelectItem>
                        <SelectItem value="GOVT">{t("whatsapp.verticalGovt" as any) || "Government"}</SelectItem>
                        <SelectItem value="HOTEL">{t("whatsapp.verticalHotel" as any) || "Hotel & Lodging"}</SelectItem>
                        <SelectItem value="HEALTH">{t("whatsapp.verticalHealth" as any) || "Health & Medical"}</SelectItem>
                        <SelectItem value="NONPROFIT">{t("whatsapp.verticalNonprofit" as any) || "Non-profit"}</SelectItem>
                        <SelectItem value="PROF_SERVICES">{t("whatsapp.verticalProfServices" as any) || "Professional Services"}</SelectItem>
                        <SelectItem value="RETAIL">{t("whatsapp.verticalRetail" as any) || "Retail"}</SelectItem>
                        <SelectItem value="TRAVEL">{t("whatsapp.verticalTravel" as any) || "Travel & Transportation"}</SelectItem>
                        <SelectItem value="RESTAURANT">{t("whatsapp.verticalRestaurant" as any) || "Restaurant"}</SelectItem>
                        <SelectItem value="OTHER">{t("whatsapp.verticalOther" as any) || "Other"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-websites" data-testid="label-profile-websites">
                    {t("whatsapp.profileWebsites" as any) || "Websites"}
                  </Label>
                  <Input
                    id="profile-websites"
                    value={profileWebsites}
                    onChange={(e) => setProfileWebsites(e.target.value)}
                    placeholder={t("whatsapp.profileWebsitesPlaceholder" as any) || "https://example.com, https://shop.example.com"}
                    data-testid="input-profile-websites"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("whatsapp.profileWebsitesHint" as any) || "Separate multiple URLs with commas"}
                  </p>
                </div>
                <Button
                  onClick={handleProfileSave}
                  disabled={profileMutation.isPending}
                  data-testid="button-save-profile"
                >
                  {profileMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  {t("common.save" as any) || "Save"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {config?.configured && <WhatsAppTemplateManager />}
    </div>
  );
}
