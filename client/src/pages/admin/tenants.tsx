import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Building2, Search, MoreHorizontal, Ban, CheckCircle } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Tenant {
  id: string;
  name: string;
  type: "retail" | "restaurant";
  status: "trial" | "active" | "past_due" | "suspended" | "cancelled";
  currency: string;
  createdAt: string;
}

export default function AdminTenants() {
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const { data: tenants, isLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/internal/tenants"],
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return apiRequest(`/api/internal/tenants/${id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal/tenants"] });
      toast({ title: "Tenant suspended successfully" });
    },
    onError: () => {
      toast({ title: "Failed to suspend tenant", variant: "destructive" });
    },
  });

  const unsuspendMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/internal/tenants/${id}/unsuspend`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal/tenants"] });
      toast({ title: "Tenant unsuspended successfully" });
    },
    onError: () => {
      toast({ title: "Failed to unsuspend tenant", variant: "destructive" });
    },
  });

  const filteredTenants = tenants?.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500">Active</Badge>;
      case "trial":
        return <Badge variant="secondary">Trial</Badge>;
      case "suspended":
        return <Badge variant="destructive">Suspended</Badge>;
      case "past_due":
        return <Badge className="bg-yellow-500">Past Due</Badge>;
      case "cancelled":
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-tenants">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="admin-tenants">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-tenants-title">Tenants</h1>
          <p className="text-muted-foreground">Manage all customer accounts</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tenants..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search-tenants"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTenants?.map((tenant) => (
                <TableRow key={tenant.id} data-testid={`row-tenant-${tenant.id}`}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {tenant.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {tenant.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(tenant.status)}</TableCell>
                  <TableCell>{tenant.currency}</TableCell>
                  <TableCell>
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-tenant-actions-${tenant.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {tenant.status !== "suspended" ? (
                          <DropdownMenuItem
                            onClick={() =>
                              suspendMutation.mutate({
                                id: tenant.id,
                                reason: "Manual suspension by admin",
                              })
                            }
                            className="text-destructive"
                          >
                            <Ban className="h-4 w-4 mr-2" />
                            Suspend
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => unsuspendMutation.mutate(tenant.id)}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Unsuspend
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {(!filteredTenants || filteredTenants.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
