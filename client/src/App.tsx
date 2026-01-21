import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-provider";
import { POSProvider } from "@/lib/pos-context";
import { I18nProvider } from "@/lib/i18n";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";

import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import POSPage from "@/pages/pos";
import TablesPage from "@/pages/tables";
import KitchenPage from "@/pages/kitchen";
import InventoryPage from "@/pages/inventory";
import ReportsPage from "@/pages/reports";
import SettingsPage from "@/pages/settings";

import AdminDashboard from "@/pages/admin/dashboard";
import AdminTenants from "@/pages/admin/tenants";

function ProtectedRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user, isLoading } = useAuth();

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

function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return <>{children}</>;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex h-12 items-center gap-2 border-b px-4 bg-card shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isInternal } = useAuth();

  if (!user || !isInternal) {
    return <>{children}</>;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AdminSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex h-12 items-center gap-2 border-b px-4 bg-card shrink-0">
            <SidebarTrigger data-testid="button-admin-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
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
        <Route path="/admin/tenants">
          <AdminRoute component={AdminTenants} />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AdminLayout>
  );
}

function TenantRouter() {
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
        <Route path="/reports">
          <ProtectedRoute component={ReportsPage} />
        </Route>
        <Route path="/settings">
          <ProtectedRoute component={SettingsPage} />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  const [location] = useLocation();
  const isAdminRoute = location.startsWith("/admin");

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      {isAdminRoute ? <AdminRouter /> : <TenantRouter />}
    </Switch>
  );
}

function AppContent() {
  const { tenant } = useAuth();
  
  return (
    <I18nProvider initialLanguage={tenant?.language || "en"}>
      <POSProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </POSProvider>
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
