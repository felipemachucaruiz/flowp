import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Send,
  RefreshCw,
  Loader2,
  Pencil,
  Trash2,
  FileText,
  Zap,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
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
  { value: "sale_completed", labelKey: "whatsapp.trigger_sale_completed" as any, defaultLabel: "Venta completada", icon: CheckCircle },
  { value: "low_stock_alert", labelKey: "whatsapp.trigger_low_stock" as any, defaultLabel: "Alerta stock bajo", icon: AlertTriangle },
  { value: "order_ready", labelKey: "whatsapp.trigger_order_ready" as any, defaultLabel: "Orden lista", icon: Zap },
  { value: "payment_received", labelKey: "whatsapp.trigger_payment_received" as any, defaultLabel: "Pago recibido", icon: CheckCircle },
  { value: "daily_summary", labelKey: "whatsapp.trigger_daily_summary" as any, defaultLabel: "Resumen diario", icon: FileText },
];

const EVENT_VARIABLES: Record<string, Array<{ key: string; labelKey: string }>> = {
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

const STATUS_CONFIG: Record<string, { color: string; variant: "default" | "secondary" | "destructive"; icon: any }> = {
  draft: { color: "text-muted-foreground", variant: "secondary", icon: FileText },
  pending: { color: "text-yellow-600", variant: "secondary", icon: Clock },
  approved: { color: "text-green-600", variant: "default", icon: CheckCircle },
  rejected: { color: "text-red-600", variant: "destructive", icon: XCircle },
};

export function WhatsAppTemplateManager() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { tenant } = useAuth();
  const queryClient = useQueryClient();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WhatsappTemplate | null>(null);
  const [showTriggerDialog, setShowTriggerDialog] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<WhatsappTemplate | null>(null);

  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<"utility" | "marketing" | "authentication">("utility");
  const [formLanguage, setFormLanguage] = useState("es");
  const [formHeader, setFormHeader] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formFooter, setFormFooter] = useState("");
  const [formVariables, setFormVariables] = useState<Record<string, string>>({});
  const [showVarReference, setShowVarReference] = useState(false);

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

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/whatsapp/templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "templates"] });
      setShowCreateDialog(false);
      resetForm();
      toast({ title: t("common.success" as any) || "Success", description: t("whatsapp.template_created" as any) || "Plantilla creada exitosamente" });
    },
    onError: (e: any) => {
      toast({ title: t("common.error" as any) || "Error", description: e.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/whatsapp/templates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "templates"] });
      setEditingTemplate(null);
      setShowCreateDialog(false);
      resetForm();
      toast({ title: t("common.success" as any) || "Success", description: t("whatsapp.template_updated" as any) || "Plantilla actualizada" });
    },
    onError: (e: any) => {
      toast({ title: t("common.error" as any) || "Error", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/whatsapp/templates/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "templates"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "triggers"] });
      toast({ title: t("common.success" as any) || "Success", description: t("whatsapp.template_deleted" as any) || "Plantilla eliminada" });
    },
    onError: (e: any) => {
      toast({ title: t("common.error" as any) || "Error", description: e.message, variant: "destructive" });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/whatsapp/templates/${id}/submit`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "templates"] });
      toast({ title: t("common.success" as any) || "Success", description: t("whatsapp.template_submitted" as any) || "Plantilla enviada para aprobación" });
    },
    onError: (e: any) => {
      toast({ title: t("common.error" as any) || "Error", description: e.message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/whatsapp/templates/sync-status");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "templates"] });
      toast({ title: t("common.success" as any) || "Success", description: `${data.updatedCount || 0} ${t("whatsapp.templates_synced" as any) || "plantillas actualizadas"}` });
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

  function resetForm() {
    setFormName("");
    setFormCategory("utility");
    setFormLanguage("es");
    setFormHeader("");
    setFormBody("");
    setFormFooter("");
    setFormVariables({});
    setEditingTemplate(null);
  }

  function openEditDialog(tpl: WhatsappTemplate) {
    setEditingTemplate(tpl);
    setFormName(tpl.name);
    setFormCategory(tpl.category);
    setFormLanguage(tpl.language);
    setFormHeader(tpl.headerText || "");
    setFormBody(tpl.bodyText);
    setFormFooter(tpl.footerText || "");
    setFormVariables(tpl.variablesSample || {});
    setShowCreateDialog(true);
  }

  function handleSaveTemplate() {
    const data = {
      name: formName,
      category: formCategory,
      language: formLanguage,
      headerText: formHeader || null,
      bodyText: formBody,
      footerText: formFooter || null,
      variablesSample: formVariables,
    };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  function extractVariables(text: string): string[] {
    const matches = text.match(/\{\{(\d+)\}\}/g);
    if (!matches) return [];
    return Array.from(new Set(matches)).sort();
  }

  const bodyVariables = extractVariables(formBody);
  const headerVariables = extractVariables(formHeader);
  const allVariables = Array.from(new Set([...headerVariables, ...bodyVariables]));

  function renderPreview(template: WhatsappTemplate) {
    let preview = template.bodyText;
    const samples = template.variablesSample || {};
    const vars = extractVariables(preview);
    vars.forEach((v) => {
      const key = v.replace(/[{}]/g, "");
      const sampleVal = samples[key] || `[${key}]`;
      preview = preview.replace(v, sampleVal);
    });
    return preview;
  }

  const approvedTemplates = templates?.filter((t) => t.status === "approved") || [];

  function getTemplateName(templateId: string) {
    return templates?.find((t) => t.id === templateId)?.name || templateId;
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
              <CardTitle>{t("whatsapp.templates_title" as any) || "Plantillas de WhatsApp"}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("whatsapp.templates_subtitle" as any) || "Crea y gestiona tus plantillas de mensajes para WhatsApp"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync-templates"
            >
              {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-1 hidden sm:inline">{t("whatsapp.sync_status" as any) || "Sincronizar"}</span>
            </Button>
            <Button
              size="sm"
              onClick={() => { resetForm(); setShowCreateDialog(true); }}
              data-testid="button-create-template"
            >
              <Plus className="w-4 h-4 mr-1" />
              {t("whatsapp.new_template" as any) || "Nueva plantilla"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {templates && templates.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name" as any) || "Nombre"}</TableHead>
                    <TableHead>{t("whatsapp.category" as any) || "Categoría"}</TableHead>
                    <TableHead>{t("whatsapp.language_col" as any) || "Idioma"}</TableHead>
                    <TableHead>{t("common.status" as any) || "Estado"}</TableHead>
                    <TableHead className="text-right">{t("common.actions" as any) || "Acciones"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((tpl) => {
                    const statusCfg = STATUS_CONFIG[tpl.status];
                    const StatusIcon = statusCfg.icon;
                    return (
                      <TableRow key={tpl.id} data-testid={`row-template-${tpl.id}`}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{tpl.name}</span>
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {tpl.bodyText.substring(0, 60)}{tpl.bodyText.length > 60 ? "..." : ""}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" data-testid={`badge-category-${tpl.id}`}>
                            {tpl.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{tpl.language.toUpperCase()}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <StatusIcon className={`w-3.5 h-3.5 ${statusCfg.color}`} />
                            <Badge variant={statusCfg.variant} data-testid={`badge-status-${tpl.id}`}>
                              {t(`whatsapp.status_${tpl.status}` as any) || tpl.status}
                            </Badge>
                          </div>
                          {tpl.status === "rejected" && tpl.rejectionReason && (
                            <p className="text-xs text-destructive mt-1">{tpl.rejectionReason}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPreviewTemplate(tpl)}
                              data-testid={`button-preview-${tpl.id}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {tpl.status !== "pending" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(tpl)}
                                data-testid={`button-edit-${tpl.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                            {(tpl.status === "draft" || tpl.status === "rejected") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => submitMutation.mutate(tpl.id)}
                                disabled={submitMutation.isPending}
                                data-testid={`button-submit-${tpl.id}`}
                              >
                                {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMutation.mutate(tpl.id)}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-${tpl.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {t("whatsapp.no_templates" as any) || "No hay plantillas creadas aún. Crea tu primera plantilla para enviar mensajes por WhatsApp."}
              </p>
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
                {t("whatsapp.no_approved_templates" as any) || "Necesitas al menos una plantilla aprobada para configurar disparadores."}
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

      <Dialog open={showCreateDialog} onOpenChange={(v) => { if (!v) { resetForm(); } setShowCreateDialog(v); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate
                ? (t("whatsapp.edit_template" as any) || "Editar plantilla")
                : (t("whatsapp.create_template" as any) || "Crear plantilla")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">{t("whatsapp.template_name" as any) || "Nombre de la plantilla"}</Label>
              <Input
                id="tpl-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="ej: recibo_compra"
                data-testid="input-template-name"
              />
              <p className="text-xs text-muted-foreground">
                {t("whatsapp.template_name_hint" as any) || "Solo letras minúsculas, números y guiones bajos"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("whatsapp.category" as any) || "Categoría"}</Label>
                <Select value={formCategory} onValueChange={(v) => setFormCategory(v as any)}>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utility">{t("whatsapp.cat_utility" as any) || "Utilidad"}</SelectItem>
                    <SelectItem value="marketing">{t("whatsapp.cat_marketing" as any) || "Marketing"}</SelectItem>
                    <SelectItem value="authentication">{t("whatsapp.cat_authentication" as any) || "Autenticación"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("whatsapp.language_col" as any) || "Idioma"}</Label>
                <Select value={formLanguage} onValueChange={setFormLanguage}>
                  <SelectTrigger data-testid="select-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="pt">Português</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-header">{t("whatsapp.header" as any) || "Encabezado"} ({t("common.optional" as any) || "opcional"})</Label>
              <Input
                id="tpl-header"
                value={formHeader}
                onChange={(e) => setFormHeader(e.target.value)}
                placeholder="ej: Recibo de {{1}}"
                data-testid="input-template-header"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-body">{t("whatsapp.body" as any) || "Cuerpo del mensaje"} *</Label>
              <Textarea
                id="tpl-body"
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                placeholder={"Hola {{1}}, tu orden #{{2}} por {{3}} ha sido completada. ¡Gracias por tu compra!"}
                rows={5}
                data-testid="input-template-body"
              />
              <p className="text-xs text-muted-foreground">
                {t("whatsapp.body_hint" as any) || "Usa {{1}}, {{2}}, {{3}} para variables dinámicas"}
              </p>
              <button
                type="button"
                onClick={() => setShowVarReference(!showVarReference)}
                className="flex items-center gap-1 text-xs text-primary hover-elevate rounded px-1.5 py-0.5 mt-1"
                data-testid="button-toggle-var-reference"
              >
                <Info className="w-3 h-3" />
                {t("whatsapp.var_reference_title" as any) || "Variable reference per event"}
                {showVarReference ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showVarReference && (
                <div className="mt-2 p-3 rounded-md bg-muted/50 space-y-3 text-xs">
                  {TRIGGER_EVENTS.map((ev) => {
                    const vars = EVENT_VARIABLES[ev.value] || [];
                    return (
                      <div key={ev.value}>
                        <p className="font-medium mb-1">{t(ev.labelKey) || ev.defaultLabel}</p>
                        <div className="flex flex-wrap gap-1">
                          {vars.map((v, idx) => (
                            <Badge key={v.key} variant="secondary" className="text-xs font-mono">
                              {`{{${idx + 1}}}`} = {t(v.labelKey as any) || v.key}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-muted-foreground italic">
                    {t("whatsapp.var_reference_note" as any) || "The variable number ({{1}}, {{2}}, etc.) maps to each event's fields in order when you assign the template to a trigger."}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-footer">{t("whatsapp.footer" as any) || "Pie de página"} ({t("common.optional" as any) || "opcional"})</Label>
              <Input
                id="tpl-footer"
                value={formFooter}
                onChange={(e) => setFormFooter(e.target.value)}
                placeholder="ej: Flowp POS"
                data-testid="input-template-footer"
              />
            </div>

            {allVariables.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label>{t("whatsapp.sample_values" as any) || "Valores de ejemplo"}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("whatsapp.sample_values_hint" as any) || "WhatsApp requiere valores de ejemplo para aprobar la plantilla"}
                  </p>
                  {allVariables.map((v) => {
                    const key = v.replace(/[{}]/g, "");
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-sm font-mono w-12 text-muted-foreground">{v}</span>
                        <Input
                          value={formVariables[key] || ""}
                          onChange={(e) => setFormVariables((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder={`Valor de ejemplo para ${v}`}
                          data-testid={`input-sample-${key}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setShowCreateDialog(false); }} data-testid="button-cancel-template">
              {t("common.cancel" as any) || "Cancelar"}
            </Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={!formName || !formBody || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-template"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editingTemplate ? (t("common.save" as any) || "Guardar") : (t("common.create" as any) || "Crear")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewTemplate} onOpenChange={(v) => { if (!v) setPreviewTemplate(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("whatsapp.preview" as any) || "Vista previa"}</DialogTitle>
          </DialogHeader>
          {previewTemplate && (
            <div className="bg-[#e5ddd5] dark:bg-[#0b141a] rounded-lg p-4">
              <div className="bg-white dark:bg-[#1f2c34] rounded-lg p-3 shadow-sm max-w-[280px] ml-auto space-y-1">
                {previewTemplate.headerText && (
                  <p className="text-sm font-bold text-foreground">{previewTemplate.headerText}</p>
                )}
                <p className="text-sm text-foreground whitespace-pre-wrap">{renderPreview(previewTemplate)}</p>
                {previewTemplate.footerText && (
                  <p className="text-xs text-muted-foreground mt-1">{previewTemplate.footerText}</p>
                )}
                <p className="text-[10px] text-muted-foreground text-right mt-1">
                  {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
