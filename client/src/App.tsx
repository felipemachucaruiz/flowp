import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-provider";
import { POSProvider } from "@/lib/pos-context";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { TourProvider } from "@/lib/tour-context";
import { TourOverlay, TourButton } from "@/components/tour-overlay";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationCenter } from "@/components/notification-center";
import { useSubscription } from "@/lib/use-subscription";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, AlertTriangle, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LockScreen } from "@/components/lock-screen";

import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import POSPage from "@/pages/pos";
import TablesPage from "@/pages/tables";
import KitchenPage from "@/pages/kitchen";
import InventoryPage from "@/pages/inventory";
import IngredientsPage from "@/pages/ingredients";
import LotsPage from "@/pages/lots";
import RecipesPage from "@/pages/recipes";
import AlertsPage from "@/pages/alerts";
import PurchasingPage from "@/pages/purchasing";
import ProductsPage from "@/pages/products";
import ReportsPage from "@/pages/reports";
import SalesHistoryPage from "@/pages/sales-history";
import CustomersPage from "@/pages/customers";
import LoyaltyRewardsPage from "@/pages/loyalty-rewards";
import SettingsPage from "@/pages/settings";
import ElectronicBillingPage from "@/pages/electronic-billing";
import SupportDocumentPage from "@/pages/support-document";

import AdminDashboard from "@/pages/admin/dashboard";
import AdminTenants from "@/pages/admin/tenants";
import AdminTenantDetail from "@/pages/admin/tenant-detail";
import AdminUsers from "@/pages/admin/users";
import AdminBilling from "@/pages/admin/billing";
import AdminEmailSettings from "@/pages/admin/email-settings";
import AdminDocuments from "@/pages/admin/documents";
import AdminPackages from "@/pages/admin/packages";
import AdminAddonStore from "@/pages/admin/addon-store";
import AdminAlerts from "@/pages/admin/alerts";
import AdminAudit from "@/pages/admin/audit";
import AdminWhatsAppPackages from "@/pages/admin/whatsapp-packages";
import AdminWhatsAppConfig from "@/pages/admin/whatsapp-config";
import AdminShopifyConfig from "@/pages/admin/shopify-config";
import LabelDesignerPage from "@/pages/label-designer";
import SubscriptionPage from "@/pages/subscription";
import CashRegisterPage from "@/pages/cash-register";
import OnboardingPage from "@/pages/onboarding";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";

function ProtectedRoute({ component: Component, skipOnboardingCheck }: { component: () => JSX.Element; skipOnboardingCheck?: boolean }) {
  const { user, isLoading, isInternal, tenant } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  // Internal users (superadmins) should only access admin routes
  if (isInternal) {
    return <Redirect to="/admin" />;
  }

  // Check if onboarding is complete (skip for the onboarding page itself)
  if (!skipOnboardingCheck && tenant && !tenant.onboardingComplete && location !== "/onboarding") {
    return <Redirect to="/onboarding" />;
  }

  return <Component />;
}

function AdminRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user, isLoading, isInternal } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user || !isInternal) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function TrialBanner() {
  const { trial, status, isLoading } = useSubscription();
  const { t } = useI18n();
  const [, navigate] = useLocation();

  const showBanner = trial.isTrialing || status === "trial" || status === "suspended";
  if (isLoading || !showBanner) return null;

  const daysText = trial.trialExpired
    ? t("trial.expired")
    : trial.daysRemaining <= 0
    ? t("trial.last_day")
    : trial.daysRemaining === 1
    ? t("trial.day_remaining")
    : t("trial.days_remaining").replace("{days}", String(trial.daysRemaining));

  const isUrgent = trial.trialExpired || trial.daysRemaining <= 3;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-1.5 text-xs shrink-0",
        trial.trialExpired
          ? "bg-destructive/10 text-destructive border-b border-destructive/20"
          : isUrgent
          ? "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-b border-orange-500/20"
          : "bg-primary/5 text-muted-foreground border-b"
      )}
      data-testid="banner-trial"
    >
      <div className="flex items-center gap-2 flex-wrap">
        {isUrgent ? (
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Clock className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>{t("trial.banner_title")}</span>
        <Badge variant={trial.trialExpired ? "destructive" : "secondary"}>
          {daysText}
        </Badge>
      </div>
      <Button
        variant={trial.trialExpired ? "destructive" : "outline"}
        size="sm"
        onClick={() => navigate("/subscription")}
        data-testid="button-trial-upgrade"
      >
        {t("trial.upgrade_now")}
      </Button>
    </div>
  );
}

function SuspendedGate() {
  const { trial, status, isLoading } = useSubscription();
  const { t } = useI18n();
  const [location, navigate] = useLocation();

  if (isLoading) return null;
  if (status !== "suspended") return null;
  if (location === "/subscription") return null;

  const isTrialExpired = trial.trialExpired;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm" data-testid="gate-suspended">
      <div className="max-w-md text-center space-y-6 p-8">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">
            {isTrialExpired ? t("trial.expired_title" as any) : t("trial.suspended_title" as any)}
          </h2>
          <p className="text-muted-foreground">
            {isTrialExpired ? t("trial.expired_description" as any) : t("trial.suspended_description" as any)}
          </p>
        </div>
        <Button onClick={() => navigate("/subscription")} className="w-full" data-testid="button-upgrade-from-gate">
          <Crown className="w-4 h-4 mr-2" />
          {isTrialExpired ? t("trial.choose_plan" as any) : t("trial.contact_support" as any)}
        </Button>
      </div>
    </div>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  if (!user) {
    return <>{children}</>;
  }

  const style = {
    "--sidebar-width": "12rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties} defaultOpen={window.innerWidth >= 1280}>
      <div className="flex h-screen min-h-dvh w-full bg-background safe-area-pt">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex h-10 items-center justify-between gap-2 border-b px-3 bg-card shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <NotificationCenter />
              <div className="hidden sm:block"><TourButton /></div>
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
            </div>
          </header>
          <TrialBanner />
          <main className="flex-1 overflow-hidden">{children}</main>
        </div>
      </div>
      <SuspendedGate />
      <TourOverlay />
      <LockScreen />
    </SidebarProvider>
  );
}

function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isInternal } = useAuth();

  if (!user || !isInternal) {
    return <>{children}</>;
  }

  const style = {
    "--sidebar-width": "12rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties} defaultOpen={window.innerWidth >= 1280}>
      <div className="flex h-screen w-full">
        <AdminSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex h-10 items-center gap-2 border-b px-3 bg-card shrink-0">
            <SidebarTrigger data-testid="button-admin-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-hidden">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AdminRouter() {
  return (
    <AdminLayout>
      <Switch>
        <Route path="/admin">
          <AdminRoute component={AdminDashboard} />
        </Route>
        <Route path="/admin/tenants/:tenantId">
          <AdminRoute component={AdminTenantDetail} />
        </Route>
        <Route path="/admin/tenants">
          <AdminRoute component={AdminTenants} />
        </Route>
        <Route path="/admin/users">
          <AdminRoute component={AdminUsers} />
        </Route>
        <Route path="/admin/billing">
          <AdminRoute component={AdminBilling} />
        </Route>
        <Route path="/admin/documents">
          <AdminRoute component={AdminDocuments} />
        </Route>
        <Route path="/admin/packages">
          <AdminRoute component={AdminPackages} />
        </Route>
        <Route path="/admin/addon-store">
          <AdminRoute component={AdminAddonStore} />
        </Route>
        <Route path="/admin/alerts">
          <AdminRoute component={AdminAlerts} />
        </Route>
        <Route path="/admin/audit">
          <AdminRoute component={AdminAudit} />
        </Route>
        <Route path="/admin/whatsapp-config">
          <AdminRoute component={AdminWhatsAppConfig} />
        </Route>
        <Route path="/admin/shopify-config">
          <AdminRoute component={AdminShopifyConfig} />
        </Route>
        <Route path="/admin/whatsapp-packages">
          <AdminRoute component={AdminWhatsAppPackages} />
        </Route>
        <Route path="/admin/email-settings">
          <AdminRoute component={AdminEmailSettings} />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AdminLayout>
  );
}

function TenantRouter() {
  const { isInternal } = useAuth();
  
  // Internal users should be redirected to admin
  if (isInternal) {
    return <Redirect to="/admin" />;
  }
  
  return (
    <AppLayout>
      <Switch>
        <Route path="/">
          <Redirect to="/pos" />
        </Route>
        <Route path="/pos">
          <ProtectedRoute component={POSPage} />
        </Route>
        <Route path="/tables">
          <ProtectedRoute component={TablesPage} />
        </Route>
        <Route path="/kitchen">
          <ProtectedRoute component={KitchenPage} />
        </Route>
        <Route path="/inventory">
          <ProtectedRoute component={InventoryPage} />
        </Route>
        <Route path="/ingredients">
          <ProtectedRoute component={IngredientsPage} />
        </Route>
        <Route path="/ingredients/:ingredientId/lots">
          <ProtectedRoute component={LotsPage} />
        </Route>
        <Route path="/recipes">
          <ProtectedRoute component={RecipesPage} />
        </Route>
        <Route path="/alerts">
          <ProtectedRoute component={AlertsPage} />
        </Route>
        <Route path="/purchasing">
          <ProtectedRoute component={PurchasingPage} />
        </Route>
        <Route path="/products">
          <ProtectedRoute component={ProductsPage} />
        </Route>
        <Route path="/reports">
          <ProtectedRoute component={ReportsPage} />
        </Route>
        <Route path="/sales-history">
          <ProtectedRoute component={SalesHistoryPage} />
        </Route>
        <Route path="/customers">
          <ProtectedRoute component={CustomersPage} />
        </Route>
        <Route path="/loyalty">
          <ProtectedRoute component={LoyaltyRewardsPage} />
        </Route>
        <Route path="/cash-register">
          <ProtectedRoute component={CashRegisterPage} />
        </Route>
        <Route path="/settings">
          <ProtectedRoute component={SettingsPage} />
        </Route>
        <Route path="/settings/shopify">
          <ProtectedRoute component={SettingsPage} />
        </Route>
        <Route path="/labels">
          <ProtectedRoute component={LabelDesignerPage} />
        </Route>
        <Route path="/subscription">
          <ProtectedRoute component={SubscriptionPage} />
        </Route>
        <Route path="/electronic-billing">
          <ProtectedRoute component={ElectronicBillingPage} />
        </Route>
        <Route path="/electronic-billing/support-doc">
          <ProtectedRoute component={SupportDocumentPage} />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function OnboardingRoute() {
  const { user, isLoading, tenant } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }
  
  if (!user) {
    return <Redirect to="/login" />;
  }
  
  // If onboarding is already complete, redirect to POS
  if (tenant?.onboardingComplete) {
    return <Redirect to="/pos" />;
  }
  
  return <OnboardingPage />;
}

function Router() {
  const [location] = useLocation();
  const isAdminRoute = location.startsWith("/admin");

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/onboarding" component={OnboardingRoute} />
      {isAdminRoute ? <AdminRouter /> : <TenantRouter />}
    </Switch>
  );
}

function AppContent() {
  const { tenant } = useAuth();
  
  return (
    <I18nProvider initialLanguage={tenant?.language || "en"}>
      <TourProvider>
        <POSProvider>
          <TooltipProvider>
            <Router />
            <Toaster />
          </TooltipProvider>
        </POSProvider>
      </TourProvider>
    </I18nProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
