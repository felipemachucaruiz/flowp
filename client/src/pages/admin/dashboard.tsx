import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, FileText, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

interface DashboardStats {
  tenants: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
  };
  electronicBilling: {
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    error: number;
  };
  support: {
    open: number;
    inProgress: number;
    pending: number;
  };
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/internal/dashboard"],
    enabled: true,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-dashboard">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="admin-dashboard">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">Management Portal</h1>
        <p className="text-muted-foreground">Internal admin dashboard for POS SaaS management</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-tenants-total">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.tenants?.total || 0}</div>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                {stats?.tenants?.active || 0} active
              </Badge>
              <Badge variant="outline" className="text-xs">
                {stats?.tenants?.trial || 0} trial
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-tenants-suspended">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suspended Tenants</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats?.tenants?.suspended || 0}</div>
            <p className="text-xs text-muted-foreground mt-2">Requires attention</p>
          </CardContent>
        </Card>

        <Card data-testid="card-ebilling-success">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">E-Billing Accepted</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.electronicBilling?.accepted || 0}</div>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {stats?.electronicBilling?.pending || 0} pending
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-ebilling-errors">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">E-Billing Errors</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {(stats?.electronicBilling?.rejected || 0) + (stats?.electronicBilling?.error || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Needs review</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="card-support-overview">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Support Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Open Tickets</span>
                <Badge variant="destructive">{stats?.support?.open || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">In Progress</span>
                <Badge variant="secondary">{stats?.support?.inProgress || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Pending Response</span>
                <Badge variant="outline">{stats?.support?.pending || 0}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-quick-actions">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Use the sidebar to navigate to:
              </p>
              <ul className="text-sm space-y-1 list-disc list-inside">
                <li>Tenants - Manage all customer accounts</li>
                <li>E-Billing - Monitor DIAN/Matias documents</li>
                <li>Support - Handle customer tickets</li>
                <li>Billing - Manage subscriptions & plans</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
