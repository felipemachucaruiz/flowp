import { ReactNode } from "react";
import { useLocation, Redirect } from "wouter";
import { useInternalAdmin } from "@/lib/internal-admin-context";
import { InternalAdminSidebar } from "@/components/internal-admin-sidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";

interface InternalAdminLayoutProps {
  children: ReactNode;
}

export function InternalAdminLayout({ children }: InternalAdminLayoutProps) {
  const { user, loading } = useInternalAdmin();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!user && location !== "/internal-admin/login") {
    return <Redirect to="/internal-admin/login" />;
  }

  if (location === "/internal-admin/login") {
    return <>{children}</>;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full">
        <InternalAdminSidebar />
        <SidebarInset className="flex flex-1 flex-col">
          <header className="flex h-12 items-center justify-between gap-4 border-b px-4">
            <SidebarTrigger data-testid="button-admin-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
