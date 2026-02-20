import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Loader2,
  Trash2,
  FileText,
  Zap,
  CheckCircle,
  AlertTriangle,
  Download,
  MessageCircle,
} from "lucide-react";

interface WhatsappTemplate {
  id: string;
  tenantId: string;
  name: string;
  category: "utility" | "marketing" | "authentication";
  language: string;
  headerText: string | null;
  bodyText: string;
  footerText: string | null;
  buttons: Array<{ type: string; text: string; url?: string; phoneNumber?: string }>;
  variablesSample: Record<string, string>;
  gupshupTemplateId: string | null;
  status: "draft" | "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WhatsappTrigger {
  id: string;
  tenantId: string;
  templateId: string;
  event: string;
  enabled: boolean;
  variableMapping: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

const TRIGGER_EVENTS = [
  { value: "conversation_start", labelKey: "whatsapp.trigger_conversation_start" as any, defaultLabel: "Inicio de conversación", icon: MessageCircle },
  { value: "sale_completed", labelKey: "whatsapp.trigger_sale_completed" as any, defaultLabel: "Venta completada", icon: CheckCircle },
  { value: "low_stock_alert", labelKey: "whatsapp.trigger_low_stock" as any, defaultLabel: "Alerta stock bajo", icon: AlertTriangle },
  { value: "order_ready", labelKey: "whatsapp.trigger_order_ready" as any, defaultLabel: "Orden lista", icon: Zap },
  { value: "payment_received", labelKey: "whatsapp.trigger_payment_received" as any, defaultLabel: "Pago recibido", icon: CheckCircle },
  { value: "daily_summary", labelKey: "whatsapp.trigger_daily_summary" as any, defaultLabel: "Resumen diario", icon: FileText },
];

const EVENT_VARIABLES: Record<string, Array<{ key: string; labelKey: string }>> = {
  conversation_start: [
    { key: "customer_name", labelKey: "whatsapp.var_customer_name" },
    { key: "company_name", labelKey: "whatsapp.var_company_name" },
  ],
  sale_completed: [
    { key: "customer_name", labelKey: "whatsapp.var_customer_name" },
    { key: "order_number", labelKey: "whatsapp.var_order_number" },
    { key: "total", labelKey: "whatsapp.var_total" },
    { key: "company_name", labelKey: "whatsapp.var_company_name" },
  ],
  low_stock_alert: [
    { key: "product_name", labelKey: "whatsapp.var_product_name" },
    { key: "current_stock", labelKey: "whatsapp.var_current_stock" },
    { key: "threshold", labelKey: "whatsapp.var_threshold" },
    { key: "sku", labelKey: "whatsapp.var_sku" },
  ],
  order_ready: [
    { key: "customer_name", labelKey: "whatsapp.var_customer_name" },
    { key: "order_number", labelKey: "whatsapp.var_order_number" },
    { key: "table_number", labelKey: "whatsapp.var_table_number" },
  ],
  payment_received: [
    { key: "customer_name", labelKey: "whatsapp.var_customer_name" },
    { key: "amount", labelKey: "whatsapp.var_amount" },
    { key: "payment_method", labelKey: "whatsapp.var_payment_method" },
  ],
  daily_summary: [
    { key: "date", labelKey: "whatsapp.var_date" },
    { key: "total_sales", labelKey: "whatsapp.var_total_sales" },
    { key: "order_count", labelKey: "whatsapp.var_order_count" },
    { key: "top_product", labelKey: "whatsapp.var_top_product" },
  ],
};

export function WhatsAppTemplateManager() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { tenant } = useAuth();
  const queryClient = useQueryClient();

  const [showTriggerDialog, setShowTriggerDialog] = useState(false);
  const [triggerEvent, setTriggerEvent] = useState("");
  const [triggerTemplateId, setTriggerTemplateId] = useState("");

  const { data: templates, isLoading: templatesLoading } = useQuery<WhatsappTemplate[]>({
    queryKey: ["whatsapp", "templates"],
    queryFn: async () => {
      const res = await fetch("/api/whatsapp/templates", {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      if (!res.ok) throw new Error("Failed to load templates");
      return res.json();
    },
    enabled: !!tenant?.id,
  });

  const { data: triggers, isLoading: triggersLoading } = useQuery<WhatsappTrigger[]>({
    queryKey: ["whatsapp", "triggers"],
    queryFn: async () => {
      const res = await fetch("/api/whatsapp/triggers", {
        headers: { "x-tenant-id": tenant?.id || "" },
      });
      if (!res.ok) throw new Error("Failed to load triggers");
      return res.json();
    },
    enabled: !!tenant?.id,
  });

  const syncFromGupshupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/whatsapp/templates/sync-from-gupshup");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "templates"] });
      toast({
        title: t("common.success" as any) || "Success",
        description: `${data.imported || 0} ${t("whatsapp.templates_imported" as any) || "plantillas importadas"}, ${data.updated || 0} ${t("whatsapp.templates_updated_count" as any) || "actualizadas"}`,
      });
    },
    onError: (e: any) => {
      toast({ title: t("common.error" as any) || "Error", description: e.message, variant: "destructive" });
    },
  });

  const saveTriggerMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/whatsapp/triggers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "triggers"] });
      setShowTriggerDialog(false);
      setTriggerEvent("");
      setTriggerTemplateId("");
      toast({ title: t("common.success" as any) || "Success", description: t("whatsapp.trigger_saved" as any) || "Disparador guardado" });
    },
    onError: (e: any) => {
      toast({ title: t("common.error" as any) || "Error", description: e.message, variant: "destructive" });
    },
  });

  const toggleTriggerMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PUT", `/api/whatsapp/triggers/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "triggers"] });
    },
  });

  const deleteTriggerMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/whatsapp/triggers/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "triggers"] });
      toast({ title: t("common.success" as any) || "Success", description: t("whatsapp.trigger_deleted" as any) || "Disparador eliminado" });
    },
  });

  const approvedTemplates = templates?.filter((tpl) => tpl.status === "approved") || [];

  function getTemplateName(templateId: string) {
    return templates?.find((tpl) => tpl.id === templateId)?.name || templateId;
  }

  function getEventLabel(event: string) {
    const ev = TRIGGER_EVENTS.find((e) => e.value === event);
    return ev ? (t(ev.labelKey) || ev.defaultLabel) : event;
  }

  if (templatesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>{t("whatsapp.approved_templates_title" as any) || "Plantillas Aprobadas"}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("whatsapp.approved_templates_subtitle" as any) || "Sincroniza las plantillas aprobadas desde Gupshup para asignar disparadores"}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncFromGupshupMutation.mutate()}
            disabled={syncFromGupshupMutation.isPending}
            data-testid="button-sync-from-gupshup"
          >
            {syncFromGupshupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="ml-1 hidden sm:inline">{t("whatsapp.sync_from_gupshup" as any) || "Sincronizar desde Gupshup"}</span>
          </Button>
        </CardHeader>
        <CardContent>
          {approvedTemplates.length > 0 ? (
            <div className="space-y-2">
              {approvedTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="flex items-center justify-between gap-4 p-3 border rounded-lg"
                  data-testid={`row-template-${tpl.id}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{tpl.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary">{tpl.category}</Badge>
                      <span className="text-xs text-muted-foreground">{tpl.language.toUpperCase()}</span>
                    </div>
                  </div>
                  <Badge variant="default" className="shrink-0">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {t("whatsapp.status_approved" as any) || "Aprobada"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Download className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {t("whatsapp.no_approved_templates_sync" as any) || "No hay plantillas aprobadas. Sincroniza desde Gupshup para importar las plantillas aprobadas."}
              </p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => syncFromGupshupMutation.mutate()}
                disabled={syncFromGupshupMutation.isPending}
                data-testid="button-sync-empty-state"
              >
                {syncFromGupshupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
                {t("whatsapp.sync_from_gupshup" as any) || "Sincronizar desde Gupshup"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>{t("whatsapp.triggers_title" as any) || "Disparadores automáticos"}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("whatsapp.triggers_subtitle" as any) || "Asigna plantillas aprobadas a eventos del negocio"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setShowTriggerDialog(true)}
            disabled={approvedTemplates.length === 0}
            data-testid="button-add-trigger"
          >
            <Plus className="w-4 h-4 mr-1" />
            {t("whatsapp.add_trigger" as any) || "Agregar disparador"}
          </Button>
        </CardHeader>
        <CardContent>
          {approvedTemplates.length === 0 && (
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg mb-4">
              <AlertTriangle className="w-4 h-4 text-muted-foreground mt-0.5" />
              <p className="text-sm text-muted-foreground">
                {t("whatsapp.no_approved_for_triggers" as any) || "Sincroniza plantillas aprobadas desde Gupshup para poder configurar disparadores."}
              </p>
            </div>
          )}

          {triggersLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : triggers && triggers.length > 0 ? (
            <div className="space-y-3">
              {triggers.map((trigger) => {
                const eventInfo = TRIGGER_EVENTS.find((e) => e.value === trigger.event);
                const EventIcon = eventInfo?.icon || Zap;
                return (
                  <div
                    key={trigger.id}
                    className="flex items-center justify-between gap-4 p-3 border rounded-lg"
                    data-testid={`trigger-item-${trigger.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <EventIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{getEventLabel(trigger.event)}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {t("whatsapp.template" as any) || "Plantilla"}: {getTemplateName(trigger.templateId)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={trigger.enabled}
                        onCheckedChange={(v) => toggleTriggerMutation.mutate({ id: trigger.id, enabled: v })}
                        data-testid={`switch-trigger-${trigger.id}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteTriggerMutation.mutate(trigger.id)}
                        data-testid={`button-delete-trigger-${trigger.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <Zap className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {t("whatsapp.no_triggers" as any) || "No hay disparadores configurados."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showTriggerDialog} onOpenChange={setShowTriggerDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("whatsapp.add_trigger" as any) || "Agregar disparador"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("whatsapp.trigger_event" as any) || "Evento"}</Label>
              <Select value={triggerEvent} onValueChange={setTriggerEvent}>
                <SelectTrigger data-testid="select-trigger-event">
                  <SelectValue placeholder={t("whatsapp.select_event" as any) || "Seleccionar evento"} />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_EVENTS.map((ev) => {
                    const alreadyMapped = triggers?.some((tr) => tr.event === ev.value);
                    return (
                      <SelectItem key={ev.value} value={ev.value} disabled={alreadyMapped}>
                        {t(ev.labelKey) || ev.defaultLabel}
                        {alreadyMapped ? ` (${t("whatsapp.already_mapped" as any) || "ya asignado"})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("whatsapp.template" as any) || "Plantilla"}</Label>
              <Select value={triggerTemplateId} onValueChange={setTriggerTemplateId}>
                <SelectTrigger data-testid="select-trigger-template">
                  <SelectValue placeholder={t("whatsapp.select_template" as any) || "Seleccionar plantilla"} />
                </SelectTrigger>
                <SelectContent>
                  {approvedTemplates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {triggerEvent && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs font-medium mb-2">
                  {t("whatsapp.available_variables" as any) || "Variables disponibles para este evento:"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(EVENT_VARIABLES[triggerEvent] || []).map((v) => (
                    <Badge key={v.key} variant="secondary" className="text-xs">
                      {`{{${v.key}}}`} - {t(v.labelKey as any) || v.key}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTriggerDialog(false)} data-testid="button-cancel-trigger">
              {t("common.cancel" as any) || "Cancelar"}
            </Button>
            <Button
              onClick={() => saveTriggerMutation.mutate({ templateId: triggerTemplateId, event: triggerEvent })}
              disabled={!triggerEvent || !triggerTemplateId || saveTriggerMutation.isPending}
              data-testid="button-save-trigger"
            >
              {saveTriggerMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {t("common.save" as any) || "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
