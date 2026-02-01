import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { internalAdminFetch } from "@/lib/internal-admin-context";
import { Building2, Search, ExternalLink, Ban, CheckCircle } from "lucide-react";

export default function InternalAdminTenants() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/internal-admin/tenants", { search, status: statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append("query", search);
      if (statusFilter) params.append("status", statusFilter);
      const res = await internalAdminFetch(`/api/internal-admin/tenants?${params.toString()}`);
      return res.json();
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      return internalAdminFetch(`/api/internal-admin/tenants/${tenantId}/suspend`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/tenants"] });
      toast({ title: "Tenant suspended" });
    },
  });

  const unsuspendMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      return internalAdminFetch(`/api/internal-admin/tenants/${tenantId}/unsuspend`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/tenants"] });
      toast({ title: "Tenant unsuspended" });
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      trial: "secondary",
      past_due: "destructive",
      suspended: "destructive",
      cancelled: "outline",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Tenants</h1>
        </div>
        <Card>
          <CardContent className="p-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="mb-4 h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-testid="text-tenants-title">Tenants</h1>
        <Badge variant="outline">{data?.total ?? 0} total</Badge>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              All Tenants
            </CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                  data-testid="input-search-tenants"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm"
                data-testid="select-status-filter"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="past_due">Past Due</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.tenants?.map((tenant: any) => (
                <TableRow key={tenant.id} data-testid={`row-tenant-${tenant.id}`}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{tenant.companyName}</p>
                      <p className="text-xs text-muted-foreground">{tenant.id.slice(0, 8)}...</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{tenant.type}</Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(tenant.status)}</TableCell>
                  <TableCell>{new Date(tenant.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/internal-admin/tenants/${tenant.id}`}>
                        <Button size="sm" variant="outline" data-testid={`button-view-tenant-${tenant.id}`}>
                          <ExternalLink className="mr-1 h-3 w-3" />
                          View
                        </Button>
                      </Link>
                      {tenant.status === "suspended" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => unsuspendMutation.mutate(tenant.id)}
                          disabled={unsuspendMutation.isPending}
                          data-testid={`button-unsuspend-${tenant.id}`}
                        >
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Unsuspend
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => suspendMutation.mutate(tenant.id)}
                          disabled={suspendMutation.isPending}
                          data-testid={`button-suspend-${tenant.id}`}
                        >
                          <Ban className="mr-1 h-3 w-3" />
                          Suspend
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!data?.tenants || data.tenants.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No tenants found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
