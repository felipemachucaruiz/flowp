import { useState } from "react";
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
import { VisualEmailEditor } from "@/components/visual-email-editor";
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

const templateTypeConfig: Record<string, { icon: any; color: string; name: string; description: string; variables: string[] }> = {
  order_confirmation: {
    icon: ShoppingCart,
    color: "text-blue-500",
    name: "Order Confirmation",
    description: "Sent when an order is placed",
    variables: ["{{orderId}}", "{{orderTotal}}", "{{orderItems}}"],
  },
  payment_received: {
    icon: CreditCard,
    color: "text-green-500",
    name: "Payment Received",
    description: "Sent when a payment is processed successfully",
    variables: ["{{amount}}", "{{paymentMethod}}", "{{transactionId}}"],
  },
  low_stock_alert: {
    icon: Package,
    color: "text-red-500",
    name: "Low Stock Alert",
    description: "Sent when a product falls below minimum stock level",
    variables: ["{{productName}}", "{{currentStock}}", "{{minStock}}"],
  },
  transaction_receipt: {
    icon: Receipt,
    color: "text-purple-500",
    name: "Transaction Receipt",
    description: "Digital receipt sent to customers",
    variables: ["{{receiptNumber}}", "{{date}}", "{{total}}", "{{items}}"],
  },
};

const defaultTemplates: Record<string, { subject: string; htmlBody: string }> = {
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
};

export function EmailTemplateEditor() {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editHtmlBody, setEditHtmlBody] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);

  const { data: templates, isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/internal/email-templates"],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { type: string; subject: string; htmlBody: string; isActive: boolean }) => {
      return apiRequest("PUT", `/api/internal/email-templates/${data.type}`, {
        subject: data.subject,
        htmlBody: data.htmlBody,
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal/email-templates"] });
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
                <Tabs defaultValue="visual" className="w-full">
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
                          navigator.clipboard.writeText(variable);
                          toast({
                            title: t("emails.copied"),
                            description: variable,
                          });
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
              {t("emails.email_subject")}: {previewTemplate?.subject}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 border rounded-lg bg-white">
            <div 
              className="p-4"
              dangerouslySetInnerHTML={{ __html: previewTemplate?.htmlBody || "" }}
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
