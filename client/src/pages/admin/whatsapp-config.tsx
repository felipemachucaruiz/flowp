import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { adminFetch } from "@/lib/admin-fetch";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  MessageCircle,
  Send,
  RefreshCw,
  Loader2,
  Phone,
  Settings,
  Shield,
} from "lucide-react";

interface GlobalConfig {
  hasApiKey: boolean;
  appName: string;
  senderPhone: string;
  enabled: boolean;
  partnerEmail: string;
  hasPartnerSecret: boolean;
  appId: string;
}

export default function AdminWhatsAppConfig() {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [apiKey, setApiKey] = useState("");
  const [appName, setAppName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerSecret, setPartnerSecret] = useState("");
  const [appId, setAppId] = useState("");
  const { data: config, isLoading } = useQuery<GlobalConfig>({
    queryKey: ["/api/internal-admin/whatsapp/global-config"],
    queryFn: async () => {
      const res = await adminFetch("/api/internal-admin/whatsapp/global-config");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  useEffect(() => {
    if (config) {
      setAppName(config.appName || "");
      setSenderPhone(config.senderPhone || "");
      setEnabled(config.enabled);
      setPartnerEmail(config.partnerEmail || "");
      setAppId(config.appId || "");
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        appName,
        senderPhone,
        enabled,
        partnerEmail,
        appId,
      };
      if (apiKey) {
        payload.gupshupApiKey = apiKey;
      }
      if (partnerSecret) {
        payload.partnerSecret = partnerSecret;
      }
      const res = await adminFetch("/api/internal-admin/whatsapp/global-config", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/whatsapp/global-config"] });
      setApiKey("");
      setPartnerSecret("");
      toast({
        title: t("common.success" as any) || "Success",
        description: t("admin.whatsapp_config_saved" as any) || "Global WhatsApp configuration saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error" as any) || "Error",
        description: error.message || "Failed to save",
        variant: "destructive",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch("/api/internal-admin/whatsapp/test-global-connection", {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        let description = t("whatsapp.connectionSuccessDesc" as any) || "Gupshup Messaging API verified.";
        if (data.partnerStatus === "ok") {
          description += " " + (t("admin.whatsapp_partner_ok" as any) || "Partner API (templates): OK");
        } else if (data.partnerStatus === "auth_failed") {
          description += " " + (t("admin.whatsapp_partner_auth_failed" as any) || "Partner API: Authentication failed - check email/secret");
        } else if (data.partnerStatus === "failed") {
          description += " " + (t("admin.whatsapp_partner_failed" as any) || "Partner API (templates): Failed - check App ID");
        } else {
          description += " " + (t("admin.whatsapp_partner_not_configured" as any) || "Partner API (templates): Not configured");
        }
        toast({
          title: t("whatsapp.connectionSuccess" as any) || "Connection Successful",
          description,
        });
      } else {
        toast({
          title: t("whatsapp.connectionFailed" as any) || "Connection Failed",
          description: data.error || "Could not connect",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: t("whatsapp.connectionFailed" as any) || "Connection Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto touch-scroll">
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto touch-scroll">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-whatsapp-config-title">
            {t("admin.whatsapp_global_config" as any) || "WhatsApp Global Configuration"}
          </h1>
          <p className="text-muted-foreground">
            {t("admin.whatsapp_global_config_desc" as any) || "Configure Flowp's global Gupshup credentials for sending WhatsApp notifications to all tenants"}
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <MessageCircle className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2 flex-wrap">
                  {t("admin.whatsapp_gupshup_settings" as any) || "Gupshup API Settings"}
                  <Badge
                    variant={config?.enabled ? "default" : "secondary"}
                    data-testid="badge-global-whatsapp-status"
                  >
                    {config?.enabled
                      ? t("common.active" as any) || "Active"
                      : t("common.inactive" as any) || "Inactive"}
                  </Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t("admin.whatsapp_single_sender" as any) || "Single sender account used for all tenant notifications"}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <Shield className="w-4 h-4 text-muted-foreground mt-0.5" />
              <p className="text-xs text-muted-foreground">
                {t("admin.whatsapp_credentials_note" as any) || "These credentials are stored encrypted and used globally to send WhatsApp messages on behalf of all tenants. Tenants do not see or configure these."}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {t("whatsapp.gupshupCredentials" as any) || "Gupshup Credentials"}
              </span>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="global-api-key">
                  {t("whatsapp.apiKey" as any) || "Gupshup API Key"}
                </label>
                <Input
                  id="global-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    config?.hasApiKey
                      ? "********** (stored encrypted)"
                      : "Enter Gupshup API key"
                  }
                  data-testid="input-global-api-key"
                />
                <p className="text-xs text-muted-foreground">
                  {t("whatsapp.apiKeyNote" as any) || "Stored encrypted on our servers"}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="global-app-name">
                  {t("whatsapp.appName" as any) || "Gupshup App Name"}
                </label>
                <Input
                  id="global-app-name"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="FlowpAPP"
                  data-testid="input-global-app-name"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="global-sender-phone">
                  {t("whatsapp.senderPhone" as any) || "Sender Phone Number"}
                </label>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <Input
                    id="global-sender-phone"
                    value={senderPhone}
                    onChange={(e) => setSenderPhone(e.target.value)}
                    placeholder="+573001234567"
                    data-testid="input-global-sender-phone"
                  />
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {t("admin.whatsapp_partner_api" as any) || "Partner API (Template Management)"}
                </span>
              </div>

              <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
                <Shield className="w-4 h-4 text-muted-foreground mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  {t("admin.whatsapp_partner_note" as any) || "Partner API credentials are required for creating and managing WhatsApp message templates. Get these from the Gupshup Partner Portal (Settings > Generate Secret)."}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="partner-email">
                  {t("admin.whatsapp_partner_email" as any) || "Partner Email"}
                </label>
                <Input
                  id="partner-email"
                  type="email"
                  value={partnerEmail}
                  onChange={(e) => setPartnerEmail(e.target.value)}
                  placeholder="admin@yourcompany.com"
                  data-testid="input-partner-email"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="partner-secret">
                  {t("admin.whatsapp_partner_secret" as any) || "Client Secret"}
                </label>
                <Input
                  id="partner-secret"
                  type="password"
                  value={partnerSecret}
                  onChange={(e) => setPartnerSecret(e.target.value)}
                  placeholder={
                    config?.hasPartnerSecret
                      ? "********** (stored encrypted)"
                      : "Enter Gupshup client secret"
                  }
                  data-testid="input-partner-secret"
                />
                <p className="text-xs text-muted-foreground">
                  {t("admin.whatsapp_partner_secret_note" as any) || "Generated from Settings page in the Gupshup Partner Portal"}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="gupshup-app-id">
                  {t("admin.whatsapp_app_id" as any) || "Gupshup App ID"}
                </label>
                <Input
                  id="gupshup-app-id"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="a1b2c3d4-e5f6-..."
                  data-testid="input-gupshup-app-id"
                />
                <p className="text-xs text-muted-foreground">
                  {t("admin.whatsapp_app_id_note" as any) || "Found in your Gupshup WhatsApp Dashboard under App Settings"}
                </p>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">
                    {t("admin.whatsapp_enable_global" as any) || "Enable Global WhatsApp Service"}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.whatsapp_enable_global_desc" as any) || "When enabled, tenants with active WhatsApp add-on can receive notifications"}
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  data-testid="switch-global-whatsapp-enabled"
                />
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending || !config?.hasApiKey}
                data-testid="button-test-global-connection"
              >
                {testMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {t("whatsapp.testConnection" as any) || "Test Connection"}
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                data-testid="button-save-global-config"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {t("whatsapp.saveConfig" as any) || "Save Configuration"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
