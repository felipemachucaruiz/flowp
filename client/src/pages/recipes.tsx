import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, ChefHat, Trash2, Edit, Crown, Package } from "lucide-react";
import type { Product, Ingredient, Recipe, RecipeItem } from "@shared/schema";

type RecipeWithItems = Recipe & { items: RecipeItem[] };

export default function RecipesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<RecipeWithItems | null>(null);
  const [requiresUpgrade, setRequiresUpgrade] = useState(false);

  const [formData, setFormData] = useState({
    productId: "",
    yieldQty: "1",
    notes: "",
  });

  const [recipeItems, setRecipeItems] = useState<Array<{
    ingredientId: string;
    qtyPerProduct: string;
    uom: string;
    wastePercent: string;
  }>>([]);

  // Unit conversion helper - convert from any UOM to base UOM
  const convertToBaseUom = (qty: number, fromUom: string, baseUom: string): number => {
    if (fromUom === baseUom) return qty;
    
    // Weight conversions
    if (fromUom === "g" && baseUom === "kg") return qty / 1000;
    if (fromUom === "kg" && baseUom === "g") return qty * 1000;
    
    // Volume conversions
    if (fromUom === "ml" && baseUom === "L") return qty / 1000;
    if (fromUom === "L" && baseUom === "ml") return qty * 1000;
    
    // No conversion possible
    return qty;
  };

  // Get compatible UOMs for an ingredient
  const getCompatibleUoms = (ingredientId: string): string[] => {
    const ingredient = ingredients.find(i => i.id === ingredientId);
    if (!ingredient) return [];
    
    const baseUom = ingredient.uomBase;
    if (baseUom === "g" || baseUom === "kg") return ["g", "kg"];
    if (baseUom === "ml" || baseUom === "L") return ["ml", "L"];
    return [baseUom];
  };

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: ingredients = [] } = useQuery<Ingredient[]>({
    queryKey: ["/api/ingredients"],
  });

  const { data: recipes = [], isLoading, error } = useQuery<RecipeWithItems[]>({
    queryKey: ["/api/recipes"],
    retry: (failureCount, error: any) => {
      if (error?.requiresUpgrade) return false;
      return failureCount < 3;
    },
  });

  if ((error as any)?.requiresUpgrade || requiresUpgrade) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md text-center">
          <CardHeader>
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

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData & { items: typeof recipeItems }) => {
      const response = await apiRequest("POST", "/api/recipes", {
        ...data,
        yieldQty: parseFloat(data.yieldQty),
        items: data.items.map(item => ({
          ingredientId: item.ingredientId,
          qtyRequiredBase: item.qtyPerProduct,
          wastePct: item.wastePercent || "0",
        })),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: t("recipes.create_success") });
    },
    onError: (error: any) => {
      if (error?.requiresUpgrade) {
        setRequiresUpgrade(true);
      } else {
        toast({ title: t("recipes.create_error"), variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/recipes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
      toast({ title: t("recipes.delete_success") });
    },
    onError: () => {
      toast({ title: t("recipes.delete_error"), variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ productId: "", yieldQty: "1", notes: "" });
    setRecipeItems([]);
    setEditingRecipe(null);
  };

  const handleEdit = (recipe: RecipeWithItems) => {
    setEditingRecipe(recipe);
    setFormData({
      productId: recipe.productId,
      yieldQty: recipe.yieldQty?.toString() || "1",
      notes: "",
    });
    setRecipeItems(recipe.items.map(item => {
      const ingredient = ingredients.find(i => i.id === item.ingredientId);
      return {
        ingredientId: item.ingredientId,
        qtyPerProduct: item.qtyRequiredBase,
        uom: ingredient?.uomBase || "",
        wastePercent: item.wastePct || "0",
      };
    }));
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Convert quantities to base UOM before saving
    const convertedItems = recipeItems.map(item => {
      const ingredient = ingredients.find(i => i.id === item.ingredientId);
      const baseUom = ingredient?.uomBase || item.uom;
      const qtyInBaseUom = convertToBaseUom(parseFloat(item.qtyPerProduct) || 0, item.uom, baseUom);
      return {
        ingredientId: item.ingredientId,
        qtyPerProduct: qtyInBaseUom.toString(),
        wastePercent: item.wastePercent,
      };
    });
    createMutation.mutate({ ...formData, items: convertedItems });
  };

  const addIngredientRow = () => {
    setRecipeItems([...recipeItems, { ingredientId: "", qtyPerProduct: "", uom: "", wastePercent: "0" }]);
  };

  const removeIngredientRow = (index: number) => {
    setRecipeItems(recipeItems.filter((_, i) => i !== index));
  };

  const updateIngredientRow = (index: number, field: string, value: string) => {
    const updated = [...recipeItems];
    updated[index] = { ...updated[index], [field]: value };
    
    // When ingredient changes, set default UOM to ingredient's base UOM
    if (field === "ingredientId") {
      const ingredient = ingredients.find(i => i.id === value);
      if (ingredient) {
        updated[index].uom = ingredient.uomBase;
      }
    }
    
    setRecipeItems(updated);
  };

  const getProductName = (productId: string) => {
    return products.find(p => p.id === productId)?.name || productId;
  };

  const getIngredientName = (ingredientId: string) => {
    return ingredients.find(i => i.id === ingredientId)?.name || ingredientId;
  };

  const getIngredientUom = (ingredientId: string) => {
    return ingredients.find(i => i.id === ingredientId)?.uomBase || "";
  };

  const filteredRecipes = recipes.filter(recipe =>
    getProductName(recipe.productId).toLowerCase().includes(search.toLowerCase())
  );

  const availableProducts = products.filter(p => 
    !recipes.some(r => r.productId === p.id) || editingRecipe?.productId === p.id
  );

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("recipes.title")}</h1>
          <p className="text-muted-foreground">{t("recipes.subtitle")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-recipe">
              <Plus className="w-4 h-4 mr-2" />
              {t("recipes.add")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRecipe ? t("recipes.edit") : t("recipes.add")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("recipes.select_product")}</Label>
                  <Select
                    value={formData.productId}
                    onValueChange={(v) => setFormData({ ...formData, productId: v })}
                  >
                    <SelectTrigger data-testid="select-recipe-product">
                      <SelectValue placeholder={t("recipes.select_product")} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProducts.map(product => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("recipes.yield")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.yieldQty}
                    onChange={(e) => setFormData({ ...formData, yieldQty: e.target.value })}
                    data-testid="input-recipe-yield"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t("recipes.ingredients")}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addIngredientRow} data-testid="button-add-ingredient">
                    <Plus className="w-4 h-4 mr-1" />
                    {t("recipes.add_ingredient")}
                  </Button>
                </div>
                {recipeItems.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground border-2 border-dashed rounded-md">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>{t("recipes.no_ingredients")}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recipeItems.map((item, index) => (
                      <div key={index} className="grid gap-2 grid-cols-12 items-end p-3 border rounded-md">
                        <div className="col-span-12 sm:col-span-4">
                          <Label className="text-xs">{t("ingredients.title")}</Label>
                          <Select
                            value={item.ingredientId}
                            onValueChange={(v) => updateIngredientRow(index, "ingredientId", v)}
                          >
                            <SelectTrigger data-testid={`select-ingredient-${index}`}>
                              <SelectValue placeholder={t("recipes.select_ingredient")} />
                            </SelectTrigger>
                            <SelectContent>
                              {ingredients.map(ing => (
                                <SelectItem key={ing.id} value={ing.id}>
                                  {ing.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <Label className="text-xs">{t("recipes.qty_required")}</Label>
                          <Input
                            type="number"
                            step="0.001"
                            value={item.qtyPerProduct}
                            onChange={(e) => updateIngredientRow(index, "qtyPerProduct", e.target.value)}
                            placeholder="0.00"
                            data-testid={`input-qty-${index}`}
                          />
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <Label className="text-xs">{t("recipes.unit")}</Label>
                          <Select
                            value={item.uom}
                            onValueChange={(v) => updateIngredientRow(index, "uom", v)}
                            disabled={!item.ingredientId}
                          >
                            <SelectTrigger data-testid={`select-uom-${index}`}>
                              <SelectValue placeholder="-" />
                            </SelectTrigger>
                            <SelectContent>
                              {getCompatibleUoms(item.ingredientId).map(uom => (
                                <SelectItem key={uom} value={uom}>
                                  {uom}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-3 sm:col-span-2">
                          <Label className="text-xs">{t("recipes.waste_percent")}</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={item.wastePercent}
                            onChange={(e) => updateIngredientRow(index, "wastePercent", e.target.value)}
                            placeholder="0"
                            data-testid={`input-waste-${index}`}
                          />
                        </div>
                        <div className="col-span-1 sm:col-span-2 flex items-end justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeIngredientRow(index)}
                            data-testid={`button-remove-ingredient-${index}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-recipe">
                  {t("common.cancel")}
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending || !formData.productId || recipeItems.length === 0}
                  data-testid="button-save-recipe"
                >
                  {createMutation.isPending ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            </form>
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
          data-testid="input-search-recipes"
        />
      </div>

      {filteredRecipes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <ChefHat className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">{t("recipes.no_recipes")}</p>
            <p className="text-sm text-muted-foreground">{t("recipes.no_recipes_hint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredRecipes.map(recipe => (
            <Card key={recipe.id} data-testid={`card-recipe-${recipe.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ChefHat className="w-5 h-5 text-primary" />
                      {getProductName(recipe.productId)}
                    </CardTitle>
                    <CardDescription>
                      {t("recipes.yield")}: {recipe.yieldQty} • {recipe.items.length} {t("recipes.ingredients")}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEdit(recipe)}
                      data-testid={`button-edit-recipe-${recipe.id}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(recipe.id)}
                      data-testid={`button-delete-recipe-${recipe.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {recipe.items.slice(0, 3).map(item => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span>{getIngredientName(item.ingredientId)}</span>
                      <Badge variant="secondary">
                        {parseFloat(item.qtyRequiredBase).toFixed(2)} {getIngredientUom(item.ingredientId)}
                      </Badge>
                    </div>
                  ))}
                  {recipe.items.length > 3 && (
                    <p className="text-sm text-muted-foreground">
                      +{recipe.items.length - 3} {t("recipes.more_ingredients")}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
