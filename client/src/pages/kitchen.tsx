import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { KitchenTicket } from "@shared/schema";
import {
  ChefHat,
  Clock,
  CheckCircle2,
  PlayCircle,
  AlertCircle,
  Timer,
  RefreshCw,
} from "lucide-react";

export default function KitchenPage() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [currentTime, setCurrentTime] = useState(new Date());

  const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
    new: { color: "bg-red-500", icon: AlertCircle, label: t("kitchen.new") },
    preparing: { color: "bg-yellow-500", icon: PlayCircle, label: t("kitchen.preparing") },
    ready: { color: "bg-green-500", icon: CheckCircle2, label: t("kitchen.ready") },
    served: { color: "bg-gray-500", icon: CheckCircle2, label: t("kitchen.served") },
  };

  // Update current time every second for elapsed time calculation
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: tickets, isLoading, refetch } = useQuery<KitchenTicket[]>({
    queryKey: ["/api/kitchen/tickets"],
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  const updateTicketMutation = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: string }) => {
      return apiRequest("PATCH", `/api/kitchen/tickets/${ticketId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/tickets"] });
    },
  });

  const handleStatusUpdate = (ticketId: string, currentStatus: string) => {
    let nextStatus: string;
    switch (currentStatus) {
      case "new":
        nextStatus = "preparing";
        break;
      case "preparing":
        nextStatus = "ready";
        break;
      case "ready":
        nextStatus = "served";
        break;
      default:
        return;
    }

    updateTicketMutation.mutate({ ticketId, status: nextStatus });
    toast({
      title: t("kitchen.ticket_updated"),
      description: `${t("kitchen.ticket_moved_to")} ${statusConfig[nextStatus]?.label || nextStatus}`,
    });
  };

  const getElapsedTime = (createdAt: Date | string) => {
    const created = new Date(createdAt);
    const diff = Math.floor((currentTime.getTime() - created.getTime()) / 1000);
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const getElapsedMinutes = (createdAt: Date | string) => {
    const created = new Date(createdAt);
    return Math.floor((currentTime.getTime() - created.getTime()) / 60000);
  };

  const activeTickets = tickets?.filter((t) => t.status !== "served") || [];
  const newTickets = activeTickets.filter((t) => t.status === "new");
  const preparingTickets = activeTickets.filter((t) => t.status === "preparing");
  const readyTickets = activeTickets.filter((t) => t.status === "ready");

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const TicketCard = ({ ticket }: { ticket: KitchenTicket }) => {
    const config = statusConfig[ticket.status || "new"];
    const elapsed = getElapsedMinutes(ticket.createdAt!);
    const isUrgent = elapsed >= 10;
    const isWarning = elapsed >= 5 && elapsed < 10;

    return (
      <Card
        className={`transition-all ${
          isUrgent ? "ring-2 ring-red-500" : isWarning ? "ring-2 ring-yellow-500" : ""
        }`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className={`${config.color} text-white`}>
                {config.label}
              </Badge>
              {ticket.tableId && (
                <Badge variant="outline">{t("kitchen.table")}</Badge>
              )}
            </div>
            <div
              className={`flex items-center gap-1 text-sm font-mono ${
                isUrgent ? "text-red-500" : isWarning ? "text-yellow-600" : "text-muted-foreground"
              }`}
            >
              <Timer className="w-4 h-4" />
              {getElapsedTime(ticket.createdAt!)}
            </div>
          </div>
          <CardTitle className="text-lg">
            Order #{ticket.id.slice(-6).toUpperCase()}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Items */}
          <div className="space-y-2">
            {ticket.items.map((item, index) => (
              <div
                key={index}
                className="flex items-start justify-between p-2 rounded bg-muted/50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-lg">{item.quantity}x</span>
                    <span className="font-medium">{item.name}</span>
                  </div>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.modifiers.map((mod, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {mod}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {item.notes && (
                    <p className="text-sm text-muted-foreground mt-1 italic">
                      {t("kitchen.note")}: {item.notes}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Action Button */}
          {ticket.status !== "served" && (
            <Button
              className="w-full"
              variant={ticket.status === "ready" ? "secondary" : "default"}
              onClick={() => handleStatusUpdate(ticket.id, ticket.status || "new")}
              disabled={updateTicketMutation.isPending}
              data-testid={`button-update-ticket-${ticket.id}`}
            >
              {ticket.status === "new" && (
                <>
                  <PlayCircle className="w-4 h-4 mr-2" />
                  {t("kitchen.start_preparing")}
                </>
              )}
              {ticket.status === "preparing" && (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {t("kitchen.mark_ready")}
                </>
              )}
              {ticket.status === "ready" && (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {t("kitchen.mark_served")}
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{t("kitchen.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {activeTickets.length} {t("kitchen.active_tickets")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-2xl font-bold font-mono">
              {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 border-b">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10">
          <AlertCircle className="w-6 h-6 text-red-500" />
          <div>
            <p className="text-sm text-muted-foreground">{t("kitchen.new")}</p>
            <p className="text-2xl font-bold text-red-500">{newTickets.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/10">
          <PlayCircle className="w-6 h-6 text-yellow-600" />
          <div>
            <p className="text-sm text-muted-foreground">{t("kitchen.preparing")}</p>
            <p className="text-2xl font-bold text-yellow-600">{preparingTickets.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10">
          <CheckCircle2 className="w-6 h-6 text-green-500" />
          <div>
            <p className="text-sm text-muted-foreground">{t("kitchen.ready")}</p>
            <p className="text-2xl font-bold text-green-500">{readyTickets.length}</p>
          </div>
        </div>
      </div>

      {/* Tickets Grid */}
      <div className="flex-1 overflow-hidden">
        {activeTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <ChefHat className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-xl font-medium">{t("kitchen.no_active_orders")}</p>
            <p className="text-sm">{t("kitchen.orders_appear_here")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 h-full">
            {/* New Column */}
            <div className="border-r overflow-hidden flex flex-col">
              <div className="p-3 bg-red-500/10 border-b">
                <h2 className="font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  {t("kitchen.new_orders")} ({newTickets.length})
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto touch-scroll p-3">
                <div className="space-y-3">
                  {newTickets.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} />
                  ))}
                </div>
              </div>
            </div>

            {/* Preparing Column */}
            <div className="border-r overflow-hidden flex flex-col">
              <div className="p-3 bg-yellow-500/10 border-b">
                <h2 className="font-semibold flex items-center gap-2">
                  <PlayCircle className="w-4 h-4 text-yellow-600" />
                  {t("kitchen.preparing")} ({preparingTickets.length})
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto touch-scroll p-3">
                <div className="space-y-3">
                  {preparingTickets.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} />
                  ))}
                </div>
              </div>
            </div>

            {/* Ready Column */}
            <div className="overflow-hidden flex flex-col">
              <div className="p-3 bg-green-500/10 border-b">
                <h2 className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {t("kitchen.ready")} ({readyTickets.length})
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto touch-scroll p-3">
                <div className="space-y-3">
                  {readyTickets.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
