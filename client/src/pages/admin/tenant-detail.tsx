import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Building2, FileText, Package, AlertTriangle, CheckCircle, XCircle, Settings, Wifi, WifiOff, Loader2, Clock, RefreshCw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminFetch } from "@/lib/admin-fetch";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function AdminTenantDetail() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { toast } = useToast();
  
  const [matiasConfig, setMatiasConfig] = useState({
    baseUrl: "https://api-v2.matias-api.com",
    email: "",
    password: "",
    defaultResolutionNumber: "",
    defaultPrefix: "",
    creditNoteResolutionNumber: "",
    creditNotePrefix: "",
    startingNumber: "",
    endingNumber: "",
    isEnabled: true,
  });
  const [showPassword, setShowPassword] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/internal-admin/tenants", tenantId, "overview"],
    queryFn: async () => {
      const res = await adminFetch(`/api/internal-admin/tenants/${tenantId}/overview`);
      return res.json();
    },
  });

  const { data: integrationData } = useQuery({
    queryKey: ["/api/internal-admin/tenants", tenantId, "integration"],
    queryFn: async () => {
      const res = await adminFetch(`/api/internal-admin/tenants/${tenantId}/ebilling/integration`);
      const data = await res.json();
      return data;
    },
  });

  const { data: documentsData, isLoading: documentsLoading } = useQuery({
    queryKey: ["/api/internal-admin/ebilling/documents", tenantId],
    queryFn: async () => {
      const res = await adminFetch(`/api/internal-admin/ebilling/documents?tenantId=${tenantId}&limit=20`);
      return res.json();
    },
  });

  useEffect(() => {
    if (integrationData?.integration) {
      setMatiasConfig(prev => ({
        ...prev,
        baseUrl: integrationData.integration.baseUrl || "https://api-v2.matias-api.com",
        email: integrationData.integration.email || "",
        defaultResolutionNumber: integrationData.integration.defaultResolutionNumber || "",
        defaultPrefix: integrationData.integration.defaultPrefix || "",
        creditNoteResolutionNumber: integrationData.integration.creditNoteResolutionNumber || "",
        creditNotePrefix: integrationData.integration.creditNotePrefix || "",
        startingNumber: integrationData.integration.startingNumber?.toString() || "",
        endingNumber: integrationData.integration.endingNumber?.toString() || "",
        isEnabled: integrationData.integration.status === "configured",
      }));
    }
  }, [integrationData]);

  const integration = integrationData?.integration;

  const saveConfigMutation = useMutation({
    mutationFn: async (config: typeof matiasConfig) => {
      const res = await adminFetch(`/api/internal-admin/tenants/${tenantId}/ebilling/integration/update`, {
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
      const res = await adminFetch(`/api/internal-admin/tenants/${tenantId}/ebilling/integration/test`, {
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
    if (!matiasConfig.email) {
      toast({ title: "Error", description: "Email is required", variant: "destructive" });
      return;
    }
    saveConfigMutation.mutate(matiasConfig);
  };

  const suspendMutation = useMutation({
    mutationFn: async () => {
      return adminFetch(`/api/internal-admin/tenants/${tenantId}/suspend`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/tenants", tenantId] });
      toast({ title: "Tenant suspended" });
    },
  });

  const unsuspendMutation = useMutation({
    mutationFn: async () => {
      return adminFetch(`/api/internal-admin/tenants/${tenantId}/unsuspend`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/tenants", tenantId] });
      toast({ title: "Tenant unsuspended" });
    },
  });

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const tenant = data?.tenant;
  const subscription = data?.subscription;
  const usage = data?.usage;

  const usagePercent = subscription && usage 
    ? Math.min(100, ((usage.documentsPosInvoice || 0) / (subscription.includedDocuments || 1)) * 100)
    : 0;

  return (
    <div className="h-full overflow-y-auto space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/tenants">
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

      <div className="flex gap-2">
        {tenant?.status === "active" ? (
          <Button 
            variant="destructive" 
            size="sm"
            onClick={() => suspendMutation.mutate()}
            disabled={suspendMutation.isPending}
          >
            Suspend Tenant
          </Button>
        ) : (
          <Button 
            variant="default" 
            size="sm"
            onClick={() => unsuspendMutation.mutate()}
            disabled={unsuspendMutation.isPending}
          >
            Unsuspend Tenant
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="ebilling" data-testid="tab-ebilling">E-Billing</TabsTrigger>
          <TabsTrigger value="matias" data-testid="tab-matias">MATIAS</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
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
                <CardTitle className="text-sm font-medium">Usage</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {usage ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Documents this period</span>
                      <span className="font-medium">{usage.documentsPosInvoice || 0}</span>
                    </div>
                    <Progress value={usagePercent} className="h-2" />
                    <p className="text-xs text-muted-foreground">{usagePercent.toFixed(0)}% of included</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No usage data</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ebilling" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>E-Billing Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {subscription ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span>{subscription ? "E-Billing enabled" : "No e-billing subscription"}</span>
              </div>
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

              <div className="flex items-center justify-between rounded-lg border p-4 mb-4">
                <div>
                  <p className="font-medium">Enable Integration</p>
                  <p className="text-sm text-muted-foreground">
                    Toggle to enable or disable MATIAS integration for this tenant
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={matiasConfig.isEnabled}
                    onChange={(e) => setMatiasConfig(prev => ({ ...prev, isEnabled: e.target.checked }))}
                    data-testid="toggle-matias-enabled"
                  />
                  <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              <div className="grid gap-4">
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="creditNoteResolutionNumber">Nota Crédito Resolution</Label>
                    <Input
                      id="creditNoteResolutionNumber"
                      placeholder="18760000002"
                      value={matiasConfig.creditNoteResolutionNumber}
                      onChange={(e) => setMatiasConfig(prev => ({ ...prev, creditNoteResolutionNumber: e.target.value }))}
                      data-testid="input-matias-credit-note-resolution"
                    />
                    <p className="text-xs text-muted-foreground">Resolución DIAN para notas crédito</p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="creditNotePrefix">Nota Crédito Prefix</Label>
                    <Input
                      id="creditNotePrefix"
                      placeholder="NC"
                      value={matiasConfig.creditNotePrefix}
                      onChange={(e) => setMatiasConfig(prev => ({ ...prev, creditNotePrefix: e.target.value }))}
                      data-testid="input-matias-credit-note-prefix"
                    />
                    <p className="text-xs text-muted-foreground">Prefijo para notas crédito (ej: NC)</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="startingNumber">Número Inicial</Label>
                    <Input
                      id="startingNumber"
                      type="number"
                      placeholder="1"
                      value={matiasConfig.startingNumber}
                      onChange={(e) => setMatiasConfig(prev => ({ ...prev, startingNumber: e.target.value }))}
                      data-testid="input-matias-starting-number"
                    />
                    <p className="text-xs text-muted-foreground">Primer número de factura autorizado</p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="endingNumber">Número Final</Label>
                    <Input
                      id="endingNumber"
                      type="number"
                      placeholder="5000"
                      value={matiasConfig.endingNumber}
                      onChange={(e) => setMatiasConfig(prev => ({ ...prev, endingNumber: e.target.value }))}
                      data-testid="input-matias-ending-number"
                    />
                    <p className="text-xs text-muted-foreground">Último número de factura autorizado</p>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    onClick={handleSaveConfig}
                    disabled={saveConfigMutation.isPending}
                    data-testid="button-save-matias"
                  >
                    {saveConfigMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Save Configuration
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Documents</CardTitle>
              <CardDescription>Electronic billing documents for this tenant</CardDescription>
            </CardHeader>
            <CardContent>
              {documentsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !documentsData?.documents?.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">No documents found for this tenant</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>CUFE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documentsData.documents.map((doc: any) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          {doc.prefix}{doc.documentNumber}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {doc.kind === "POS" ? "POS Invoice" : 
                             doc.kind === "INVOICE" ? "Invoice" :
                             doc.kind === "POS_CREDIT_NOTE" ? "Credit Note" :
                             doc.kind === "POS_DEBIT_NOTE" ? "Debit Note" :
                             doc.kind === "SUPPORT_DOC" ? "Support Doc" : doc.kind}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {doc.status === "SUCCESS" ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Success
                            </Badge>
                          ) : doc.status === "PENDING" ? (
                            <Badge variant="secondary">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          ) : doc.status === "RETRY" ? (
                            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Retry
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              {doc.status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[200px] truncate">
                          {doc.cufe ? doc.cufe.slice(0, 20) + "..." : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
