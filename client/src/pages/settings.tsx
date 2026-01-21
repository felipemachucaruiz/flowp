import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { Category, Product, Floor, Table, User } from "@shared/schema";
import {
  Settings as SettingsIcon,
  Store,
  Package,
  LayoutGrid,
  Users,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Printer,
  FileText,
  Check,
  X,
  Upload,
  ImageIcon,
} from "lucide-react";
import { useUpload } from "@/hooks/use-upload";

const businessSettingsSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  currency: z.string().min(1, "Currency is required"),
  taxRate: z.string().min(0, "Tax rate is required"),
  address: z.string().optional(),
  phone: z.string().optional(),
  language: z.string().min(1, "Language is required"),
});

const userSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Phone is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  role: z.enum(["admin", "manager", "cashier", "kitchen"]),
  pin: z.string().optional(),
});

const matiasConfigSchema = z.object({
  apiUrl: z.string().min(1, "API URL is required"),
  clientId: z.string().min(1, "Client ID is required"),
  clientSecret: z.string().min(1, "Client Secret is required"),
});

const receiptSettingsSchema = z.object({
  receiptShowLogo: z.boolean().default(true),
  receiptHeaderText: z.string().optional(),
  receiptFooterText: z.string().optional(),
  receiptShowAddress: z.boolean().default(true),
  receiptShowPhone: z.boolean().default(true),
  receiptTaxId: z.string().optional(),
});

const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  color: z.string().default("#3B82F6"),
});

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  categoryId: z.string().optional(),
  price: z.string().min(1, "Price is required"),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  description: z.string().optional(),
  image: z.string().optional(),
});

const floorSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

const tableSchema = z.object({
  name: z.string().min(1, "Name is required"),
  floorId: z.string().min(1, "Floor is required"),
  capacity: z.number().int().min(1, "Capacity must be at least 1"),
});

const CURRENCIES = [
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (€)" },
  { value: "GBP", label: "GBP (£)" },
  { value: "JPY", label: "JPY (¥)" },
  { value: "INR", label: "INR (₹)" },
  { value: "AUD", label: "AUD (A$)" },
  { value: "CAD", label: "CAD (C$)" },
  { value: "CHF", label: "CHF" },
  { value: "CNY", label: "CNY (¥)" },
  { value: "COP", label: "COP ($)" },
  { value: "BRL", label: "BRL (R$)" },
  { value: "PHP", label: "PHP (₱)" },
  { value: "KRW", label: "KRW (₩)" },
  { value: "THB", label: "THB (฿)" },
  { value: "VND", label: "VND (₫)" },
  { value: "IDR", label: "IDR (Rp)" },
  { value: "MYR", label: "MYR (RM)" },
  { value: "SGD", label: "SGD (S$)" },
  { value: "AED", label: "AED" },
  { value: "SAR", label: "SAR" },
  { value: "ZAR", label: "ZAR" },
  { value: "MXN", label: "MXN ($)" },
  { value: "ARS", label: "ARS ($)" },
  { value: "PEN", label: "PEN (S/)" },
  { value: "CLP", label: "CLP ($)" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const { tenant, refreshTenant } = useAuth();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState("business");
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [showFloorDialog, setShowFloorDialog] = useState(false);
  const [showTableDialog, setShowTableDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isEditingBusiness, setIsEditingBusiness] = useState(false);
  const [isEditingMatias, setIsEditingMatias] = useState(false);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [productImagePath, setProductImagePath] = useState<string>("");
  const [receiptLogoPath, setReceiptLogoPath] = useState<string>(tenant?.logo || "");

  const { uploadFile, isUploading: isUploadingImage } = useUpload({
    onSuccess: (response) => {
      setProductImagePath(response.objectPath);
      productForm.setValue("image", response.objectPath);
      toast({ title: "Image uploaded successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to upload image", description: error.message, variant: "destructive" });
    },
  });

  const { uploadFile: uploadLogoFile, isUploading: isUploadingLogo } = useUpload({
    onSuccess: async (response) => {
      setReceiptLogoPath(response.objectPath);
      try {
        await apiRequest("PATCH", "/api/tenant/settings", { logo: response.objectPath });
        if (refreshTenant) refreshTenant();
        toast({ title: "Logo uploaded successfully" });
      } catch {
        toast({ title: "Logo uploaded but failed to save", variant: "destructive" });
      }
    },
    onError: (error) => {
      toast({ title: "Failed to upload logo", description: error.message, variant: "destructive" });
    },
  });

  const isRestaurant = tenant?.type === "restaurant";

  // Queries
  const { data: categories, isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: floors, isLoading: floorsLoading } = useQuery<Floor[]>({
    queryKey: ["/api/floors"],
    enabled: isRestaurant,
  });

  const { data: tables, isLoading: tablesLoading } = useQuery<Table[]>({
    queryKey: ["/api/tables"],
    enabled: isRestaurant,
  });

  const { data: matiasStatus, isLoading: matiasLoading } = useQuery<{
    enabled: boolean;
    configured: boolean;
    apiUrl: string | null;
    clientId: string | null;
  }>({
    queryKey: ["/api/matias/status"],
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Forms
  const categoryForm = useForm({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "", color: "#3B82F6" },
  });

  const productForm = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: { name: "", categoryId: "", price: "", sku: "", barcode: "", description: "", image: "" },
  });

  const floorForm = useForm({
    resolver: zodResolver(floorSchema),
    defaultValues: { name: "" },
  });

  const tableForm = useForm({
    resolver: zodResolver(tableSchema),
    defaultValues: { name: "", floorId: "", capacity: 4 },
  });

  const businessForm = useForm({
    resolver: zodResolver(businessSettingsSchema),
    defaultValues: {
      name: tenant?.name || "",
      currency: tenant?.currency || "USD",
      taxRate: tenant?.taxRate?.toString() || "0",
      address: tenant?.address || "",
      phone: tenant?.phone || "",
      language: tenant?.language || "en",
    },
  });

  const userForm = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      username: "",
      password: "",
      role: "cashier",
      pin: "",
    },
  });

  const matiasForm = useForm({
    resolver: zodResolver(matiasConfigSchema),
    defaultValues: {
      apiUrl: matiasStatus?.apiUrl || "https://api.matias.com",
      clientId: matiasStatus?.clientId || "",
      clientSecret: "",
    },
  });

  const receiptForm = useForm({
    resolver: zodResolver(receiptSettingsSchema),
    defaultValues: {
      receiptShowLogo: tenant?.receiptShowLogo ?? true,
      receiptHeaderText: tenant?.receiptHeaderText || "",
      receiptFooterText: tenant?.receiptFooterText || "",
      receiptShowAddress: tenant?.receiptShowAddress ?? true,
      receiptShowPhone: tenant?.receiptShowPhone ?? true,
      receiptTaxId: tenant?.receiptTaxId || "",
    },
  });

  // Mutations
  const businessSettingsMutation = useMutation({
    mutationFn: async (data: z.infer<typeof businessSettingsSchema>) => {
      return apiRequest("PATCH", "/api/tenant/settings", data);
    },
    onSuccess: () => {
      toast({ title: "Settings updated successfully" });
      setIsEditingBusiness(false);
      if (refreshTenant) refreshTenant();
    },
    onError: () => {
      toast({ title: "Failed to update settings", variant: "destructive" });
    },
  });

  const receiptSettingsMutation = useMutation({
    mutationFn: async (data: z.infer<typeof receiptSettingsSchema>) => {
      return apiRequest("PATCH", "/api/tenant/settings", data);
    },
    onSuccess: () => {
      toast({ title: "Receipt settings updated successfully" });
      if (refreshTenant) refreshTenant();
    },
    onError: () => {
      toast({ title: "Failed to update receipt settings", variant: "destructive" });
    },
  });

  const matiasConfigMutation = useMutation({
    mutationFn: async (data: z.infer<typeof matiasConfigSchema>) => {
      return apiRequest("POST", "/api/matias/configure", data);
    },
    onSuccess: () => {
      toast({ title: "Electronic invoicing configured successfully" });
      setIsEditingMatias(false);
      queryClient.invalidateQueries({ queryKey: ["/api/matias/status"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to configure electronic invoicing", description: error.message, variant: "destructive" });
    },
  });

  const matiasDisableMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/matias/disable", {});
    },
    onSuccess: () => {
      toast({ title: "Electronic invoicing disabled" });
      queryClient.invalidateQueries({ queryKey: ["/api/matias/status"] });
    },
    onError: () => {
      toast({ title: "Failed to disable electronic invoicing", variant: "destructive" });
    },
  });

  const categoryMutation = useMutation({
    mutationFn: async (data: z.infer<typeof categorySchema>) => {
      if (editingItem) {
        return apiRequest("PATCH", `/api/categories/${editingItem.id}`, data);
      }
      return apiRequest("POST", "/api/categories", data);
    },
    onSuccess: () => {
      toast({ title: editingItem ? "Category updated" : "Category created" });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setShowCategoryDialog(false);
      setEditingItem(null);
      categoryForm.reset();
    },
  });

  const userMutation = useMutation({
    mutationFn: async (data: z.infer<typeof userSchema>) => {
      if (editingUser) {
        // When editing, password is optional - only send if provided
        const updateData = { ...data };
        if (!updateData.password) {
          delete updateData.password;
        }
        return apiRequest("PATCH", `/api/users/${editingUser.id}`, updateData);
      }
      // When creating, password is required
      if (!data.password) {
        throw new Error("Password is required for new users");
      }
      return apiRequest("POST", "/api/users", data);
    },
    onSuccess: () => {
      toast({ title: editingUser ? "User updated" : "User created" });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowUserDialog(false);
      setEditingUser(null);
      userForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save user", description: error.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/users/${userId}`, {});
    },
    onSuccess: () => {
      toast({ title: "User deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: () => {
      toast({ title: "Failed to delete user", variant: "destructive" });
    },
  });

  const productMutation = useMutation({
    mutationFn: async (data: z.infer<typeof productSchema>) => {
      if (editingItem) {
        return apiRequest("PATCH", `/api/products/${editingItem.id}`, data);
      }
      return apiRequest("POST", "/api/products", data);
    },
    onSuccess: () => {
      toast({ title: editingItem ? "Product updated" : "Product created" });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setShowProductDialog(false);
      setEditingItem(null);
      productForm.reset();
    },
  });

  const floorMutation = useMutation({
    mutationFn: async (data: z.infer<typeof floorSchema>) => {
      if (editingItem) {
        return apiRequest("PATCH", `/api/floors/${editingItem.id}`, data);
      }
      return apiRequest("POST", "/api/floors", data);
    },
    onSuccess: () => {
      toast({ title: editingItem ? "Floor updated" : "Floor created" });
      queryClient.invalidateQueries({ queryKey: ["/api/floors"] });
      setShowFloorDialog(false);
      setEditingItem(null);
      floorForm.reset();
    },
  });

  const tableMutation = useMutation({
    mutationFn: async (data: z.infer<typeof tableSchema>) => {
      if (editingItem) {
        return apiRequest("PATCH", `/api/tables/${editingItem.id}`, data);
      }
      return apiRequest("POST", "/api/tables", data);
    },
    onSuccess: () => {
      toast({ title: editingItem ? "Table updated" : "Table created" });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      setShowTableDialog(false);
      setEditingItem(null);
      tableForm.reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ type, id }: { type: string; id: string }) => {
      return apiRequest("DELETE", `/api/${type}/${id}`, {});
    },
    onSuccess: (_, { type }) => {
      toast({ title: "Item deleted" });
      queryClient.invalidateQueries({ queryKey: [`/api/${type}`] });
    },
  });

  const openCategoryDialog = (category?: Category) => {
    if (category) {
      setEditingItem(category);
      categoryForm.reset({ name: category.name, color: category.color || "#3B82F6" });
    } else {
      setEditingItem(null);
      categoryForm.reset({ name: "", color: "#3B82F6" });
    }
    setShowCategoryDialog(true);
  };

  const openProductDialog = (product?: Product) => {
    if (product) {
      setEditingItem(product);
      setProductImagePath(product.image || "");
      productForm.reset({
        name: product.name,
        categoryId: product.categoryId || "",
        price: product.price,
        sku: product.sku || "",
        barcode: product.barcode || "",
        description: product.description || "",
        image: product.image || "",
      });
    } else {
      setEditingItem(null);
      setProductImagePath("");
      productForm.reset({ name: "", categoryId: "", price: "", sku: "", barcode: "", description: "", image: "" });
    }
    setShowProductDialog(true);
  };

  const openFloorDialog = (floor?: Floor) => {
    if (floor) {
      setEditingItem(floor);
      floorForm.reset({ name: floor.name });
    } else {
      setEditingItem(null);
      floorForm.reset({ name: "" });
    }
    setShowFloorDialog(true);
  };

  const openTableDialog = (table?: Table) => {
    if (table) {
      setEditingItem(table);
      tableForm.reset({ name: table.name, floorId: table.floorId, capacity: table.capacity || 4 });
    } else {
      setEditingItem(null);
      tableForm.reset({ name: "", floorId: floors?.[0]?.id || "", capacity: 4 });
    }
    setShowTableDialog(true);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="text-muted-foreground">
          {t("settings.subtitle")}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="business" data-testid="tab-business">
            <Store className="w-4 h-4 mr-2" />
            {t("settings.business")}
          </TabsTrigger>
          <TabsTrigger value="products" data-testid="tab-products">
            <Package className="w-4 h-4 mr-2" />
            {t("settings.products")}
          </TabsTrigger>
          {isRestaurant && (
            <TabsTrigger value="tables" data-testid="tab-tables">
              <LayoutGrid className="w-4 h-4 mr-2" />
              {t("settings.tables")}
            </TabsTrigger>
          )}
          <TabsTrigger value="printing" data-testid="tab-printing">
            <Printer className="w-4 h-4 mr-2" />
            {t("settings.printing")}
          </TabsTrigger>
          <TabsTrigger value="invoicing" data-testid="tab-invoicing">
            <FileText className="w-4 h-4 mr-2" />
            {t("settings.invoicing")}
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="w-4 h-4 mr-2" />
            {t("settings.users")}
          </TabsTrigger>
        </TabsList>

        {/* Business Settings */}
        <TabsContent value="business" className="mt-6 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>{t("business.title")}</CardTitle>
                <CardDescription>
                  {t("business.subtitle")}
                </CardDescription>
              </div>
              {!isEditingBusiness && (
                <Button 
                  variant="outline" 
                  onClick={() => {
                    businessForm.reset({
                      name: tenant?.name || "",
                      currency: tenant?.currency || "USD",
                      taxRate: tenant?.taxRate?.toString() || "0",
                      address: tenant?.address || "",
                      phone: tenant?.phone || "",
                      language: tenant?.language || "en",
                    });
                    setIsEditingBusiness(true);
                  }}
                  data-testid="button-edit-business"
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  {t("business.edit")}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditingBusiness ? (
                <Form {...businessForm}>
                  <form onSubmit={businessForm.handleSubmit((data) => businessSettingsMutation.mutate(data))} className="space-y-4">
                    <FormField
                      control={businessForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("business.name")}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-company-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={businessForm.control}
                        name="currency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("business.currency")}</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-currency">
                                  <SelectValue placeholder="Select currency" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {CURRENCIES.map((currency) => (
                                  <SelectItem key={currency.value} value={currency.value}>
                                    {currency.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={businessForm.control}
                        name="taxRate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("business.tax_rate")}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                placeholder="0.00"
                                data-testid="input-tax-rate"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={businessForm.control}
                        name="address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("business.address")}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="Business address"
                                data-testid="input-business-address"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={businessForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("business.phone")}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="Business phone"
                                data-testid="input-business-phone"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={businessForm.control}
                        name="language"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("business.language")}</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-language">
                                  <SelectValue placeholder="Select language" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {LANGUAGES.map((lang) => (
                                  <SelectItem key={lang.value} value={lang.value}>
                                    {lang.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsEditingBusiness(false)}
                        data-testid="button-cancel-business"
                      >
                        {t("business.cancel")}
                      </Button>
                      <Button
                        type="submit"
                        disabled={businessSettingsMutation.isPending}
                        data-testid="button-save-business"
                      >
                        {businessSettingsMutation.isPending && (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        )}
                        {t("business.save")}
                      </Button>
                    </div>
                  </form>
                </Form>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t("business.name")}</p>
                    <p className="font-medium">{tenant?.name || t("business.not_set")}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("business.type")}</p>
                    <Badge variant="secondary" className="capitalize">
                      {tenant?.type || "Not set"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("business.address")}</p>
                    <p className="font-medium">{tenant?.address || t("business.not_set")}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("business.phone")}</p>
                    <p className="font-medium">{tenant?.phone || t("business.not_set")}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("business.currency")}</p>
                    <p className="font-medium">{CURRENCIES.find(c => c.value === tenant?.currency)?.label || tenant?.currency || "$"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("business.tax_rate")}</p>
                    <p className="font-medium">{tenant?.taxRate || "0"}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("business.language")}</p>
                    <p className="font-medium">{LANGUAGES.find(l => l.value === tenant?.language)?.label || tenant?.language || "English"}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products Settings */}
        <TabsContent value="products" className="mt-6 space-y-6">
          {/* Categories */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>{t("categories.title")}</CardTitle>
                <CardDescription>
                  {t("categories.subtitle")}
                </CardDescription>
              </div>
              <Button onClick={() => openCategoryDialog()} data-testid="button-add-category">
                <Plus className="w-4 h-4 mr-2" />
                {t("categories.add")}
              </Button>
            </CardHeader>
            <CardContent>
              {categoriesLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : categories?.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {t("categories.empty")}
                </p>
              ) : (
                <div className="space-y-2">
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
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openCategoryDialog(category)}
                          data-testid={`button-edit-category-${category.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate({ type: "categories", id: category.id })}
                          data-testid={`button-delete-category-${category.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Products */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>{t("products.title")}</CardTitle>
                <CardDescription>
                  {t("products.subtitle")}
                </CardDescription>
              </div>
              <Button onClick={() => openProductDialog()} data-testid="button-add-product">
                <Plus className="w-4 h-4 mr-2" />
                {t("products.add")}
              </Button>
            </CardHeader>
            <CardContent>
              {productsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : products?.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {t("products.empty")}
                </p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {products?.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{product.name}</span>
                            {product.sku && (
                              <Badge variant="secondary" className="text-xs">
                                {product.sku}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {tenant?.currency || "$"}{product.price}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openProductDialog(product)}
                            data-testid={`button-edit-product-${product.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate({ type: "products", id: product.id })}
                            data-testid={`button-delete-product-${product.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tables Settings (Restaurant only) */}
        {isRestaurant && (
          <TabsContent value="tables" className="mt-6 space-y-6">
            {/* Floors */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>Floors</CardTitle>
                  <CardDescription>
                    Organize tables by floor
                  </CardDescription>
                </div>
                <Button onClick={() => openFloorDialog()} data-testid="button-add-floor">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Floor
                </Button>
              </CardHeader>
              <CardContent>
                {floorsLoading ? (
                  <div className="space-y-2">
                    {[...Array(2)].map((_, i) => (
                      <Skeleton key={i} className="h-12" />
                    ))}
                  </div>
                ) : floors?.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No floors yet. Add one to get started.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {floors?.map((floor) => (
                      <div
                        key={floor.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <span className="font-medium">{floor.name}</span>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openFloorDialog(floor)}
                            data-testid={`button-edit-floor-${floor.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate({ type: "floors", id: floor.id })}
                            data-testid={`button-delete-floor-${floor.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tables */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>Tables</CardTitle>
                  <CardDescription>
                    Manage your restaurant tables
                  </CardDescription>
                </div>
                <Button
                  onClick={() => openTableDialog()}
                  disabled={!floors?.length}
                  data-testid="button-add-table"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Table
                </Button>
              </CardHeader>
              <CardContent>
                {tablesLoading ? (
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-12" />
                    ))}
                  </div>
                ) : tables?.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    {floors?.length ? "No tables yet. Add one to get started." : "Add a floor first to create tables."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {tables?.map((table) => {
                      const floor = floors?.find((f) => f.id === table.floorId);
                      return (
                        <div
                          key={table.id}
                          className="flex items-center justify-between p-3 rounded-lg border"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{table.name}</span>
                            <Badge variant="secondary">{floor?.name}</Badge>
                            <Badge variant="outline">{table.capacity} seats</Badge>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openTableDialog(table)}
                              data-testid={`button-edit-table-${table.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate({ type: "tables", id: table.id })}
                              data-testid={`button-delete-table-${table.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Printing Settings */}
        <TabsContent value="printing" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("printing.title")}</CardTitle>
              <CardDescription>
                Customize your receipt appearance and content
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...receiptForm}>
                <form onSubmit={receiptForm.handleSubmit((data) => receiptSettingsMutation.mutate(data))} className="space-y-6">
                  <div className="space-y-4 mb-6">
                    <h3 className="text-sm font-medium">Company Logo</h3>
                    <div className="flex items-start gap-4">
                      <div className="relative w-32 h-32 rounded-lg border bg-muted/50 flex items-center justify-center overflow-hidden">
                        {receiptLogoPath ? (
                          <img
                            src={receiptLogoPath}
                            alt="Company Logo"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <ImageIcon className="w-8 h-8 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <Input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id="receipt-logo-upload"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              await uploadLogoFile(file);
                            }
                          }}
                          data-testid="input-receipt-logo-file"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isUploadingLogo}
                          onClick={() => document.getElementById("receipt-logo-upload")?.click()}
                          data-testid="button-upload-receipt-logo"
                        >
                          {isUploadingLogo ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4 mr-2" />
                          )}
                          {receiptLogoPath ? "Change Logo" : "Upload Logo"}
                        </Button>
                        {receiptLogoPath && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              setReceiptLogoPath("");
                              await apiRequest("PATCH", "/api/tenant/settings", { logo: "" });
                              if (refreshTenant) refreshTenant();
                            }}
                            data-testid="button-remove-receipt-logo"
                          >
                            <X className="w-4 h-4 mr-2" />
                            Remove Logo
                          </Button>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Recommended: 200x200px, PNG or JPG
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                      <h3 className="text-sm font-medium">Display Options</h3>
                      
                      <FormField
                        control={receiptForm.control}
                        name="receiptShowLogo"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel>Show Logo</FormLabel>
                              <FormDescription className="text-xs">
                                Display your company logo on receipts
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-receipt-show-logo"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={receiptForm.control}
                        name="receiptShowAddress"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel>Show Address</FormLabel>
                              <FormDescription className="text-xs">
                                Display your business address
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-receipt-show-address"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={receiptForm.control}
                        name="receiptShowPhone"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel>Show Phone</FormLabel>
                              <FormDescription className="text-xs">
                                Display your contact phone number
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-receipt-show-phone"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={receiptForm.control}
                        name="receiptTaxId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tax ID / NIT</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="Enter your tax identification number"
                                data-testid="input-receipt-tax-id"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              Your business tax ID shown on receipts
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-sm font-medium">Custom Text</h3>
                      
                      <FormField
                        control={receiptForm.control}
                        name="receiptHeaderText"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Header Message</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                placeholder="Welcome message or promotional text"
                                rows={3}
                                data-testid="input-receipt-header"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              Displayed at the top of the receipt
                            </FormDescription>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={receiptForm.control}
                        name="receiptFooterText"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Footer Message</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                placeholder="Thank you message, return policy, etc."
                                rows={3}
                                data-testid="input-receipt-footer"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              Displayed at the bottom of the receipt
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={receiptSettingsMutation.isPending}
                      data-testid="button-save-receipt-settings"
                    >
                      {receiptSettingsMutation.isPending && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      Save Receipt Settings
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Printing Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 rounded-lg bg-muted/50 border border-dashed">
                <div className="flex items-center gap-3 mb-3">
                  <Printer className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">{t("printing.browser_printing")}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("printing.browser_description")}
                </p>
                <div className="text-sm space-y-2">
                  <p><strong>{t("printing.supported_sizes")}:</strong> 58mm, 80mm</p>
                  <p><strong>{t("printing.tip")}:</strong> {t("printing.tip_text")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Electronic Invoicing Settings */}
        <TabsContent value="invoicing" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Facturación Electrónica Colombia</CardTitle>
                  <CardDescription>
                    Configuración de la API de Matias para facturación electrónica DIAN
                  </CardDescription>
                </div>
                {matiasStatus?.enabled ? (
                  <Badge variant="default" className="bg-green-500">
                    <Check className="w-3 h-3 mr-1" />
                    Conectado
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <X className="w-3 h-3 mr-1" />
                    No configurado
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {matiasLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : isEditingMatias || !matiasStatus?.configured ? (
                <Form {...matiasForm}>
                  <form onSubmit={matiasForm.handleSubmit((data) => matiasConfigMutation.mutate(data))} className="space-y-4">
                    <FormField
                      control={matiasForm.control}
                      name="apiUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>URL de la API</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="https://api.matias-api.com" 
                              data-testid="input-matias-url"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={matiasForm.control}
                      name="clientId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client ID</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="text"
                              placeholder="your-client-id" 
                              data-testid="input-matias-client-id"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={matiasForm.control}
                      name="clientSecret"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client Secret</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="password"
                              placeholder="••••••••" 
                              data-testid="input-matias-client-secret"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex gap-2 justify-end">
                      {matiasStatus?.configured && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsEditingMatias(false)}
                        >
                          Cancelar
                        </Button>
                      )}
                      <Button
                        type="submit"
                        disabled={matiasConfigMutation.isPending}
                        data-testid="button-save-matias"
                      >
                        {matiasConfigMutation.isPending && (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        )}
                        Conectar
                      </Button>
                    </div>
                  </form>
                </Form>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">URL de la API</p>
                      <p className="font-medium truncate">{matiasStatus.apiUrl}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Client ID</p>
                      <p className="font-medium">{matiasStatus.clientId}</p>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 border border-dashed">
                    <div className="flex items-center gap-3 mb-3">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                      <span className="font-medium">Documentos Soportados</span>
                    </div>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>Factura Electrónica (Resolución 000165/2024)</li>
                      <li>Nota Crédito</li>
                      <li>Documento Soporte</li>
                    </ul>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsEditingMatias(true)}
                      data-testid="button-edit-matias"
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      Editar configuración
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => matiasDisableMutation.mutate()}
                      disabled={matiasDisableMutation.isPending}
                      data-testid="button-disable-matias"
                    >
                      {matiasDisableMutation.isPending && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      Desconectar
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Management */}
        <TabsContent value="users" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>{t("users.title")}</CardTitle>
                <CardDescription>
                  {t("users.subtitle")}
                </CardDescription>
              </div>
              <Button
                onClick={() => {
                  setEditingUser(null);
                  userForm.reset({
                    name: "",
                    email: "",
                    phone: "",
                    username: "",
                    password: "",
                    role: "cashier",
                    pin: "",
                  });
                  setShowUserDialog(true);
                }}
                data-testid="button-add-user"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t("users.add")}
              </Button>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : users?.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {t("users.empty")}
                </p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {users?.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-3 rounded-md border"
                        data-testid={`user-item-${user.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{user.name}</span>
                            <Badge variant={user.role === "admin" ? "default" : user.role === "manager" ? "secondary" : "outline"}>
                              {user.role}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            @{user.username} • {user.email}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingUser(user);
                              userForm.reset({
                                name: user.name,
                                email: user.email || "",
                                phone: user.phone || "",
                                username: user.username,
                                password: "",
                                role: user.role as "admin" | "manager" | "cashier" | "kitchen",
                                pin: user.pin || "",
                              });
                              setShowUserDialog(true);
                            }}
                            data-testid={`button-edit-user-${user.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(t("users.delete_confirm"))) {
                                deleteUserMutation.mutate(user.id);
                              }
                            }}
                            disabled={deleteUserMutation.isPending}
                            data-testid={`button-delete-user-${user.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? t("categories.edit") : t("categories.add")}</DialogTitle>
          </DialogHeader>
          <Form {...categoryForm}>
            <form onSubmit={categoryForm.handleSubmit((data) => categoryMutation.mutate(data))} className="space-y-4">
              <FormField
                control={categoryForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.name")}</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-category-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={categoryForm.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.color")}</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input type="color" {...field} className="w-12 h-10 p-1" />
                        <Input {...field} placeholder="#3B82F6" className="flex-1" data-testid="input-category-color" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCategoryDialog(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={categoryMutation.isPending} data-testid="button-save-category">
                  {categoryMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Product Dialog */}
      <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? t("products.edit") : t("products.add")}</DialogTitle>
          </DialogHeader>
          <Form {...productForm}>
            <form onSubmit={productForm.handleSubmit((data) => productMutation.mutate(data))} className="space-y-4">
              <FormField
                control={productForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.name")}</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-product-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={productForm.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.category")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-product-category">
                          <SelectValue placeholder={t("products.select_category")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories?.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={productForm.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.price")}</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step="0.01" data-testid="input-product-price" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={productForm.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.sku")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-product-sku" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={productForm.control}
                  name="barcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.barcode")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-product-barcode" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={productForm.control}
                name="image"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Image</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        {productImagePath && (
                          <div className="relative w-24 h-24 rounded-md border overflow-hidden">
                            <img
                              src={productImagePath}
                              alt="Product"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            id="product-image-upload"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                await uploadFile(file);
                              }
                            }}
                            data-testid="input-product-image-file"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            disabled={isUploadingImage}
                            onClick={() => document.getElementById("product-image-upload")?.click()}
                            data-testid="button-upload-product-image"
                          >
                            {isUploadingImage ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Upload className="w-4 h-4 mr-2" />
                            )}
                            {productImagePath ? "Change Image" : "Upload Image"}
                          </Button>
                          {productImagePath && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setProductImagePath("");
                                field.onChange("");
                              }}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        <input type="hidden" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowProductDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={productMutation.isPending} data-testid="button-save-product">
                  {productMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Floor Dialog */}
      <Dialog open={showFloorDialog} onOpenChange={setShowFloorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Floor" : "Add Floor"}</DialogTitle>
          </DialogHeader>
          <Form {...floorForm}>
            <form onSubmit={floorForm.handleSubmit((data) => floorMutation.mutate(data))} className="space-y-4">
              <FormField
                control={floorForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Main Floor, Patio" data-testid="input-floor-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowFloorDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={floorMutation.isPending} data-testid="button-save-floor">
                  {floorMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Table Dialog */}
      <Dialog open={showTableDialog} onOpenChange={setShowTableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Table" : "Add Table"}</DialogTitle>
          </DialogHeader>
          <Form {...tableForm}>
            <form onSubmit={tableForm.handleSubmit((data) => tableMutation.mutate(data))} className="space-y-4">
              <FormField
                control={tableForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Table 1" data-testid="input-table-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={tableForm.control}
                name="floorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Floor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-table-floor">
                          <SelectValue placeholder="Select floor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {floors?.map((floor) => (
                          <SelectItem key={floor.id} value={floor.id}>
                            {floor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={tableForm.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacity (seats)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        data-testid="input-table-capacity"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowTableDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={tableMutation.isPending} data-testid="button-save-table">
                  {tableMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* User Dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit User" : "Add User"}</DialogTitle>
          </DialogHeader>
          <Form {...userForm}>
            <form onSubmit={userForm.handleSubmit((data) => userMutation.mutate(data))} className="space-y-4">
              <FormField
                control={userForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-user-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={userForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-user-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={userForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-user-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={userForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-user-username" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={userForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{editingUser ? "New Password (leave blank to keep)" : "Password"}</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} data-testid="input-user-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={userForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-user-role">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="cashier">Cashier</SelectItem>
                          <SelectItem value="kitchen">Kitchen</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={userForm.control}
                  name="pin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PIN (optional)</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          maxLength={6} 
                          placeholder="4-6 digits"
                          {...field} 
                          data-testid="input-user-pin" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowUserDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={userMutation.isPending} data-testid="button-save-user">
                  {userMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
