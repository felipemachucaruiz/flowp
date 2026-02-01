import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { FileText, CheckCircle, XCircle, Settings, Wifi, WifiOff, Loader2 } from "lucide-react";

export default function AdminEbillingPage() {
  const { tenant } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();

  const [matiasConfig, setMatiasConfig] = useState({
    baseUrl: "",
    email: "",
    password: "",
    defaultResolutionNumber: "",
    defaultPrefix: "",
    isEnabled: true,
  });
  const [showPassword, setShowPassword] = useState(false);

  const { data: integrationStatus, isLoading } = useQuery({
    queryKey: ["/api/billing/matias/status", tenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/billing/matias/status", {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!tenant?.id,
  });

  const { data: configData } = useQuery({
    queryKey: ["/api/billing/matias/config", tenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/billing/matias/config", {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!tenant?.id,
  });

  useEffect(() => {
    if (configData?.config) {
      setMatiasConfig(prev => ({
        ...prev,
        baseUrl: configData.config.baseUrl || "",
        email: configData.config.email || "",
        defaultResolutionNumber: configData.config.defaultResolutionNumber || "",
        defaultPrefix: configData.config.defaultPrefix || "",
        isEnabled: configData.config.isEnabled ?? true,
      }));
    }
  }, [configData]);

  const { data: recentDocs } = useQuery({
    queryKey: ["/api/billing/matias/documents", tenant?.id],
    queryFn: async () => {
      const res = await fetch("/api/billing/matias/documents?limit=10", {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      if (!res.ok) return { documents: [] };
      return res.json();
    },
    enabled: !!tenant?.id,
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (config: typeof matiasConfig) => {
      const res = await fetch("/api/billing/matias/config", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-tenant-id": tenant?.id || "",
        },
        body: JSON.stringify(config),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Configuration saved successfully" });
        queryClient.invalidateQueries({ queryKey: ["/api/billing/matias/status", tenant?.id] });
        queryClient.invalidateQueries({ queryKey: ["/api/billing/matias/config", tenant?.id] });
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
      const res = await fetch("/api/billing/matias/test-connection", {
        method: "POST",
        headers: { "x-tenant-id": tenant?.id || "" },
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
    if (!matiasConfig.baseUrl || !matiasConfig.email) {
      toast({ title: "Error", description: "API URL and Email are required", variant: "destructive" });
      return;
    }
    saveConfigMutation.mutate(matiasConfig);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  const isConfigured = integrationStatus?.configured || false;

  return (
    <div className="h-full overflow-y-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-ebilling-title">
            {t("admin.ebilling")}
          </h1>
          <p className="text-sm text-muted-foreground">
            DIAN Electronic Billing via MATIAS API
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="config" data-testid="tab-config">Configuration</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Integration Status</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {isConfigured ? (
                    <CheckCircle className="h-6 w-6 text-green-500" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-500" />
                  )}
                  <span className="text-lg font-bold">
                    {isConfigured ? "Connected" : "Not Configured"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {isConfigured 
                    ? "MATIAS integration is active" 
                    : "Go to Configuration tab to set up"
                  }
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Documents This Month</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {integrationStatus?.documentsThisMonth || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Electronic documents submitted
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {integrationStatus?.successRate || "N/A"}
                </div>
                <p className="text-xs text-muted-foreground">
                  DIAN acceptance rate
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="config" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                MATIAS API Configuration
              </CardTitle>
              <CardDescription>
                Configure the connection to the MATIAS electronic billing API
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
                    placeholder="https://api.matias-api.com"
                    value={matiasConfig.baseUrl}
                    onChange={(e) => setMatiasConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                    data-testid="input-matias-url"
                  />
                  <p className="text-xs text-muted-foreground">The base URL for the MATIAS API</p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email">Email / Username</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={matiasConfig.email}
                    onChange={(e) => setMatiasConfig(prev => ({ ...prev, email: e.target.value }))}
                    data-testid="input-matias-email"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="flex gap-2">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder={configData?.config?.hasPassword ? "••••••••" : "Enter password"}
                      value={matiasConfig.password}
                      onChange={(e) => setMatiasConfig(prev => ({ ...prev, password: e.target.value }))}
                      data-testid="input-matias-password"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {configData?.config?.hasPassword 
                      ? "Password is saved. Leave blank to keep existing."
                      : "Your MATIAS account password (encrypted before storage)"
                    }
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="defaultResolutionNumber">Resolution Number (optional)</Label>
                    <Input
                      id="defaultResolutionNumber"
                      placeholder="18760000001"
                      value={matiasConfig.defaultResolutionNumber}
                      onChange={(e) => setMatiasConfig(prev => ({ ...prev, defaultResolutionNumber: e.target.value }))}
                      data-testid="input-matias-resolution"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="defaultPrefix">Prefix (optional)</Label>
                    <Input
                      id="defaultPrefix"
                      placeholder="SETT"
                      value={matiasConfig.defaultPrefix}
                      onChange={(e) => setMatiasConfig(prev => ({ ...prev, defaultPrefix: e.target.value }))}
                      data-testid="input-matias-prefix"
                    />
                  </div>
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
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  onClick={handleSaveConfig}
                  disabled={saveConfigMutation.isPending}
                  data-testid="button-save-matias-config"
                >
                  {saveConfigMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Save Configuration
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Recent Documents
              </CardTitle>
              <CardDescription>
                Latest electronic documents submitted to DIAN
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentDocs?.documents?.length > 0 ? (
                <div className="space-y-2">
                  {recentDocs.documents.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{doc.documentNumber || doc.id}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.documentKind} - {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : "N/A"}
                        </p>
                      </div>
                      <Badge 
                        variant={
                          doc.status === "ACCEPTED" ? "default" : 
                          doc.status === "REJECTED" ? "destructive" : 
                          "secondary"
                        }
                      >
                        {doc.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No documents found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
