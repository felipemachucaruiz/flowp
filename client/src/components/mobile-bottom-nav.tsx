import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  ShoppingCart,
  LayoutGrid,
  Package,
  BarChart3,
  Settings,
  MoreHorizontal,
  Users,
  Receipt,
  Tag,
  Truck,
  Gift,
  FileText,
  MessageCircle,
  Barcode,
  Landmark,
  History,
  ChefHat,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useState } from "react";
import { canAccessPage, hasAnyPermission } from "@/lib/permissions";
import { useSubscription } from "@/lib/use-subscription";

export function MobileBottomNav() {
  const [location, navigate] = useLocation();
  const { tenant, user } = useAuth();
  const { t } = useI18n();
  const { hasFeature } = useSubscription();
  const [moreOpen, setMoreOpen] = useState(false);

  const isRestaurant = tenant?.type === "restaurant";
  const userRole = (user as any)?.role;

  const mainNavItems = [
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
  ];

  const moreNavGroups = [
    {
      label: t("nav.pos"),
      items: [
        {
          title: t("nav.products"),
          url: "/products",
          icon: Tag,
        },
        {
          title: t("nav.customers") || "Customers",
          url: "/customers",
          icon: Users,
        },
        {
          title: t("nav.sales_history") || "Sales History",
          url: "/sales-history",
          icon: History,
        },
        {
          title: t("nav.cash_register") || "Cash Register",
          url: "/cash-register",
          icon: Landmark,
        },
      ],
    },
    {
      label: t("nav.inventory"),
      items: [
        {
          title: t("nav.purchasing") || "Purchasing",
          url: "/purchasing",
          icon: Truck,
        },
        ...(isRestaurant
          ? [
              {
                title: t("nav.kitchen"),
                url: "/kitchen",
                icon: ChefHat,
              },
            ]
          : []),
        {
          title: t("nav.alerts"),
          url: "/alerts",
          icon: AlertTriangle,
        },
      ],
    },
    {
      label: t("nav.loyalty") || "Loyalty",
      items: [
        {
          title: t("nav.loyalty") || "Loyalty",
          url: "/loyalty",
          icon: Gift,
        },
        ...(hasFeature("electronic_invoicing" as any)
          ? [
              {
                title: t("nav.electronic_billing"),
                url: "/electronic-billing",
                icon: FileText,
              },
            ]
          : []),
        ...(hasFeature("whatsapp_chat" as any)
          ? [
              {
                title: "WhatsApp",
                url: "/whatsapp-chat",
                icon: MessageCircle,
              },
            ]
          : []),
        ...(hasFeature("label_designer" as any)
          ? [
              {
                title: t("nav.labels") || "Labels",
                url: "/label-designer",
                icon: Barcode,
              },
            ]
          : []),
      ],
    },
    {
      label: t("nav.settings"),
      items: [
        {
          title: t("nav.settings"),
          url: "/settings",
          icon: Settings,
        },
        {
          title: t("nav.subscription"),
          url: "/subscription",
          icon: Receipt,
        },
      ],
    },
  ];

  const handleMoreNavClick = (url: string) => {
    navigate(url);
    setMoreOpen(false);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-end justify-around h-[68px] pb-1">
        {mainNavItems.slice(0, 4).map((item) => {
          const isActive = location === item.url || location.startsWith(item.url + "/");
          return (
            <Link key={item.url} href={item.url}>
              <Button
                variant="ghost"
                className={cn(
                  "flex flex-col items-center justify-center min-w-[80px] h-full px-4 py-2.5 gap-1.5 rounded-none no-default-hover-elevate no-default-active-elevate",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
                data-testid={`mobile-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <item.icon className={cn("w-7 h-7", isActive && "stroke-[2.5]")} />
                <span className="text-xs font-medium leading-none truncate max-w-[80px]">{item.title}</span>
              </Button>
            </Link>
          );
        })}
        
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              className="flex flex-col items-center justify-center min-w-[80px] h-full px-4 py-2.5 gap-1.5 rounded-none text-muted-foreground no-default-hover-elevate no-default-active-elevate"
              data-testid="mobile-nav-more"
            >
              <MoreHorizontal className="w-7 h-7" />
              <span className="text-xs font-medium leading-none">{t("nav.more") || "More"}</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto max-h-[80vh] rounded-t-2xl px-4 pb-6 safe-area-pb">
            <SheetHeader className="pb-2">
              <SheetTitle className="text-base">{t("nav.more") || "More"}</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto max-h-[60vh] space-y-4">
              {moreNavGroups.map((group) => {
                const visibleItems = group.items.filter(item => item);
                if (visibleItems.length === 0) return null;
                return (
                  <div key={group.label}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                      {group.label}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {visibleItems.map((item) => {
                        const isActive = location === item.url;
                        return (
                          <Button
                            key={item.url}
                            variant={isActive ? "secondary" : "ghost"}
                            className={cn(
                              "flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl min-h-[72px] h-auto no-default-hover-elevate no-default-active-elevate",
                              isActive
                                ? "bg-primary/10 text-primary border border-primary/20"
                                : "bg-muted/50 text-foreground border border-transparent"
                            )}
                            onClick={() => handleMoreNavClick(item.url)}
                            data-testid={`mobile-nav-more-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            <item.icon className="w-5 h-5" />
                            <span className="text-[11px] font-medium leading-tight text-center line-clamp-2">{item.title}</span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
