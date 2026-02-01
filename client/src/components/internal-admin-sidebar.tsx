import { Link, useLocation } from "wouter";
import { useInternalAdmin } from "@/lib/internal-admin-context";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Building2,
  FileText,
  Package,
  AlertTriangle,
  ClipboardList,
  LogOut,
  Shield,
} from "lucide-react";

const menuItems = [
  { title: "Dashboard", icon: LayoutDashboard, href: "/internal-admin/dashboard", roles: ["superadmin", "supportagent", "billingops"] },
  { title: "Tenants", icon: Building2, href: "/internal-admin/tenants", roles: ["superadmin", "supportagent", "billingops"] },
  { title: "Documents", icon: FileText, href: "/internal-admin/documents", roles: ["superadmin", "supportagent", "billingops"] },
  { title: "Packages", icon: Package, href: "/internal-admin/packages", roles: ["superadmin", "billingops"] },
  { title: "Alerts", icon: AlertTriangle, href: "/internal-admin/alerts", roles: ["superadmin", "supportagent", "billingops"] },
  { title: "Audit Log", icon: ClipboardList, href: "/internal-admin/audit", roles: ["superadmin"] },
];

export function InternalAdminSidebar() {
  const [location] = useLocation();
  const { user, logout, hasPermission } = useInternalAdmin();

  const filteredItems = menuItems.filter((item) => hasPermission(item.roles));

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      superadmin: "bg-red-500",
      supportagent: "bg-blue-500",
      billingops: "bg-green-500",
    };
    return colors[role] || "bg-gray-500";
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <Shield className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold">Admin Console</p>
            <p className="text-xs text-muted-foreground">Flowp Internal</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={location === item.href}>
                    <Link href={item.href} data-testid={`nav-${item.title.toLowerCase().replace(" ", "-")}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        {user && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <span className="text-xs font-medium">{user.name?.[0] || user.email[0].toUpperCase()}</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium">{user.name || user.email}</p>
                <Badge className={`text-xs text-white ${getRoleBadge(user.role)}`}>
                  {user.role}
                </Badge>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={logout}
              data-testid="button-logout"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
