import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Building2, FileText, Package, AlertTriangle, Settings, CheckCircle, XCircle, Loader2, Wifi, WifiOff } from "lucide-react";
import { internalAdminFetch } from "@/lib/internal-admin-context";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function InternalAdminTenantDetail() {
  const { tenantId } = useParams<{ tenantId: string }>();
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

  const { data, isLoading } = useQuery({
    queryKey: ["/api/internal-admin/tenants", tenantId, "overview"],
    queryFn: async () => {
      const res = await internalAdminFetch(`/api/internal-admin/tenants/${tenantId}/overview`);
      return res.json();
    },
  });

  const { data: integrationData, isLoading: integrationLoading } = useQuery({
    queryKey: ["/api/internal-admin/tenants", tenantId, "integration"],
    queryFn: async () => {
      const res = await internalAdminFetch(`/api/internal-admin/tenants/${tenantId}/ebilling/integration`);
      const data = await res.json();
      if (data.integration?.baseUrl) {
        setMatiasConfig(prev => ({
          ...prev,
          baseUrl: data.integration.baseUrl || "",
          defaultResolutionNumber: data.integration.defaultResolutionNumber || "",
          defaultPrefix: data.integration.defaultPrefix || "",
          isEnabled: data.integration.status === "configured",
        }));
      }
      return data;
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (config: typeof matiasConfig) => {
      const res = await internalAdminFetch(`/api/internal-admin/tenants/${tenantId}/ebilling/integration/update`, {
        method: "POST",
        body: JSON.stringify(config),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "MATIAS configuration saved" });
        queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/tenants", tenantId] });
      } else {
        toast({ title: "Error", description: data.error || "Failed to save configuration", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const res = await internalAdminFetch(`/api/internal-admin/tenants/${tenantId}/ebilling/integration/test`, {
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
    if (!matiasConfig.baseUrl || !matiasConfig.email) {
      toast({ title: "Error", description: "URL and Email are required", variant: "destructive" });
      return;
    }
    saveConfigMutation.mutate(matiasConfig);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const tenant = data?.tenant;
  const subscription = data?.subscription;
  const usage = data?.usage;
  const integration = integrationData?.integration;

  const usagePercent = subscription && usage 
    ? Math.min(100, ((usage.documentsPosInvoice || 0) / (subscription.includedDocuments || 1)) * 100)
    : 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link href="/internal-admin/tenants">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-tenant-name">{tenant?.companyName || tenant?.name}</h1>
          <p className="text-sm text-muted-foreground">{tenantId}</p>
        </div>
        <Badge className="ml-auto" variant={tenant?.status === "active" ? "default" : "destructive"}>
          {tenant?.status}
        </Badge>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="ebilling" data-testid="tab-ebilling">E-Billing</TabsTrigger>
          <TabsTrigger value="matias" data-testid="tab-matias">MATIAS Config</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tenant Info</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="font-medium">{tenant?.type}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Country</dt>
                    <dd className="font-medium">{tenant?.country || "N/A"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Currency</dt>
                    <dd className="font-medium">{tenant?.currency || "USD"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="font-medium">{tenant?.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : "N/A"}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Subscription</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {subscription ? (
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Package</dt>
                      <dd className="font-medium">{subscription.packageName}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Included Docs</dt>
                      <dd className="font-medium">{subscription.includedDocuments}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Overage Policy</dt>
                      <dd className="font-medium">{subscription.overagePolicy}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">No subscription</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">MATIAS Integration</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {integration?.isConfigured ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className="text-sm font-medium">
                    {integration?.isConfigured ? "Configured" : "Not Configured"}
                  </span>
                </div>
                {integration?.baseUrl && (
                  <p className="mt-2 text-xs text-muted-foreground truncate">
                    {integration.baseUrl}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ebilling" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Usage This Period</CardTitle>
              <CardDescription>Document count vs. included in package</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Documents Used</span>
                <span className="text-sm font-medium">
                  {usage?.documentsPosInvoice || 0} / {subscription?.includedDocuments || 0}
                </span>
              </div>
              <Progress value={usagePercent} />
              {usagePercent >= 90 && (
                <div className="flex items-center gap-2 text-amber-500">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">Approaching limit</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usage by Document Type</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border p-4">
                  <dt className="text-sm text-muted-foreground">POS Documents</dt>
                  <dd className="text-2xl font-bold">{usage?.documentsPosInvoice || 0}</dd>
                </div>
                <div className="rounded-lg border p-4">
                  <dt className="text-sm text-muted-foreground">Credit Notes</dt>
                  <dd className="text-2xl font-bold">{usage?.documentsCreditNote || 0}</dd>
                </div>
                <div className="rounded-lg border p-4">
                  <dt className="text-sm text-muted-foreground">Debit Notes</dt>
                  <dd className="text-2xl font-bold">{usage?.documentsDebitNote || 0}</dd>
                </div>
                <div className="rounded-lg border p-4">
                  <dt className="text-sm text-muted-foreground">Support Docs</dt>
                  <dd className="text-2xl font-bold">{usage?.documentsSupportDoc || 0}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matias" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                MATIAS API Configuration
              </CardTitle>
              <CardDescription>
                Configure the connection to the MATIAS electronic billing API for this tenant
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  {integration?.isConfigured ? (
                    <Wifi className="h-6 w-6 text-green-500" />
                  ) : (
                    <WifiOff className="h-6 w-6 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium">Connection Status</p>
                    <p className="text-sm text-muted-foreground">
                      {integration?.isConfigured 
                        ? integration?.status === "configured" ? "Configured and enabled" : "Configured but disabled"
                        : "Not configured"
                      }
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => testConnectionMutation.mutate()}
                  disabled={!integration?.isConfigured || testConnectionMutation.isPending}
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
                    placeholder="https://api-v2.matias-api.com"
                    value={matiasConfig.baseUrl}
                    onChange={(e) => setMatiasConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                    data-testid="input-matias-url"
                  />
                  <p className="text-xs text-muted-foreground">The base URL for the MATIAS API endpoint</p>
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
                  <p className="text-xs text-muted-foreground">The email address used to authenticate with MATIAS</p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="flex gap-2">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder={integration?.hasPassword ? "••••••••" : "Enter password"}
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
                    {integration?.hasPassword 
                      ? "Password is already saved. Leave blank to keep the existing password."
                      : "The password for your MATIAS account. This will be encrypted before storage."
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
            </CardHeader>
            <CardContent>
              {data?.recentDocuments?.length > 0 ? (
                <div className="space-y-2">
                  {data.recentDocuments.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{doc.documentNumber}</p>
                        <p className="text-xs text-muted-foreground">{doc.documentKind}</p>
                      </div>
                      <Badge variant={doc.status === "ACCEPTED" ? "default" : doc.status === "REJECTED" ? "destructive" : "secondary"}>
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

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.alerts?.alerts?.length > 0 ? (
                <div className="space-y-2">
                  {data.alerts.alerts.map((alert: any) => (
                    <div key={alert.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{alert.alertType || alert.type}</p>
                        <p className="text-xs text-muted-foreground">{alert.message}</p>
                      </div>
                      <Badge variant={alert.acknowledgedAt ? "secondary" : "destructive"}>
                        {alert.acknowledgedAt ? "Acknowledged" : "New"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No alerts</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
