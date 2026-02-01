import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Building2, FileText, Package, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { adminFetch } from "@/lib/admin-fetch";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function AdminTenantDetail() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/internal-admin/tenants", tenantId, "overview"],
    queryFn: async () => {
      const res = await adminFetch(`/api/internal-admin/tenants/${tenantId}/overview`);
      return res.json();
    },
  });

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

        <TabsContent value="documents" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">View all documents in the Documents page</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
