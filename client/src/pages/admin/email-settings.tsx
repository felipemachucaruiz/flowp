import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { Mail, Server, Check, X, Loader2, Send, Eye, Clock } from "lucide-react";

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  fromEmail: string;
  fromName: string;
}

interface EmailLog {
  id: string;
  tenantId: string | null;
  templateType: string;
  recipientEmail: string;
  subject: string;
  status: string;
  errorMessage: string | null;
  sentAt: string;
}

const defaultSmtpConfig: SmtpConfig = {
  host: "",
  port: 587,
  secure: false,
  auth: {
    user: "",
    pass: "",
  },
  fromEmail: "",
  fromName: "Flowp",
};

export default function AdminEmailSettings() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>(defaultSmtpConfig);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data: savedConfig, isLoading: isLoadingConfig } = useQuery<SmtpConfig | null>({
    queryKey: ["/api/internal/smtp-config"],
  });

  const { data: emailLogs = [], isLoading: isLoadingLogs } = useQuery<EmailLog[]>({
    queryKey: ["/api/internal/email-logs"],
  });

  useEffect(() => {
    if (savedConfig) {
      setSmtpConfig(savedConfig);
    }
  }, [savedConfig]);

  const saveMutation = useMutation({
    mutationFn: async (config: SmtpConfig) => {
      const res = await apiRequest("POST", "/api/internal/smtp-config", {
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.auth.user,
        pass: config.auth.pass,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal/smtp-config"] });
      toast({
        title: t("admin.smtp_saved"),
        description: t("admin.smtp_saved_description"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("admin.smtp_save_error"),
        variant: "destructive",
      });
    },
  });

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await apiRequest("POST", "/api/internal/smtp-config/test", {
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        user: smtpConfig.auth.user,
        pass: smtpConfig.auth.pass,
        fromEmail: smtpConfig.fromEmail,
        fromName: smtpConfig.fromName,
      });
      const data = await res.json();
      setTestResult({ success: true, message: data.message || t("admin.smtp_test_success") });
    } catch (error) {
      setTestResult({ success: false, message: t("admin.smtp_test_failed") });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    saveMutation.mutate(smtpConfig);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  if (isLoadingConfig) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.email_settings")}</h1>
        <p className="text-muted-foreground">{t("admin.email_settings_description")}</p>
      </div>

      <Tabs defaultValue="smtp" className="w-full">
        <TabsList>
          <TabsTrigger value="smtp" className="gap-2" data-testid="tab-smtp">
            <Server className="w-4 h-4" />
            {t("admin.smtp_settings")}
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2" data-testid="tab-logs">
            <Mail className="w-4 h-4" />
            {t("admin.email_logs")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="smtp" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.smtp_configuration")}</CardTitle>
              <CardDescription>{t("admin.smtp_configuration_description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">{t("admin.smtp_host")}</Label>
                  <Input
                    id="smtp-host"
                    placeholder="smtp.example.com"
                    value={smtpConfig.host}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                    data-testid="input-smtp-host"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">{t("admin.smtp_port")}</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    placeholder="587"
                    value={smtpConfig.port}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, port: parseInt(e.target.value) || 587 })}
                    data-testid="input-smtp-port"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="smtp-secure"
                  checked={smtpConfig.secure}
                  onCheckedChange={(checked) => setSmtpConfig({ ...smtpConfig, secure: checked })}
                  data-testid="switch-smtp-secure"
                />
                <Label htmlFor="smtp-secure">{t("admin.smtp_secure")}</Label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtp-user">{t("admin.smtp_username")}</Label>
                  <Input
                    id="smtp-user"
                    placeholder="username@example.com"
                    value={smtpConfig.auth.user}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, auth: { ...smtpConfig.auth, user: e.target.value } })}
                    data-testid="input-smtp-user"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-pass">{t("admin.smtp_password")}</Label>
                  <Input
                    id="smtp-pass"
                    type="password"
                    placeholder="********"
                    value={smtpConfig.auth.pass}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, auth: { ...smtpConfig.auth, pass: e.target.value } })}
                    data-testid="input-smtp-pass"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtp-from-email">{t("admin.smtp_from_email")}</Label>
                  <Input
                    id="smtp-from-email"
                    placeholder="noreply@example.com"
                    value={smtpConfig.fromEmail}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, fromEmail: e.target.value })}
                    data-testid="input-smtp-from-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-from-name">{t("admin.smtp_from_name")}</Label>
                  <Input
                    id="smtp-from-name"
                    placeholder="Flowp"
                    value={smtpConfig.fromName}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, fromName: e.target.value })}
                    data-testid="input-smtp-from-name"
                  />
                </div>
              </div>

              {testResult && (
                <div className={`flex items-center gap-2 p-3 rounded-lg ${testResult.success ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                  {testResult.success ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  <span>{testResult.message}</span>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={isTesting || !smtpConfig.host}
                  data-testid="button-test-smtp"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t("admin.testing")}
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      {t("admin.test_connection")}
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saveMutation.isPending || !smtpConfig.host}
                  data-testid="button-save-smtp"
                >
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t("common.saving")}
                    </>
                  ) : (
                    t("common.save")
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.email_logs")}</CardTitle>
              <CardDescription>{t("admin.email_logs_description")}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingLogs ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : emailLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>{t("admin.no_email_logs")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {emailLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`email-log-${log.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${log.status === 'sent' ? 'bg-green-500' : 'bg-red-500'}`} />
                        <div>
                          <p className="font-medium text-sm">{log.subject}</p>
                          <p className="text-xs text-muted-foreground">{log.recipientEmail}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant={log.status === 'sent' ? 'default' : 'destructive'}>
                          {log.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(log.sentAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
