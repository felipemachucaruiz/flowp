import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { adminFetch } from "@/lib/admin-fetch";
import { FileText, Search, RefreshCw, Download, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";

export default function AdminDocuments() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const { toast } = useToast();
  const { t, language } = useI18n();
  const locale = language === "es" ? "es-ES" : language === "pt" ? "pt-BR" : "en-US";

  const { data, isLoading } = useQuery({
    queryKey: ["/api/internal-admin/ebilling/documents", { search, status: statusFilter, kind: kindFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append("query", search);
      if (statusFilter) params.append("status", statusFilter);
      if (kindFilter) params.append("kind", kindFilter);
      const res = await adminFetch(`/api/internal-admin/ebilling/documents?${params.toString()}`);
      return res.json();
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (docId: string) => {
      return adminFetch(`/api/internal-admin/ebilling/documents/${docId}/retry`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/ebilling/documents"] });
      toast({ title: "Document queued for retry" });
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      ACCEPTED: "default",
      PENDING: "secondary",
      SENT: "secondary",
      REJECTED: "destructive",
      FAILED: "destructive",
    };
    const labels: Record<string, string> = {
      ACCEPTED: t("ebilling.status.accepted"),
      PENDING: t("ebilling.status.pending"),
      SENT: t("ebilling.status.sent"),
      REJECTED: t("ebilling.status.rejected"),
      FAILED: t("ebilling.status.failed"),
    };
    return <Badge variant={variants[status] || "outline"}>{labels[status] || status}</Badge>;
  };

  return (
    <div className="h-full overflow-y-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-testid="text-documents-title">E-Billing Documents</h1>
        <Badge variant="outline">{data?.total ?? 0} total</Badge>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              All Documents
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                  data-testid="input-search-docs"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm"
                data-testid="select-status"
              >
                <option value="">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="SENT">Sent</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="REJECTED">Rejected</option>
                <option value="FAILED">Failed</option>
              </select>
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm"
                data-testid="select-kind"
              >
                <option value="">All Types</option>
                <option value="pos_invoice">POS Invoice</option>
                <option value="invoice">Invoice</option>
                <option value="credit_note">Credit Note</option>
                <option value="debit_note">Debit Note</option>
                <option value="support_doc">Support Doc</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document #</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>CUFE</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.documents?.map((doc: any) => (
                <TableRow key={doc.id} data-testid={`row-doc-${doc.id}`}>
                  <TableCell className="font-medium">{doc.documentNumber}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{doc.tenantId?.slice(0, 8)}...</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{doc.documentKind}</Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(doc.status)}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{doc.cufe?.slice(0, 12)}...</span>
                  </TableCell>
                  <TableCell>{new Date(doc.createdAt).toLocaleString(locale)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setSelectedDoc(doc)}
                        data-testid={`button-view-doc-${doc.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {(doc.status === "REJECTED" || doc.status === "FAILED") && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => retryMutation.mutate(doc.id)}
                          disabled={retryMutation.isPending}
                          data-testid={`button-retry-doc-${doc.id}`}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      )}
                      {doc.status === "ACCEPTED" && (
                        <a href={`/api/internal-admin/ebilling/documents/${doc.id}/pdf`} target="_blank" rel="noreferrer">
                          <Button size="icon" variant="ghost" data-testid={`button-download-doc-${doc.id}`}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!data?.documents || data.documents.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No documents found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Document Details</DialogTitle>
            <DialogDescription>Full document information</DialogDescription>
          </DialogHeader>
          {selectedDoc && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Document Number</dt>
                  <dd className="font-medium">{selectedDoc.documentNumber}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{getStatusBadge(selectedDoc.status)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Type</dt>
                  <dd className="font-medium">{selectedDoc.documentKind}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">CUFE</dt>
                  <dd className="break-all text-xs">{selectedDoc.cufe || "N/A"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="font-medium">{new Date(selectedDoc.createdAt).toLocaleString(locale)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Retries</dt>
                  <dd className="font-medium">{selectedDoc.retryCount || 0}</dd>
                </div>
              </dl>
              {selectedDoc.errorMessage && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                  <p className="text-sm font-medium text-destructive">Error Message</p>
                  <p className="mt-1 text-sm">{selectedDoc.errorMessage}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
