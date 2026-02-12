import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/currency";
import { CurrencyInput } from "@/components/currency-input";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DollarSign,
  Lock,
  Unlock,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  Eye,
  Plus,
  History,
  Banknote,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import type { Register, RegisterSession } from "@shared/schema";

interface SessionWithUser extends RegisterSession {
  userName?: string;
  closedByUserName?: string;
  movements?: any[];
}

const DENOMINATION_VALUES = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50];

function getDenominations(currency: string) {
  return DENOMINATION_VALUES.map(value => ({
    label: formatCurrency(value, currency),
    value,
  }));
}


function formatDate(date: string | Date | null | undefined, locale: string): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
}

export default function CashRegisterPage() {
  const { tenant } = useAuth();
  const { t, language } = useI18n();
  const { toast } = useToast();
  const { can } = usePermissions();
  const currency = tenant?.currency || "USD";
  const locale = language === "es" ? "es-CO" : language === "pt" ? "pt-BR" : "en-US";

  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [movementDialog, setMovementDialog] = useState(false);
  const [detailDialog, setDetailDialog] = useState(false);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<SessionWithUser | null>(null);
  const [selectedRegisterId, setSelectedRegisterId] = useState<string>("");
  const [openingCash, setOpeningCash] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [countedCard, setCountedCard] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [denominations, setDenominations] = useState<Record<string, number>>({});
  const [movementType, setMovementType] = useState<string>("cash_in");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const { data: registersData } = useQuery<{ registers: Register[]; maxRegisters: number; count: number }>({
    queryKey: ["/api/registers"],
    enabled: !!tenant?.id,
  });
  const registers = registersData?.registers || [];

  const { data: activeSession, isLoading: loadingSession } = useQuery<SessionWithUser | null>({
    queryKey: ["/api/register-sessions/active"],
    enabled: !!tenant?.id,
  });

  const { data: sessionHistory = [] } = useQuery<SessionWithUser[]>({
    queryKey: ["/api/register-sessions"],
    enabled: !!tenant?.id && showHistory,
  });

  const { data: activeMovements = [] } = useQuery<any[]>({
    queryKey: ["/api/register-sessions", activeSession?.id, "movements"],
    queryFn: async () => {
      if (!activeSession?.id) return [];
      const res = await fetch(`/api/register-sessions/${activeSession.id}/movements`, {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeSession?.id,
  });

  interface SessionSummary {
    totalOrders: number;
    totalSales: number;
    cashSales: number;
    cardSales: number;
    movementsIn: number;
    movementsOut: number;
    openingCash: number;
    expectedCash: number;
  }

  const { data: sessionSummary } = useQuery<SessionSummary>({
    queryKey: ["/api/register-sessions", activeSession?.id, "summary"],
    enabled: !!activeSession?.id,
  });

  const openMutation = useMutation({
    mutationFn: async (data: { registerId: string; openingCash: string }) => {
      return apiRequest("POST", "/api/register-sessions/open", data);
    },
    onSuccess: () => {
      toast({ title: t("cash_register.register_opened") });
      queryClient.invalidateQueries({ queryKey: ["/api/register-sessions/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/register-sessions"] });
      setOpenDialog(false);
      setOpeningCash("");
      setSelectedRegisterId("");
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (data: { countedCash: string; countedCard: string; denominationCounts?: Record<string, number>; notes?: string }) => {
      if (!activeSession?.id) throw new Error("No active session");
      return apiRequest("POST", `/api/register-sessions/${activeSession.id}/close`, data);
    },
    onSuccess: () => {
      toast({ title: t("cash_register.register_closed") });
      queryClient.invalidateQueries({ queryKey: ["/api/register-sessions/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/register-sessions"] });
      setCloseDialog(false);
      setCountedCash("");
      setCountedCard("");
      setCloseNotes("");
      setDenominations({});
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const movementMutation = useMutation({
    mutationFn: async (data: { type: string; amount: string; reason?: string }) => {
      if (!activeSession?.id) throw new Error("No active session");
      return apiRequest("POST", `/api/register-sessions/${activeSession.id}/movements`, data);
    },
    onSuccess: () => {
      toast({ title: t("cash_register.movement_added") });
      queryClient.invalidateQueries({ queryKey: ["/api/register-sessions", activeSession?.id, "movements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/register-sessions", activeSession?.id, "summary"] });
      setMovementDialog(false);
      setMovementAmount("");
      setMovementReason("");
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const currentDenominations = getDenominations(currency);
  const denominationTotal = Object.entries(denominations).reduce((sum, [key, count]) => {
    const denom = currentDenominations.find(d => String(d.value) === key);
    return sum + (denom ? denom.value * count : 0);
  }, 0);

  const handleDenominationChange = (value: string, count: string) => {
    const c = parseInt(count) || 0;
    setDenominations(prev => ({ ...prev, [value]: c }));
  };

  const applyDenominationTotal = () => {
    setCountedCash(String(denominationTotal));
  };

  const handleViewDetails = async (session: SessionWithUser) => {
    try {
      const res = await fetch(`/api/register-sessions/${session.id}`, {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      if (res.ok) {
        const detail = await res.json();
        setSelectedSessionDetail(detail);
        setDetailDialog(true);
      }
    } catch (error) {
      console.error("Failed to fetch session details", error);
    }
  };

  const getVarianceColor = (variance: string | number | null | undefined) => {
    const v = parseFloat(String(variance || "0"));
    if (v === 0) return "text-foreground";
    if (v > 0) return "text-green-600 dark:text-green-400";
    return "text-red-600 dark:text-red-400";
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto overflow-auto h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">{t("cash_register.title")}</h1>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={showHistory ? "default" : "outline"}
            onClick={() => setShowHistory(!showHistory)}
            data-testid="button-toggle-history"
          >
            <History className="w-4 h-4 mr-2" />
            {t("cash_register.session_history")}
          </Button>
        </div>
      </div>

      {/* Active Session Card */}
      <Card data-testid="card-active-session">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            {activeSession ? <Unlock className="w-5 h-5 text-green-500" /> : <Lock className="w-5 h-5 text-muted-foreground" />}
            {t("cash_register.active_session")}
          </CardTitle>
          {activeSession && (
            <Badge variant="default" className="bg-green-600" data-testid="badge-session-status">
              {t("cash_register.status_open")}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {loadingSession ? (
            <div className="animate-pulse text-muted-foreground">Loading...</div>
          ) : activeSession ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t("cash_register.opening_cash")}</p>
                  <p className="text-lg font-semibold" data-testid="text-opening-cash">{formatCurrency(parseFloat(String(activeSession.openingCash || "0")), currency)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("cash_register.opened_by")}</p>
                  <p className="text-lg font-semibold" data-testid="text-opened-by">{activeSession.userName || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("cash_register.opened_at")}</p>
                  <p className="text-lg font-semibold" data-testid="text-opened-at">{formatDate(activeSession.openedAt, locale)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("cash_register.movements")}</p>
                  <p className="text-lg font-semibold" data-testid="text-movements-count">{activeMovements.length}</p>
                </div>
              </div>

              {sessionSummary && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">{t("cash_register.cash_sales")}</p>
                      <p className="text-lg font-semibold text-green-600 dark:text-green-400" data-testid="text-cash-sales">{formatCurrency(sessionSummary.cashSales, currency)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t("cash_register.card_sales")}</p>
                      <p className="text-lg font-semibold" data-testid="text-card-sales">{formatCurrency(sessionSummary.cardSales, currency)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t("cash_register.total_sales")}</p>
                      <p className="text-lg font-semibold" data-testid="text-total-sales">{formatCurrency(sessionSummary.totalSales, currency)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t("cash_register.total_orders")}</p>
                      <p className="text-lg font-semibold" data-testid="text-total-orders">{sessionSummary.totalOrders}</p>
                    </div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-md">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{t("cash_register.expected_in_drawer")}</span>
                      <span className="text-lg font-bold text-green-600 dark:text-green-400" data-testid="text-expected-cash">
                        {formatCurrency(sessionSummary.expectedCash, currency)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("cash_register.expected_formula")}
                    </p>
                  </div>
                </>
              )}

              {activeMovements.length > 0 && (
                <div className="space-y-2">
                  <Separator />
                  <h4 className="text-sm font-medium">{t("cash_register.movements")}</h4>
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {activeMovements.map((m: any) => (
                      <div key={m.id} className="flex items-center justify-between text-sm py-1">
                        <div className="flex items-center gap-2">
                          {m.type === "cash_in" ? (
                            <ArrowDownCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <ArrowUpCircle className="w-4 h-4 text-red-500" />
                          )}
                          <span>{m.type === "cash_in" ? t("cash_register.deposit") : t("cash_register.withdrawal")}</span>
                          {m.reason && <span className="text-muted-foreground">- {m.reason}</span>}
                        </div>
                        <span className={m.type === "cash_in" ? "text-green-600 dark:text-green-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
                          {m.type === "cash_in" ? "+" : "-"}{formatCurrency(parseFloat(String(m.amount || "0")), currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                {can("cash_register.open_close") && (
                  <>
                    <Button onClick={() => setMovementDialog(true)} variant="outline" data-testid="button-add-movement">
                      <Plus className="w-4 h-4 mr-2" />
                      {t("cash_register.add_movement")}
                    </Button>
                    <Button onClick={() => setCloseDialog(true)} variant="destructive" data-testid="button-close-register">
                      <Lock className="w-4 h-4 mr-2" />
                      {t("cash_register.close_register")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 space-y-4">
              <Lock className="w-12 h-12 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">{t("cash_register.no_active_session")}</p>
              {can("cash_register.open_close") && (
                <Button onClick={() => setOpenDialog(true)} data-testid="button-open-register">
                  <Unlock className="w-4 h-4 mr-2" />
                  {t("cash_register.open_register")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session History */}
      {showHistory && (
        <Card data-testid="card-session-history">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              {t("cash_register.session_history")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sessionHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t("cash_register.no_sessions")}</p>
            ) : (
              <div className="space-y-3">
                {sessionHistory.map((session) => (
                  <div
                    key={session.id}
                    className="border rounded-md p-4 space-y-2"
                    data-testid={`card-session-${session.id}`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={session.status === "open" ? "default" : "secondary"}>
                          {session.status === "open" ? t("cash_register.status_open") : t("cash_register.status_closed")}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(session.openedAt, locale)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {session.status === "closed" && (
                          <div className="flex items-center gap-3 text-sm">
                            <span className="flex items-center gap-1">
                              <Banknote className="w-4 h-4" />
                              <span className={getVarianceColor(session.cashVariance)}>
                                {formatCurrency(parseFloat(String(session.cashVariance || "0")), currency)}
                              </span>
                            </span>
                            <span className="flex items-center gap-1">
                              <CreditCard className="w-4 h-4" />
                              <span className={getVarianceColor(session.cardVariance)}>
                                {formatCurrency(parseFloat(String(session.cardVariance || "0")), currency)}
                              </span>
                            </span>
                          </div>
                        )}
                        <Button variant="outline" size="sm" onClick={() => handleViewDetails(session)} data-testid={`button-view-session-${session.id}`}>
                          <Eye className="w-4 h-4 mr-1" />
                          {t("cash_register.view_details")}
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">{t("cash_register.opened_by")}: </span>
                        <span className="font-medium">{session.userName || "-"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t("cash_register.total_sales")}: </span>
                        <span className="font-medium">{formatCurrency(parseFloat(String(session.totalSales || "0")), currency)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t("cash_register.total_orders")}: </span>
                        <span className="font-medium">{session.totalOrders || 0}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t("cash_register.opening_cash")}: </span>
                        <span className="font-medium">{formatCurrency(parseFloat(String(session.openingCash || "0")), currency)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Open Register Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent data-testid="dialog-open-register">
          <DialogHeader>
            <DialogTitle>{t("cash_register.open_register")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("cash_register.select_register")}</Label>
              <Select value={selectedRegisterId} onValueChange={setSelectedRegisterId}>
                <SelectTrigger data-testid="select-register">
                  <SelectValue placeholder={t("cash_register.select_register")} />
                </SelectTrigger>
                <SelectContent>
                  {registers.map((reg) => (
                    <SelectItem key={reg.id} value={reg.id}>{reg.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("cash_register.opening_cash")}</Label>
              <p className="text-sm text-muted-foreground mb-2">{t("cash_register.enter_opening_cash")}</p>
              <CurrencyInput
                value={openingCash}
                onChange={(val) => setOpeningCash(val)}
                currency={currency}
                data-testid="input-opening-cash"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)} data-testid="button-cancel-open">
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => openMutation.mutate({ registerId: selectedRegisterId, openingCash })}
              disabled={!selectedRegisterId || openMutation.isPending}
              data-testid="button-confirm-open"
            >
              {openMutation.isPending ? "..." : t("cash_register.open_register")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Register Dialog */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-auto" data-testid="dialog-close-register">
          <DialogHeader>
            <DialogTitle>{t("cash_register.close_register")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {sessionSummary && (
              <div className="p-3 border rounded-md space-y-2 bg-muted/30" data-testid="close-dialog-summary">
                <h4 className="text-sm font-medium">{t("cash_register.system_summary")}</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">{t("cash_register.opening_cash")}:</span>
                  <span className="font-medium text-right">{formatCurrency(sessionSummary.openingCash, currency)}</span>
                  <span className="text-muted-foreground">{t("cash_register.cash_sales")}:</span>
                  <span className="font-medium text-right text-green-600 dark:text-green-400">+ {formatCurrency(sessionSummary.cashSales, currency)}</span>
                  {sessionSummary.movementsIn > 0 && (
                    <>
                      <span className="text-muted-foreground">{t("cash_register.deposits")}:</span>
                      <span className="font-medium text-right text-green-600 dark:text-green-400">+ {formatCurrency(sessionSummary.movementsIn, currency)}</span>
                    </>
                  )}
                  {sessionSummary.movementsOut > 0 && (
                    <>
                      <span className="text-muted-foreground">{t("cash_register.withdrawals")}:</span>
                      <span className="font-medium text-right text-red-600 dark:text-red-400">- {formatCurrency(sessionSummary.movementsOut, currency)}</span>
                    </>
                  )}
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{t("cash_register.expected_in_drawer")}:</span>
                  <span className="text-lg font-bold text-green-600 dark:text-green-400" data-testid="text-close-expected-cash">
                    {formatCurrency(sessionSummary.expectedCash, currency)}
                  </span>
                </div>
                {sessionSummary.cardSales > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("cash_register.expected_card")}:</span>
                    <span className="font-medium">{formatCurrency(sessionSummary.cardSales, currency)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("cash_register.total_orders")}:</span>
                  <span className="font-medium">{sessionSummary.totalOrders}</span>
                </div>
              </div>
            )}

            <p className="text-sm text-muted-foreground">{t("cash_register.enter_counted_amounts")}</p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-2">
                  <Banknote className="w-4 h-4" />
                  {t("cash_register.counted_cash")}
                </Label>
                <CurrencyInput
                  value={countedCash}
                  onChange={(val) => setCountedCash(val)}
                  currency={currency}
                  data-testid="input-counted-cash"
                />
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  {t("cash_register.counted_card")}
                </Label>
                <CurrencyInput
                  value={countedCard}
                  onChange={(val) => setCountedCard(val)}
                  currency={currency}
                  data-testid="input-counted-card"
                />
              </div>
            </div>

            <Separator />

            <div>
              <Label className="mb-2 block">{t("cash_register.denomination_counts")}</Label>
              <div className="grid grid-cols-3 gap-2">
                {currentDenominations.map((d) => (
                  <div key={d.value} className="flex items-center gap-2">
                    <span className="text-xs w-16 text-right text-muted-foreground">{d.label}</span>
                    <Input
                      type="number"
                      min="0"
                      className="h-8 text-sm"
                      value={denominations[String(d.value)] || ""}
                      onChange={(e) => handleDenominationChange(String(d.value), e.target.value)}
                      placeholder="0"
                      data-testid={`input-denom-${d.value}`}
                    />
                  </div>
                ))}
              </div>
              {denominationTotal > 0 && (
                <div className="flex items-center justify-between mt-2 p-2 bg-muted/50 rounded-md">
                  <span className="text-sm font-medium">{formatCurrency(denominationTotal, currency)}</span>
                  <Button variant="outline" size="sm" onClick={applyDenominationTotal} data-testid="button-apply-denominations">
                    <DollarSign className="w-3 h-3 mr-1" />
                    {"Apply"}
                  </Button>
                </div>
              )}
            </div>

            <div>
              <Label>{t("cash_register.notes")}</Label>
              <Textarea
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder={t("cash_register.notes")}
                data-testid="textarea-close-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialog(false)} data-testid="button-cancel-close">
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => closeMutation.mutate({
                countedCash,
                countedCard,
                denominationCounts: Object.keys(denominations).length > 0 ? denominations : undefined,
                notes: closeNotes || undefined,
              })}
              disabled={closeMutation.isPending}
              data-testid="button-confirm-close"
            >
              {closeMutation.isPending ? "..." : t("cash_register.close_register")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement Dialog */}
      <Dialog open={movementDialog} onOpenChange={setMovementDialog}>
        <DialogContent data-testid="dialog-add-movement">
          <DialogHeader>
            <DialogTitle>{t("cash_register.add_movement")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("cash_register.movement_type")}</Label>
              <Select value={movementType} onValueChange={setMovementType}>
                <SelectTrigger data-testid="select-movement-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash_in">{t("cash_register.deposit")}</SelectItem>
                  <SelectItem value="cash_out">{t("cash_register.withdrawal")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("cash_register.movement_amount")}</Label>
              <CurrencyInput
                value={movementAmount}
                onChange={(val) => setMovementAmount(val)}
                currency={currency}
                data-testid="input-movement-amount"
              />
            </div>
            <div>
              <Label>{t("cash_register.movement_reason")}</Label>
              <Input
                value={movementReason}
                onChange={(e) => setMovementReason(e.target.value)}
                placeholder={t("cash_register.movement_reason")}
                data-testid="input-movement-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementDialog(false)} data-testid="button-cancel-movement">
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => movementMutation.mutate({
                type: movementType,
                amount: movementAmount,
                reason: movementReason || undefined,
              })}
              disabled={!movementAmount || movementMutation.isPending}
              data-testid="button-confirm-movement"
            >
              {movementMutation.isPending ? "..." : t("cash_register.add_movement")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Session Detail Dialog */}
      <Dialog open={detailDialog} onOpenChange={setDetailDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-auto" data-testid="dialog-session-detail">
          <DialogHeader>
            <DialogTitle>{t("cash_register.summary")}</DialogTitle>
          </DialogHeader>
          {selectedSessionDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">{t("cash_register.opened_by")}</span>
                  <p className="font-medium">{selectedSessionDetail.userName || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("cash_register.closed_by")}</span>
                  <p className="font-medium">{selectedSessionDetail.closedByUserName || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("cash_register.opened_at")}</span>
                  <p className="font-medium">{formatDate(selectedSessionDetail.openedAt, locale)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("cash_register.closed_at")}</span>
                  <p className="font-medium">{formatDate(selectedSessionDetail.closedAt, locale)}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">{t("cash_register.opening_cash")}</span>
                  <p className="font-medium">{formatCurrency(parseFloat(String(selectedSessionDetail.openingCash || "0")), currency)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("cash_register.total_sales")}</span>
                  <p className="font-medium">{formatCurrency(parseFloat(String(selectedSessionDetail.totalSales || "0")), currency)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("cash_register.total_orders")}</span>
                  <p className="font-medium">{selectedSessionDetail.totalOrders || 0}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("cash_register.cash_in")}/{t("cash_register.cash_out")}</span>
                  <p className="font-medium text-green-600 dark:text-green-400">+{formatCurrency(parseFloat(String(selectedSessionDetail.cashMovementsIn || "0")), currency)}</p>
                  <p className="font-medium text-red-600 dark:text-red-400">-{formatCurrency(parseFloat(String(selectedSessionDetail.cashMovementsOut || "0")), currency)}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Banknote className="w-4 h-4" />
                    {t("cash_register.expected_cash")}
                  </span>
                  <span className="font-medium">{formatCurrency(parseFloat(String(selectedSessionDetail.expectedCash || "0")), currency)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Banknote className="w-4 h-4" />
                    {t("cash_register.counted_cash")}
                  </span>
                  <span className="font-medium">{formatCurrency(parseFloat(String(selectedSessionDetail.countedCash || "0")), currency)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {t("cash_register.cash_variance")}
                  </span>
                  <span className={`font-bold ${getVarianceColor(selectedSessionDetail.cashVariance)}`}>
                    {formatCurrency(parseFloat(String(selectedSessionDetail.cashVariance || "0")), currency)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    {t("cash_register.expected_card")}
                  </span>
                  <span className="font-medium">{formatCurrency(parseFloat(String(selectedSessionDetail.expectedCard || "0")), currency)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    {t("cash_register.counted_card")}
                  </span>
                  <span className="font-medium">{formatCurrency(parseFloat(String(selectedSessionDetail.countedCard || "0")), currency)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {t("cash_register.card_variance")}
                  </span>
                  <span className={`font-bold ${getVarianceColor(selectedSessionDetail.cardVariance)}`}>
                    {formatCurrency(parseFloat(String(selectedSessionDetail.cardVariance || "0")), currency)}
                  </span>
                </div>
              </div>

              {selectedSessionDetail.movements && selectedSessionDetail.movements.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-2">{t("cash_register.movements")}</h4>
                    <div className="space-y-1">
                      {selectedSessionDetail.movements.map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between text-sm py-1">
                          <div className="flex items-center gap-2">
                            {m.type === "cash_in" ? (
                              <ArrowDownCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <ArrowUpCircle className="w-4 h-4 text-red-500" />
                            )}
                            <span>{m.type === "cash_in" ? t("cash_register.deposit") : t("cash_register.withdrawal")}</span>
                            {m.reason && <span className="text-muted-foreground">- {m.reason}</span>}
                          </div>
                          <span className={m.type === "cash_in" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                            {m.type === "cash_in" ? "+" : "-"}{formatCurrency(parseFloat(String(m.amount || "0")), currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {selectedSessionDetail.notes && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-1">{t("cash_register.notes")}</h4>
                    <p className="text-sm text-muted-foreground">{selectedSessionDetail.notes}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
