import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Category, Product } from "@shared/schema";
import { Plus, Pencil, Trash2, Package, Tag, X, ImageIcon, Search, Filter } from "lucide-react";
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
    sku: "",
    barcode: "",
    cost: "",
    image: "",
    trackInventory: true,
    lowStockThreshold: "10",
  });
  const [productFormTouched, setProductFormTouched] = useState(false);
  
  const productFormErrors = {
    name: productFormTouched && !productForm.name.trim(),
    price: productFormTouched && (!productForm.price || parseFloat(productForm.price) <= 0),
  };

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
      const payload = {
        ...data,
        lowStockThreshold: parseInt(data.lowStockThreshold, 10) || 10,
      };
      if (editingProduct) {
        return apiRequest("PATCH", `/api/products/${editingProduct.id}`, payload);
      }
      return apiRequest("POST", "/api/products", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setProductDialogOpen(false);
      setEditingProduct(null);
      setProductForm({ name: "", price: "", categoryId: "", sku: "", barcode: "", cost: "", image: "", trackInventory: true, lowStockThreshold: "10" });
      setProductFormTouched(false);
      toast({ title: editingProduct ? t("products.updated") : t("products.created") });
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
    setProductFormTouched(false);
    if (product) {
      setEditingProduct(product);
      setProductForm({
        name: product.name,
        price: product.price,
        categoryId: product.categoryId || "",
        sku: product.sku || "",
        barcode: product.barcode || "",
        cost: product.cost || "",
        image: product.image || "",
        trackInventory: product.trackInventory ?? true,
        lowStockThreshold: String(product.lowStockThreshold ?? 10),
      });
    } else {
      setEditingProduct(null);
      setProductForm({ name: "", price: "", categoryId: "", sku: "", barcode: "", cost: "", image: "", trackInventory: true, lowStockThreshold: "10" });
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

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [priceFilter, setPriceFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  
  const filteredProducts = products?.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.barcode && p.barcode.toLowerCase().includes(q));
    
    const matchesCategory = categoryFilter === "all" || p.categoryId === categoryFilter;
    
    const price = parseFloat(p.price);
    let matchesPrice = true;
    if (priceFilter === "0-50") matchesPrice = price >= 0 && price <= 50;
    else if (priceFilter === "50-100") matchesPrice = price > 50 && price <= 100;
    else if (priceFilter === "100-500") matchesPrice = price > 100 && price <= 500;
    else if (priceFilter === "500+") matchesPrice = price > 500;
    
    return matchesSearch && matchesCategory && matchesPrice;
  });
  
  const filteredCategories = categories?.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const activeFiltersCount = (categoryFilter !== "all" ? 1 : 0) + (priceFilter !== "all" ? 1 : 0);
  
  const clearFilters = () => {
    setCategoryFilter("all");
    setPriceFilter("all");
  };

  return (
    <div className="h-full overflow-y-auto touch-scroll overscroll-contain">
      <div className="p-4 md:p-6 pb-24 md:pb-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-products-title">{t("nav.products")}</h1>
          <p className="text-muted-foreground">{t("products.subtitle")}</p>
        </div>

        <Tabs defaultValue="products" className="space-y-4">
          <TabsList>
            <TabsTrigger value="products" data-testid="tab-products">
              <Package className="h-4 w-4 mr-2" />
              {t("products.title")}
            </TabsTrigger>
            <TabsTrigger value="categories" data-testid="tab-categories">
              <Tag className="h-4 w-4 mr-2" />
              {t("categories.title")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("products.search_placeholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-product-search"
                />
              </div>
              <Button
                variant={showFilters ? "secondary" : "outline"}
                onClick={() => setShowFilters(!showFilters)}
                data-testid="button-toggle-filters"
              >
                <Filter className="h-4 w-4 mr-2" />
                {t("products.filters")}
                {activeFiltersCount > 0 && (
                  <Badge variant="default" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
              {can('products.create') && (
                <Button onClick={() => openProductDialog()} data-testid="button-add-product">
                  <Plus className="h-4 w-4 mr-2" />
                  {t("products.add")}
                </Button>
              )}
            </div>

            {showFilters && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 space-y-2">
                      <Label>{t("products.filter_by_category")}</Label>
                      <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger data-testid="select-category-filter">
                          <SelectValue placeholder={t("products.all_categories")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t("products.all_categories")}</SelectItem>
                          {categories?.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label>{t("products.filter_by_price")}</Label>
                      <Select value={priceFilter} onValueChange={setPriceFilter}>
                        <SelectTrigger data-testid="select-price-filter">
                          <SelectValue placeholder={t("products.all_prices")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t("products.all_prices")}</SelectItem>
                          <SelectItem value="0-50">$0 - $50</SelectItem>
                          <SelectItem value="50-100">$50 - $100</SelectItem>
                          <SelectItem value="100-500">$100 - $500</SelectItem>
                          <SelectItem value="500+">$500+</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {activeFiltersCount > 0 && (
                      <div className="flex items-end">
                        <Button variant="ghost" onClick={clearFilters} data-testid="button-clear-filters">
                          <X className="h-4 w-4 mr-2" />
                          {t("products.clear_filters")}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {productsLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map(i => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-6 w-32 mb-2" />
                      <Skeleton className="h-4 w-24" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredProducts && filteredProducts.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredProducts.map(product => (
                  <Card key={product.id} className="hover-elevate" data-testid={`card-product-${product.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {product.image ? (
                          <img 
                            src={product.image} 
                            alt={product.name}
                            className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                            <Package className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 space-y-1">
                          <h3 className="font-semibold truncate">{product.name}</h3>
                          <p className="text-lg font-bold text-primary">
                            {formatCurrency(parseFloat(product.price))}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {getCategoryName(product.categoryId) && (
                              <Badge
                                variant="secondary"
                                className="text-xs"
                                style={{ backgroundColor: getCategoryColor(product.categoryId) + "20", color: getCategoryColor(product.categoryId) }}
                              >
                                {getCategoryName(product.categoryId)}
                              </Badge>
                            )}
                            {product.sku && (
                              <Badge variant="outline" className="text-xs">
                                SKU: {product.sku}
                              </Badge>
                            )}
                            {product.barcode && (
                              <Badge variant="outline" className="text-xs">
                                {product.barcode}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {(can('products.edit') || can('products.delete')) && (
                          <div className="flex gap-1 flex-shrink-0">
                            {can('products.edit') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openProductDialog(product)}
                                data-testid={`button-edit-product-${product.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {can('products.delete') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteMutation.mutate({ type: "products", id: product.id })}
                                data-testid={`button-delete-product-${product.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">{t("products.empty")}</p>
                  <p className="text-muted-foreground">{t("products.add_first")}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("categories.search_placeholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-category-search"
                />
              </div>
              {can('products.create') && (
                <Button onClick={() => openCategoryDialog()} data-testid="button-add-category">
                  <Plus className="h-4 w-4 mr-2" />
                  {t("categories.add")}
                </Button>
              )}
            </div>

            {categoriesLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map(i => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-6 w-32 mb-2" />
                      <Skeleton className="h-4 w-24" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredCategories && filteredCategories.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredCategories.map(category => (
                  <Card key={category.id} className="hover-elevate" data-testid={`card-category-${category.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-6 h-6 rounded"
                            style={{ backgroundColor: category.color || "#3B82F6" }}
                          />
                          <h3 className="font-semibold">{category.name}</h3>
                        </div>
                        {(can('products.edit') || can('products.delete')) && (
                          <div className="flex gap-1">
                            {can('products.edit') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openCategoryDialog(category)}
                                data-testid={`button-edit-category-${category.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {can('products.delete') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteMutation.mutate({ type: "categories", id: category.id })}
                                data-testid={`button-delete-category-${category.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Tag className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">{t("categories.no_categories")}</p>
                  <p className="text-muted-foreground">{t("categories.add_first")}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

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
              <Label className={productFormErrors.name ? "text-destructive" : ""}>
                {t("products.name")} *
              </Label>
              <Input
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                placeholder={t("products.name_placeholder")}
                className={productFormErrors.name ? "border-destructive" : ""}
                data-testid="input-product-name"
              />
              {productFormErrors.name && (
                <p className="text-xs text-destructive">{t("common.required_field")}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className={productFormErrors.price ? "text-destructive" : ""}>
                  {t("products.price")} *
                </Label>
                <Input
                  type="number"
                  value={productForm.price}
                  onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                  placeholder="0.00"
                  step="0.01"
                  className={productFormErrors.price ? "border-destructive" : ""}
                  data-testid="input-product-price"
                />
                {productFormErrors.price && (
                  <p className="text-xs text-destructive">{t("common.required_field")}</p>
                )}
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("products.sku")}</Label>
                <Input
                  value={productForm.sku}
                  onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                  placeholder="SKU-001"
                  data-testid="input-product-sku"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("products.barcode")}</Label>
                <Input
                  value={productForm.barcode}
                  onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                  placeholder="7701234567890"
                  data-testid="input-product-barcode"
                />
              </div>
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
            <div className="space-y-4 pt-4 border-t">
              <h4 className="font-medium text-sm">{t("products.stock_configuration")}</h4>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("products.track_inventory")}</Label>
                  <p className="text-xs text-muted-foreground">{t("products.track_inventory_description")}</p>
                </div>
                <Switch
                  checked={productForm.trackInventory}
                  onCheckedChange={(checked) => setProductForm({ ...productForm, trackInventory: checked })}
                  data-testid="switch-track-inventory"
                />
              </div>
              {productForm.trackInventory && (
                <div className="space-y-2">
                  <Label>{t("products.low_stock_threshold")}</Label>
                  <Input
                    type="number"
                    value={productForm.lowStockThreshold}
                    onChange={(e) => setProductForm({ ...productForm, lowStockThreshold: e.target.value })}
                    placeholder="10"
                    min="0"
                    data-testid="input-low-stock-threshold"
                  />
                  <p className="text-xs text-muted-foreground">{t("products.low_stock_threshold_description")}</p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                setProductFormTouched(true);
                if (productForm.name.trim() && productForm.price && parseFloat(productForm.price) > 0) {
                  productMutation.mutate(productForm);
                }
              }}
              disabled={productMutation.isPending}
              data-testid="button-save-product"
            >
              {productMutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
