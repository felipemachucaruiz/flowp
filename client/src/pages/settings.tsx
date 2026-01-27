import { useState, useEffect } from "react";
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
import type { Category, Product, Floor, Table, User, TaxRate } from "@shared/schema";
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
  Receipt,
} from "lucide-react";
import { useUpload } from "@/hooks/use-upload";
import { printBridge, type PrintBridgeStatus, type PrinterInfo } from "@/lib/print-bridge";
import { Wifi, WifiOff, Download } from "lucide-react";

const businessSettingsSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  currency: z.string().min(1, "Currency is required"),
  taxRate: z.string().min(0, "Tax rate is required"),
  country: z.string().min(1, "Country is required"),
  city: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  language: z.string().min(1, "Language is required"),
  taxId: z.string().min(1, "Tax ID is required"),
  logo: z.string().optional(),
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

const receiptSettingsSchema = z.object({
  receiptShowLogo: z.boolean().default(true),
  receiptLogoSize: z.number().min(50).max(400).default(200),
  receiptHeaderText: z.string().optional(),
  receiptFooterText: z.string().optional(),
  receiptShowAddress: z.boolean().default(true),
  receiptShowPhone: z.boolean().default(true),
  receiptFontSize: z.number().min(8).max(16).default(12),
  receiptFontFamily: z.string().default("monospace"),
  couponEnabled: z.boolean().default(false),
  couponText: z.string().optional(),
});

const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  color: z.string().default("#3B82F6"),
});

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  categoryId: z.string().optional(),
  price: z.string().min(1, "Price is required"),
  cost: z.string().optional(),
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
];

const COUNTRIES = [
  { value: "CO", label: "Colombia", taxIdLabel: "NIT" },
  { value: "MX", label: "México", taxIdLabel: "RFC" },
  { value: "AR", label: "Argentina", taxIdLabel: "CUIT" },
  { value: "PE", label: "Perú", taxIdLabel: "RUC" },
  { value: "CL", label: "Chile", taxIdLabel: "RUT" },
  { value: "BR", label: "Brasil", taxIdLabel: "CNPJ" },
  { value: "US", label: "United States", taxIdLabel: "EIN" },
  { value: "ES", label: "España", taxIdLabel: "CIF/NIF" },
];

function PrintBridgeSettings() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [bridgeStatus, setBridgeStatus] = useState<PrintBridgeStatus | null>(null);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [tokenInput, setTokenInput] = useState(printBridge.getToken() || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const checkBridgeStatus = async () => {
    setIsChecking(true);
    try {
      const status = await printBridge.checkStatus();
      setBridgeStatus(status);
      
      if (status.isAvailable && printBridge.getToken()) {
        const detectedPrinters = await printBridge.getPrinters();
        if (detectedPrinters.length > 0) {
          setIsAuthenticated(true);
          setPrinters(detectedPrinters);
        } else {
          setIsAuthenticated(false);
          setPrinters([]);
        }
      } else {
        setIsAuthenticated(false);
        setPrinters([]);
      }
    } catch {
      setBridgeStatus({ isAvailable: false });
      setIsAuthenticated(false);
      setPrinters([]);
    }
    setIsChecking(false);
  };

  const handleSaveToken = () => {
    printBridge.setToken(tokenInput.trim() || null);
    checkBridgeStatus();
    toast({
      title: t("printing.token_saved"),
      description: t("printing.token_saved_desc"),
    });
  };

  useEffect(() => {
    checkBridgeStatus();
    const interval = setInterval(checkBridgeStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-dashed">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {bridgeStatus?.isAvailable && isAuthenticated ? (
            <Wifi className="w-5 h-5 text-green-500" />
          ) : bridgeStatus?.isAvailable ? (
            <Wifi className="w-5 h-5 text-yellow-500" />
          ) : (
            <WifiOff className="w-5 h-5 text-muted-foreground" />
          )}
          <span className="font-medium">{t("printing.bridge_title")}</span>
        </div>
        <Badge variant={bridgeStatus?.isAvailable && isAuthenticated ? "default" : "secondary"}>
          {bridgeStatus?.isAvailable && isAuthenticated 
            ? t("printing.bridge_connected") 
            : bridgeStatus?.isAvailable 
              ? t("printing.bridge_needs_token")
              : t("printing.bridge_disconnected")}
        </Badge>
      </div>
      
      <p className="text-sm text-muted-foreground mb-4">
        {t("printing.bridge_description")}
      </p>

      {bridgeStatus?.isAvailable && isAuthenticated ? (
        <div className="space-y-3">
          <div className="text-sm">
            <strong>{t("printing.bridge_version")}</strong> {bridgeStatus.version}
          </div>
          {printers.length > 0 && (
            <div className="text-sm">
              <strong>{t("printing.bridge_printers")}</strong>
              <ul className="mt-1 ml-4 list-disc">
                {printers.map((printer, idx) => (
                  <li key={idx}>{printer.name} ({printer.type})</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <Check className="w-4 h-4" />
            {t("printing.direct_print_desc")}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground whitespace-pre-line">
            {t("printing.bridge_instructions")}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('/flowp-print-bridge.exe', '_blank')}
            data-testid="button-download-print-bridge"
          >
            <Download className="w-4 h-4 mr-2" />
            {t("printing.bridge_download_exe")}
          </Button>
          
          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground mb-2">
              {t("printing.bridge_token_instructions")}
            </p>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder={t("printing.token_placeholder")}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="flex-1"
                data-testid="input-bridge-token"
              />
              <Button 
                size="sm" 
                onClick={handleSaveToken}
                data-testid="button-save-token"
              >
                {t("common.save")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={checkBridgeStatus}
        disabled={isChecking}
        className="mt-3"
        data-testid="button-check-bridge"
      >
        {isChecking ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Wifi className="w-4 h-4 mr-2" />
        )}
        {t("printing.bridge_status")}
      </Button>
    </div>
  );
}

// Tax Add Form Component
function TaxAddForm({
  onSave,
  onCancel,
  isPending,
  t,
}: {
  onSave: (data: { name: string; rate: string; isActive: boolean }) => void;
  onCancel: () => void;
  isPending: boolean;
  t: (key: string) => string;
}) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [isActive, setIsActive] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && rate.trim()) {
      onSave({ name: name.trim(), rate, isActive });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">{t("taxes.name")}</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("taxes.name_placeholder")}
            data-testid="input-tax-name"
          />
        </div>
        <div>
          <label className="text-sm font-medium">{t("taxes.rate")}</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder={t("taxes.rate_placeholder")}
            data-testid="input-tax-rate"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={isActive}
          onCheckedChange={setIsActive}
          data-testid="switch-tax-active"
        />
        <label className="text-sm">{t("taxes.active")}</label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel-tax">
          <X className="w-4 h-4 mr-2" />
          {t("business.cancel")}
        </Button>
        <Button type="submit" disabled={isPending || !name.trim() || !rate.trim()} data-testid="button-save-tax">
          {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
          {t("business.save")}
        </Button>
      </div>
    </form>
  );
}

// Tax Edit Form Component
function TaxEditForm({
  tax,
  onSave,
  onCancel,
  isPending,
  t,
}: {
  tax: TaxRate;
  onSave: (data: { name?: string; rate?: string; isActive?: boolean }) => void;
  onCancel: () => void;
  isPending: boolean;
  t: (key: string) => string;
}) {
  const [name, setName] = useState(tax.name);
  const [rate, setRate] = useState(tax.rate || "0");
  const [isActive, setIsActive] = useState(tax.isActive ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name: name.trim(), rate, isActive });
  };

  return (
    <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-4">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("taxes.name")}
          data-testid="input-edit-tax-name"
        />
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-24"
            data-testid="input-edit-tax-rate"
          />
          <span>%</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
            data-testid="switch-edit-tax-active"
          />
          <label className="text-sm">{t("taxes.active")}</label>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} data-testid="button-cancel-edit-tax">
          <X className="w-4 h-4" />
        </Button>
        <Button type="submit" size="icon" disabled={isPending || !name.trim()} data-testid="button-save-edit-tax">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        </Button>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { tenant, refreshTenant } = useAuth();
  const { t, formatDate } = useI18n();
  const [activeTab, setActiveTab] = useState("business");
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [showFloorDialog, setShowFloorDialog] = useState(false);
  const [showTableDialog, setShowTableDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isEditingBusiness, setIsEditingBusiness] = useState(false);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [productImagePath, setProductImagePath] = useState<string>("");
  const [businessLogoPath, setBusinessLogoPath] = useState<string>(tenant?.logo || "");
  const [receiptLogoPath, setReceiptLogoPath] = useState<string>(tenant?.receiptLogo || "");

  // Sync logo paths when tenant data loads/changes
  useEffect(() => {
    if (tenant?.logo !== undefined) {
      setBusinessLogoPath(tenant.logo || "");
    }
    if (tenant?.receiptLogo !== undefined) {
      setReceiptLogoPath(tenant.receiptLogo || "");
    }
  }, [tenant?.logo, tenant?.receiptLogo]);

  // Sync receipt form when tenant data loads
  useEffect(() => {
    if (tenant) {
      receiptForm.reset({
        receiptShowLogo: tenant.receiptShowLogo ?? true,
        receiptLogoSize: tenant.receiptLogoSize ?? 200,
        receiptHeaderText: tenant.receiptHeaderText || "",
        receiptFooterText: tenant.receiptFooterText || "",
        receiptShowAddress: tenant.receiptShowAddress ?? true,
        receiptShowPhone: tenant.receiptShowPhone ?? true,
        receiptFontSize: tenant.receiptFontSize ?? 12,
        receiptFontFamily: tenant.receiptFontFamily ?? "monospace",
        couponEnabled: tenant.couponEnabled ?? false,
        couponText: tenant.couponText || "",
      });
    }
  }, [tenant]);

  const { uploadFile, isUploading: isUploadingImage } = useUpload({
    onSuccess: (response) => {
      setProductImagePath(response.objectPath);
      productForm.setValue("image", response.objectPath);
      toast({ title: t("settings.image_uploaded") });
    },
    onError: (error) => {
      toast({ title: t("settings.image_upload_error"), description: error.message, variant: "destructive" });
    },
  });

  const { uploadFile: uploadBusinessLogo, isUploading: isUploadingBusinessLogo } = useUpload({
    onSuccess: async (response) => {
      setBusinessLogoPath(response.objectPath);
      businessForm.setValue("logo", response.objectPath);
      toast({ title: t("settings.logo_uploaded") });
    },
    onError: (error) => {
      toast({ title: t("settings.logo_upload_error"), description: error.message, variant: "destructive" });
    },
  });

  const { uploadFile: uploadReceiptLogo, isUploading: isUploadingReceiptLogo } = useUpload({
    onSuccess: async (response) => {
      setReceiptLogoPath(response.objectPath);
      await apiRequest("PATCH", "/api/settings", { receiptLogo: response.objectPath });
      toast({ title: t("settings.receipt_logo_uploaded") });
      if (refreshTenant) refreshTenant();
    },
    onError: (error) => {
      toast({ title: t("settings.receipt_logo_upload_error"), description: error.message, variant: "destructive" });
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

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: taxRates, isLoading: taxRatesLoading } = useQuery<TaxRate[]>({
    queryKey: ["/api/tax-rates"],
  });

  // Tax rates state
  const [isAddingTax, setIsAddingTax] = useState(false);
  const [editingTax, setEditingTax] = useState<TaxRate | null>(null);

  // Forms
  const categoryForm = useForm({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "", color: "#3B82F6" },
  });

  const productForm = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: { name: "", categoryId: "", price: "", cost: "", sku: "", barcode: "", description: "", image: "" },
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
      country: tenant?.country || "",
      city: tenant?.city || "",
      address: tenant?.address || "",
      phone: tenant?.phone || "",
      language: tenant?.language || "en",
      taxId: tenant?.receiptTaxId || "",
      logo: tenant?.logo || "",
    },
  });

  const selectedCountry = businessForm.watch("country");
  const taxIdLabel = COUNTRIES.find(c => c.value === selectedCountry)?.taxIdLabel || "Tax ID";

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

  const receiptForm = useForm({
    resolver: zodResolver(receiptSettingsSchema),
    defaultValues: {
      receiptShowLogo: tenant?.receiptShowLogo ?? true,
      receiptLogoSize: tenant?.receiptLogoSize ?? 200,
      receiptHeaderText: tenant?.receiptHeaderText || "",
      receiptFooterText: tenant?.receiptFooterText || "",
      receiptShowAddress: tenant?.receiptShowAddress ?? true,
      receiptShowPhone: tenant?.receiptShowPhone ?? true,
      receiptFontSize: tenant?.receiptFontSize ?? 12,
      receiptFontFamily: tenant?.receiptFontFamily ?? "monospace",
      couponEnabled: tenant?.couponEnabled ?? false,
      couponText: tenant?.couponText || "",
    },
  });

  // Mutations
  const businessSettingsMutation = useMutation({
    mutationFn: async (data: z.infer<typeof businessSettingsSchema>) => {
      const { taxId, ...rest } = data;
      return apiRequest("PATCH", "/api/settings", { ...rest, receiptTaxId: taxId });
    },
    onSuccess: () => {
      toast({ title: t("settings.updated") });
      setIsEditingBusiness(false);
      if (refreshTenant) refreshTenant();
    },
    onError: () => {
      toast({ title: t("settings.update_error"), variant: "destructive" });
    },
  });

  const receiptSettingsMutation = useMutation({
    mutationFn: async (data: z.infer<typeof receiptSettingsSchema>) => {
      return apiRequest("PATCH", "/api/settings", data);
    },
    onSuccess: () => {
      toast({ title: t("settings.receipt_updated") });
      if (refreshTenant) refreshTenant();
    },
    onError: () => {
      toast({ title: t("settings.receipt_update_error"), variant: "destructive" });
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
      toast({ title: editingItem ? t("settings.category_updated") : t("settings.category_created") });
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
        throw new Error(t("validation.password_required_new"));
      }
      return apiRequest("POST", "/api/users", data);
    },
    onSuccess: () => {
      toast({ title: editingUser ? t("settings.user_updated") : t("settings.user_created") });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowUserDialog(false);
      setEditingUser(null);
      userForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: t("settings.user_save_error"), description: error.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/users/${userId}`, {});
    },
    onSuccess: () => {
      toast({ title: t("settings.user_deleted") });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: () => {
      toast({ title: t("settings.user_delete_error"), variant: "destructive" });
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
      toast({ title: editingItem ? t("settings.product_updated") : t("settings.product_created") });
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
      toast({ title: editingItem ? t("settings.floor_updated") : t("settings.floor_created") });
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
      toast({ title: editingItem ? t("settings.table_updated") : t("settings.table_created") });
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
      toast({ title: t("settings.item_deleted") });
      queryClient.invalidateQueries({ queryKey: [`/api/${type}`] });
    },
  });

  // Tax rate mutations
  const createTaxRateMutation = useMutation({
    mutationFn: async (data: { name: string; rate: string; isActive: boolean }) => {
      return apiRequest("POST", "/api/tax-rates", data);
    },
    onSuccess: () => {
      toast({ title: t("taxes.create_success") });
      queryClient.invalidateQueries({ queryKey: ["/api/tax-rates"] });
      setIsAddingTax(false);
    },
  });

  const updateTaxRateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; rate?: string; isActive?: boolean } }) => {
      return apiRequest("PATCH", `/api/tax-rates/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: t("taxes.update_success") });
      queryClient.invalidateQueries({ queryKey: ["/api/tax-rates"] });
      setEditingTax(null);
    },
  });

  const deleteTaxRateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/tax-rates/${id}`, {});
    },
    onSuccess: () => {
      toast({ title: t("taxes.delete_success") });
      queryClient.invalidateQueries({ queryKey: ["/api/tax-rates"] });
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
        cost: product.cost || "",
        sku: product.sku || "",
        barcode: product.barcode || "",
        description: product.description || "",
        image: product.image || "",
      });
    } else {
      setEditingItem(null);
      setProductImagePath("");
      productForm.reset({ name: "", categoryId: "", price: "", cost: "", sku: "", barcode: "", description: "", image: "" });
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
          <TabsTrigger value="taxes" data-testid="tab-taxes">
            <Receipt className="w-4 h-4 mr-2" />
            {t("taxes.title")}
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
                      country: tenant?.country || "",
                      city: tenant?.city || "",
                      address: tenant?.address || "",
                      phone: tenant?.phone || "",
                      language: tenant?.language || "en",
                      taxId: tenant?.receiptTaxId || "",
                      logo: tenant?.logo || "",
                    });
                    setBusinessLogoPath(tenant?.logo || "");
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
                    <div className="flex gap-6 items-start">
                      <div className="flex-shrink-0">
                        <p className="text-sm font-medium mb-2">{t("settings.company_logo")}</p>
                        <div className="w-32 h-32 border-2 border-dashed rounded-lg flex items-center justify-center overflow-hidden bg-muted/50">
                          {businessLogoPath ? (
                            <img
                              src={businessLogoPath.startsWith('/objects') ? businessLogoPath : `/objects${businessLogoPath}`}
                              alt="Company logo"
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <ImageIcon className="w-8 h-8 text-muted-foreground" />
                          )}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isUploadingBusinessLogo}
                            onClick={() => {
                              const input = document.createElement("input");
                              input.type = "file";
                              input.accept = "image/*";
                              input.onchange = (e) => {
                                const file = (e.target as HTMLInputElement).files?.[0];
                                if (file) uploadBusinessLogo(file);
                              };
                              input.click();
                            }}
                            data-testid="button-upload-business-logo"
                          >
                            {isUploadingBusinessLogo ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              t("settings.upload")
                            )}
                          </Button>
                          {businessLogoPath && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setBusinessLogoPath("");
                                businessForm.setValue("logo", "");
                              }}
                              data-testid="button-remove-business-logo"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex-1">
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
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={businessForm.control}
                        name="country"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("form.country")}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-country">
                                  <SelectValue placeholder={t("settings.select_country")} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {COUNTRIES.map((country) => (
                                  <SelectItem key={country.value} value={country.value}>
                                    {country.label}
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
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("settings.city")}</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder={t("settings.city")} data-testid="input-city" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={businessForm.control}
                        name="taxId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{taxIdLabel} *</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder={taxIdLabel} data-testid="input-tax-id" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={businessForm.control}
                        name="currency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("business.currency")}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
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
                            <Select onValueChange={field.onChange} value={field.value}>
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
                <div className="flex gap-6">
                  {tenant?.logo && (
                    <div className="flex-shrink-0">
                      <p className="text-sm text-muted-foreground mb-2">Logo</p>
                      <div className="w-24 h-24 border rounded-lg overflow-hidden bg-muted/50">
                        <img
                          src={`/objects${tenant.logo}`}
                          alt="Company logo"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex-1 grid grid-cols-2 gap-4">
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
                      <p className="text-sm text-muted-foreground">Country</p>
                      <p className="font-medium">{COUNTRIES.find(c => c.value === tenant?.country)?.label || tenant?.country || t("business.not_set")}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">City</p>
                      <p className="font-medium">{tenant?.city || t("business.not_set")}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{COUNTRIES.find(c => c.value === tenant?.country)?.taxIdLabel || "Tax ID"}</p>
                      <p className="font-medium">{tenant?.receiptTaxId || t("business.not_set")}</p>
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
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tax Configuration */}
        <TabsContent value="taxes" className="mt-6 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>{t("taxes.title")}</CardTitle>
                <CardDescription>{t("taxes.subtitle")}</CardDescription>
              </div>
              <Button onClick={() => setIsAddingTax(true)} data-testid="button-add-tax">
                <Plus className="w-4 h-4 mr-2" />
                {t("taxes.add")}
              </Button>
            </CardHeader>
            <CardContent>
              {taxRatesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : !taxRates || taxRates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">{t("taxes.no_taxes")}</p>
                  <p className="text-sm">{t("taxes.no_taxes_description")}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Tax List */}
                  <div className="space-y-2">
                    {taxRates.map((tax) => (
                      <div
                        key={tax.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                        data-testid={`tax-item-${tax.id}`}
                      >
                        {editingTax?.id === tax.id ? (
                          <TaxEditForm
                            tax={tax}
                            onSave={(data) => updateTaxRateMutation.mutate({ id: tax.id, data })}
                            onCancel={() => setEditingTax(null)}
                            isPending={updateTaxRateMutation.isPending}
                            t={t}
                          />
                        ) : (
                          <>
                            <div className="flex items-center gap-3">
                              <div>
                                <p className="font-medium">{tax.name}</p>
                                <p className="text-sm text-muted-foreground">{tax.rate}%</p>
                              </div>
                              {!tax.isActive && (
                                <Badge variant="secondary">{t("common.inactive")}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingTax(tax)}
                                data-testid={`button-edit-tax-${tax.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm(t("taxes.delete_confirm"))) {
                                    deleteTaxRateMutation.mutate(tax.id);
                                  }
                                }}
                                data-testid={`button-delete-tax-${tax.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Total Tax Rate Display */}
                  <div className="pt-4 border-t">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{t("taxes.total_rate")}</span>
                      <span className="text-lg font-bold">
                        {taxRates
                          .filter((t) => t.isActive)
                          .reduce((sum, t) => sum + parseFloat(t.rate || "0"), 0)
                          .toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Add Tax Form */}
              {isAddingTax && (
                <div className="mt-4 p-4 border rounded-lg">
                  <TaxAddForm
                    onSave={(data) => createTaxRateMutation.mutate(data)}
                    onCancel={() => setIsAddingTax(false)}
                    isPending={createTaxRateMutation.isPending}
                    t={t}
                  />
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
                  <CardTitle>{t("form.floors")}</CardTitle>
                  <CardDescription>
                    {t("settings.organize_floors")}
                  </CardDescription>
                </div>
                <Button onClick={() => openFloorDialog()} data-testid="button-add-floor">
                  <Plus className="w-4 h-4 mr-2" />
                  {t("settings.add_floor")}
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
                  <CardTitle>{t("form.tables")}</CardTitle>
                  <CardDescription>
                    {t("settings.manage_tables")}
                  </CardDescription>
                </div>
                <Button
                  onClick={() => openTableDialog()}
                  disabled={!floors?.length}
                  data-testid="button-add-table"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t("settings.add_table")}
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
                {t("printing.subtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...receiptForm}>
                <form onSubmit={receiptForm.handleSubmit((data) => receiptSettingsMutation.mutate(data))} className="space-y-6">
                  <div className="space-y-4 mb-6">
                    <h3 className="text-sm font-medium">{t("printing.receipt_logo")}</h3>
                    <p className="text-xs text-muted-foreground">
                      {t("printing.receipt_logo_desc")}
                    </p>
                    <div className="flex items-start gap-4">
                      <div className="relative w-32 h-32 rounded-lg border bg-muted/50 flex items-center justify-center overflow-hidden">
                        {receiptLogoPath ? (
                          <img
                            src={receiptLogoPath.startsWith('/objects') ? receiptLogoPath : `/objects${receiptLogoPath}`}
                            alt={t("printing.receipt_logo")}
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
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadReceiptLogo(file);
                          }}
                          data-testid="input-receipt-logo-file"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isUploadingReceiptLogo}
                          onClick={() => document.getElementById("receipt-logo-upload")?.click()}
                          data-testid="button-upload-receipt-logo"
                        >
                          {isUploadingReceiptLogo ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4 mr-2" />
                          )}
                          {receiptLogoPath ? t("printing.change_logo") : t("printing.upload_logo")}
                        </Button>
                        {receiptLogoPath && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              setReceiptLogoPath("");
                              await apiRequest("PATCH", "/api/settings", { receiptLogo: "" });
                              if (refreshTenant) refreshTenant();
                            }}
                            data-testid="button-remove-receipt-logo"
                          >
                            <X className="w-4 h-4 mr-2" />
                            {t("printing.remove_logo")}
                          </Button>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {t("printing.logo_recommended")}
                        </p>
                      </div>
                    </div>
                    
                    {receiptLogoPath && (
                      <FormField
                        control={receiptForm.control}
                        name="receiptLogoSize"
                        render={({ field }) => (
                          <FormItem className="mt-4">
                            <div className="flex items-center justify-between">
                              <FormLabel>{t("printing.logo_size")}</FormLabel>
                              <span className="text-sm text-muted-foreground">{field.value}px</span>
                            </div>
                            <FormControl>
                              <input
                                type="range"
                                min={50}
                                max={400}
                                step={10}
                                value={field.value}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                                data-testid="slider-receipt-logo-size"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              {t("printing.logo_size_desc")}
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  {/* Font Settings */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium">{t("printing.font_settings")}</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={receiptForm.control}
                        name="receiptFontFamily"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("printing.font_family")}</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-receipt-font-family">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="monospace">{t("printing.font_monospace")}</SelectItem>
                                <SelectItem value="sans-serif">{t("printing.font_sans")}</SelectItem>
                                <SelectItem value="serif">{t("printing.font_serif")}</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription className="text-xs">
                              {t("printing.font_family_desc")}
                            </FormDescription>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={receiptForm.control}
                        name="receiptFontSize"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>{t("printing.font_size")}</FormLabel>
                              <span className="text-sm text-muted-foreground">{field.value}pt</span>
                            </div>
                            <FormControl>
                              <input
                                type="range"
                                min={8}
                                max={16}
                                step={1}
                                value={field.value}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                                data-testid="slider-receipt-font-size"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              {t("printing.font_size_desc")}
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                      <h3 className="text-sm font-medium">{t("printing.display_options")}</h3>
                      
                      <FormField
                        control={receiptForm.control}
                        name="receiptShowLogo"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel>{t("printing.show_logo")}</FormLabel>
                              <FormDescription className="text-xs">
                                {t("printing.show_logo_desc")}
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
                              <FormLabel>{t("printing.show_address")}</FormLabel>
                              <FormDescription className="text-xs">
                                {t("printing.show_address_desc")}
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
                              <FormLabel>{t("printing.show_phone")}</FormLabel>
                              <FormDescription className="text-xs">
                                {t("printing.show_phone_desc")}
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

                    </div>

                    <div className="space-y-4">
                      <h3 className="text-sm font-medium">{t("printing.custom_text")}</h3>
                      
                      <FormField
                        control={receiptForm.control}
                        name="receiptHeaderText"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("printing.header_message")}</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                placeholder={t("printing.header_placeholder")}
                                rows={3}
                                data-testid="input-receipt-header"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              {t("printing.header_desc")}
                            </FormDescription>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={receiptForm.control}
                        name="receiptFooterText"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("printing.footer_message")}</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                placeholder={t("printing.footer_placeholder")}
                                rows={3}
                                data-testid="input-receipt-footer"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              {t("printing.footer_desc")}
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Coupon Settings */}
                  <div className="space-y-4 pt-4 border-t">
                    <h3 className="text-sm font-medium">{t("printing.coupon_settings")}</h3>
                    
                    <FormField
                      control={receiptForm.control}
                      name="couponEnabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>{t("printing.enable_coupon")}</FormLabel>
                            <FormDescription className="text-xs">
                              {t("printing.enable_coupon_desc")}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-coupon-enabled"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {receiptForm.watch("couponEnabled") && (
                      <FormField
                        control={receiptForm.control}
                        name="couponText"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("printing.coupon_text")}</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                placeholder={t("printing.coupon_placeholder")}
                                rows={4}
                                data-testid="input-coupon-text"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              {t("printing.coupon_desc")}
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    )}
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
                      {t("printing.save_settings")}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Receipt Preview */}
          <Card>
            <CardHeader>
              <CardTitle>{t("printing.preview_title")}</CardTitle>
              <CardDescription>{t("printing.preview_desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center">
                <div 
                  className="bg-white text-black p-4 shadow-lg border rounded-sm"
                  style={{ 
                    width: '280px',
                    fontFamily: receiptForm.watch("receiptFontFamily") || "monospace",
                    fontSize: `${receiptForm.watch("receiptFontSize") || 12}px`
                  }}
                  data-testid="receipt-preview"
                >
                  {/* Logo */}
                  {receiptForm.watch("receiptShowLogo") && receiptLogoPath && (
                    <div className="flex justify-center mb-3">
                      <img 
                        src={receiptLogoPath.startsWith('/objects') ? receiptLogoPath : `/objects${receiptLogoPath}`} 
                        alt="Logo"
                        style={{ width: `${Math.min(receiptForm.watch("receiptLogoSize") || 200, 250)}px`, maxHeight: '80px', objectFit: 'contain' }}
                      />
                    </div>
                  )}
                  
                  {/* Business Name */}
                  <div className="text-center font-bold mb-1" style={{ fontSize: '1.1em' }}>
                    {tenant?.name || "Business Name"}
                  </div>
                  
                  {/* Address */}
                  {receiptForm.watch("receiptShowAddress") && (
                    <div className="text-center mb-1" style={{ fontSize: '0.85em' }}>
                      {tenant?.address || "123 Main Street, City"}
                    </div>
                  )}
                  
                  {/* Phone */}
                  {receiptForm.watch("receiptShowPhone") && (
                    <div className="text-center mb-2" style={{ fontSize: '0.85em' }}>
                      {tenant?.phone || "(555) 123-4567"}
                    </div>
                  )}
                  
                  {/* Tax ID */}
                  {tenant?.receiptTaxId && (
                    <div className="text-center mb-2" style={{ fontSize: '0.85em' }}>
                      {t("pos.tax_id")}: {tenant.receiptTaxId}
                    </div>
                  )}
                  
                  {/* Header Text */}
                  {receiptForm.watch("receiptHeaderText") && (
                    <div className="text-center mb-2 italic" style={{ fontSize: '0.85em' }}>
                      {receiptForm.watch("receiptHeaderText")}
                    </div>
                  )}
                  
                  <div className="border-t border-dashed border-gray-400 my-2" />
                  
                  {/* Order Info */}
                  <div className="flex justify-between mb-2" style={{ fontSize: '0.85em' }}>
                    <span>{t("pos.order")} #1234</span>
                    <span>{formatDate(new Date())}</span>
                  </div>
                  
                  <div className="border-t border-dashed border-gray-400 my-2" />
                  
                  {/* Sample Items */}
                  <div className="space-y-1" style={{ fontSize: '0.85em' }}>
                    <div className="flex justify-between">
                      <span>2x {t("printing.sample_item")} 1</span>
                      <span>$10.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span>1x {t("printing.sample_item")} 2</span>
                      <span>$15.00</span>
                    </div>
                  </div>
                  
                  <div className="border-t border-dashed border-gray-400 my-2" />
                  
                  {/* Totals */}
                  <div className="space-y-1" style={{ fontSize: '0.85em' }}>
                    <div className="flex justify-between">
                      <span>{t("pos.subtotal")}</span>
                      <span>$25.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t("pos.tax")} ({tenant?.taxRate || 0}%)</span>
                      <span>$2.50</span>
                    </div>
                    <div className="flex justify-between font-bold" style={{ fontSize: '1.1em' }}>
                      <span>{t("pos.total")}</span>
                      <span>$27.50</span>
                    </div>
                  </div>
                  
                  <div className="border-t border-dashed border-gray-400 my-2" />
                  
                  {/* Payment */}
                  <div style={{ fontSize: '0.85em' }}>
                    <div className="flex justify-between">
                      <span>{t("pos.payment_cash")}</span>
                      <span>$30.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t("pos.change")}</span>
                      <span>$2.50</span>
                    </div>
                  </div>
                  
                  {/* Footer Text */}
                  {receiptForm.watch("receiptFooterText") && (
                    <>
                      <div className="border-t border-dashed border-gray-400 my-2" />
                      <div className="text-center italic" style={{ fontSize: '0.85em' }}>
                        {receiptForm.watch("receiptFooterText")}
                      </div>
                    </>
                  )}
                  
                  <div className="border-t border-dashed border-gray-400 my-2" />
                  <div className="text-center" style={{ fontSize: '0.85em' }}>
                    {t("printing.thank_you")}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("printing.instructions")}</CardTitle>
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

              <PrintBridgeSettings />
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
              <div className="grid grid-cols-2 gap-4">
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
                <FormField
                  control={productForm.control}
                  name="cost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("products.cost")}</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" placeholder={t("products.cost_placeholder")} data-testid="input-product-cost" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
                    <FormLabel>{t("form.product_image")}</FormLabel>
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
                    <FormLabel>{t("form.name")}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t("settings.floor_placeholder")} data-testid="input-floor-name" />
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
            <DialogTitle>{editingItem ? t("settings.edit_table") : t("settings.add_table")}</DialogTitle>
          </DialogHeader>
          <Form {...tableForm}>
            <form onSubmit={tableForm.handleSubmit((data) => tableMutation.mutate(data))} className="space-y-4">
              <FormField
                control={tableForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.name")}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t("settings.table_placeholder")} data-testid="input-table-name" />
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
                    <FormLabel>{t("form.floor")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-table-floor">
                          <SelectValue placeholder={t("settings.select_floor")} />
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
                    <FormLabel>{t("form.capacity")}</FormLabel>
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
            <DialogTitle>{editingUser ? t("settings.edit_user") : t("settings.add_user")}</DialogTitle>
          </DialogHeader>
          <Form {...userForm}>
            <form onSubmit={userForm.handleSubmit((data) => userMutation.mutate(data))} className="space-y-4">
              <FormField
                control={userForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.full_name")}</FormLabel>
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
                      <FormLabel>{t("form.email")}</FormLabel>
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
                      <FormLabel>{t("form.phone")}</FormLabel>
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
                      <FormLabel>{t("form.username")}</FormLabel>
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
                      <FormLabel>{editingUser ? t("settings.new_password") : t("settings.password")}</FormLabel>
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
                      <FormLabel>{t("form.role")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-user-role">
                            <SelectValue placeholder={t("settings.select_role")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="admin">{t("form.role_admin")}</SelectItem>
                          <SelectItem value="manager">{t("form.role_manager")}</SelectItem>
                          <SelectItem value="cashier">{t("form.role_cashier")}</SelectItem>
                          <SelectItem value="kitchen">{t("form.role_kitchen")}</SelectItem>
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
