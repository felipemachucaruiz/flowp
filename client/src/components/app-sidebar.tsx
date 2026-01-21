import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-provider";
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
import {
  Store,
  ShoppingCart,
  LayoutGrid,
  ChefHat,
  Package,
  BarChart3,
  Settings,
  Sun,
  Moon,
  LogOut,
  ChevronUp,
  User,
} from "lucide-react";

export function AppSidebar() {
  const [location] = useLocation();
  const { user, tenant, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const isRestaurant = tenant?.type === "restaurant";

  const mainMenuItems = [
    {
      title: "Point of Sale",
      url: "/pos",
      icon: ShoppingCart,
    },
    ...(isRestaurant
      ? [
          {
            title: "Tables",
            url: "/tables",
            icon: LayoutGrid,
          },
          {
            title: "Kitchen",
            url: "/kitchen",
            icon: ChefHat,
          },
        ]
      : []),
    {
      title: "Inventory",
      url: "/inventory",
      icon: Package,
    },
    {
      title: "Reports",
      url: "/reports",
      icon: BarChart3,
    },
    {
      title: "Settings",
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
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary text-primary-foreground">
            <Store className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm truncate max-w-[140px]">
              {tenant?.name || "POS Pro"}
            </span>
            <span className="text-xs text-muted-foreground capitalize">
              {tenant?.type || "Business"}
            </span>
          </div>
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
                  className="w-full"
                  data-testid="button-user-menu"
                >
                  <Avatar className="w-6 h-6">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {user?.name ? getInitials(user.name) : <User className="w-3 h-3" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start flex-1 text-left">
                    <span className="text-sm font-medium truncate max-w-[120px]">
                      {user?.name || "User"}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {user?.role || "Staff"}
                    </span>
                  </div>
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
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
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
