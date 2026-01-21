import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-provider";
import { useI18n } from "@/lib/i18n";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import flowpLogo from "@assets/Sin_título-1_1769033877071.webp";
import {
  ShoppingCart,
  LayoutGrid,
  ChefHat,
  Package,
  BarChart3,
  Settings,
  Sun,
  Moon,
  LogOut,
  User,
} from "lucide-react";

export function AppSidebar() {
  const [location] = useLocation();
  const { user, tenant, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();

  const isRestaurant = tenant?.type === "restaurant";

  const mainMenuItems = [
    {
      title: t("nav.pos"),
      url: "/pos",
      icon: ShoppingCart,
    },
    ...(isRestaurant
      ? [
          {
            title: t("nav.tables"),
            url: "/tables",
            icon: LayoutGrid,
          },
          {
            title: t("nav.kitchen"),
            url: "/kitchen",
            icon: ChefHat,
          },
        ]
      : []),
    {
      title: t("nav.inventory"),
      url: "/inventory",
      icon: Package,
    },
    {
      title: t("nav.reports"),
      url: "/reports",
      icon: BarChart3,
    },
    {
      title: t("nav.settings"),
      url: "/settings",
      icon: Settings,
    },
  ];

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-3">
          <img src={flowpLogo} alt="Flowp" className="h-8" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  className="w-full h-auto py-3"
                  data-testid="button-user-menu"
                >
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {user?.name ? getInitials(user.name) : <User className="w-4 h-4" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start flex-1 text-left min-w-0">
                    <span className="text-xs text-muted-foreground truncate w-full">
                      {tenant?.name || "Store"}
                    </span>
                    <span className="text-sm font-medium truncate w-full">
                      {user?.name || "User"}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize truncate w-full">
                      {user?.role || "Staff"}
                    </span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-[--radix-dropdown-menu-trigger-width]"
              >
                <DropdownMenuItem
                  onClick={toggleTheme}
                  data-testid="button-toggle-theme"
                >
                  {theme === "light" ? (
                    <>
                      <Moon className="w-4 h-4 mr-2" />
                      Dark Mode
                    </>
                  ) : (
                    <>
                      <Sun className="w-4 h-4 mr-2" />
                      Light Mode
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="text-destructive focus:text-destructive"
                  data-testid="button-logout"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {t("nav.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
