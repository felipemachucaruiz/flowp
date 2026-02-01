import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { FileText, CheckCircle, XCircle, Settings, ExternalLink, AlertTriangle } from "lucide-react";

export default function AdminEbillingPage() {
  const { tenant } = useAuth();
  const { t } = useI18n();

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
    <div className="space-y-6 p-6">
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
                : "Contact support to configure MATIAS integration"
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

      {!isConfigured && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" />
              Configuration Required
            </CardTitle>
            <CardDescription className="text-amber-600 dark:text-amber-400">
              MATIAS integration needs to be configured by an administrator before you can submit electronic documents to DIAN.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Please contact your Flowp administrator to set up electronic billing credentials.
            </p>
          </CardContent>
        </Card>
      )}

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
                      {doc.documentKind} - {new Date(doc.createdAt).toLocaleDateString()}
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
    </div>
  );
}
