import { Link, useLocation } from "wouter";
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
import flowpLogo from "@assets/Sin_título-1_1769033877071.webp";
import {
  LayoutDashboard,
  Building2,
  FileText,
  CreditCard,
  Users,
  Settings,
  LogOut,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

const adminMenuItems = [
  {
    title: "Dashboard",
    url: "/admin",
    icon: LayoutDashboard,
  },
  {
    title: "Tenants",
    url: "/admin/tenants",
    icon: Building2,
  },
  {
    title: "Users",
    url: "/admin/users",
    icon: Users,
  },
  {
    title: "E-Billing",
    url: "/admin/ebilling",
    icon: FileText,
  },
  {
    title: "Billing",
    url: "/admin/billing",
    icon: CreditCard,
  },
  {
    title: "Email Settings",
    url: "/admin/email-settings",
    icon: Mail,
  },
  {
    title: "Support",
    url: "/admin/support",
    icon: Settings,
  },
];

export function AdminSidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();

  return (
    <Sidebar data-testid="admin-sidebar">
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center gap-2">
          <img src={flowpLogo} alt="Flowp" className="h-8" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                  >
                    <Link href={item.url} data-testid={`link-admin-${item.title.toLowerCase()}`}>
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
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={logout}
          data-testid="button-admin-logout"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
