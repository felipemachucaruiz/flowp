import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { VisualEmailEditor, VisualEmailEditorRef } from "@/components/visual-email-editor";
import {
  Mail,
  Pencil,
  Eye,
  Check,
  X,
  AlertCircle,
  ShoppingCart,
  CreditCard,
  Package,
  Receipt,
  Loader2,
  Paintbrush,
  Code2,
} from "lucide-react";

interface EmailTemplate {
  id: string;
  type: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  isActive: boolean;
  updatedAt: string;
}

const templateTypeConfig: Record<string, { icon: any; color: string; name: string; description: string; variables: string[]; sampleData: Record<string, string> }> = {
  order_confirmation: {
    icon: ShoppingCart,
    color: "text-blue-500",
    name: "Order Confirmation",
    description: "Sent when an order is placed",
    variables: ["{{orderId}}", "{{orderTotal}}", "{{orderItems}}"],
    sampleData: {
      "{{orderId}}": "ORD-2026-0001",
      "{{orderTotal}}": "$156.99",
      "{{orderItems}}": "2x Classic Burger ($24.99), 1x Caesar Salad ($12.50), 3x Soft Drink ($8.97)",
    },
  },
  payment_received: {
    icon: CreditCard,
    color: "text-green-500",
    name: "Payment Received",
    description: "Sent when a payment is processed successfully",
    variables: ["{{amount}}", "{{paymentMethod}}", "{{transactionId}}"],
    sampleData: {
      "{{amount}}": "$156.99",
      "{{paymentMethod}}": "Credit Card (Visa ****4242)",
      "{{transactionId}}": "TXN-8F7A2B3C",
    },
  },
  low_stock_alert: {
    icon: Package,
    color: "text-red-500",
    name: "Low Stock Alert",
    description: "Sent when a product falls below minimum stock level",
    variables: ["{{productName}}", "{{currentStock}}", "{{minStock}}"],
    sampleData: {
      "{{productName}}": "Organic Chicken Breast",
      "{{currentStock}}": "5 units",
      "{{minStock}}": "10 units",
    },
  },
  transaction_receipt: {
    icon: Receipt,
    color: "text-purple-500",
    name: "Transaction Receipt",
    description: "Digital receipt sent to customers",
    variables: ["{{receiptNumber}}", "{{date}}", "{{total}}", "{{items}}"],
    sampleData: {
      "{{receiptNumber}}": "REC-2026-00847",
      "{{date}}": "January 31, 2026 - 2:45 PM",
      "{{total}}": "$156.99",
      "{{items}}": "2x Classic Burger, 1x Caesar Salad, 3x Soft Drink",
    },
  },
};

const defaultTemplatesByLanguage: Record<string, Record<string, { subject: string; htmlBody: string }>> = {
  en: {
    order_confirmation: {
      subject: "Order Confirmation - #{{orderId}}",
      htmlBody: `<h1>Thank you for your order!</h1>
<p><strong>Order #{{orderId}}</strong></p>
<p>{{orderItems}}</p>
<p><strong>Total: {{orderTotal}}</strong></p>
<p>We've received your order and it's being processed.</p>`,
    },
    payment_received: {
      subject: "Payment Received",
      htmlBody: `<h1>Payment Successful!</h1>
<p>We have received your payment.</p>
<p><strong>Amount:</strong> {{amount}}</p>
<p><strong>Payment Method:</strong> {{paymentMethod}}</p>
<p>Thank you for your business!</p>`,
    },
    low_stock_alert: {
      subject: "Low Stock Alert: {{productName}}",
      htmlBody: `<h1>Low Stock Alert</h1>
<p>The following product is running low on stock:</p>
<p><strong>Product:</strong> {{productName}}</p>
<p><strong>Current Stock:</strong> {{currentStock}}</p>
<p>Please consider restocking soon.</p>`,
    },
    transaction_receipt: {
      subject: "Receipt #{{receiptNumber}}",
      htmlBody: `<h1>Your Receipt</h1>
<p><strong>Receipt #:</strong> {{receiptNumber}}</p>
<p><strong>Date:</strong> {{date}}</p>
<p>{{items}}</p>
<p><strong>Total:</strong> {{total}}</p>
<p>Thank you for your purchase!</p>`,
    },
  },
  es: {
    order_confirmation: {
      subject: "Confirmación de Pedido - #{{orderId}}",
      htmlBody: `<h1>¡Gracias por tu pedido!</h1>
<p><strong>Pedido #{{orderId}}</strong></p>
<p>{{orderItems}}</p>
<p><strong>Total: {{orderTotal}}</strong></p>
<p>Hemos recibido tu pedido y está siendo procesado.</p>`,
    },
    payment_received: {
      subject: "Pago Recibido",
      htmlBody: `<h1>¡Pago Exitoso!</h1>
<p>Hemos recibido tu pago.</p>
<p><strong>Monto:</strong> {{amount}}</p>
<p><strong>Método de Pago:</strong> {{paymentMethod}}</p>
<p>¡Gracias por tu preferencia!</p>`,
    },
    low_stock_alert: {
      subject: "Alerta de Stock Bajo: {{productName}}",
      htmlBody: `<h1>Alerta de Stock Bajo</h1>
<p>El siguiente producto tiene stock bajo:</p>
<p><strong>Producto:</strong> {{productName}}</p>
<p><strong>Stock Actual:</strong> {{currentStock}}</p>
<p>Por favor considera reabastecer pronto.</p>`,
    },
    transaction_receipt: {
      subject: "Recibo #{{receiptNumber}}",
      htmlBody: `<h1>Tu Recibo</h1>
<p><strong>Recibo #:</strong> {{receiptNumber}}</p>
<p><strong>Fecha:</strong> {{date}}</p>
<p>{{items}}</p>
<p><strong>Total:</strong> {{total}}</p>
<p>¡Gracias por tu compra!</p>`,
    },
  },
  pt: {
    order_confirmation: {
      subject: "Confirmação de Pedido - #{{orderId}}",
      htmlBody: `<h1>Obrigado pelo seu pedido!</h1>
<p><strong>Pedido #{{orderId}}</strong></p>
<p>{{orderItems}}</p>
<p><strong>Total: {{orderTotal}}</strong></p>
<p>Recebemos seu pedido e ele está sendo processado.</p>`,
    },
    payment_received: {
      subject: "Pagamento Recebido",
      htmlBody: `<h1>Pagamento Confirmado!</h1>
<p>Recebemos seu pagamento.</p>
<p><strong>Valor:</strong> {{amount}}</p>
<p><strong>Método de Pagamento:</strong> {{paymentMethod}}</p>
<p>Obrigado pela sua preferência!</p>`,
    },
    low_stock_alert: {
      subject: "Alerta de Estoque Baixo: {{productName}}",
      htmlBody: `<h1>Alerta de Estoque Baixo</h1>
<p>O seguinte produto está com estoque baixo:</p>
<p><strong>Produto:</strong> {{productName}}</p>
<p><strong>Estoque Atual:</strong> {{currentStock}}</p>
<p>Por favor considere reabastecer em breve.</p>`,
    },
    transaction_receipt: {
      subject: "Recibo #{{receiptNumber}}",
      htmlBody: `<h1>Seu Recibo</h1>
<p><strong>Recibo #:</strong> {{receiptNumber}}</p>
<p><strong>Data:</strong> {{date}}</p>
<p>{{items}}</p>
<p><strong>Total:</strong> {{total}}</p>
<p>Obrigado pela sua compra!</p>`,
    },
  },
};

function getDefaultTemplates(language: string): Record<string, { subject: string; htmlBody: string }> {
  return defaultTemplatesByLanguage[language] || defaultTemplatesByLanguage.en;
}

export function EmailTemplateEditor() {
  const { t, language } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editHtmlBody, setEditHtmlBody] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [activeEditorTab, setActiveEditorTab] = useState<"visual" | "html">("visual");
  const [showFinalPreview, setShowFinalPreview] = useState(true);
  const visualEditorRef = useRef<VisualEmailEditorRef>(null);

  const replaceVariablesWithSampleData = (content: string, templateType: string): string => {
    const config = templateTypeConfig[templateType];
    if (!config?.sampleData) return content;
    
    let result = content;
    for (const [variable, value] of Object.entries(config.sampleData)) {
      result = result.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    return result;
  };

  const [styledPreviewHtml, setStyledPreviewHtml] = useState<string>("");

  const getPreviewContent = (template: EmailTemplate) => {
    if (showFinalPreview) {
      return replaceVariablesWithSampleData(template.htmlBody, template.type);
    }
    return template.htmlBody;
  };

  const fetchStyledPreview = async (htmlBody: string) => {
    try {
      const res = await apiRequest("POST", "/api/email-templates/preview", { htmlBody });
      const data = await res.json();
      setStyledPreviewHtml(data.html);
    } catch {
      setStyledPreviewHtml(htmlBody);
    }
  };

  const getPreviewSubject = (template: EmailTemplate) => {
    if (showFinalPreview) {
      return replaceVariablesWithSampleData(template.subject, template.type);
    }
    return template.subject;
  };

  const { data: templates, isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email-templates"],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { type: string; subject: string; htmlBody: string; isActive: boolean }) => {
      return apiRequest("PUT", `/api/email-templates/${data.type}`, {
        subject: data.subject,
        htmlBody: data.htmlBody,
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      toast({
        title: t("common.success"),
        description: t("emails.template_updated"),
      });
      setEditingTemplate(null);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("emails.template_update_failed"),
      });
    },
  });

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setEditSubject(template.subject);
    setEditHtmlBody(template.htmlBody);
    setEditIsActive(template.isActive);
  };

  const handleEditNew = (type: string) => {
    const defaultTemplates = getDefaultTemplates(language);
    const defaultTemplate = defaultTemplates[type];
    const config = templateTypeConfig[type];
    setEditingTemplate({
      id: "",
      type,
      subject: defaultTemplate?.subject || `${config?.name || type} Email`,
      htmlBody: defaultTemplate?.htmlBody || "<p>Email content here...</p>",
      isActive: true,
      updatedAt: new Date().toISOString(),
    });
    setEditSubject(defaultTemplate?.subject || `${config?.name || type} Email`);
    setEditHtmlBody(defaultTemplate?.htmlBody || "<p>Email content here...</p>");
    setEditIsActive(true);
  };

  const handleSave = () => {
    if (!editingTemplate) return;
    updateMutation.mutate({
      type: editingTemplate.type,
      subject: editSubject,
      htmlBody: editHtmlBody,
      isActive: editIsActive,
    });
  };

  const allTemplateTypes = Object.keys(templateTypeConfig);
  const existingTemplates = new Map(templates?.map(t => [t.type, t]) || []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            {t("emails.title")}
          </CardTitle>
          <CardDescription>
            {t("emails.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="space-y-3">
              {allTemplateTypes.map((type) => {
                const config = templateTypeConfig[type];
                const template = existingTemplates.get(type);
                const Icon = config.icon;

                return (
                  <div
                    key={type}
                    className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                    data-testid={`email-template-${type}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg bg-muted ${config.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{t(`emails.${type}`) || config.name}</span>
                          {template ? (
                            template.isActive ? (
                              <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                                <Check className="w-3 h-3 mr-1" />
                                {t("emails.active")}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <X className="w-3 h-3 mr-1" />
                                {t("emails.inactive")}
                              </Badge>
                            )
                          ) : (
                            <Badge variant="outline">{t("emails.default")}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{t(`emails.${type}_desc`) || config.description}</p>
                        {template && (
                          <p className="text-xs text-muted-foreground">
                            Subject: {template.subject}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {template && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPreviewTemplate(template)}
                          data-testid={`button-preview-template-${type}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => template ? handleEdit(template) : handleEditNew(type)}
                        data-testid={`button-edit-template-${type}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {t("emails.variables_title")}
          </CardTitle>
          <CardDescription>
            {t("emails.variables_subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(templateTypeConfig).map(([type, config]) => (
              <div key={type} className="p-3 border rounded-lg">
                <h4 className="font-medium text-sm mb-2">{t(`emails.${type}`) || config.name}</h4>
                <div className="flex flex-wrap gap-1">
                  {config.variables.map((variable) => (
                    <Badge key={variable} variant="secondary" className="font-mono text-xs">
                      {variable}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              {t("emails.edit_template")}: {editingTemplate && (t(`emails.${editingTemplate.type}`) || templateTypeConfig[editingTemplate.type]?.name)}
            </DialogTitle>
            <DialogDescription>
              {t("emails.edit_template_desc")}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="template-active">{t("emails.template_active")}</Label>
                <Switch
                  id="template-active"
                  checked={editIsActive}
                  onCheckedChange={setEditIsActive}
                  data-testid="switch-template-active"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="template-subject">{t("emails.email_subject")}</Label>
                <Input
                  id="template-subject"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder={t("emails.email_subject")}
                  data-testid="input-template-subject"
                />
              </div>

              <div className="space-y-2">
                <Label>{t("emails.email_body")}</Label>
                <Tabs value={activeEditorTab} onValueChange={(v) => setActiveEditorTab(v as "visual" | "html")} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-2">
                    <TabsTrigger value="visual" className="gap-2" data-testid="tab-visual-editor">
                      <Paintbrush className="h-4 w-4" />
                      {t("emails.visual_editor")}
                    </TabsTrigger>
                    <TabsTrigger value="html" className="gap-2" data-testid="tab-html-editor">
                      <Code2 className="h-4 w-4" />
                      {t("emails.html_code")}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="visual" className="mt-0">
                    <VisualEmailEditor
                      ref={visualEditorRef}
                      content={editHtmlBody}
                      onChange={setEditHtmlBody}
                    />
                  </TabsContent>
                  <TabsContent value="html" className="mt-0">
                    <Textarea
                      id="template-body"
                      value={editHtmlBody}
                      onChange={(e) => setEditHtmlBody(e.target.value)}
                      placeholder={t("emails.email_body")}
                      className="font-mono text-sm min-h-[300px]"
                      data-testid="textarea-template-body"
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {editingTemplate && (
                <div className="p-3 bg-muted rounded-lg">
                  <Label className="text-xs text-muted-foreground">{t("emails.available_variables")}</Label>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">{t("emails.click_to_copy")}</p>
                  <div className="flex flex-wrap gap-1">
                    {templateTypeConfig[editingTemplate.type]?.variables.map((variable) => (
                      <Badge
                        key={variable}
                        variant="secondary"
                        className="font-mono text-xs cursor-pointer hover:bg-primary hover:text-primary-foreground"
                        onClick={() => {
                          if (activeEditorTab === "visual" && visualEditorRef.current) {
                            visualEditorRef.current.insertText(variable);
                            toast({
                              title: t("emails.inserted"),
                              description: variable,
                            });
                          } else {
                            setEditHtmlBody(prev => prev + variable);
                            toast({
                              title: t("emails.inserted"),
                              description: variable,
                            });
                          }
                        }}
                        data-testid={`variable-${variable}`}
                      >
                        {variable}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditingTemplate(null)}
              data-testid="button-cancel-template"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              data-testid="button-save-template"
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("emails.save_template")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              {t("emails.preview")}: {previewTemplate && (t(`emails.${previewTemplate.type}`) || templateTypeConfig[previewTemplate.type]?.name)}
            </DialogTitle>
            <DialogDescription>
              {t("emails.email_subject")}: {previewTemplate && getPreviewSubject(previewTemplate)}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex items-center justify-between py-2 px-1">
            <div className="flex items-center gap-2">
              <Label htmlFor="final-preview-toggle" className="text-sm">
                {t("emails.show_with_sample_data")}
              </Label>
              <Switch
                id="final-preview-toggle"
                checked={showFinalPreview}
                onCheckedChange={setShowFinalPreview}
                data-testid="switch-final-preview"
              />
            </div>
            {showFinalPreview && (
              <Badge variant="secondary" className="text-xs">
                {t("emails.sample_data_preview")}
              </Badge>
            )}
          </div>
          
          <ScrollArea className="flex-1 border rounded-lg bg-white">
            <div 
              className="p-4 text-black"
              dangerouslySetInnerHTML={{ __html: previewTemplate ? getPreviewContent(previewTemplate) : "" }}
            />
          </ScrollArea>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreviewTemplate(null)}
              data-testid="button-close-preview"
            >
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
