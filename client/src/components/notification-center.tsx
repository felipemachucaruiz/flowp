import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { 
  Bell, 
  Check, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  CheckCircle, 
  Package, 
  Receipt, 
  CreditCard,
  Settings,
  Clock
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  tenantId: string | null;
  userId: string | null;
  type: "info" | "warning" | "error" | "success" | "low_stock" | "order_status" | "payment" | "system" | "expiring_ingredient";
  title: string;
  message: string;
  link: string | null;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

const typeIcons: Record<string, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle,
  low_stock: Package,
  order_status: Receipt,
  payment: CreditCard,
  system: Settings,
  expiring_ingredient: Clock,
};

const typeColors: Record<string, string> = {
  info: "text-blue-500",
  warning: "text-yellow-500",
  error: "text-red-500",
  success: "text-green-500",
  low_stock: "text-orange-500",
  order_status: "text-purple-500",
  payment: "text-emerald-500",
  system: "text-gray-500",
  expiring_ingredient: "text-amber-500",
};

export function NotificationCenter() {
  const { t } = useI18n();
  const { user, tenant } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", user?.id, tenant?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const res = await fetch(`/api/notifications?userId=${user.id}${tenant?.id ? `&tenantId=${tenant.id}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ["/api/notifications/unread-count", user?.id, tenant?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const res = await fetch(`/api/notifications/unread-count?userId=${user.id}${tenant?.id ? `&tenantId=${tenant.id}` : ""}`);
      if (!res.ok) return 0;
      const data = await res.json();
      return data.count || 0;
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/mark-all-read", {
        userId: user?.id,
        tenantId: tenant?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.link) {
      window.location.href = notification.link;
    }
    setIsOpen(false);
  };

  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return dateStr;
    }
  };

  if (!user) return null;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>{t("notifications.title")}</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-1 px-2 text-xs"
              onClick={() => markAllAsReadMutation.mutate()}
              data-testid="button-mark-all-read"
            >
              <Check className="h-3 w-3 mr-1" />
              {t("notifications.mark_all_read")}
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-80">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t("notifications.no_notifications")}</p>
            </div>
          ) : (
            notifications.map((notification) => {
              const IconComponent = typeIcons[notification.type] || Info;
              const colorClass = typeColors[notification.type] || "text-gray-500";
              
              return (
                <DropdownMenuItem
                  key={notification.id}
                  className={`flex items-start gap-3 p-3 cursor-pointer ${!notification.isRead ? "bg-muted/50" : ""}`}
                  onClick={() => handleNotificationClick(notification)}
                  data-testid={`notification-${notification.id}`}
                >
                  <IconComponent className={`h-5 w-5 mt-0.5 flex-shrink-0 ${colorClass}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${!notification.isRead ? "font-semibold" : ""}`}>
                      {notification.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatTime(notification.createdAt)}
                    </p>
                  </div>
                  {!notification.isRead && (
                    <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                  )}
                </DropdownMenuItem>
              );
            })
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
