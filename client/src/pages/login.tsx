import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Lock, User, ArrowRight, Loader2, Globe, Fingerprint } from "lucide-react";
import { FlowpLogo } from "@/components/flowp-logo";
import {
  isBiometricAvailable,
  getBiometryType,
  authenticateWithBiometric,
  saveCredentials,
  getStoredCredentials,
  isBiometricEnabled
} from "@/lib/biometric-auth";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login, user, tenant, isInternal, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { t, language, setLanguage } = useI18n();
  const [isLoading, setIsLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string>("biometric");
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState<{ username: string; password: string } | null>(null);

  // Check biometric availability on mount
  useEffect(() => {
    async function checkBiometric() {
      const available = await isBiometricAvailable();
      setBiometricAvailable(available);
      if (available) {
        const type = await getBiometryType();
        setBiometricType(type);
      }
    }
    checkBiometric();
  }, []);

  // Redirect if already logged in (only for users who completed onboarding)
  // Don't force redirect to onboarding - let them stay on login to log out if needed
  useEffect(() => {
    if (!authLoading && user) {
      if (isInternal) {
        navigate("/admin");
      } else if (tenant && tenant.onboardingComplete) {
        navigate("/pos");
      }
      // If onboarding not complete, don't redirect - let user stay on login page
      // They can log out or will be redirected after successful new login
    }
  }, [authLoading, user, tenant, isInternal, navigate]);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const getBiometricLabel = () => {
    switch (biometricType) {
      case "faceId": return "Face ID";
      case "touchId": return "Touch ID";
      case "fingerprint": return t("login.fingerprint") || "Fingerprint";
      default: return t("login.biometric") || "Biometric";
    }
  };

  const handleBiometricLogin = async () => {
    setIsLoading(true);
    try {
      const authenticated = await authenticateWithBiometric(t("login.authenticate_prompt") || "Authenticate to login");
      if (!authenticated) {
        toast({
          title: t("login.auth_failed") || "Authentication Failed",
          description: t("login.try_again") || "Please try again",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
      
      const creds = await getStoredCredentials();
      if (!creds) {
        toast({
          title: t("login.no_stored_credentials") || "No Stored Credentials",
          description: t("login.login_with_password") || "Please login with your password",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
      
      const result = await login(creds.username, creds.password);
      if (result.success) {
        toast({
          title: t("login.welcome_back"),
          description: t("login.login_success"),
        });
        const redirectPath = result.redirectTo || "/pos";
        window.location.href = redirectPath;
      } else {
        toast({
          title: t("login.login_failed"),
          description: t("login.credentials_changed") || "Stored credentials are no longer valid",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: t("common.error"),
        description: t("login.error"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnableBiometric = async () => {
    if (pendingCredentials) {
      const saved = await saveCredentials(pendingCredentials.username, pendingCredentials.password);
      if (saved) {
        toast({
          title: getBiometricLabel() + " " + (t("login.enabled") || "Enabled"),
          description: t("login.biometric_enabled_desc") || "You can now login with biometrics",
        });
      }
    }
    setShowBiometricPrompt(false);
    const redirectPath = "/pos";
    window.location.href = redirectPath;
  };

  const handleSkipBiometric = () => {
    setShowBiometricPrompt(false);
    const redirectPath = "/pos";
    window.location.href = redirectPath;
  };

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const result = await login(data.username, data.password);
      if (result.success) {
        toast({
          title: t("login.welcome_back"),
          description: t("login.login_success"),
        });
        
        // If biometric available and not already enabled, prompt to enable
        if (biometricAvailable && !isBiometricEnabled()) {
          setPendingCredentials({ username: data.username, password: data.password });
          setShowBiometricPrompt(true);
          setIsLoading(false);
          return;
        }
        
        // Use window.location for reliable redirect after login
        const redirectPath = result.redirectTo || "/pos";
        window.location.href = redirectPath;
      } else {
        toast({
          title: t("login.login_failed"),
          description: t("login.invalid_credentials"),
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: t("common.error"),
        description: t("login.error"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-dvh flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4 safe-area-inset">
      <div className="w-full max-w-md space-y-6">
        {/* Logo and branding */}
        <div className="text-center space-y-2">
          <FlowpLogo className="h-12 mx-auto mb-4" />
          <p className="text-muted-foreground">
            {t("login.subtitle")}
          </p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">{t("login.title")}</CardTitle>
            <CardDescription>
              {t("login.credentials_prompt")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("login.username")}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            {...field}
                            placeholder={t("login.username_placeholder")}
                            className="pl-10"
                            data-testid="input-username"
                            autoComplete="username"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("login.password")}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            {...field}
                            type="password"
                            placeholder={t("login.password_placeholder")}
                            className="pl-10"
                            data-testid="input-password"
                            autoComplete="current-password"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => navigate("/forgot-password")}
                    className="text-sm text-muted-foreground hover:text-primary hover:underline"
                    data-testid="link-forgot-password"
                  >
                    {t("login.forgot_password")}
                  </button>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                  data-testid="button-login"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t("login.signing_in")}
                    </>
                  ) : (
                    <>
                      {t("login.sign_in")}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>

                {biometricAvailable && isBiometricEnabled() && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isLoading}
                    onClick={handleBiometricLogin}
                    data-testid="button-biometric-login"
                  >
                    <Fingerprint className="w-4 h-4 mr-2" />
                    {t("login.login_with") || "Login with"} {getBiometricLabel()}
                  </Button>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>

        {showBiometricPrompt && (
          <Card className="border-0 shadow-lg">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl flex items-center gap-2">
                <Fingerprint className="w-5 h-5" />
                {t("login.enable_biometric") || "Enable"} {getBiometricLabel()}?
              </CardTitle>
              <CardDescription>
                {t("login.biometric_prompt_desc") || "Login faster next time using"} {getBiometricLabel()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full"
                onClick={handleEnableBiometric}
                data-testid="button-enable-biometric"
              >
                {t("login.enable") || "Enable"} {getBiometricLabel()}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={handleSkipBiometric}
                data-testid="button-skip-biometric"
              >
                {t("login.skip") || "Skip for now"}
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            {t("login.no_account")}{" "}
            <button
              onClick={() => navigate("/register")}
              className="text-primary hover:underline font-medium"
              data-testid="link-register"
            >
              {t("login.register_link")}
            </button>
          </p>
        </div>

        {/* Language Selector */}
        <div className="flex items-center justify-center gap-2 pt-4">
          <Globe className="w-4 h-4 text-muted-foreground" />
          <Select value={language} onValueChange={(val) => setLanguage(val as "en" | "es" | "pt")}>
            <SelectTrigger className="w-40" data-testid="select-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Español</SelectItem>
              <SelectItem value="pt">Português</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
