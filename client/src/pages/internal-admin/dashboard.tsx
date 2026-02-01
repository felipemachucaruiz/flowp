import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, FileText, AlertTriangle, Package, Users, CheckCircle, XCircle, Clock } from "lucide-react";
import { internalAdminFetch } from "@/lib/internal-admin-context";

interface DashboardStats {
  tenants?: { total?: number; active?: number; trial?: number; pastDue?: number; suspended?: number };
  documents?: { thisMonth?: number; accepted?: number };
  packages?: { active?: number };
}

interface Alert {
  id: string;
  alertType: string;
  message: string;
  acknowledgedAt: string | null;
}

interface AlertsResponse {
  alerts?: Alert[];
}

export default function InternalAdminDashboard() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/internal-admin/stats"],
    queryFn: () => internalAdminFetch("/api/internal-admin/stats").then(r => r.json()),
  });

  const { data: recentAlerts } = useQuery<AlertsResponse>({
    queryKey: ["/api/internal-admin/ebilling/alerts"],
    queryFn: () => internalAdminFetch("/api/internal-admin/ebilling/alerts").then(r => r.json()),
  });

  const statCards = [
    {
      title: "Total Tenants",
      value: stats?.tenants?.total ?? 0,
      description: `${stats?.tenants?.active ?? 0} active`,
      icon: Building2,
      color: "text-blue-500",
    },
    {
      title: "Documents This Month",
      value: stats?.documents?.thisMonth ?? 0,
      description: `${stats?.documents?.accepted ?? 0} accepted`,
      icon: FileText,
      color: "text-green-500",
    },
    {
      title: "Active Alerts",
      value: recentAlerts?.alerts?.filter((a: any) => !a.acknowledgedAt).length ?? 0,
      description: "Unacknowledged",
      icon: AlertTriangle,
      color: "text-amber-500",
    },
    {
      title: "Active Packages",
      value: stats?.packages?.active ?? 0,
      description: "Subscription plans",
      icon: Package,
      color: "text-purple-500",
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="mt-2 h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">Admin Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Tenant Status Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <StatusRow label="Active" count={stats?.tenants?.active ?? 0} icon={CheckCircle} color="text-green-500" />
              <StatusRow label="Trial" count={stats?.tenants?.trial ?? 0} icon={Clock} color="text-blue-500" />
              <StatusRow label="Past Due" count={stats?.tenants?.pastDue ?? 0} icon={AlertTriangle} color="text-amber-500" />
              <StatusRow label="Suspended" count={stats?.tenants?.suspended ?? 0} icon={XCircle} color="text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Recent Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(recentAlerts?.alerts?.length ?? 0) > 0 ? (
              <div className="space-y-3">
                {recentAlerts?.alerts?.slice(0, 5).map((alert) => (
                  <div key={alert.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{alert.alertType}</p>
                      <p className="text-xs text-muted-foreground">{alert.message}</p>
                    </div>
                    <Badge variant={alert.acknowledgedAt ? "secondary" : "destructive"}>
                      {alert.acknowledgedAt ? "Ack" : "New"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No alerts</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusRow({ label, count, icon: Icon, color }: { label: string; count: number; icon: any; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-sm">{label}</span>
      </div>
      <span className="font-semibold">{count}</span>
    </div>
  );
}
