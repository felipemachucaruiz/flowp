import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePOS } from "@/lib/pos-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { Floor, Table } from "@shared/schema";
import {
  LayoutGrid,
  Users,
  Clock,
  CircleDot,
  ChefHat,
  Plus,
} from "lucide-react";

export default function TablesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useI18n();
  const { setSelectedTable } = usePOS();
  const [activeFloor, setActiveFloor] = useState<string | null>(null);

  const statusColors: Record<string, { bg: string; text: string; label: string }> = {
    free: { bg: "bg-green-500/10", text: "text-green-600", label: t("tables.available") },
    occupied: { bg: "bg-blue-500/10", text: "text-blue-600", label: t("tables.occupied") },
    dirty: { bg: "bg-orange-500/10", text: "text-orange-600", label: t("tables.needs_cleaning") },
    reserved: { bg: "bg-purple-500/10", text: "text-purple-600", label: t("tables.reserved") },
  };

  const { data: floors, isLoading: floorsLoading } = useQuery<Floor[]>({
    queryKey: ["/api/floors"],
  });

  const { data: tables, isLoading: tablesLoading } = useQuery<Table[]>({
    queryKey: ["/api/tables"],
  });

  const updateTableMutation = useMutation({
    mutationFn: async ({ tableId, status }: { tableId: string; status: string }) => {
      return apiRequest("PATCH", `/api/tables/${tableId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
    },
  });

  // Set default floor when data loads
  if (floors?.length && !activeFloor) {
    setActiveFloor(floors[0].id);
  }

  const currentFloorTables = tables?.filter((t) => t.floorId === activeFloor) || [];

  const handleTableClick = (table: Table) => {
    if (table.status === "free") {
      // Open new order for this table
      setSelectedTable(table.id);
      updateTableMutation.mutate({ tableId: table.id, status: "occupied" });
      navigate("/pos");
    } else if (table.status === "occupied") {
      // Continue order for this table
      setSelectedTable(table.id);
      navigate("/pos");
    } else if (table.status === "dirty") {
      // Mark as clean
      updateTableMutation.mutate({ tableId: table.id, status: "free" });
      toast({
        title: t("tables.table_cleaned"),
        description: `${table.name} ${t("tables.now_available")}`,
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "free":
        return <CircleDot className="w-4 h-4" />;
      case "occupied":
        return <Users className="w-4 h-4" />;
      case "dirty":
        return <Clock className="w-4 h-4" />;
      case "reserved":
        return <Clock className="w-4 h-4" />;
      default:
        return <CircleDot className="w-4 h-4" />;
    }
  };

  const stats = {
    total: tables?.filter((t) => t.floorId === activeFloor).length || 0,
    free: currentFloorTables.filter((t) => t.status === "free").length,
    occupied: currentFloorTables.filter((t) => t.status === "occupied").length,
    dirty: currentFloorTables.filter((t) => t.status === "dirty").length,
  };

  if (floorsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!floors?.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground">
        <LayoutGrid className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-xl font-medium mb-2">{t("tables.no_floors")}</p>
        <p className="text-center mb-6">
          {t("tables.setup_floors")}
        </p>
        <Button onClick={() => navigate("/settings")} data-testid="button-goto-settings">
          <Plus className="w-4 h-4 mr-2" />
          {t("tables.add_floors")}
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto touch-scroll">
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight truncate">{t("tables.title")}</h1>
          <p className="text-sm text-muted-foreground truncate">
            {t("tables.subtitle")}
          </p>
        </div>
        <Button onClick={() => navigate("/kitchen")} variant="outline" size="sm" data-testid="button-goto-kitchen">
          <ChefHat className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">{t("tables.kitchen_view")}</span>
        </Button>
      </div>

      {/* Floor Tabs */}
      <Tabs value={activeFloor || ""} onValueChange={setActiveFloor}>
        <TabsList className="h-9">
          {floors.map((floor) => (
            <TabsTrigger
              key={floor.id}
              value={floor.id}
              className="text-sm px-3"
              data-testid={`tab-floor-${floor.id}`}
            >
              {floor.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-4 mt-4">
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs lg:text-sm text-muted-foreground">{t("tables.total_tables")}</p>
                  <p className="text-xl lg:text-2xl font-bold">{stats.total}</p>
                </div>
                <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-muted flex items-center justify-center">
                  <LayoutGrid className="w-4 h-4 lg:w-5 lg:h-5 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs lg:text-sm text-muted-foreground">{t("tables.available")}</p>
                  <p className="text-xl lg:text-2xl font-bold text-green-600">{stats.free}</p>
                </div>
                <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CircleDot className="w-4 h-4 lg:w-5 lg:h-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs lg:text-sm text-muted-foreground">{t("tables.occupied")}</p>
                  <p className="text-xl lg:text-2xl font-bold text-blue-600">{stats.occupied}</p>
                </div>
                <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Users className="w-4 h-4 lg:w-5 lg:h-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs lg:text-sm text-muted-foreground">{t("tables.needs_cleaning")}</p>
                  <p className="text-xl lg:text-2xl font-bold text-orange-600">{stats.dirty}</p>
                </div>
                <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Clock className="w-4 h-4 lg:w-5 lg:h-5 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tables Grid */}
        {floors.map((floor) => (
          <TabsContent key={floor.id} value={floor.id} className="mt-4">
            {tablesLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 lg:gap-4">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-28 lg:h-32" />
                ))}
              </div>
            ) : currentFloorTables.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <LayoutGrid className="w-10 h-10 mb-3 opacity-30" />
                <p className="font-medium text-sm">{t("tables.no_tables_floor")}</p>
                <p className="text-xs">{t("tables.add_tables_settings")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 lg:gap-4">
                {currentFloorTables.map((table) => {
                  const status = statusColors[table.status || "free"];
                  return (
                    <button
                      key={table.id}
                      onClick={() => handleTableClick(table)}
                      className={`relative p-4 rounded-lg border-2 transition-all hover-elevate active-elevate-2 text-left ${status.bg} border-transparent hover:border-primary/50`}
                      data-testid={`button-table-${table.id}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-bold text-lg">{table.name}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {table.capacity} {t("tables.seats")}
                        </Badge>
                      </div>
                      <div className={`flex items-center gap-2 ${status.text}`}>
                        {getStatusIcon(table.status || "free")}
                        <span className="text-sm font-medium">{status.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 pt-4 border-t">
        <span className="text-sm text-muted-foreground">{t("tables.legend_status")}</span>
        {Object.entries(statusColors).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${value.bg}`} />
            <span className="text-sm">{value.label}</span>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}
