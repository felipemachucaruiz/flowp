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
  ShoppingBag,
  Send,
  Loader2,
  Shield,
  Settings,
  Key,
  Link2,
} from "lucide-react";

interface GlobalShopifyConfig {
  hasClientId: boolean;
  hasClientSecret: boolean;
  enabled: boolean;
}

export default function AdminShopifyConfig() {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [enabled, setEnabled] = useState(false);

  const { data: config, isLoading } = useQuery<GlobalShopifyConfig>({
    queryKey: ["/api/internal-admin/shopify/global-config"],
    queryFn: async () => {
      const res = await adminFetch("/api/internal-admin/shopify/global-config");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { enabled };
      if (clientId) payload.clientId = clientId;
      if (clientSecret) payload.clientSecret = clientSecret;
      const res = await adminFetch("/api/internal-admin/shopify/global-config", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/shopify/global-config"] });
      setClientId("");
      setClientSecret("");
      toast({
        title: t("common.success" as any) || "Success",
        description: t("admin.shopify_config_saved" as any) || "Global Shopify app configuration saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error" as any) || "Error",
        description: error.message || t("common.save_failed" as any) || "Failed to save",
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
          <h1 className="text-2xl font-bold" data-testid="text-shopify-config-title">
            {t("admin.shopify_global_config" as any) || "Shopify App Configuration"}
          </h1>
          <p className="text-muted-foreground">
            {t("admin.shopify_global_config_desc" as any) || "Configure the Shopify App credentials that all tenants will use to connect their stores via OAuth"}
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <ShoppingBag className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2 flex-wrap">
                  {t("admin.shopify_app_credentials" as any) || "Shopify App Credentials"}
                  <Badge
                    variant={config?.enabled ? "default" : "secondary"}
                    data-testid="badge-global-shopify-status"
                  >
                    {config?.enabled
                      ? t("common.active" as any) || "Active"
                      : t("common.inactive" as any) || "Inactive"}
                  </Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t("admin.shopify_single_app" as any) || "Single app configuration used for all tenant OAuth connections"}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <Shield className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  {t("admin.shopify_credentials_note" as any) || "These credentials come from your Shopify Partner Dashboard or Custom App. They are stored encrypted and used globally so tenants only need to enter their store domain to connect."}
                </p>
                <p>
                  <strong>{t("admin.shopify_setup" as any) || "Setup"}:</strong>{" "}
                  {t("admin.shopify_setup_instructions" as any) || "Create a Shopify App in your Partner Dashboard, set the redirect URL to"}{" "}
                  <code className="bg-background px-1 py-0.5 rounded text-foreground">{window.location.origin}/api/shopify/oauth/callback</code>
                  {", "}
                  {t("admin.shopify_setup_copy" as any) || "and copy the Client ID and Client Secret here."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {t("admin.shopify_app_creds_label" as any) || "App Credentials"}
              </span>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="shopify-client-id">
                  {t("admin.shopify_client_id" as any) || "Client ID (API Key)"}
                </label>
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-muted-foreground" />
                  <Input
                    id="shopify-client-id"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder={
                      config?.hasClientId
                        ? `********** (${t("admin.stored_encrypted" as any) || "stored encrypted"})`
                        : t("admin.shopify_enter_client_id" as any) || "Enter Shopify App Client ID"
                    }
                    data-testid="input-global-shopify-client-id"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("admin.shopify_client_id_help" as any) || "Found in Shopify Partner Dashboard under your app's API credentials"}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="shopify-client-secret">
                  {t("admin.shopify_client_secret" as any) || "Client Secret (API Secret Key)"}
                </label>
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-muted-foreground" />
                  <Input
                    id="shopify-client-secret"
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder={
                      config?.hasClientSecret
                        ? `********** (${t("admin.stored_encrypted" as any) || "stored encrypted"})`
                        : t("admin.shopify_enter_client_secret" as any) || "Enter Shopify App Client Secret"
                    }
                    data-testid="input-global-shopify-client-secret"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("admin.stored_encrypted" as any) || "Stored encrypted on our servers"}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">
                    {t("admin.shopify_enable_oauth" as any) || "Enable Shopify OAuth"}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.shopify_enable_oauth_desc" as any) || "When enabled, tenants with Shopify add-on can connect their stores via one-click OAuth"}
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  data-testid="switch-global-shopify-enabled"
                />
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                data-testid="button-save-shopify-global-config"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {t("admin.save_configuration" as any) || "Save Configuration"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
