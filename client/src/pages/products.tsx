import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Category, Product } from "@shared/schema";
import { Plus, Pencil, Trash2, Package, Tag, Upload, X, ImageIcon } from "lucide-react";
import { useUpload } from "@/hooks/use-upload";

export default function ProductsPage() {
  const { tenant } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const { can } = usePermissions();

  const formatCurrency = (amount: number) => {
    const currency = tenant?.currency || "USD";
    const localeMap: Record<string, string> = {
      COP: "es-CO", MXN: "es-MX", USD: "en-US", EUR: "de-DE", BRL: "pt-BR",
    };
    const locale = localeMap[currency] || "en-US";
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    } catch {
      return `${currency} ${amount.toLocaleString()}`;
    }
  };
  
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  const [categoryForm, setCategoryForm] = useState({ name: "", color: "#3B82F6" });
  const [productForm, setProductForm] = useState({
    name: "",
    price: "",
    categoryId: "",
    barcode: "",
    cost: "",
    image: "",
  });

  const { uploadFile, isUploading } = useUpload();

  const { data: categories, isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const categoryMutation = useMutation({
    mutationFn: async (data: { name: string; color: string }) => {
      if (editingCategory) {
        return apiRequest("PATCH", `/api/categories/${editingCategory.id}`, data);
      }
      return apiRequest("POST", "/api/categories", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setCategoryDialogOpen(false);
      setEditingCategory(null);
      setCategoryForm({ name: "", color: "#3B82F6" });
      toast({ title: editingCategory ? t("categories.updated") : t("categories.created") });
    },
  });

  const productMutation = useMutation({
    mutationFn: async (data: typeof productForm) => {
      if (editingProduct) {
        return apiRequest("PATCH", `/api/products/${editingProduct.id}`, data);
      }
      return apiRequest("POST", "/api/products", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setProductDialogOpen(false);
      setEditingProduct(null);
      setProductForm({ name: "", price: "", categoryId: "", barcode: "", cost: "", image: "" });
      toast({ title: editingProduct ? t("products.title") : t("products.title") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ type, id }: { type: string; id: string }) => {
      return apiRequest("DELETE", `/api/${type}/${id}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/${variables.type}`] });
      toast({ title: t("settings.deleted") });
    },
  });

  const openCategoryDialog = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({ name: category.name, color: category.color || "#3B82F6" });
    } else {
      setEditingCategory(null);
      setCategoryForm({ name: "", color: "#3B82F6" });
    }
    setCategoryDialogOpen(true);
  };

  const openProductDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setProductForm({
        name: product.name,
        price: product.price,
        categoryId: product.categoryId || "",
        barcode: product.barcode || "",
        cost: product.cost || "",
        image: product.image || "",
      });
    } else {
      setEditingProduct(null);
      setProductForm({ name: "", price: "", categoryId: "", barcode: "", cost: "", image: "" });
    }
    setProductDialogOpen(true);
  };

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const result = await uploadFile(file);
    if (result) {
      setProductForm({ ...productForm, image: result.objectPath });
    }
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return null;
    const category = categories?.find(c => c.id === categoryId);
    return category?.name || null;
  };

  const getCategoryColor = (categoryId: string | null) => {
    if (!categoryId) return "#6B7280";
    const category = categories?.find(c => c.id === categoryId);
    return category?.color || "#6B7280";
  };

  return (
    <div className="h-full overflow-y-auto touch-scroll overscroll-contain">
    <div className="p-3 sm:p-6 pb-24 sm:pb-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{t("nav.products")}</h1>
          <p className="text-sm sm:text-base text-muted-foreground">{t("products.subtitle")}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Tag className="w-5 h-5" />
                {t("categories.title")}
              </CardTitle>
              <CardDescription>{t("categories.subtitle")}</CardDescription>
            </div>
            {can('products.create') && (
              <Button onClick={() => openCategoryDialog()} data-testid="button-add-category">
                <Plus className="w-4 h-4 mr-2" />
                {t("categories.add")}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {categoriesLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : categories?.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">{t("categories.empty")}</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {categories?.map((category) => (
                    <div
                      key={category.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: category.color || "#3B82F6" }}
                        />
                        <span className="font-medium">{category.name}</span>
                      </div>
                      {(can('products.edit') || can('products.delete')) && (
                        <div className="flex gap-1">
                          {can('products.edit') && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openCategoryDialog(category)}
                              data-testid={`button-edit-category-${category.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {can('products.delete') && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate({ type: "categories", id: category.id })}
                              data-testid={`button-delete-category-${category.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                {t("products.title")}
              </CardTitle>
              <CardDescription>{t("products.subtitle")}</CardDescription>
            </div>
            {can('products.create') && (
              <Button onClick={() => openProductDialog()} data-testid="button-add-product">
                <Plus className="w-4 h-4 mr-2" />
                {t("products.add")}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {productsLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : products?.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">{t("products.empty")}</p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {products?.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{product.name}</span>
                          {product.barcode && (
                            <Badge variant="outline" className="text-xs">
                              {product.barcode}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {getCategoryName(product.categoryId) && (
                            <Badge
                              variant="secondary"
                              className="text-xs"
                              style={{ backgroundColor: getCategoryColor(product.categoryId) + "20", color: getCategoryColor(product.categoryId) }}
                            >
                              {getCategoryName(product.categoryId)}
                            </Badge>
                          )}
                          <span className="text-sm text-muted-foreground">
                            {formatCurrency(parseFloat(product.price))}
                          </span>
                        </div>
                      </div>
                      {(can('products.edit') || can('products.delete')) && (
                        <div className="flex gap-1 ml-2">
                          {can('products.edit') && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openProductDialog(product)}
                              data-testid={`button-edit-product-${product.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {can('products.delete') && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate({ type: "products", id: product.id })}
                              data-testid={`button-delete-product-${product.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? t("categories.edit") : t("categories.add")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("categories.name")}</Label>
              <Input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder={t("categories.name_placeholder")}
                data-testid="input-category-name"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("categories.color")}</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={categoryForm.color}
                  onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                  className="w-12 h-10 p-1"
                  data-testid="input-category-color"
                />
                <Input
                  value={categoryForm.color}
                  onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => categoryMutation.mutate(categoryForm)}
              disabled={!categoryForm.name || categoryMutation.isPending}
              data-testid="button-save-category"
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? t("products.edit") : t("products.add")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("products.name")}</Label>
              <Input
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                placeholder={t("products.name_placeholder")}
                data-testid="input-product-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("products.price")}</Label>
                <Input
                  type="number"
                  value={productForm.price}
                  onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                  placeholder="0.00"
                  step="0.01"
                  data-testid="input-product-price"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("products.cost")}</Label>
                <Input
                  type="number"
                  value={productForm.cost}
                  onChange={(e) => setProductForm({ ...productForm, cost: e.target.value })}
                  placeholder="0.00"
                  step="0.01"
                  data-testid="input-product-cost"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("products.category")}</Label>
              <Select
                value={productForm.categoryId}
                onValueChange={(value) => setProductForm({ ...productForm, categoryId: value })}
              >
                <SelectTrigger data-testid="select-product-category">
                  <SelectValue placeholder={t("products.select_category")} />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("products.sku")}</Label>
              <Input
                value={productForm.barcode}
                onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                placeholder="12345678901"
                data-testid="input-product-barcode"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("products.image")}</Label>
              {productForm.image ? (
                <div className="relative inline-block">
                  <img 
                    src={productForm.image} 
                    alt="Product" 
                    className="w-24 h-24 object-cover rounded-lg border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6"
                    onClick={() => setProductForm({ ...productForm, image: "" })}
                    data-testid="button-remove-product-image"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed cursor-pointer hover:bg-muted/50 transition-colors">
                    {isUploading ? (
                      <span className="text-sm text-muted-foreground">{t("common.uploading")}</span>
                    ) : (
                      <>
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{t("products.upload_image")}</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleProductImageUpload}
                      disabled={isUploading}
                      data-testid="input-product-image"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => productMutation.mutate(productForm)}
              disabled={!productForm.name || !productForm.price || productMutation.isPending}
              data-testid="button-save-product"
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
