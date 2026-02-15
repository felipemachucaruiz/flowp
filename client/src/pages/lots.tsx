import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/currency";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Package, Plus, Minus, AlertTriangle, Calendar, Truck } from "lucide-react";
import type { Ingredient, IngredientLot } from "@shared/schema";

export default function LotsPage() {
  const { t, formatDate } = useI18n();
  const { tenant } = useAuth();
  const currency = tenant?.currency || "USD";
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { ingredientId } = useParams<{ ingredientId: string }>();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [selectedLot, setSelectedLot] = useState<IngredientLot | null>(null);
  
  const [receiveData, setReceiveData] = useState({
    qty: "",
    expiresAt: "",
    costPerBase: "",
    lotCode: "",
  });
  
  const [adjustData, setAdjustData] = useState({
    qtyDelta: "",
    reason: "adjustment",
    notes: "",
  });

  const { data: ingredient } = useQuery<Ingredient>({
    queryKey: ["/api/ingredients", ingredientId],
    enabled: !!ingredientId,
  });

  const { data: lots = [], isLoading } = useQuery<IngredientLot[]>({
    queryKey: ["/api/ingredients", ingredientId, "lots"],
    enabled: !!ingredientId,
  });

  const receiveMutation = useMutation({
    mutationFn: async (data: typeof receiveData) => {
      return apiRequest("POST", `/api/ingredients/${ingredientId}/lots/receive`, {
        qty: parseFloat(data.qty),
        expiresAt: data.expiresAt || null,
        costPerBase: data.costPerBase ? parseFloat(data.costPerBase) : null,
        lotCode: data.lotCode || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ingredients", ingredientId, "lots"] });
      setReceiveOpen(false);
      setReceiveData({ qty: "", expiresAt: "", costPerBase: "", lotCode: "" });
      toast({ title: t("lots.receive_success") });
    },
    onError: () => {
      toast({ title: t("lots.receive_error"), variant: "destructive" });
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async ({ lotId, data }: { lotId: string; data: typeof adjustData }) => {
      return apiRequest("POST", `/api/lots/${lotId}/adjust`, {
        qtyDelta: parseFloat(data.qtyDelta),
        reason: data.reason,
        notes: data.notes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ingredients", ingredientId, "lots"] });
      setAdjustOpen(false);
      setSelectedLot(null);
      setAdjustData({ qtyDelta: "", reason: "adjustment", notes: "" });
      toast({ title: t("lots.adjust_success") });
    },
    onError: () => {
      toast({ title: t("lots.adjust_error"), variant: "destructive" });
    },
  });

  const handleReceive = (e: React.FormEvent) => {
    e.preventDefault();
    receiveMutation.mutate(receiveData);
  };

  const handleAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedLot) {
      adjustMutation.mutate({ lotId: selectedLot.id, data: adjustData });
    }
  };

  const openAdjustDialog = (lot: IngredientLot) => {
    setSelectedLot(lot);
    setAdjustData({ qtyDelta: "", reason: "adjustment", notes: "" });
    setAdjustOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge variant="default">{t("lots.status_open")}</Badge>;
      case "depleted":
        return <Badge variant="secondary">{t("lots.status_depleted")}</Badge>;
      case "expired":
        return <Badge variant="destructive">{t("lots.status_expired")}</Badge>;
      case "quarantine":
        return <Badge variant="outline">{t("lots.status_quarantine")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const isExpiringSoon = (expiresAt: Date | null) => {
    if (!expiresAt) return false;
    const daysUntilExpiry = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry > 0 && daysUntilExpiry <= 7;
  };

  const isExpired = (expiresAt: Date | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/ingredients")}
          data-testid="button-back-ingredients"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{ingredient?.name}</h1>
          <p className="text-muted-foreground">
            {t("lots.manage_lots")} • {ingredient?.uomBase}
          </p>
        </div>
        <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-receive-stock">
              <Truck className="w-4 h-4 mr-2" />
              {t("lots.receive_stock")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("lots.receive_stock")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleReceive} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("lots.quantity")} ({ingredient?.uomBase})</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={receiveData.qty}
                  onChange={(e) => setReceiveData({ ...receiveData, qty: e.target.value })}
                  onFocus={e => e.target.select()}
                  required
                  data-testid="input-receive-qty"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("lots.expiration_date")}</Label>
                <Input
                  type="date"
                  value={receiveData.expiresAt}
                  onChange={(e) => setReceiveData({ ...receiveData, expiresAt: e.target.value })}
                  data-testid="input-receive-expiry"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("lots.cost_per_unit")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={receiveData.costPerBase}
                  onChange={(e) => setReceiveData({ ...receiveData, costPerBase: e.target.value })}
                  onFocus={e => e.target.select()}
                  data-testid="input-receive-cost"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("lots.lot_code")}</Label>
                <Input
                  value={receiveData.lotCode}
                  onChange={(e) => setReceiveData({ ...receiveData, lotCode: e.target.value })}
                  placeholder={t("lots.lot_code_placeholder")}
                  data-testid="input-receive-lot-code"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setReceiveOpen(false)} data-testid="button-cancel-receive">
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={receiveMutation.isPending} data-testid="button-confirm-receive">
                  {receiveMutation.isPending ? t("common.saving") : t("lots.receive")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {lots.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>{t("lots.no_lots")}</p>
            <p className="text-sm">{t("lots.no_lots_hint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {lots.map((lot) => (
            <Card
              key={lot.id}
              className={
                isExpired(lot.expiresAt) ? "border-destructive" :
                isExpiringSoon(lot.expiresAt) ? "border-amber-500" : ""
              }
              data-testid={`card-lot-${lot.id}`}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {lot.lotCode || `Lot #${lot.id.slice(0, 8)}`}
                      </span>
                      {getStatusBadge(lot.status || "open")}
                      {isExpiringSoon(lot.expiresAt) && !isExpired(lot.expiresAt) && (
                        <Badge variant="outline" className="text-amber-600 border-amber-600">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          {t("lots.expiring_soon")}
                        </Badge>
                      )}
                      {isExpired(lot.expiresAt) && (
                        <Badge variant="destructive">
                          {t("lots.expired")}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>
                        {t("lots.remaining")}: {parseFloat(lot.qtyRemainingBase).toFixed(2)}{ingredient?.uomBase} / {parseFloat(lot.qtyReceivedBase).toFixed(2)}{ingredient?.uomBase}
                      </span>
                      {lot.expiresAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {t("lots.expires")}: {formatDate(new Date(lot.expiresAt))}
                        </span>
                      )}
                      {lot.costPerBase && (
                        <span>
                          {t("lots.cost")}: {formatCurrency(parseFloat(lot.costPerBase), currency)}/{ingredient?.uomBase}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("lots.received")}: {lot.receivedAt ? formatDate(new Date(lot.receivedAt)) : "-"}
                    </div>
                  </div>
                  {lot.status === "open" && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAdjustDialog(lot)}
                        data-testid={`button-adjust-lot-${lot.id}`}
                      >
                        <Minus className="w-4 h-4 mr-1" />
                        {t("lots.adjust")}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("lots.adjust_quantity")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdjust} className="space-y-4">
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm">
                {t("lots.current_quantity")}: {selectedLot ? parseFloat(selectedLot.qtyRemainingBase).toFixed(2) : 0} {ingredient?.uomBase}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t("lots.adjustment")} ({ingredient?.uomBase})</Label>
              <Input
                type="number"
                step="0.001"
                value={adjustData.qtyDelta}
                onChange={(e) => setAdjustData({ ...adjustData, qtyDelta: e.target.value })}
                onFocus={e => e.target.select()}
                placeholder={t("lots.adjustment_placeholder")}
                required
                data-testid="input-adjust-qty"
              />
              <p className="text-xs text-muted-foreground">{t("lots.adjustment_hint")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("lots.reason")}</Label>
              <Select
                value={adjustData.reason}
                onValueChange={(v) => setAdjustData({ ...adjustData, reason: v })}
              >
                <SelectTrigger data-testid="select-adjust-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="adjustment">{t("lots.reason_adjustment")}</SelectItem>
                  <SelectItem value="waste">{t("lots.reason_waste")}</SelectItem>
                  <SelectItem value="count_correction">{t("lots.reason_count_correction")}</SelectItem>
                  <SelectItem value="damage">{t("lots.reason_damage")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("lots.notes")}</Label>
              <Textarea
                value={adjustData.notes}
                onChange={(e) => setAdjustData({ ...adjustData, notes: e.target.value })}
                placeholder={t("lots.notes_placeholder")}
                data-testid="input-adjust-notes"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAdjustOpen(false)} data-testid="button-cancel-adjust">
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={adjustMutation.isPending} data-testid="button-confirm-adjust">
                {adjustMutation.isPending ? t("common.saving") : t("lots.apply_adjustment")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
