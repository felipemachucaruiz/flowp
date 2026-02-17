import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { 
  FileText, CheckCircle, XCircle, Clock, AlertTriangle, 
  Search, Eye, Download, RefreshCw, Settings, Plus
} from "lucide-react";
import { Link } from "wouter";

export default function ElectronicBillingPage() {
  const { tenant, user } = useAuth();
  const { t, language } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  
  const tenantId = tenant?.id || user?.tenantId || "";

  const getAuthHeaders = () => {
    const headers: Record<string, string> = { "x-tenant-id": tenantId };
    if (user?.id) headers["x-user-id"] = user.id;
    return headers;
  };

  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ["/api/tenant/ebilling/status", tenantId],
    queryFn: async () => {
      const res = await fetch("/api/tenant/ebilling/status", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!tenantId && !!user?.id,
  });

  const { data: documentsData, isLoading: docsLoading, refetch } = useQuery({
    queryKey: ["/api/tenant/ebilling/documents", tenantId, { search, status: statusFilter, kind: kindFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append("query", search);
      if (statusFilter) params.append("status", statusFilter);
      if (kindFilter) params.append("kind", kindFilter);
      const res = await fetch(`/api/tenant/ebilling/documents?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return { documents: [], stats: {} };
      return res.json();
    },
    enabled: !!tenantId && !!user?.id,
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const localeMap: Record<string, string> = { en: "en-US", es: "es-CO", pt: "pt-BR" };
    return new Date(dateStr).toLocaleDateString(localeMap[language] || "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      ACCEPTED: "default",
      PENDING: "secondary",
      SENT: "secondary",
      REJECTED: "destructive",
      FAILED: "destructive",
    };
    const icons: Record<string, any> = {
      ACCEPTED: <CheckCircle className="h-3 w-3 mr-1" />,
      PENDING: <Clock className="h-3 w-3 mr-1" />,
      SENT: <Clock className="h-3 w-3 mr-1" />,
      REJECTED: <XCircle className="h-3 w-3 mr-1" />,
      FAILED: <AlertTriangle className="h-3 w-3 mr-1" />,
    };
    const labels: Record<string, string> = {
      ACCEPTED: t("ebilling.status.accepted"),
      PENDING: t("ebilling.status.pending"),
      SENT: t("ebilling.status.sent"),
      REJECTED: t("ebilling.status.rejected"),
      FAILED: t("ebilling.status.failed"),
    };
    return (
      <Badge variant={variants[status] || "outline"} className="flex items-center w-fit">
        {icons[status]}
        {labels[status] || status}
      </Badge>
    );
  };

  const getDocumentKindLabel = (kind: string) => {
    const kindLabels: Record<string, string> = {
      pos_invoice: t("ebilling.docType.posInvoice"),
      invoice: t("ebilling.docType.invoice"),
      credit_note: t("ebilling.docType.creditNote"),
      debit_note: t("ebilling.docType.debitNote"),
      support_doc: t("ebilling.docType.supportDoc"),
    };
    return kindLabels[kind] || kind;
  };

  if (statusLoading) {
    return (
      <div className="h-full overflow-y-auto space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const isConfigured = statusData?.configured || false;
  const stats = documentsData?.stats || {};

  return (
    <div className="h-full overflow-y-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-ebilling-title">
            {t("ebilling.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("ebilling.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isConfigured && (
            <Link href="/electronic-billing/support-doc">
              <Button data-testid="button-new-support-doc">
                <Plus className="h-4 w-4 mr-2" />
                {t("ebilling.supportDoc.create")}
              </Button>
            </Link>
          )}
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {!isConfigured && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" />
              {t("ebilling.notEnabled")}
            </CardTitle>
            <CardDescription className="text-amber-600 dark:text-amber-400">
              {t("ebilling.notEnabledDesc")}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("ebilling.stats.total")}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-stat-total">
              {stats.total || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("ebilling.stats.totalDesc")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("ebilling.stats.accepted")}</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-stat-accepted">
              {stats.accepted || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("ebilling.stats.acceptedDesc")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("ebilling.stats.pending")}</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600" data-testid="text-stat-pending">
              {stats.pending || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("ebilling.stats.pendingDesc")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("ebilling.stats.rejected")}</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="text-stat-rejected">
              {(stats.rejected || 0) + (stats.failed || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("ebilling.stats.rejectedDesc")}
            </p>
          </CardContent>
        </Card>
      </div>

      {isConfigured && statusData && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {t("ebilling.config.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">{t("ebilling.config.resolution")}</p>
                <p className="font-medium">{statusData.resolution || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("ebilling.config.prefix")}</p>
                <p className="font-medium">{statusData.prefix || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("ebilling.config.currentNumber")}</p>
                <p className="font-medium">{statusData.currentNumber || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("ebilling.config.endingNumber")}</p>
                <p className="font-medium">{statusData.endingNumber || "-"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t("ebilling.documents.title")}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("common.search")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-40"
                  data-testid="input-search-docs"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm bg-background"
                data-testid="select-status"
              >
                <option value="">{t("ebilling.filter.allStatus")}</option>
                <option value="PENDING">{t("ebilling.status.pending")}</option>
                <option value="SENT">{t("ebilling.status.sent")}</option>
                <option value="ACCEPTED">{t("ebilling.status.accepted")}</option>
                <option value="REJECTED">{t("ebilling.status.rejected")}</option>
                <option value="FAILED">{t("ebilling.status.failed")}</option>
              </select>
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm bg-background"
                data-testid="select-kind"
              >
                <option value="">{t("ebilling.filter.allTypes")}</option>
                <option value="pos_invoice">{t("ebilling.docType.posInvoice")}</option>
                <option value="invoice">{t("ebilling.docType.invoice")}</option>
                <option value="credit_note">{t("ebilling.docType.creditNote")}</option>
                <option value="debit_note">{t("ebilling.docType.debitNote")}</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {docsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ebilling.table.documentNumber")}</TableHead>
                  <TableHead>{t("ebilling.table.type")}</TableHead>
                  <TableHead>{t("ebilling.table.status")}</TableHead>
                  <TableHead>{t("ebilling.table.cufe")}</TableHead>
                  <TableHead>{t("ebilling.table.date")}</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentsData?.documents?.map((doc: any) => (
                  <TableRow key={doc.id} data-testid={`row-doc-${doc.id}`}>
                    <TableCell className="font-medium">
                      {doc.prefix}{doc.documentNumber || doc.orderNumber || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getDocumentKindLabel(doc.kind)}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(doc.status)}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {doc.cufe ? `${doc.cufe.slice(0, 12)}...` : "-"}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(doc.createdAt)}</TableCell>
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!documentsData?.documents || documentsData.documents.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {t("ebilling.noDocuments")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("ebilling.detail.title")}</DialogTitle>
            <DialogDescription>{t("ebilling.detail.subtitle")}</DialogDescription>
          </DialogHeader>
          {selectedDoc && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t("ebilling.table.documentNumber")}</dt>
                  <dd className="font-medium">{selectedDoc.prefix}{selectedDoc.documentNumber}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("ebilling.table.status")}</dt>
                  <dd>{getStatusBadge(selectedDoc.status)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("ebilling.table.type")}</dt>
                  <dd className="font-medium">{getDocumentKindLabel(selectedDoc.kind)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("ebilling.config.resolution")}</dt>
                  <dd className="font-medium">{selectedDoc.resolutionNumber || "-"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">{t("ebilling.table.cufe")}</dt>
                  <dd className="break-all text-xs font-mono">{selectedDoc.cufe || "-"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("ebilling.detail.created")}</dt>
                  <dd className="font-medium">{formatDate(selectedDoc.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("ebilling.detail.submitted")}</dt>
                  <dd className="font-medium">{formatDate(selectedDoc.submittedAt)}</dd>
                </div>
                {selectedDoc.acceptedAt && (
                  <div>
                    <dt className="text-muted-foreground">{t("ebilling.detail.accepted")}</dt>
                    <dd className="font-medium">{formatDate(selectedDoc.acceptedAt)}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">{t("ebilling.detail.retries")}</dt>
                  <dd className="font-medium">{selectedDoc.retryCount || 0}</dd>
                </div>
              </dl>
              {selectedDoc.errorMessage && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                  <p className="text-sm font-medium text-destructive">{t("ebilling.detail.error")}</p>
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
