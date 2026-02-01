import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { adminFetch } from "@/lib/admin-fetch";
import { AlertTriangle, Check, Bell, Filter } from "lucide-react";

export default function AdminAlerts() {
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/internal-admin/ebilling/alerts", { ack: showAcknowledged ? "true" : "false" }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (!showAcknowledged) params.append("ack", "false");
      const res = await adminFetch(`/api/internal-admin/ebilling/alerts?${params.toString()}`);
      return res.json();
    },
  });

  const ackMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return adminFetch(`/api/internal-admin/ebilling/alerts/${alertId}/acknowledge`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/ebilling/alerts"] });
      toast({ title: "Alert acknowledged" });
    },
  });

  const getAlertTypeIcon = (type: string) => {
    if (type.includes("usage")) return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    if (type.includes("limit")) return <AlertTriangle className="h-5 w-5 text-red-500" />;
    return <Bell className="h-5 w-5 text-blue-500" />;
  };

  const getAlertTypeBadge = (type: string) => {
    if (type.includes("100") || type.includes("limit")) {
      return <Badge variant="destructive">Critical</Badge>;
    }
    if (type.includes("90")) {
      return <Badge variant="destructive">Warning</Badge>;
    }
    if (type.includes("70")) {
      return <Badge variant="secondary">Notice</Badge>;
    }
    return <Badge variant="outline">{type}</Badge>;
  };

  return (
    <div className="h-full overflow-y-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-testid="text-alerts-title">E-Billing Alerts</h1>
        <div className="flex items-center gap-2">
          <Button
            variant={showAcknowledged ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAcknowledged(!showAcknowledged)}
            data-testid="button-toggle-acknowledged"
          >
            <Filter className="mr-2 h-4 w-4" />
            {showAcknowledged ? "Show All" : "Hide Acknowledged"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {data?.alerts?.map((alert: any) => (
          <Card key={alert.id} className={alert.acknowledgedAt ? "opacity-60" : ""}>
            <CardContent className="flex items-start gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                {getAlertTypeIcon(alert.alertType)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{alert.alertType.replace(/_/g, " ")}</span>
                  {getAlertTypeBadge(alert.alertType)}
                  {alert.acknowledgedAt && <Badge variant="outline">Acknowledged</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Tenant: {alert.tenantId?.slice(0, 8)}...</span>
                  <span>Created: {new Date(alert.createdAt).toLocaleString()}</span>
                  {alert.acknowledgedAt && (
                    <span>Ack: {new Date(alert.acknowledgedAt).toLocaleString()}</span>
                  )}
                </div>
              </div>
              {!alert.acknowledgedAt && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => ackMutation.mutate(alert.id)}
                  disabled={ackMutation.isPending}
                  data-testid={`button-ack-alert-${alert.id}`}
                >
                  <Check className="mr-2 h-4 w-4" />
                  Acknowledge
                </Button>
              )}
            </CardContent>
          </Card>
        ))}

        {(!data?.alerts || data.alerts.length === 0) && !isLoading && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Bell className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No alerts</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
