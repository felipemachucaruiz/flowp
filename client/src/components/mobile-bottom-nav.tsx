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
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function MobileBottomNav() {
  const [location, navigate] = useLocation();
  const { tenant } = useAuth();
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);

  const isRestaurant = tenant?.type === "restaurant";

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

  const moreNavItems = [
    {
      title: t("nav.products"),
      url: "/products",
    },
    ...(isRestaurant
      ? [
          {
            title: t("nav.kitchen"),
            url: "/kitchen",
          },
        ]
      : []),
    {
      title: t("nav.purchasing"),
      url: "/purchasing",
    },
    {
      title: t("nav.customers") || "Customers",
      url: "/customers",
    },
    {
      title: t("nav.loyalty") || "Loyalty",
      url: "/loyalty",
    },
    {
      title: t("nav.sales_history") || "Sales History",
      url: "/sales-history",
    },
    {
      title: t("nav.settings"),
      url: "/settings",
    },
  ];

  const handleMoreNavClick = (url: string) => {
    navigate(url);
    setMoreOpen(false);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-pb">
      <div className="flex items-center justify-around h-16">
        {mainNavItems.slice(0, 4).map((item) => (
          <Link key={item.url} href={item.url}>
            <button
              className={cn(
                "flex flex-col items-center justify-center w-full h-full px-3 py-2 gap-1",
                "transition-colors",
                location === item.url
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
              data-testid={`mobile-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <item.icon className="w-6 h-6" />
              <span className="text-[10px] font-medium leading-none">{item.title}</span>
            </button>
          </Link>
        ))}
        
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center w-full h-full px-3 py-2 gap-1",
                "transition-colors text-muted-foreground"
              )}
              data-testid="mobile-nav-more"
            >
              <MoreHorizontal className="w-6 h-6" />
              <span className="text-[10px] font-medium leading-none">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto max-h-[70vh]">
            <SheetHeader>
              <SheetTitle>More</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-3 py-4">
              {moreNavItems.map((item) => (
                <Button
                  key={item.url}
                  variant={location === item.url ? "default" : "outline"}
                  className="h-16 flex-col gap-1 text-xs"
                  onClick={() => handleMoreNavClick(item.url)}
                  data-testid={`mobile-nav-more-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <Settings className="w-5 h-5" />
                  <span className="truncate w-full text-center">{item.title}</span>
                </Button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
