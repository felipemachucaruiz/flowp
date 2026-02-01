import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Building2, FileText, Package, AlertTriangle, Settings, CheckCircle, XCircle } from "lucide-react";
import { internalAdminFetch } from "@/lib/internal-admin-context";

export default function InternalAdminTenantDetail() {
  const { tenantId } = useParams<{ tenantId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/internal-admin/tenants", tenantId, "overview"],
    queryFn: async () => {
      const res = await internalAdminFetch(`/api/internal-admin/tenants/${tenantId}/overview`);
      return res.json();
    },
  });

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
  const integration = data?.integration;

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
          <h1 className="text-2xl font-bold" data-testid="text-tenant-name">{tenant?.companyName}</h1>
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
                  {integration?.configured ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className="text-sm font-medium">
                    {integration?.configured ? "Configured" : "Not Configured"}
                  </span>
                </div>
                {integration?.lastTest && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Last test: {new Date(integration.lastTest).toLocaleString()}
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

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Recent Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.recentDocs?.documents?.length > 0 ? (
                <div className="space-y-2">
                  {data.recentDocs.documents.map((doc: any) => (
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
                        <p className="text-sm font-medium">{alert.alertType}</p>
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
