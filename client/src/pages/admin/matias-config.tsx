import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { adminFetch } from "@/lib/admin-fetch";
import { Settings, Wifi, WifiOff, Loader2, CheckCircle, AlertTriangle } from "lucide-react";

export default function AdminMatiasConfig() {
  const { toast } = useToast();
  
  const [matiasConfig, setMatiasConfig] = useState({
    baseUrl: "https://api.matias.com",
    clientId: "",
    clientSecret: "",
    isEnabled: true,
    skipSSL: false,
  });
  const [showSecret, setShowSecret] = useState(false);

  const { data: configData, isLoading } = useQuery({
    queryKey: ["/api/internal-admin/matias/config"],
    queryFn: async () => {
      const res = await adminFetch("/api/internal-admin/matias/config");
      if (!res.ok) return null;
      return res.json();
    },
  });

  useEffect(() => {
    if (configData?.config) {
      setMatiasConfig(prev => ({
        ...prev,
        baseUrl: configData.config.baseUrl || "https://api.matias.com",
        clientId: configData.config.clientId || "",
        isEnabled: configData.config.isEnabled ?? true,
        skipSSL: configData.config.skipSSL ?? false,
      }));
    }
  }, [configData]);

  const saveConfigMutation = useMutation({
    mutationFn: async (config: typeof matiasConfig) => {
      const res = await adminFetch("/api/internal-admin/matias/config", {
        method: "POST",
        body: JSON.stringify(config),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Global MATIAS configuration saved" });
        queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/matias/config"] });
      } else {
        toast({ title: "Error", description: data.error || "Failed to save", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch("/api/internal-admin/matias/test-connection", {
        method: "POST",
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Connection successful", description: data.message });
      } else {
        toast({ title: "Connection failed", description: data.message || data.error, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Connection error", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveConfig = () => {
    if (!matiasConfig.baseUrl || !matiasConfig.clientId) {
      toast({ title: "Error", description: "API URL and Client ID are required", variant: "destructive" });
      return;
    }
    saveConfigMutation.mutate(matiasConfig);
  };

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isConfigured = configData?.config?.isEnabled && configData?.config?.clientId;

  return (
    <div className="h-full overflow-y-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-matias-config-title">
          MATIAS Global Configuration
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure the MATIAS API credentials used for all tenants
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            API Configuration
          </CardTitle>
          <CardDescription>
            These credentials are used globally for all tenant e-billing submissions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              {isConfigured ? (
                <Wifi className="h-6 w-6 text-green-500" />
              ) : (
                <WifiOff className="h-6 w-6 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium">Connection Status</p>
                <p className="text-sm text-muted-foreground">
                  {isConfigured ? "Configured and enabled" : "Not configured"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => testConnectionMutation.mutate()}
              disabled={!isConfigured || testConnectionMutation.isPending}
              data-testid="button-test-connection"
            >
              {testConnectionMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Test Connection
            </Button>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="baseUrl">API URL</Label>
              <Input
                id="baseUrl"
                placeholder="https://api.matias.com"
                value={matiasConfig.baseUrl}
                onChange={(e) => setMatiasConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                data-testid="input-matias-url"
              />
              <p className="text-xs text-muted-foreground">The base URL for the MATIAS API</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="clientId">Client ID</Label>
              <Input
                id="clientId"
                placeholder="YOUR_CLIENT_ID"
                value={matiasConfig.clientId}
                onChange={(e) => setMatiasConfig(prev => ({ ...prev, clientId: e.target.value }))}
                data-testid="input-matias-client-id"
              />
              <p className="text-xs text-muted-foreground">Your MATIAS OAuth Client ID</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="clientSecret">Client Secret</Label>
              <div className="flex gap-2">
                <Input
                  id="clientSecret"
                  type={showSecret ? "text" : "password"}
                  placeholder={configData?.config?.hasClientSecret ? "••••••••" : "Enter client secret"}
                  value={matiasConfig.clientSecret}
                  onChange={(e) => setMatiasConfig(prev => ({ ...prev, clientSecret: e.target.value }))}
                  data-testid="input-matias-client-secret"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? "Hide" : "Show"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {configData?.config?.hasClientSecret 
                  ? "Client secret is saved. Leave blank to keep existing."
                  : "Your MATIAS OAuth Client Secret (encrypted before storage)"
                }
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">Enable Integration</p>
                <p className="text-sm text-muted-foreground">
                  When enabled, electronic documents will be submitted to MATIAS
                </p>
              </div>
              <Switch
                checked={matiasConfig.isEnabled}
                onCheckedChange={(checked) => setMatiasConfig(prev => ({ ...prev, isEnabled: checked }))}
                data-testid="switch-matias-enabled"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium">Skip SSL Verification</p>
                  <p className="text-sm text-muted-foreground">
                    Enable this if the MATIAS API has SSL certificate issues. Not recommended for production.
                  </p>
                </div>
              </div>
              <Switch
                checked={matiasConfig.skipSSL}
                onCheckedChange={(checked) => setMatiasConfig(prev => ({ ...prev, skipSSL: checked }))}
                data-testid="switch-skip-ssl"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              onClick={handleSaveConfig}
              disabled={saveConfigMutation.isPending}
              data-testid="button-save-matias-config"
            >
              {saveConfigMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Save Configuration
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Documentation</CardTitle>
          <CardDescription>Reference documentation for the MATIAS API</CardDescription>
        </CardHeader>
        <CardContent>
          <a 
            href="https://documenter.getpostman.com/view/8699065/2s9YyvBLby" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            View MATIAS API Documentation (Postman)
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
