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
import { FlowpLogo } from "@/components/flowp-logo";
import {
  LayoutDashboard,
  Building2,
  FileText,
  CreditCard,
  Users,
  Settings,
  LogOut,
  Mail,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AdminSidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();
  const { t, language, setLanguage } = useI18n();

  const adminMenuItems = [
    {
      title: t("admin.dashboard"),
      url: "/admin",
      icon: LayoutDashboard,
    },
    {
      title: t("admin.tenants"),
      url: "/admin/tenants",
      icon: Building2,
    },
    {
      title: t("admin.users"),
      url: "/admin/users",
      icon: Users,
    },
    {
      title: t("admin.ebilling"),
      url: "/admin/ebilling",
      icon: FileText,
    },
    {
      title: t("admin.billing"),
      url: "/admin/billing",
      icon: CreditCard,
    },
    {
      title: t("admin.email_settings"),
      url: "/admin/email-settings",
      icon: Mail,
    },
    {
      title: t("admin.support"),
      url: "/admin/support",
      icon: Settings,
    },
  ];

  return (
    <Sidebar data-testid="admin-sidebar">
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center gap-2">
          <FlowpLogo className="h-8" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("admin.navigation")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminMenuItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                  >
                    <Link href={item.url} data-testid={`link-admin-${item.url.split('/').pop()}`}>
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
      <SidebarFooter className="border-t p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <Select value={language} onValueChange={(val) => setLanguage(val as "en" | "es" | "pt")}>
            <SelectTrigger className="flex-1" data-testid="select-admin-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Español</SelectItem>
              <SelectItem value="pt">Português</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={logout}
          data-testid="button-admin-logout"
        >
          <LogOut className="h-4 w-4 mr-2" />
          {t("admin.logout")}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
