import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Package, Crown, AlertTriangle, Edit, Trash2, Archive, Boxes } from "lucide-react";
import type { Ingredient } from "@shared/schema";

export default function IngredientsPage() {
  const { t } = useTranslation();
  const { tenant } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    barcode: "",
    uomBase: "g" as "g" | "ml" | "unit",
    reorderPointBase: "10",
    reorderQtyBase: "100",
    isActive: true,
  });

  const { data: ingredients, isLoading, error } = useQuery<Ingredient[]>({
    queryKey: ["/api/ingredients"],
    retry: false,
  });

  const { data: stockLevels } = useQuery<Record<string, number>>({
    queryKey: ["/api/ingredient-stock-levels"],
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => apiRequest("POST", "/api/ingredients", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ingredients"] });
      toast({ title: t("common.saved") });
      setShowAddDialog(false);
      resetForm();
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof formData }) => 
      apiRequest("PATCH", `/api/ingredients/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ingredients"] });
      toast({ title: t("common.saved") });
      setEditingIngredient(null);
      resetForm();
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ingredients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ingredients"] });
      toast({ title: t("common.deleted") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      sku: "",
      barcode: "",
      uomBase: "g",
      reorderPointBase: "10",
      reorderQtyBase: "100",
      isActive: true,
    });
  };

  const handleEdit = (ingredient: Ingredient) => {
    setEditingIngredient(ingredient);
    setFormData({
      name: ingredient.name,
      sku: ingredient.sku || "",
      barcode: ingredient.barcode || "",
      uomBase: ingredient.uomBase,
      reorderPointBase: ingredient.reorderPointBase || "10",
      reorderQtyBase: ingredient.reorderQtyBase || "100",
      isActive: ingredient.isActive ?? true,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingIngredient) {
      updateMutation.mutate({ id: editingIngredient.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredIngredients = ingredients?.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.sku?.toLowerCase().includes(search.toLowerCase()) ||
    i.barcode?.toLowerCase().includes(search.toLowerCase())
  );

  const getUomLabel = (uom: string) => {
    switch (uom) {
      case "g": return t("ingredients.grams");
      case "ml": return t("ingredients.milliliters");
      case "unit": return t("ingredients.units");
      default: return uom;
    }
  };

  const isProRequired = (error as any)?.requiresUpgrade === true || 
    ((error as any)?.message?.includes("Pro subscription") ?? false);

  if (tenant?.type !== "restaurant") {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              {t("ingredients.pro_required_description")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isProRequired) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <Crown className="w-12 h-12 mx-auto mb-2 text-amber-500" />
            <CardTitle>{t("ingredients.pro_required")}</CardTitle>
            <CardDescription>
              {t("ingredients.pro_required_description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="default" className="bg-amber-500" data-testid="button-upgrade-pro">
              {t("common.upgrade")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const IngredientForm = () => (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>{t("ingredients.name")}</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          data-testid="input-ingredient-name"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("ingredients.sku")}</Label>
          <Input
            value={formData.sku}
            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
            data-testid="input-ingredient-sku"
          />
        </div>
        <div className="space-y-2">
          <Label>{t("ingredients.barcode")}</Label>
          <Input
            value={formData.barcode}
            onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
            data-testid="input-ingredient-barcode"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t("ingredients.uom")}</Label>
        <Select
          value={formData.uomBase}
          onValueChange={(v) => setFormData({ ...formData, uomBase: v as "g" | "ml" | "unit" })}
        >
          <SelectTrigger data-testid="select-ingredient-uom">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="g">{t("ingredients.grams")}</SelectItem>
            <SelectItem value="ml">{t("ingredients.milliliters")}</SelectItem>
            <SelectItem value="unit">{t("ingredients.units")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("ingredients.reorder_point")}</Label>
          <Input
            type="number"
            value={formData.reorderPointBase}
            onChange={(e) => setFormData({ ...formData, reorderPointBase: e.target.value })}
            data-testid="input-ingredient-reorder-point"
          />
        </div>
        <div className="space-y-2">
          <Label>{t("ingredients.reorder_qty")}</Label>
          <Input
            type="number"
            value={formData.reorderQtyBase}
            onChange={(e) => setFormData({ ...formData, reorderQtyBase: e.target.value })}
            data-testid="input-ingredient-reorder-qty"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
          data-testid="switch-ingredient-active"
        />
        <Label>{t("ingredients.active")}</Label>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setShowAddDialog(false);
            setEditingIngredient(null);
            resetForm();
          }}
        >
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("ingredients.title")}</h1>
          <p className="text-muted-foreground">{t("ingredients.subtitle")}</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-ingredient">
              <Plus className="w-4 h-4 mr-2" />
              {t("ingredients.add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("ingredients.add")}</DialogTitle>
            </DialogHeader>
            <IngredientForm />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
          data-testid="input-search-ingredients"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filteredIngredients?.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">{t("common.no_results")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredIngredients?.map((ingredient) => {
            const stock = stockLevels?.[ingredient.id] ?? 0;
            const reorderPoint = parseFloat(ingredient.reorderPointBase || "0");
            const isLowStock = stock <= reorderPoint && reorderPoint > 0;

            return (
              <Card key={ingredient.id} className={!ingredient.isActive ? "opacity-60" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{ingredient.name}</CardTitle>
                      {ingredient.sku && (
                        <p className="text-sm text-muted-foreground">SKU: {ingredient.sku}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(ingredient)}
                        data-testid={`button-edit-ingredient-${ingredient.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(ingredient.id)}
                        data-testid={`button-delete-ingredient-${ingredient.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={ingredient.isActive ? "default" : "secondary"}>
                      {ingredient.isActive ? t("ingredients.active") : t("common.inactive")}
                    </Badge>
                    <Badge variant="outline">{getUomLabel(ingredient.uomBase)}</Badge>
                    {isLowStock && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {t("alerts.low_stock")}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t("ingredients.stock")}:</span>
                      <span className="ml-1 font-medium">{stock.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("ingredients.reorder_point")}:</span>
                      <span className="ml-1 font-medium">{reorderPoint}</span>
                    </div>
                  </div>
                  <Link href={`/ingredients/${ingredient.id}/lots`}>
                    <Button variant="outline" size="sm" className="w-full mt-3" data-testid={`button-manage-lots-${ingredient.id}`}>
                      <Boxes className="w-4 h-4 mr-2" />
                      {t("ingredients.manage_lots")}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editingIngredient} onOpenChange={(open) => !open && setEditingIngredient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ingredients.edit")}</DialogTitle>
          </DialogHeader>
          <IngredientForm />
        </DialogContent>
      </Dialog>
    </div>
  );
}
