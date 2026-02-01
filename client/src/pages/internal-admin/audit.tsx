import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, Search, User, Building2 } from "lucide-react";
import { internalAdminFetch } from "@/lib/internal-admin-context";

export default function InternalAdminAudit() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/internal-admin/audit", { search, action: actionFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append("query", search);
      if (actionFilter) params.append("action", actionFilter);
      const res = await internalAdminFetch(`/api/internal-admin/audit?${params.toString()}`);
      return res.json();
    },
  });

  const getActionBadge = (action: string) => {
    const colors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      TENANT_SUSPEND: "destructive",
      TENANT_UNSUSPEND: "default",
      CREDIT_ADJUST: "secondary",
      PACKAGE_ASSIGN: "default",
      INTEGRATION_TEST: "outline",
      DOC_RETRY: "secondary",
    };
    return <Badge variant={colors[action] || "outline"}>{action.replace(/_/g, " ")}</Badge>;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-testid="text-audit-title">Audit Log</h1>
        <Badge variant="outline">{data?.total ?? 0} entries</Badge>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Admin Actions
            </CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                  data-testid="input-search-audit"
                />
              </div>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm"
                data-testid="select-action-filter"
              >
                <option value="">All Actions</option>
                <option value="TENANT_SUSPEND">Tenant Suspend</option>
                <option value="TENANT_UNSUSPEND">Tenant Unsuspend</option>
                <option value="PACKAGE_ASSIGN">Package Assign</option>
                <option value="CREDIT_ADJUST">Credit Adjust</option>
                <option value="INTEGRATION_TEST">Integration Test</option>
                <option value="DOC_RETRY">Document Retry</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.logs?.map((log: any) => (
                <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                  <TableCell>{getActionBadge(log.actionType)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{log.actorInternalUserId?.slice(0, 8)}...</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {log.targetTenantId ? (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{log.targetTenantId.slice(0, 8)}...</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {log.details ? JSON.stringify(log.details).slice(0, 50) : "-"}
                    </span>
                  </TableCell>
                  <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {(!data?.logs || data.logs.length === 0) && !isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No audit logs found
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
