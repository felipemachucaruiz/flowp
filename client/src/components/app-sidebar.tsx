import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-provider";
import { useI18n } from "@/lib/i18n";
import { canAccessPage, getRoleLabel, type Permission, hasAnyPermission } from "@/lib/permissions";
import { useSubscription } from "@/lib/use-subscription";
import { SUBSCRIPTION_FEATURES, type SubscriptionFeature } from "@shared/schema";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { FlowpLogo } from "@/components/flowp-logo";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ShoppingCart,
  LayoutGrid,
  ChefHat,
  Package,
  BarChart3,
  Receipt,
  Settings,
  Sun,
  Moon,
  LogOut,
  User,
  Users,
  Download,
  Tag,
  Truck,
  Gift,
  AlertTriangle,
  FileText,
  Barcode,
  Landmark,
  Lock,
  KeyRound,
} from "lucide-react";
import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, tenant, logout, refreshUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const { toast } = useToast();
  const { isMobile, setOpenMobile } = useSidebar();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinForm, setPinForm] = useState({ currentPin: "", newPin: "", confirmPin: "" });
  const [pinError, setPinError] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const userHasPin = !!(user as any)?.hasPin;

  const handleSetPin = async () => {
    setPinError("");
    if (pinForm.newPin.length < 4 || pinForm.newPin.length > 6 || !/^\d+$/.test(pinForm.newPin)) {
      setPinError(t("pin.pin_description"));
      return;
    }
    if (pinForm.newPin !== pinForm.confirmPin) {
      setPinError(t("pin.pin_mismatch"));
      return;
    }
    setPinSaving(true);
    try {
      const res = await fetch("/api/auth/set-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user?.id || "",
          "x-tenant-id": (tenant as any)?.id || "",
        },
        body: JSON.stringify({
          pin: pinForm.newPin,
          ...(userHasPin ? { currentPin: pinForm.currentPin } : {}),
        }),
      });
      if (res.ok) {
        toast({ title: userHasPin ? t("pin.pin_changed_success") : t("pin.pin_set_success") });
        setPinDialogOpen(false);
        setPinForm({ currentPin: "", newPin: "", confirmPin: "" });
        refreshUser();
      } else {
        const data = await res.json();
        if (res.status === 401) {
          setPinError(t("pin.current_pin_wrong"));
        } else {
          setPinError(data.message || "Error");
        }
      }
    } catch {
      setPinError("Error");
    } finally {
      setPinSaving(false);
    }
  };

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const isRestaurant = tenant?.type === "restaurant";
  const userRole = user?.role;
  const { hasFeature, tier } = useSubscription();

  const allMenuItems: { title: string; url: string; icon: any; page: string; requiredFeature?: SubscriptionFeature; minTier?: string }[] = [
    {
      title: t("nav.pos"),
      url: "/pos",
      icon: ShoppingCart,
      page: "pos",
    },
    ...(isRestaurant
      ? [
          {
            title: t("nav.tables"),
            url: "/tables",
            icon: LayoutGrid,
            page: "tables",
          },
          {
            title: t("nav.kitchen"),
            url: "/kitchen",
            icon: ChefHat,
            page: "kitchen",
          },
        ]
      : []),
    {
      title: t("nav.products"),
      url: "/products",
      icon: Tag,
      page: "products",
    },
    {
      title: t("nav.labels"),
      url: "/labels",
      icon: Barcode,
      page: "labels",
      requiredFeature: SUBSCRIPTION_FEATURES.LABEL_DESIGNER,
      minTier: "pro",
    },
    {
      title: t("nav.inventory"),
      url: "/inventory",
      icon: Package,
      page: "inventory",
    },
    ...(tenant?.type === "restaurant"
      ? [
          {
            title: t("ingredients.title"),
            url: "/ingredients",
            icon: Package,
            page: "ingredients",
            requiredFeature: SUBSCRIPTION_FEATURES.INGREDIENTS_RECIPES as SubscriptionFeature,
            minTier: "pro",
          },
          {
            title: t("recipes.title"),
            url: "/recipes",
            icon: ChefHat,
            page: "recipes",
            requiredFeature: SUBSCRIPTION_FEATURES.INGREDIENTS_RECIPES as SubscriptionFeature,
            minTier: "pro",
          },
          {
            title: t("alerts.title"),
            url: "/alerts",
            icon: AlertTriangle,
            page: "alerts",
          },
        ]
      : []),
    {
      title: t("nav.purchasing"),
      url: "/purchasing",
      icon: Truck,
      page: "purchasing",
    },
    {
      title: t("nav.customers") || "Customers",
      url: "/customers",
      icon: Users,
      page: "customers",
    },
    {
      title: t("nav.loyalty") || "Loyalty",
      url: "/loyalty",
      icon: Gift,
      page: "loyalty-rewards",
    },
    {
      title: t("nav.cash_register"),
      url: "/cash-register",
      icon: Landmark,
      page: "cash-register",
    },
    {
      title: t("nav.reports"),
      url: "/reports",
      icon: BarChart3,
      page: "reports",
    },
    {
      title: t("nav.sales_history") || "Sales History",
      url: "/sales-history",
      icon: Receipt,
      page: "sales-history",
    },
    {
      title: t("nav.ebilling") || "E-Billing",
      url: "/electronic-billing",
      icon: FileText,
      page: "electronic-billing",
    },
    {
      title: t("nav.settings"),
      url: "/settings",
      icon: Settings,
      page: "settings",
    },
  ];

  const tierOrder: Record<string, number> = { basic: 0, pro: 1, enterprise: 2 };
  const currentTierLevel = tierOrder[tier] ?? 0;
  const mainMenuItems = allMenuItems.filter(item => canAccessPage(userRole, item.page));

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <>
    <Sidebar data-tour="sidebar">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-3">
          <FlowpLogo className="h-10 sm:h-8" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => {
                const isLocked = item.requiredFeature && !hasFeature(item.requiredFeature);
                const requiredTierLabel = item.minTier === "enterprise" ? "AVZ" : "PRO";

                if (isLocked) {
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        className="h-12 sm:h-9 text-base sm:text-sm opacity-60"
                        data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}-locked`}
                      >
                        <Link
                          href="/subscription"
                          onClick={() => { if (isMobile) setOpenMobile(false); }}
                        >
                          <item.icon className="w-5 h-5 sm:w-4 sm:h-4" />
                          <span className="flex-1">{item.title}</span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0 no-default-hover-elevate no-default-active-elevate">
                            <Lock className="w-3 h-3 mr-0.5" />
                            {requiredTierLabel}
                          </Badge>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      className="h-12 sm:h-9 text-base sm:text-sm"
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link 
                        href={item.url}
                        onClick={() => { if (isMobile) setOpenMobile(false); }}
                      >
                        <item.icon className="w-5 h-5 sm:w-4 sm:h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {user?.name ? getInitials(user.name) : <User className="w-4 h-4" />}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-xs text-muted-foreground truncate">
                {tenant?.name || "Store"}
              </span>
              <span className="text-sm font-medium truncate">
                {user?.name || "User"}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {userRole ? getRoleLabel(userRole) : "Staff"}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:hidden"
              onClick={toggleTheme}
              data-testid="button-toggle-theme"
            >
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPinDialogOpen(true); setPinForm({ currentPin: "", newPin: "", confirmPin: "" }); setPinError(""); }}
              data-testid="button-set-pin"
            >
              <KeyRound className="w-4 h-4 mr-1" />
              {userHasPin ? t("pin.change_pin") : t("pin.set_pin")}
            </Button>
            {installPrompt && !isInstalled && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:hidden"
                onClick={handleInstallClick}
                data-testid="button-install-app"
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-destructive hover:text-destructive"
              onClick={() => { logout(); if (isMobile) setOpenMobile(false); }}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-1" />
              {t("nav.logout")}
            </Button>
          </div>
        </div>
      </SidebarFooter>

    </Sidebar>

      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{userHasPin ? t("pin.change_pin") : t("pin.set_pin")}</DialogTitle>
            <DialogDescription>{t("pin.pin_description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {userHasPin && (
              <div className="space-y-2">
                <Label htmlFor="current-pin">{t("pin.current_pin")}</Label>
                <Input
                  id="current-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinForm.currentPin}
                  onChange={(e) => setPinForm(p => ({ ...p, currentPin: e.target.value.replace(/\D/g, "") }))}
                  data-testid="input-current-pin"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-pin">{t("pin.new_pin")}</Label>
              <Input
                id="new-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinForm.newPin}
                onChange={(e) => setPinForm(p => ({ ...p, newPin: e.target.value.replace(/\D/g, "") }))}
                data-testid="input-new-pin"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pin">{t("pin.confirm_pin")}</Label>
              <Input
                id="confirm-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinForm.confirmPin}
                onChange={(e) => setPinForm(p => ({ ...p, confirmPin: e.target.value.replace(/\D/g, "") }))}
                data-testid="input-confirm-pin"
              />
            </div>
            {pinError && (
              <p className="text-sm text-destructive" data-testid="text-pin-error">{pinError}</p>
            )}
            <Button className="w-full" onClick={handleSetPin} disabled={pinSaving} data-testid="button-save-pin">
              {pinSaving ? t("common.saving") : (userHasPin ? t("pin.change_pin") : t("pin.set_pin"))}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
