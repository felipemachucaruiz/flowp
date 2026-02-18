import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
  Mail,
  FileDigit,
  Puzzle,
  ShoppingBag,
  MessageSquare,
  Landmark,
  AlertTriangle,
  SlidersHorizontal,
  CreditCard,
  Crown,
  Building2,
  Monitor,
  Warehouse,
  UtensilsCrossed,
  CookingPot,
  AlertCircle,
} from "lucide-react";
import { useUpload } from "@/hooks/use-upload";
import { printBridge, type PrintBridgeStatus, type PrinterInfo } from "@/lib/print-bridge";
import { Wifi, WifiOff, Download, ChevronDown, DoorOpen, RefreshCw, Smartphone, Bell, Gift } from "lucide-react";
import { CouponEditor, renderCouponContent } from "@/components/coupon-editor";
import { EmailTemplateEditor } from "@/components/email-template-editor";
import { ShopifySettings } from "@/components/shopify-settings";
import { WhatsAppSettings } from "@/components/whatsapp-settings";
import { useSubscription } from "@/lib/use-subscription";
import { UpgradeBanner } from "@/components/upgrade-banner";
import { formatCurrency } from "@/lib/currency";
import { useLocation } from "wouter";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const businessSettingsSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  currency: z.string().min(1, "Currency is required"),
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
  role: z.enum(["owner", "admin", "manager", "cashier", "kitchen", "inventory"]),
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

const ebillingSchema = z.object({
  autoSubmitSales: z.boolean().default(true),
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

function CsvImportSection() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { tenant } = useAuth();
  const queryClient = useQueryClient();
  const [categoriesFile, setCategoriesFile] = useState<File | null>(null);
  const [productsFile, setProductsFile] = useState<File | null>(null);
  const [stockFile, setStockFile] = useState<File | null>(null);
  const [isImportingCategories, setIsImportingCategories] = useState(false);
  const [isImportingProducts, setIsImportingProducts] = useState(false);
  const [isImportingStock, setIsImportingStock] = useState(false);

  const parseCSV = (text: string): Record<string, string>[] => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((header, i) => {
        row[header] = values[i] || '';
      });
      return row;
    });
  };

  const handleCategoriesImport = async () => {
    if (!categoriesFile || !tenant) return;
    setIsImportingCategories(true);
    try {
      const text = await categoriesFile.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast({ title: t("inventory.csv_no_data"), variant: "destructive" });
        return;
      }
      const response = await fetch('/api/categories/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenant.id },
        body: JSON.stringify({ categories: rows.map(r => ({ name: r.name, color: r.color })) }),
      });
      const result = await response.json();
      if (response.ok) {
        toast({ title: t("inventory.csv_import_complete"), description: t("inventory.csv_import_result_categories").replace("{success}", result.success).replace("{failed}", result.failed) });
        queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
        setCategoriesFile(null);
      } else {
        toast({ title: t("inventory.csv_import_error"), variant: "destructive" });
      }
    } catch {
      toast({ title: t("inventory.csv_import_error"), variant: "destructive" });
    } finally {
      setIsImportingCategories(false);
    }
  };

  const handleProductsImport = async () => {
    if (!productsFile || !tenant) return;
    setIsImportingProducts(true);
    try {
      const text = await productsFile.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast({ title: t("inventory.csv_no_data"), variant: "destructive" });
        return;
      }
      const products = rows.map(r => ({
        name: r.name,
        sku: r.sku,
        barcode: r.barcode,
        price: parseFloat(r.price) || 0,
        cost: r.cost ? parseFloat(r.cost) : null,
        categoryName: r.categoryName,
        description: r.description,
        trackInventory: r.trackInventory?.toLowerCase() !== 'false',
      }));
      const response = await fetch('/api/products/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenant.id },
        body: JSON.stringify({ products }),
      });
      const result = await response.json();
      if (response.ok) {
        toast({ title: t("inventory.csv_import_complete"), description: t("inventory.csv_import_result").replace("{success}", result.success).replace("{failed}", result.failed) });
        queryClient.invalidateQueries({ queryKey: ['/api/products'] });
        setProductsFile(null);
      } else {
        toast({ title: t("inventory.csv_import_error"), variant: "destructive" });
      }
    } catch {
      toast({ title: t("inventory.csv_import_error"), variant: "destructive" });
    } finally {
      setIsImportingProducts(false);
    }
  };

  const handleStockImport = async () => {
    if (!stockFile || !tenant) return;
    setIsImportingStock(true);
    try {
      const text = await stockFile.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast({ title: t("inventory.csv_no_data"), variant: "destructive" });
        return;
      }
      const stockData = rows.map(r => ({
        sku: r.sku,
        barcode: r.barcode,
        quantity: parseInt(r.quantity) || 0,
        notes: r.notes || t("settings.import_stock_note"),
      }));
      const response = await fetch('/api/inventory/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenant.id },
        body: JSON.stringify({ stock: stockData }),
      });
      const result = await response.json();
      if (response.ok) {
        toast({ title: t("inventory.csv_import_complete"), description: t("settings.import_stock_result").replace("{success}", result.success).replace("{failed}", result.failed) });
        queryClient.invalidateQueries({ queryKey: ['/api/inventory/levels'] });
        setStockFile(null);
      } else {
        toast({ title: t("inventory.csv_import_error"), variant: "destructive" });
      }
    } catch {
      toast({ title: t("inventory.csv_import_error"), variant: "destructive" });
    } finally {
      setIsImportingStock(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.import_categories")}</CardTitle>
          <CardDescription>{t("settings.import_categories_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild data-testid="button-download-categories-template">
              <a href="/api/csv/template/categories" download>
                <Download className="w-4 h-4 mr-2" />
                {t("inventory.download_template")}
              </a>
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="file"
              accept=".csv"
              onChange={(e) => setCategoriesFile(e.target.files?.[0] || null)}
              className="flex-1"
              data-testid="input-categories-csv"
            />
            <Button
              onClick={handleCategoriesImport}
              disabled={!categoriesFile || isImportingCategories}
              data-testid="button-import-categories"
            >
              {isImportingCategories ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              {t("inventory.import_csv")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.import_products")}</CardTitle>
          <CardDescription>{t("settings.import_products_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild data-testid="button-download-products-template">
              <a href="/api/csv/template/products" download>
                <Download className="w-4 h-4 mr-2" />
                {t("inventory.download_template")}
              </a>
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="file"
              accept=".csv"
              onChange={(e) => setProductsFile(e.target.files?.[0] || null)}
              className="flex-1"
              data-testid="input-products-csv"
            />
            <Button
              onClick={handleProductsImport}
              disabled={!productsFile || isImportingProducts}
              data-testid="button-import-products"
            >
              {isImportingProducts ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              {t("inventory.import_csv")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.import_stock")}</CardTitle>
          <CardDescription>{t("settings.import_stock_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild data-testid="button-download-stock-template">
              <a href="/api/csv/template/stock" download>
                <Download className="w-4 h-4 mr-2" />
                {t("inventory.download_template")}
              </a>
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="file"
              accept=".csv"
              onChange={(e) => setStockFile(e.target.files?.[0] || null)}
              className="flex-1"
              data-testid="input-stock-csv"
            />
            <Button
              onClick={handleStockImport}
              disabled={!stockFile || isImportingStock}
              data-testid="button-import-stock"
            >
              {isImportingStock ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              {t("inventory.import_csv")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PrintBridgeSettings() {
  const { t, language } = useI18n();
  const localeCode = language === "es" ? "es-ES" : language === "pt" ? "pt-BR" : "en-US";
  const { toast } = useToast();
  const { tenant, refreshTenant } = useAuth();
  const [bridgeStatus, setBridgeStatus] = useState<PrintBridgeStatus | null>(null);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [selectedBarcodePrinter, setSelectedBarcodePrinter] = useState<string>('');
  const [openCashDrawer, setOpenCashDrawer] = useState(tenant?.openCashDrawer ?? false);
  const [isTestingDrawer, setIsTestingDrawer] = useState(false);
  const isElectron = printBridge.isElectronApp();

  const updateCashDrawerSetting = async (enabled: boolean) => {
    setOpenCashDrawer(enabled);
    try {
      await apiRequest("PATCH", "/api/settings", { openCashDrawer: enabled });
      if (refreshTenant) refreshTenant();
      toast({
        title: enabled ? t("printing.cash_drawer_opened") : t("common.saved"),
      });
    } catch {
      toast({
        title: t("common.error"),
        variant: "destructive",
      });
    }
  };

  const testCashDrawer = async () => {
    setIsTestingDrawer(true);
    try {
      const result = await printBridge.openCashDrawer();
      if (result.success) {
        toast({
          title: t("printing.cash_drawer_opened"),
        });
      } else {
        toast({
          title: t("printing.cash_drawer_error"),
          description: result.error,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: t("printing.cash_drawer_error"),
        variant: "destructive",
      });
    }
    setIsTestingDrawer(false);
  };

  const checkBridgeStatus = async () => {
    setIsChecking(true);
    try {
      printBridge.clearCache();
      const status = await printBridge.checkStatus();
      setBridgeStatus(status);
      
      if (status.isAvailable) {
        const detectedPrinters = await printBridge.getPrinters();
        if (detectedPrinters.length > 0) {
          setPrinters(detectedPrinters);
          setIsAuthenticated(true);
          if (isElectron) {
            const savedPrinter = localStorage.getItem('flowp_electron_printer');
            const savedBarcode = localStorage.getItem('flowp_electron_barcode_printer');
            if (savedPrinter) {
              setSelectedPrinter(savedPrinter);
            }
            if (savedBarcode) {
              setSelectedBarcodePrinter(savedBarcode);
            }
          } else {
            const configuredPrinter = status.printerConfig?.printerName || '';
            setSelectedPrinter(configuredPrinter);
          }
        } else {
          setPrinters([]);
          setIsAuthenticated(false);
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

  const handlePrinterSelect = async (printerName: string) => {
    setSelectedPrinter(printerName);
    const success = await printBridge.configurePrinter({ 
      type: 'windows', 
      printerName 
    });
    if (success) {
      toast({
        title: t("printing.printer_configured"),
        description: printerName,
      });
      printBridge.clearCache();
    } else {
      toast({
        title: t("printing.printer_config_error"),
        description: t("printing.check_bridge_running"),
        variant: "destructive",
      });
      setSelectedPrinter('');
      // Update status to reflect bridge is not available
      setBridgeStatus({ isAvailable: false });
      setIsAuthenticated(false);
      setPrinters([]);
    }
  };

  useEffect(() => {
    if (isElectron) {
      const savedPrinter = localStorage.getItem('flowp_electron_printer');
      if (savedPrinter) setSelectedPrinter(savedPrinter);
      const savedBarcode = localStorage.getItem('flowp_electron_barcode_printer');
      if (savedBarcode) setSelectedBarcodePrinter(savedBarcode);
    }
    checkBridgeStatus();
    const interval = setInterval(checkBridgeStatus, 30000);
    return () => clearInterval(interval);
  }, [isElectron]);

  const isConnected = bridgeStatus?.isAvailable && isAuthenticated;

  // Electron Desktop App UI - clean native printer selection
  if (isElectron) {
    return (
      <div className="mt-6 space-y-6">
        {/* Printer for Receipts */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("printing.receipt_printer")}</Label>
          <p className="text-xs text-muted-foreground">{t("printing.receipt_printer_desc")}</p>
          {printers.length > 0 ? (
            <Select
              value={selectedPrinter}
              onValueChange={(value) => {
                setSelectedPrinter(value);
                localStorage.setItem('flowp_electron_printer', value);
                toast({
                  title: t("printing.printer_configured"),
                  description: value,
                });
              }}
            >
              <SelectTrigger className="w-full" data-testid="select-receipt-printer-electron">
                <SelectValue placeholder={t("printing.select_printer_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {printers.map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground italic">{t("printing.no_printers")}</p>
          )}
        </div>

        {/* Printer for Labels */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("printing.barcode_printer")}</Label>
          <p className="text-xs text-muted-foreground">{t("printing.barcode_printer_desc")}</p>
          {printers.length > 0 ? (
            <Select
              value={selectedBarcodePrinter || '__same__'}
              onValueChange={(value) => {
                const actual = value === '__same__' ? '' : value;
                setSelectedBarcodePrinter(actual);
                if (actual) {
                  localStorage.setItem('flowp_electron_barcode_printer', actual);
                } else {
                  localStorage.removeItem('flowp_electron_barcode_printer');
                }
                toast({
                  title: t("printing.printer_configured"),
                  description: actual || t("printing.same_printer"),
                });
              }}
            >
              <SelectTrigger className="w-full" data-testid="select-barcode-printer-electron">
                <SelectValue placeholder={t("printing.select_printer_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__same__">{t("printing.same_printer")}</SelectItem>
                {printers.map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground italic">{t("printing.no_printers")}</p>
          )}
        </div>

        {/* Cash Drawer */}
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">{t("printing.cash_drawer")}</Label>
              <p className="text-xs text-muted-foreground">{t("printing.open_cash_drawer_desc")}</p>
            </div>
            <Switch
              checked={openCashDrawer}
              onCheckedChange={updateCashDrawerSetting}
              data-testid="switch-cash-drawer-electron"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={testCashDrawer}
            disabled={isTestingDrawer || !selectedPrinter}
            data-testid="button-test-cash-drawer-electron"
          >
            {isTestingDrawer ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <DoorOpen className="w-4 h-4 mr-2" />
            )}
            {t("printing.test_cash_drawer")}
          </Button>
        </div>

        {/* Refresh Printers */}
        <Button
          variant="ghost"
          size="sm"
          onClick={checkBridgeStatus}
          disabled={isChecking}
          data-testid="button-refresh-printers"
        >
          {isChecking ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {t("printing.refresh_printers")}
        </Button>
      </div>
    );
  }

  // Regular Browser UI - show PrintBridge connection
  return (
    <div className="mt-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <div className="w-2 h-2 rounded-full bg-green-500" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-muted-foreground" />
          )}
          <span className="font-medium">{t("printing.bridge_title")}</span>
        </div>
        <Badge variant={isConnected ? "default" : "secondary"}>
          {isConnected ? t("printing.bridge_connected") : t("printing.bridge_disconnected")}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        {t("printing.bridge_instructions")}
      </p>

      {isConnected ? (
        /* Connected State */
        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 space-y-3">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <Check className="w-5 h-5" />
            <span className="font-medium">{t("printing.direct_print_desc")}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">{t("printing.bridge_version")}</span> {bridgeStatus?.version}
          </div>
          {printers.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("printing.select_printer")}</Label>
              <Select
                value={selectedPrinter}
                onValueChange={handlePrinterSelect}
              >
                <SelectTrigger className="w-full" data-testid="select-printer">
                  <SelectValue placeholder={t("printing.select_printer_placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {printers.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {/* Cash Drawer Settings */}
          <div className="border-t pt-3 mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">{t("printing.open_cash_drawer")}</Label>
                <p className="text-xs text-muted-foreground">{t("printing.open_cash_drawer_desc")}</p>
              </div>
              <Switch
                checked={openCashDrawer}
                onCheckedChange={updateCashDrawerSetting}
                data-testid="switch-cash-drawer"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={testCashDrawer}
              disabled={isTestingDrawer}
              data-testid="button-test-cash-drawer"
            >
              {isTestingDrawer ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <DoorOpen className="w-4 h-4 mr-2" />
              )}
              {t("printing.test_cash_drawer")}
            </Button>
          </div>
        </div>
      ) : (
        /* Not Connected State - Simple message */
        <div className="p-4 rounded-lg bg-muted/50 border text-center">
          <p className="text-sm text-muted-foreground">
            {t("printing.bridge_not_running")}
          </p>
        </div>
      )}

      {/* Advanced Section (Collapsible) */}
      <div className="border-t pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-toggle-advanced-bridge"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          {t("printing.bridge_advanced_options")}
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4">
            {/* Check Status */}
            <Button
              variant="ghost"
              size="sm"
              onClick={checkBridgeStatus}
              disabled={isChecking}
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
        )}
      </div>
    </div>
  );
}

// Official DIAN Tax Types
const DIAN_TAX_TYPES = [
  { id: 1, code: "01", name: "IVA", description: "Impuesto al Valor Agregado", defaultRates: ["19", "5", "0"] },
  { id: 2, code: "03", name: "Consumo", description: "Impuesto al Consumo", defaultRates: ["8", "4", "0"] },
  { id: 3, code: "04", name: "Timbre", description: "Impuesto de Timbre", defaultRates: ["0"] },
  { id: 4, code: "08", name: "Bolsa", description: "Impuesto a Bolsas Plásticas", defaultRates: ["8"] },
  { id: 5, code: "07", name: "Bebidas", description: "Impuesto a Bebidas Azucaradas", defaultRates: ["8"] },
];

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
  const [selectedTaxType, setSelectedTaxType] = useState("");
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [isActive, setIsActive] = useState(true);

  const handleTaxTypeChange = (value: string) => {
    setSelectedTaxType(value);
    if (value === "custom") {
      setName("");
      setRate("");
    } else {
      const taxType = DIAN_TAX_TYPES.find(t => t.code === value);
      if (taxType) {
        setName(`${taxType.name} - ${taxType.description}`);
        setRate(taxType.defaultRates[0]);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && rate.trim()) {
      onSave({ name: name.trim(), rate, isActive });
    }
  };

  const selectedType = DIAN_TAX_TYPES.find(t => t.code === selectedTaxType);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">{t("taxes.type") || "Tipo de Impuesto DIAN"}</label>
        <Select value={selectedTaxType} onValueChange={handleTaxTypeChange}>
          <SelectTrigger data-testid="select-tax-type">
            <SelectValue placeholder={t("taxes.select_type") || "Seleccionar tipo de impuesto..."} />
          </SelectTrigger>
          <SelectContent>
            {DIAN_TAX_TYPES.map((taxType) => (
              <SelectItem key={taxType.code} value={taxType.code}>
                {taxType.code} - {taxType.name} ({taxType.description})
              </SelectItem>
            ))}
            <SelectItem value="custom">{t("taxes.custom") || "Personalizado"}</SelectItem>
          </SelectContent>
        </Select>
      </div>
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
          {selectedType && selectedType.defaultRates.length > 1 ? (
            <Select value={rate} onValueChange={setRate}>
              <SelectTrigger data-testid="select-tax-rate">
                <SelectValue placeholder={t("taxes.rate_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {selectedType.defaultRates.map((r) => (
                  <SelectItem key={r} value={r}>{r}%</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder={t("taxes.rate_placeholder")}
              data-testid="input-tax-rate"
            />
          )}
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
            onFocus={(e) => e.target.select()}
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

function EmailNotificationPreferences() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { user, tenant } = useAuth();
  const [saving, setSaving] = useState(false);

  const defaultPrefs = {
    lowStockAlerts: true,
    expiringProductAlerts: true,
    newSaleNotification: false,
    dailySalesReport: false,
    weeklyReport: false,
    newCustomerNotification: false,
    orderNotifications: true,
    refundAlerts: true,
    highValueSaleAlerts: false,
    systemAlerts: true,
  };

  const preferences = (user?.emailPreferences as typeof defaultPrefs) || defaultPrefs;

  const [prefs, setPrefs] = useState(preferences);

  useEffect(() => {
    if (user?.emailPreferences) {
      setPrefs(user.emailPreferences as typeof defaultPrefs);
    }
  }, [user?.emailPreferences]);

  const handleToggle = async (key: keyof typeof defaultPrefs, value: boolean) => {
    const newPrefs = { ...prefs, [key]: value };
    setPrefs(newPrefs);
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user?.id}/email-preferences`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'x-tenant-id': tenant?.id || ''
        },
        body: JSON.stringify(newPrefs)
      });
      if (!res.ok) throw new Error('Failed to update preferences');
      const updatedUser = { ...user, emailPreferences: newPrefs };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      toast({ title: t("common.saved") || "Saved" });
    } catch (err) {
      setPrefs(prefs);
      toast({ title: t("common.error") || "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const notificationTypes = [
    { key: 'newSaleNotification' as const, label: t("email.pref_new_sale") || "New Sale Notifications", description: t("email.pref_new_sale_desc") || "Get notified immediately when a sale is made", category: "sales", active: true },
    { key: 'lowStockAlerts' as const, label: t("email.pref_low_stock") || "Low Stock Alerts", description: t("email.pref_low_stock_desc") || "Get notified when inventory drops below threshold", category: "inventory", active: true },
    { key: 'orderNotifications' as const, label: t("email.pref_orders") || "Customer Order Emails", description: t("email.pref_orders_desc") || "Send order confirmations to customers", category: "customers", active: true },
    { key: 'systemAlerts' as const, label: t("email.pref_system") || "System Alerts", description: t("email.pref_system_desc") || "Important system notifications and updates", category: "system", active: true },
    { key: 'dailySalesReport' as const, label: t("email.pref_daily_report") || "Daily Sales Report", description: t("email.pref_daily_report_desc") || "Receive a daily summary of sales", category: "reports", active: false },
    { key: 'weeklyReport' as const, label: t("email.pref_weekly_report") || "Weekly Report", description: t("email.pref_weekly_report_desc") || "Receive a weekly summary report", category: "reports", active: false },
    { key: 'highValueSaleAlerts' as const, label: t("email.pref_high_value") || "High Value Sale Alerts", description: t("email.pref_high_value_desc") || "Get notified for sales above a certain amount", category: "sales", active: false },
    { key: 'expiringProductAlerts' as const, label: t("email.pref_expiring") || "Expiring Product Alerts", description: t("email.pref_expiring_desc") || "Get notified when products are about to expire", category: "inventory", active: false },
    { key: 'newCustomerNotification' as const, label: t("email.pref_new_customer") || "New Customer Notifications", description: t("email.pref_new_customer_desc") || "Get notified when a new customer registers", category: "customers", active: false },
    { key: 'refundAlerts' as const, label: t("email.pref_refund") || "Refund Alerts", description: t("email.pref_refund_desc") || "Get notified when refunds are processed", category: "financial", active: false },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5" />
          {t("email.notifications") || "Email Notifications"}
        </CardTitle>
        <CardDescription>
          {t("email.notifications_desc") || "Control which email notifications you receive"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notificationTypes.map((item) => (
          <div key={item.key} className={`flex items-center justify-between py-2 border-b last:border-0 ${!item.active ? 'opacity-60' : ''}`}>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">{item.label}</Label>
                {!item.active && (
                  <Badge variant="secondary" className="text-xs">{t("common.coming_soon") || "Coming Soon"}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <Switch
              checked={item.active ? prefs[item.key] : false}
              onCheckedChange={(value) => handleToggle(item.key, value)}
              disabled={saving || !item.active}
              data-testid={`switch-email-${item.key}`}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function WarehouseSettings() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { tenant } = useAuth();
  const { canCreate: canCreateWh, usage: whUsage, limits: whLimits } = useSubscription();

  const [showDialog, setShowDialog] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<{ id: string; name: string; isDefault: boolean } | null>(null);
  const [warehouseName, setWarehouseName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: warehousesData, isLoading } = useQuery<any[]>({
    queryKey: ["/api/warehouses"],
    enabled: !!tenant?.id,
  });

  const warehouses = warehousesData || [];

  const createMutation = useMutation({
    mutationFn: async (name: string) => apiRequest("POST", "/api/warehouses", { name }),
    onSuccess: () => {
      toast({ title: t("warehouses.created") });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/my-plan"] });
      setShowDialog(false);
      setWarehouseName("");
    },
    onError: (error: any) => {
      if (error.message?.includes("warehouse_limit_reached")) {
        toast({ title: t("warehouses.limit_reached"), variant: "destructive" });
      } else {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => apiRequest("PATCH", `/api/warehouses/${id}`, { name }),
    onSuccess: () => {
      toast({ title: t("warehouses.updated") });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      setShowDialog(false);
      setEditingWarehouse(null);
      setWarehouseName("");
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("PATCH", `/api/warehouses/${id}`, { isDefault: true }),
    onSuccess: () => {
      toast({ title: t("warehouses.updated") });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/warehouses/${id}`),
    onSuccess: () => {
      toast({ title: t("warehouses.deleted") });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/my-plan"] });
      setConfirmDeleteId(null);
    },
    onError: (error: any) => {
      if (error.message?.includes("Cannot delete default")) {
        toast({ title: t("warehouses.cannot_delete_default"), variant: "destructive" });
      } else {
        toast({ title: t("common.error"), variant: "destructive" });
      }
    },
  });

  const openCreateDialog = () => {
    setEditingWarehouse(null);
    setWarehouseName("");
    setShowDialog(true);
  };

  const openEditDialog = (wh: { id: string; name: string; isDefault: boolean }) => {
    setEditingWarehouse(wh);
    setWarehouseName(wh.name);
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!warehouseName.trim()) return;
    if (editingWarehouse) {
      updateMutation.mutate({ id: editingWarehouse.id, name: warehouseName.trim() });
    } else {
      createMutation.mutate(warehouseName.trim());
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {t("warehouses.title")}
            </CardTitle>
            <CardDescription>{t("warehouses.subtitle")}</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" data-testid="badge-warehouse-count">
              {warehouses.length} / {whLimits.maxWarehouses === -1 ? "∞" : whLimits.maxWarehouses}
            </Badge>
            <Button
              onClick={openCreateDialog}
              disabled={!canCreateWh("warehouses")}
              data-testid="button-add-warehouse"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("warehouses.add")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!canCreateWh("warehouses") && (
            <div className="mb-4">
              <UpgradeBanner
                type="limit"
                resourceName={t("warehouses.title")}
                current={whUsage.warehouses}
                max={whLimits.maxWarehouses}
                compact
              />
            </div>
          )}
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : warehouses.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground">{t("warehouses.no_warehouses")}</p>
              <p className="text-sm text-muted-foreground">{t("warehouses.no_warehouses_desc")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {warehouses.map((wh: any) => (
                <div
                  key={wh.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                  data-testid={`card-warehouse-${wh.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <span className="font-medium">{wh.name}</span>
                      {wh.isDefault && (
                        <Badge variant="secondary" className="ml-2 text-xs">{t("warehouses.default_badge")}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {!wh.isDefault && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDefaultMutation.mutate(wh.id)}
                        disabled={setDefaultMutation.isPending}
                        data-testid={`button-set-default-warehouse-${wh.id}`}
                      >
                        {t("warehouses.set_default")}
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEditDialog(wh)}
                      data-testid={`button-edit-warehouse-${wh.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {!wh.isDefault && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setConfirmDeleteId(wh.id)}
                        data-testid={`button-delete-warehouse-${wh.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingWarehouse ? t("warehouses.edit") : t("warehouses.add")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("warehouses.name")}</Label>
              <Input
                value={warehouseName}
                onChange={(e) => setWarehouseName(e.target.value)}
                placeholder={t("warehouses.name_placeholder")}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                data-testid="input-warehouse-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={isPending || !warehouseName.trim()} data-testid="button-save-warehouse">
              {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.confirm")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("warehouses.delete_confirm")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>{t("common.cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteId && deleteMutation.mutate(confirmDeleteId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-warehouse"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RegistersSettings() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { tenant } = useAuth();
  const { canCreate: canCreateSub, usage: subUsage, limits: subLimits } = useSubscription();

  const [showDialog, setShowDialog] = useState(false);
  const [editingRegister, setEditingRegister] = useState<{ id: string; name: string; warehouseId?: string | null } | null>(null);
  const [registerName, setRegisterName] = useState("");
  const [registerWarehouseId, setRegisterWarehouseId] = useState<string>("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: registersData, isLoading } = useQuery<{ registers: any[]; maxRegisters: number; count: number }>({
    queryKey: ["/api/registers"],
    enabled: !!tenant?.id,
  });

  const { data: warehouses } = useQuery<any[]>({
    queryKey: ["/api/warehouses"],
    enabled: !!tenant?.id,
  });

  const registers = registersData?.registers || [];
  const maxRegisters = registersData?.maxRegisters || 2;
  const count = registersData?.count || 0;

  const createMutation = useMutation({
    mutationFn: async ({ name, warehouseId }: { name: string; warehouseId?: string }) => apiRequest("POST", "/api/registers", { name, warehouseId: warehouseId || null }),
    onSuccess: () => {
      toast({ title: t("settings.register_created") });
      queryClient.invalidateQueries({ queryKey: ["/api/registers"] });
      setShowDialog(false);
      setRegisterName("");
      setRegisterWarehouseId("");
    },
    onError: (error: any) => {
      if (error.message?.includes("register_limit_reached")) {
        toast({ title: t("settings.register_limit_reached"), variant: "destructive" });
      } else {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, warehouseId }: { id: string; name: string; warehouseId?: string }) => apiRequest("PUT", `/api/registers/${id}`, { name, warehouseId: warehouseId || null }),
    onSuccess: () => {
      toast({ title: t("settings.register_updated") });
      queryClient.invalidateQueries({ queryKey: ["/api/registers"] });
      setShowDialog(false);
      setEditingRegister(null);
      setRegisterName("");
      setRegisterWarehouseId("");
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/registers/${id}`),
    onSuccess: () => {
      toast({ title: t("settings.register_deleted") });
      queryClient.invalidateQueries({ queryKey: ["/api/registers"] });
      setConfirmDeleteId(null);
    },
    onError: (error: any) => {
      toast({ title: t("settings.cannot_delete_active"), variant: "destructive" });
    },
  });

  const openCreateDialog = () => {
    setEditingRegister(null);
    setRegisterName("");
    setRegisterWarehouseId("");
    setShowDialog(true);
  };

  const openEditDialog = (reg: { id: string; name: string; warehouseId?: string | null }) => {
    setEditingRegister(reg);
    setRegisterName(reg.name);
    setRegisterWarehouseId(reg.warehouseId || "");
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!registerName.trim()) return;
    if (editingRegister) {
      updateMutation.mutate({ id: editingRegister.id, name: registerName.trim(), warehouseId: registerWarehouseId || undefined });
    } else {
      createMutation.mutate({ name: registerName.trim(), warehouseId: registerWarehouseId || undefined });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="w-5 h-5" />
              {t("settings.registers")}
            </CardTitle>
            <CardDescription>{t("settings.registers_description")}</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" data-testid="badge-register-count">
              {count} / {maxRegisters} {t("settings.registers_used")}
            </Badge>
            <Button
              onClick={openCreateDialog}
              disabled={count >= maxRegisters}
              data-testid="button-add-register"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("settings.add_register")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!canCreateSub("registers") && (
            <div className="mb-4">
              <UpgradeBanner
                type="limit"
                resourceName={t("settings.registers")}
                current={subUsage.registers}
                max={subLimits.maxRegisters}
                compact
              />
            </div>
          )}
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : registers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t("settings.no_registers")}</p>
          ) : (
            <div className="space-y-2">
              {registers.map((reg: any) => {
                const wh = warehouses?.find((w: any) => w.id === reg.warehouseId);
                return (
                <div
                  key={reg.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                  data-testid={`register-item-${reg.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Landmark className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <span className="font-medium">{reg.name}</span>
                      {wh && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Warehouse className="w-3 h-3" />
                          <span>{wh.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(reg)}
                      data-testid={`button-edit-register-${reg.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {registers.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmDeleteId(reg.id)}
                        data-testid={`button-delete-register-${reg.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent data-testid="dialog-register">
          <DialogHeader>
            <DialogTitle>
              {editingRegister ? t("settings.edit_register") : t("settings.add_register")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("settings.register_name")}</Label>
              <Input
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder={t("settings.register_name")}
                data-testid="input-register-name"
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
            </div>
            <div>
              <Label>{t("settings.register_warehouse")}</Label>
              <Select value={registerWarehouseId} onValueChange={setRegisterWarehouseId}>
                <SelectTrigger data-testid="select-register-warehouse">
                  <SelectValue placeholder={t("settings.select_warehouse")} />
                </SelectTrigger>
                <SelectContent>
                  {(warehouses || []).map((wh: any) => (
                    <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{t("settings.register_warehouse_description")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} data-testid="button-cancel-register">
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!registerName.trim() || isPending}
              data-testid="button-save-register"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent data-testid="dialog-delete-register">
          <DialogHeader>
            <DialogTitle>{t("settings.delete_register")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("settings.delete_register_confirm")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)} data-testid="button-cancel-delete">
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteId && deleteMutation.mutate(confirmDeleteId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-register"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("settings.delete_register")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const FEATURE_TRANSLATION_KEYS: Record<string, string> = {
  user_management: "subscription.feature_user_management",
  inventory_advanced: "subscription.feature_advanced_inventory",
  reports_detailed: "subscription.feature_detailed_reports",
  label_designer: "subscription.feature_label_designer",
  multi_location: "subscription.feature_multi_location",
  reports_management: "subscription.feature_management_reports",
  ecommerce_integrations: "subscription.feature_ecommerce",
  security_audit: "subscription.feature_security_audit",
  kds_advanced: "subscription.feature_advanced_kds",
  floor_management: "subscription.feature_floor_management",
  modifiers_advanced: "subscription.feature_advanced_modifiers",
  ingredients_recipes: "subscription.feature_ingredients_recipes",
  tips_analytics: "subscription.feature_tips_analytics",
  "pos.core": "subscription.feature_pos_core",
  "inventory.core": "subscription.feature_inventory_core",
  "purchasing.core": "subscription.feature_purchasing_core",
  "customers.core": "subscription.feature_customers_core",
  "reporting.core": "subscription.feature_reporting_core",
  electronic_invoicing: "subscription.feature_electronic_invoicing",
  loyalty_program: "subscription.feature_loyalty_program",
  advanced_reporting: "subscription.feature_advanced_reporting",
  "retail.barcode": "subscription.feature_barcode",
  "retail.returns": "subscription.feature_returns",
  "retail.bulk_discounts": "subscription.feature_bulk_discounts",
};

function MyPlanTab() {
  const { t, language } = useI18n();
  const locale = language === "es" ? "es-ES" : language === "pt" ? "pt-BR" : "en-US";
  const { toast } = useToast();
  const { tenant } = useAuth();
  const [, navigate] = useLocation();
  const { tier, limits, usage, trial, status, isComped, isLoading: subLoading } = useSubscription();

  const { data: subscription, isLoading: subDataLoading } = useQuery<any>({
    queryKey: ["/api/subscription/current"],
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<any[]>({
    queryKey: ["/api/subscription/payments"],
  });

  const { data: plans = [] } = useQuery<any[]>({
    queryKey: ["/api/subscription/plans"],
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscription/cancel");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/my-plan"] });
      toast({ title: t("subscription.cancel_success" as any) });
    },
    onError: () => {
      toast({ title: t("subscription.cancel_error" as any), variant: "destructive" });
    },
  });

  const getTierLabel = (t_tier: string) => {
    if (t_tier === "enterprise") return t("subscription.tier_enterprise" as any);
    if (t_tier === "pro") return "Pro";
    return "Starter";
  };

  const getStatusBadge = (s: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      active: { label: t("subscription.status_active" as any), variant: "default" },
      trial: { label: t("subscription.status_trial" as any), variant: "secondary" },
      cancelled: { label: t("subscription.status_cancelled" as any), variant: "destructive" },
      past_due: { label: t("subscription.status_past_due" as any), variant: "destructive" },
      suspended: { label: t("subscription.status_suspended" as any), variant: "destructive" },
    };
    const info = map[s] || { label: s, variant: "secondary" as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  const getPaymentStatusBadge = (s: string) => {
    if (s === "completed") return <Badge variant="default">{t("subscription.status_completed" as any)}</Badge>;
    if (s === "pending") return <Badge variant="secondary">{t("subscription.status_pending" as any)}</Badge>;
    return <Badge variant="outline">{s}</Badge>;
  };

  const usageLimitItems = [
    { icon: Monitor, label: t("subscription.limit_registers" as any), used: usage.registers, max: limits.maxRegisters },
    { icon: Users, label: t("subscription.limit_users" as any), used: usage.users, max: limits.maxUsers },
    { icon: Building2, label: t("subscription.limit_locations" as any), used: usage.locations, max: limits.maxLocations },
    { icon: Warehouse, label: t("subscription.limit_warehouses" as any), used: usage.warehouses, max: limits.maxWarehouses },
    { icon: ShoppingBag, label: t("subscription.limit_products" as any), used: usage.products, max: limits.maxProducts },
  ];

  if (limits.maxTables > 0) {
    usageLimitItems.push({ icon: UtensilsCrossed, label: t("subscription.limit_tables" as any), used: usage.tables, max: limits.maxTables });
  }
  if (limits.maxRecipes !== 0) {
    usageLimitItems.push({ icon: CookingPot, label: t("subscription.limit_recipes" as any), used: usage.recipes, max: limits.maxRecipes });
  }

  const currentPlan = plans.find((p: any) => p.id === subscription?.planId);
  const currency = currentPlan?.currency || tenant?.currency || "COP";

  if (subLoading || subDataLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const hasActiveSub = subscription && (subscription.status === "active" || isComped);

  return (
    <div className="space-y-6">
      <Card data-testid="card-plan-details">
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-primary" />
              {t("subscription.plan_details" as any)}
            </CardTitle>
            <CardDescription>{t("subscription.plan_details_desc" as any)}</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isComped && (
              <Badge className="bg-green-600 text-white" data-testid="badge-myplan-comped">
                {t("subscription.comped_badge" as any)}
              </Badge>
            )}
            {getStatusBadge(status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isComped && (
            <div className="flex items-center gap-3 p-3 rounded-md bg-green-500/10 border border-green-500/20">
              <Gift className="w-5 h-5 text-green-600 shrink-0" />
              <p className="text-sm text-muted-foreground">
                {t("subscription.comped_notice" as any)}
              </p>
            </div>
          )}
          {trial.isTrialing && (
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted">
              <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">{t("subscription.trial_period" as any)}</p>
                <p className="text-sm text-muted-foreground">
                  {trial.daysRemaining} {t("subscription.days_left" as any)}
                  {trial.trialEndsAt && ` - ${new Date(trial.trialEndsAt).toLocaleDateString(locale)}`}
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t("subscription.plan_name" as any)}</p>
              <p className="font-medium text-lg" data-testid="text-plan-name">
                {currentPlan?.name || getTierLabel(tier)}
                {trial.isTrialing && ` (${t("subscription.trial_suffix" as any)})`}
              </p>
            </div>
            {subscription?.billingPeriod && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t("subscription.billing_cycle" as any)}</p>
                <p className="font-medium" data-testid="text-billing-cycle">
                  {subscription.billingPeriod === "yearly" ? t("subscription.yearly" as any) : t("subscription.monthly" as any)}
                </p>
              </div>
            )}
            {subscription?.currentPeriodEnd && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t("subscription.next_payment" as any)}</p>
                <p className="font-medium" data-testid="text-next-payment">{new Date(subscription.currentPeriodEnd).toLocaleDateString(locale)}</p>
              </div>
            )}
            {subscription?.mpPayerEmail && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t("subscription.payment_email" as any)}</p>
                <p className="font-medium" data-testid="text-payer-email">{subscription.mpPayerEmail}</p>
              </div>
            )}
            {subscription?.paymentGateway && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t("subscription.payment_method" as any)}</p>
                <p className="font-medium capitalize" data-testid="text-payment-method">{subscription.paymentGateway}</p>
              </div>
            )}
            {currentPlan && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t("subscription.payment_amount" as any)}</p>
                <p className="font-medium text-lg" data-testid="text-plan-price">
                  {formatCurrency(
                    parseFloat(subscription?.billingPeriod === "yearly" ? currentPlan.priceYearly || currentPlan.priceMonthly : currentPlan.priceMonthly),
                    currency
                  )}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{subscription?.billingPeriod === "yearly" ? t("subscription.per_year" as any) : t("subscription.per_month" as any)}
                  </span>
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" onClick={() => navigate("/subscription?from=myplan")} data-testid="button-change-plan">
              <Crown className="w-4 h-4 mr-2" />
              {t("subscription.change_plan" as any)}
            </Button>
            {hasActiveSub && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" data-testid="button-cancel-subscription">
                    {t("subscription.cancel_subscription" as any)}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("subscription.cancel_subscription" as any)}</AlertDialogTitle>
                    <AlertDialogDescription>{t("subscription.cancel_confirm" as any)}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-dialog-dismiss">{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => cancelMutation.mutate()}
                      className="bg-destructive text-destructive-foreground"
                      data-testid="button-cancel-dialog-confirm"
                    >
                      {cancelMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {t("subscription.cancel_subscription" as any)}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>

      {!hasActiveSub && (() => {
        const activePlans = plans.filter((p: any) => p.isActive);
        const tenantBizType = tenant?.businessType || "retail";
        const matchingPlans = activePlans.filter((p: any) => {
          if (!p.businessType) return true;
          return p.businessType === tenantBizType;
        });
        return matchingPlans.length > 0 ? (
          <Card data-testid="card-available-plans">
            <CardHeader>
              <CardTitle>{t("subscription.available_plans" as any)}</CardTitle>
              <CardDescription>{t("subscription.available_plans_desc" as any)}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className={`grid gap-4 ${matchingPlans.length === 1 ? "max-w-md" : matchingPlans.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
                {matchingPlans.map((plan: any) => (
                  <Card key={plan.id} className={plan.tier === tier ? "border-primary relative" : ""} data-testid={`card-available-plan-${plan.tier}`}>
                    {plan.tier === tier && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge>{t("subscription.current_plan" as any)}</Badge>
                      </div>
                    )}
                    <CardHeader className="text-center pb-2">
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      <CardDescription>
                        <span className="text-2xl font-bold text-foreground">
                          {formatCurrency(parseFloat(plan.priceMonthly), plan.currency || currency)}
                        </span>
                        <span className="text-muted-foreground">/{t("subscription.per_month" as any)}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-3 gap-2 text-sm text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{plan.maxLocations}</span>
                          <span className="text-xs text-muted-foreground">{t("subscription.limit_locations" as any)}</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <Monitor className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{plan.maxRegisters}</span>
                          <span className="text-xs text-muted-foreground">{t("subscription.limit_registers" as any)}</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{plan.maxUsers}</span>
                          <span className="text-xs text-muted-foreground">{t("subscription.limit_users" as any)}</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <Warehouse className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{plan.maxWarehouses ?? 1}</span>
                          <span className="text-xs text-muted-foreground">{t("subscription.limit_warehouses" as any)}</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{plan.maxProducts === -1 ? "\u221e" : (plan.maxProducts ?? 100)}</span>
                          <span className="text-xs text-muted-foreground">{t("subscription.limit_products" as any)}</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{plan.maxDianDocuments ?? 200}</span>
                          <span className="text-xs text-muted-foreground">DIAN/{t("subscription.per_month" as any)}</span>
                        </div>
                      </div>

                      {plan.features && plan.features.length > 0 && (
                        <div className="space-y-2 pt-4 border-t">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {t("subscription.included_features" as any)}
                          </p>
                          {plan.features.map((feature: string, i: number) => {
                            const featureKey = FEATURE_TRANSLATION_KEYS[feature];
                            const label = featureKey ? t(featureKey as any) : feature.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
                            return (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                <Check className="h-4 w-4 text-primary shrink-0" />
                                <span>{label}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                    <CardFooter>
                      <Button
                        className="w-full"
                        variant={plan.tier === tier ? "secondary" : "outline"}
                        onClick={() => navigate(`/subscription?from=myplan&select=${plan.id}`)}
                        disabled={plan.tier === tier}
                        data-testid={`button-subscribe-plan-${plan.tier}`}
                      >
                        {plan.tier === tier
                          ? t("subscription.you_have_this_plan" as any)
                          : t("subscription.subscribe_to" as any)}
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card data-testid="card-no-plan">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Crown className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">{t("subscription.no_active_plan" as any)}</h3>
              <p className="text-muted-foreground text-center mb-4">{t("subscription.no_active_plan_desc" as any)}</p>
              <Button onClick={() => navigate("/subscription?from=myplan")} data-testid="button-choose-plan">
                {t("subscription.choose_plan" as any)}
              </Button>
            </CardContent>
          </Card>
        );
      })()}

      <Card data-testid="card-usage-overview">
        <CardHeader>
          <CardTitle>{t("subscription.usage_overview" as any)}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {usageLimitItems.map((item) => {
              const isUnlimited = item.max === -1;
              const percentage = isUnlimited ? 0 : item.max > 0 ? Math.min((item.used / item.max) * 100, 100) : 0;
              const isNearLimit = !isUnlimited && item.max > 0 && percentage >= 80;
              return (
                <div key={item.label} className="space-y-2" data-testid={`usage-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <item.icon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                    <span className={`text-sm ${isNearLimit ? "text-destructive font-medium" : "text-muted-foreground"}`} data-testid={`text-usage-value-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
                      {item.used} {t("subscription.used_of" as any)} {isUnlimited ? t("subscription.unlimited" as any) : item.max}
                    </span>
                  </div>
                  {!isUnlimited && item.max > 0 && (
                    <Progress value={percentage} className={`h-2 ${isNearLimit ? "[&>div]:bg-destructive" : ""}`} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-payment-history">
        <CardHeader>
          <CardTitle>{t("subscription.payment_history" as any)}</CardTitle>
          <CardDescription>{t("subscription.payment_history_desc" as any)}</CardDescription>
        </CardHeader>
        <CardContent>
          {paymentsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">{t("subscription.no_payments" as any)}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("subscription.no_payments_desc" as any)}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-payment-history">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">{t("subscription.payment_date" as any)}</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">{t("subscription.payment_amount" as any)}</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">{t("subscription.payment_method" as any)}</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">{t("subscription.payment_status" as any)}</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">{t("subscription.payment_reference" as any)}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment: any) => (
                    <tr key={payment.id} className="border-b last:border-0" data-testid={`row-payment-${payment.id}`}>
                      <td className="py-3 pr-4">{payment.createdAt ? new Date(payment.createdAt).toLocaleDateString(locale) : "-"}</td>
                      <td className="py-3 pr-4 font-medium">{formatCurrency(parseFloat(payment.amount), currency)}</td>
                      <td className="py-3 pr-4 capitalize">{payment.method || "-"}</td>
                      <td className="py-3 pr-4">{getPaymentStatusBadge(payment.status)}</td>
                      <td className="py-3 font-mono text-xs text-muted-foreground">{payment.providerRef ? payment.providerRef.slice(0, 16) + "..." : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddonsSettings() {
  const { t, language } = useI18n();
  const locale = language === "es" ? "es-ES" : language === "pt" ? "pt-BR" : "en-US";
  const { toast } = useToast();
  const { tenant } = useAuth();
  const queryClientInstance = useQueryClient();

  const { data: addonsData, isLoading, refetch } = useQuery<{
    availableAddons: Array<{
      id: string;
      addonKey: string;
      name: string;
      description: string | null;
      icon: string | null;
      category: string | null;
      monthlyPrice: number | null;
      trialDays: number | null;
      includedInTiers: string[];
    }>;
    activeAddons: Array<{
      id: string;
      addonType: string;
      status: string;
      trialEndsAt: string | null;
      monthlyPrice: number | null;
    }>;
    subscriptionTier: string;
  }>({
    queryKey: ['/api/tenant/addons'],
    enabled: !!tenant,
  });

  const activateMutation = useMutation({
    mutationFn: async ({ addonKey, withTrial }: { addonKey: string; withTrial: boolean }) => {
      const res = await apiRequest("POST", `/api/tenant/addons/${addonKey}`, { withTrial });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: t("settings.addon_activated") });
        refetch();
      } else {
        toast({ title: t("common.error"), description: data.error, variant: "destructive" });
      }
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (addonKey: string) => {
      const res = await apiRequest("DELETE", `/api/tenant/addons/${addonKey}`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: t("settings.addon_deactivated") });
        refetch();
      } else {
        toast({ title: t("common.error"), description: data.error, variant: "destructive" });
      }
    },
  });

  const getAddonStatusLabel = (status: string) => {
    switch (status) {
      case "active": return t("settings.addon_status_active");
      case "trial": return t("settings.addon_status_trial");
      case "cancelled": return t("settings.addon_status_cancelled");
      case "expired": return t("settings.addon_status_expired");
      default: return t("settings.addon_status_unknown");
    }
  };

  const getIconComponent = (iconName: string | null) => {
    switch (iconName) {
      case "ShoppingBag": return ShoppingBag;
      case "MessageSquare": return MessageSquare;
      default: return Puzzle;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const availableAddons = addonsData?.availableAddons || [];
  const activeAddons = addonsData?.activeAddons || [];
  const subscriptionTier = addonsData?.subscriptionTier || "basic";

  const isAddonActive = (addonKey: string) => {
    const addon = activeAddons.find(a => a.addonType === addonKey);
    return addon && addon.status !== "cancelled" && addon.status !== "expired";
  };

  const getActiveAddon = (addonKey: string) => {
    return activeAddons.find(a => a.addonType === addonKey);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.addons_title")}</CardTitle>
          <CardDescription>{t("settings.addons_description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {availableAddons.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {t("settings.no_addons_available")}
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {availableAddons.map((addon) => {
                const IconComponent = getIconComponent(addon.icon);
                const isActive = isAddonActive(addon.addonKey);
                const activeAddon = getActiveAddon(addon.addonKey);
                const isIncludedInTier = addon.includedInTiers?.includes(subscriptionTier);
                const hasTrial = (addon.trialDays || 0) > 0;

                return (
                  <Card key={addon.id} className={isActive ? "border-primary" : ""}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <IconComponent className="h-5 w-5 text-primary" />
                          <CardTitle className="text-lg">{addon.name}</CardTitle>
                        </div>
                        {isActive && (
                          <Badge variant={activeAddon?.status === "trial" ? "secondary" : "default"}>
                            {getAddonStatusLabel(activeAddon?.status || "active")}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        {addon.description || t("settings.no_description")}
                      </p>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t("settings.addon_price")}</span>
                        <span className="font-medium">
                          {isIncludedInTier ? (
                            <Badge variant="secondary">{t("settings.addon_included_in_plan")}</Badge>
                          ) : addon.monthlyPrice ? (
                            `${new Intl.NumberFormat(tenant?.currency === "COP" ? "es-CO" : "en-US", { style: "currency", currency: tenant?.currency || "COP", minimumFractionDigits: ["COP","CLP","JPY","KRW"].includes(tenant?.currency || "COP") ? 0 : 2, maximumFractionDigits: ["COP","CLP","JPY","KRW"].includes(tenant?.currency || "COP") ? 0 : 2 }).format(addon.monthlyPrice / 100)}${t("settings.addon_per_month")}`
                          ) : (
                            t("settings.addon_free")
                          )}
                        </span>
                      </div>

                      {activeAddon?.status === "trial" && activeAddon.trialEndsAt && (
                        <p className="text-xs text-muted-foreground">
                          {t("settings.trial_ends")}: {new Date(activeAddon.trialEndsAt).toLocaleDateString(locale)}
                        </p>
                      )}

                      <div className="flex gap-2">
                        {isActive ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="w-full"
                            onClick={() => deactivateMutation.mutate(addon.addonKey)}
                            disabled={deactivateMutation.isPending}
                            data-testid={`button-deactivate-${addon.addonKey}`}
                          >
                            {deactivateMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            {t("settings.addon_deactivate")}
                          </Button>
                        ) : (
                          <>
                            {hasTrial && !isIncludedInTier && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => activateMutation.mutate({ addonKey: addon.addonKey, withTrial: true })}
                                disabled={activateMutation.isPending}
                                data-testid={`button-trial-${addon.addonKey}`}
                              >
                                {activateMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : null}
                                {t("settings.addon_start_trial")} ({addon.trialDays} {t("settings.days")})
                              </Button>
                            )}
                            <Button
                              size="sm"
                              className={hasTrial && !isIncludedInTier ? "flex-1" : "w-full"}
                              onClick={() => activateMutation.mutate({ addonKey: addon.addonKey, withTrial: false })}
                              disabled={activateMutation.isPending}
                              data-testid={`button-activate-${addon.addonKey}`}
                            >
                              {activateMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : null}
                              {t("settings.addon_activate")}
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EBillingSettings() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { tenant } = useAuth();
  const queryClientInstance = useQueryClient();

  const { data: billingConfig, isLoading } = useQuery<{
    autoSubmitSales: boolean;
    documentTypes: Array<{
      type: string;
      resolution: string;
      prefix: string;
      currentNumber: number | null;
      endingNumber: number | null;
    }>;
  }>({
    queryKey: ['/api/tenant/ebilling-config'],
    enabled: !!tenant,
  });

  const form = useForm<z.infer<typeof ebillingSchema>>({
    resolver: zodResolver(ebillingSchema),
    defaultValues: {
      autoSubmitSales: true,
    },
  });

  useEffect(() => {
    if (billingConfig) {
      form.reset({
        autoSubmitSales: billingConfig.autoSubmitSales ?? true,
      });
    }
  }, [billingConfig]);

  const saveMutation = useMutation({
    mutationFn: async (data: z.infer<typeof ebillingSchema>) => {
      const res = await apiRequest('PUT', '/api/tenant/ebilling-config', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("common.saved") || "Configuration saved" });
      queryClientInstance.invalidateQueries({ queryKey: ['/api/tenant/ebilling-config'] });
    },
    onError: () => {
      toast({ title: t("common.error") || "Error", variant: "destructive" });
    },
  });

  const onSubmit = (data: z.infer<typeof ebillingSchema>) => {
    saveMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileDigit className="w-5 h-5" />
          {t("settings.ebilling") || "Electronic Billing (DIAN)"}
        </CardTitle>
        <CardDescription>
          {t("settings.ebilling_desc") || "Configure DIAN electronic billing for this business"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {billingConfig?.documentTypes && billingConfig.documentTypes.length > 0 && (
              <div className="space-y-3">
                {billingConfig.documentTypes.map((docType) => (
                  <div key={docType.type} className="rounded-lg border p-4 bg-muted/50 space-y-2" data-testid={`config-${docType.type}`}>
                    <div className="text-sm font-medium">
                      {t(`ebilling.doctype.${docType.type}`) || docType.type}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">{t("ebilling.resolution") || "Resolution"}</div>
                        <div className="text-sm font-mono" data-testid={`text-resolution-${docType.type}`}>{docType.resolution || "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{t("ebilling.prefix") || "Prefix"}</div>
                        <div className="text-sm font-mono" data-testid={`text-prefix-${docType.type}`}>{docType.prefix || "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{t("ebilling.current_number") || "Current Number"}</div>
                        <div className="text-sm font-mono" data-testid={`text-current-${docType.type}`}>{docType.currentNumber ?? "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{t("ebilling.ending_number") || "Ending Number"}</div>
                        <div className="text-sm font-mono" data-testid={`text-ending-${docType.type}`}>{docType.endingNumber ?? "-"}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <FormField
              control={form.control}
              name="autoSubmitSales"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      {t("ebilling.auto_submit") || "Auto-Submit Sales"}
                    </FormLabel>
                    <FormDescription>
                      {t("ebilling.auto_submit_desc") || "Automatically submit completed sales to DIAN"}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-auto-submit"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={saveMutation.isPending}
              data-testid="button-save-ebilling"
            >
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save") || "Save Configuration"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { tenant, refreshTenant } = useAuth();
  const { t, formatDate } = useI18n();
  const { can, isOwner, isAdmin } = usePermissions();
  const { canCreate: canCreateSub2, usage: subUsage2, limits: subLimits2 } = useSubscription();
  
  // Determine initial tab from URL path and query params
  const getInitialTab = () => {
    if (typeof window !== "undefined") {
      if (window.location.pathname === "/settings/shopify") {
        return "shopify";
      }
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "myplan") {
        return "myplan";
      }
    }
    return "business";
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab);
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
  
  // Handle Shopify OAuth callback query params
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const shopifySuccess = params.get("shopify_success");
      const shopifyError = params.get("shopify_error");
      
      if (shopifySuccess === "true") {
        toast({
          title: t("settings.shopify.connectionSuccess"),
          description: t("settings.shopify.connectionSuccessDesc"),
        });
        // Clean up URL
        window.history.replaceState({}, "", window.location.pathname);
      } else if (shopifyError) {
        toast({
          title: t("settings.shopify.connectionFailed"),
          description: shopifyError,
          variant: "destructive",
        });
        // Clean up URL
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, [toast, t]);

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

  const { data: shopifyAddonData } = useQuery<{ hasAddon: boolean }>({
    queryKey: ["/api/shopify/addon-status"],
    retry: false,
  });
  const hasShopifyAddon = shopifyAddonData?.hasAddon === true;

  const { data: whatsappAddonData } = useQuery<{ hasAddon: boolean }>({
    queryKey: ["/api/whatsapp/addon-status"],
    retry: false,
  });
  const hasWhatsappAddon = whatsappAddonData?.hasAddon === true;

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

  const printTestReceiptBrowser = () => {
    const fontSize = receiptForm.watch("receiptFontSize") || 12;
    const fontFamily = receiptForm.watch("receiptFontFamily") || "monospace";
    const fontFamilyMap: Record<string, string> = {
      monospace: "'Courier New', monospace",
      "sans-serif": "Arial, Helvetica, sans-serif",
      serif: "'Times New Roman', Georgia, serif",
    };
    const cssFontFamily = fontFamilyMap[fontFamily] || fontFamilyMap.monospace;

    const receiptHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${t("printing.test_receipt")}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    body { font-family: ${cssFontFamily}; font-size: ${fontSize}px; width: 80mm; margin: 0 auto; padding: 2mm; }
    .header { text-align: center; margin-bottom: 10px; }
    .logo { max-width: 60mm; max-height: 20mm; margin-bottom: 5px; }
    .company-name { font-weight: bold; font-size: ${Math.round(fontSize * 1.17)}px; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; margin: 3px 0; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .total { font-size: ${Math.round(fontSize * 1.17)}px; border-top: 1px solid #000; padding-top: 5px; margin-top: 5px; }
    .coupon { border-top: 2px dashed #000; margin-top: 15px; padding-top: 10px; text-align: center; }
    .coupon-title { font-weight: bold; font-size: ${Math.round(fontSize * 1.2)}px; margin-bottom: 10px; }
    .coupon-text { white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="header">
    ${receiptForm.watch("receiptShowLogo") && receiptLogoPath ? `<img src="${receiptLogoPath.startsWith('/objects') ? receiptLogoPath : '/objects' + receiptLogoPath}" class="logo" alt="Logo" />` : ""}
    <div class="company-name">${tenant?.name || "Business Name"}</div>
    ${receiptForm.watch("receiptShowAddress") && tenant?.address ? `<div>${tenant.address}</div>` : ""}
    ${receiptForm.watch("receiptShowPhone") && tenant?.phone ? `<div>Tel: ${tenant.phone}</div>` : ""}
    ${tenant?.receiptTaxId ? `<div>${t("pos.tax_id")}: ${tenant.receiptTaxId}</div>` : ""}
    ${receiptForm.watch("receiptHeaderText") ? `<div style="font-style: italic; margin-top: 5px;">${receiptForm.watch("receiptHeaderText")}</div>` : ""}
  </div>
  <div class="divider"></div>
  <div class="row"><span>${t("pos.order")} #TEST-1234</span><span>${formatDate(new Date())}</span></div>
  <div class="divider"></div>
  <div class="row"><span>2x ${t("printing.sample_item")} 1</span><span>$10.00</span></div>
  <div class="row"><span>1x ${t("printing.sample_item")} 2</span><span>$15.00</span></div>
  <div class="divider"></div>
  <div class="row"><span>${t("pos.subtotal")}</span><span>$25.00</span></div>
  <div class="row"><span>${t("pos.tax")} (${tenant?.taxRate || 10}%)</span><span>$2.50</span></div>
  <div class="row bold total"><span>${t("pos.total")}</span><span>$27.50</span></div>
  <div class="divider"></div>
  <div class="row"><span>${t("pos.payment_cash")}</span><span>$30.00</span></div>
  <div class="row"><span>${t("pos.change")}</span><span>$2.50</span></div>
  ${receiptForm.watch("receiptFooterText") ? `<div class="divider"></div><div class="center" style="font-style: italic;">${receiptForm.watch("receiptFooterText")}</div>` : ""}
  <div class="divider"></div>
  <div class="center bold">${t("printing.thank_you")}</div>
  ${receiptForm.watch("couponEnabled") && receiptForm.watch("couponText") ? `
    <div class="coupon">
      <div>✂ - - - - - - - - - - - - ✂</div>
      <div class="coupon-title">🎟️ ${t("printing.coupon_label")}</div>
      <div class="coupon-text">${receiptForm.watch("couponText")}</div>
      <div style="margin-top: 10px; border-top: 1px dashed #000; padding-top: 5px;">${tenant?.name || ""}</div>
    </div>
  ` : ""}
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>
    `;

    const printWindow = window.open("", "_blank", "width=350,height=600");
    if (printWindow) {
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
    }
  };

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

  const inventorySettingsMutation = useMutation({
    mutationFn: async (data: { allowZeroStockSales: boolean }) => {
      return apiRequest("PATCH", "/api/settings", data);
    },
    onSuccess: () => {
      toast({ title: t("settings.updated") });
      if (refreshTenant) refreshTenant();
    },
    onError: () => {
      toast({ title: t("settings.update_error"), variant: "destructive" });
    },
  });

  const autoLockMutation = useMutation({
    mutationFn: async (data: { autoLockEnabled?: boolean; autoLockTimeout?: number }) => {
      return apiRequest("PATCH", "/api/settings", data);
    },
    onSuccess: () => {
      toast({ title: t("settings.updated") });
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
    onSuccess: (_, variables) => {
      toast({ title: editingUser ? t("settings.user_updated") : t("settings.user_created") });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      // If the current logged-in user was edited, update localStorage
      if (editingUser && user && editingUser.id === user.id) {
        const updatedUser = { ...user, name: variables.name, email: variables.email, phone: variables.phone };
        localStorage.setItem("pos_user", JSON.stringify(updatedUser));
        // Force page reload to refresh auth context
        window.location.reload();
      }
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
    if (!table && !canCreateSub2("tables")) return;
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
    <div className="h-full overflow-y-auto touch-scroll overscroll-contain">
    <div className="p-3 sm:p-6 pb-24 sm:pb-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          {t("settings.subtitle")}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="w-full pb-2">
          <TabsList className="flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="business" data-testid="tab-business" className="text-xs sm:text-sm">
              <Store className="w-4 h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">{t("settings.business")}</span>
              <span className="sm:hidden">{t("settings.business").split(' ')[0]}</span>
            </TabsTrigger>
            {isOwner && (
              <TabsTrigger value="taxes" data-testid="tab-taxes" className="text-xs sm:text-sm">
                <Receipt className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t("taxes.title")}</span>
                <span className="sm:hidden">{t("taxes.title").split(' ')[0]}</span>
              </TabsTrigger>
            )}
            {isOwner && (
              <TabsTrigger value="inventory" data-testid="tab-inventory" className="text-xs sm:text-sm">
                <Package className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t("settings.inventory")}</span>
                <span className="sm:hidden">{t("settings.inventory").split(' ')[0]}</span>
              </TabsTrigger>
            )}
            {isRestaurant && isAdmin && (
              <TabsTrigger value="tables" data-testid="tab-tables" className="text-xs sm:text-sm">
                <LayoutGrid className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t("settings.tables")}</span>
                <span className="sm:hidden">{t("settings.tables").split(' ')[0]}</span>
              </TabsTrigger>
            )}
            {isOwner && (
              <TabsTrigger value="printing" data-testid="tab-printing" className="text-xs sm:text-sm">
                <Printer className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t("settings.printing")}</span>
                <span className="sm:hidden">{t("settings.printing").split(' ')[0]}</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="registers" data-testid="tab-registers" className="text-xs sm:text-sm">
                <Landmark className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t("settings.registers")}</span>
                <span className="sm:hidden">{t("settings.registers").split(' ')[0]}</span>
              </TabsTrigger>
            )}
            {isOwner && (
              <TabsTrigger value="users" data-testid="tab-users" className="text-xs sm:text-sm">
                <Users className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t("settings.users")}</span>
                <span className="sm:hidden">{t("settings.users").split(' ')[0]}</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="import" data-testid="tab-import" className="text-xs sm:text-sm">
                <Upload className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t("settings.import")}</span>
                <span className="sm:hidden">{t("settings.import").split(' ')[0]}</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="downloads" data-testid="tab-downloads" className="hidden sm:flex text-xs sm:text-sm">
                <Download className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t("settings.downloads")}</span>
                <span className="sm:hidden">{t("settings.downloads").split(' ')[0]}</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="notifications" data-testid="tab-notifications" className="text-xs sm:text-sm">
                <Bell className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t("settings.my_notifications") || "My Notifications"}</span>
                <span className="sm:hidden">{t("nav.notifications") || "Notifications"}</span>
              </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="emails" data-testid="tab-emails" className="text-xs sm:text-sm">
                <Mail className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t("settings.email_templates") || "Email Templates"}</span>
                <span className="sm:hidden">{t("email.templates") || "Templates"}</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="ebilling" data-testid="tab-ebilling" className="text-xs sm:text-sm">
                <FileDigit className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t("settings.ebilling") || "E-Billing"}</span>
                <span className="sm:hidden">{t("ebilling.short") || "E-Bill"}</span>
              </TabsTrigger>
            )}
            {isAdmin && hasShopifyAddon && (
              <TabsTrigger value="shopify" data-testid="tab-shopify" className="text-xs sm:text-sm">
                <Store className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t("settings.shopify") || "Shopify"}</span>
                <span className="sm:hidden">{t("shopify.short") || "Shop"}</span>
              </TabsTrigger>
            )}
            {isAdmin && hasWhatsappAddon && (
              <TabsTrigger value="whatsapp" data-testid="tab-whatsapp" className="text-xs sm:text-sm">
                <MessageSquare className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t("settings.whatsapp" as any) || "WhatsApp"}</span>
                <span className="sm:hidden">{t("whatsapp.short" as any) || "WA"}</span>
              </TabsTrigger>
            )}
            {isOwner && (
              <TabsTrigger value="addons" data-testid="tab-addons" className="text-xs sm:text-sm">
                <Puzzle className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t("settings.addons")}</span>
                <span className="sm:hidden">{t("settings.addons_short")}</span>
              </TabsTrigger>
            )}
            {isOwner && (
              <TabsTrigger value="myplan" data-testid="tab-myplan" className="text-xs sm:text-sm">
                <CreditCard className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t("subscription.my_plan" as any)}</span>
                <span className="sm:hidden">{t("subscription.my_plan_short" as any)}</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="otros" data-testid="tab-otros" className="text-xs sm:text-sm">
                <SlidersHorizontal className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t("settings.others")}</span>
                <span className="sm:hidden">{t("settings.others_short")}</span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

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
                                  <SelectValue placeholder={t("settings.select_currency")} />
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
                        name="address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("business.address")}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder={t("form.business_address")}
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
                                placeholder={t("form.business_phone")}
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
                                  <SelectValue placeholder={t("form.select_language")} />
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
                      <p className="text-sm text-muted-foreground">{t("business.support_id" as any) || "Support ID"}</p>
                      <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded" data-testid="text-tenant-support-id">
                        {tenant?.supportId || "—"}
                      </code>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t("business.type")}</p>
                      <Badge variant="secondary" className="capitalize">
                        {tenant?.type || "Not set"}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t("form.country")}</p>
                      <p className="font-medium">{COUNTRIES.find(c => c.value === tenant?.country)?.label || tenant?.country || t("business.not_set")}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t("settings.city")}</p>
                      <p className="font-medium">{tenant?.city || t("business.not_set")}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{COUNTRIES.find(c => c.value === tenant?.country)?.taxIdLabel || t("business.tax_id")}</p>
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

        {/* Inventory Settings */}
        <TabsContent value="inventory" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.inventory")}</CardTitle>
              <CardDescription>{t("settings.inventory_description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">{t("settings.allow_zero_stock_sales")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.allow_zero_stock_sales_description")}
                  </p>
                </div>
                <Switch
                  checked={tenant?.allowZeroStockSales ?? true}
                  onCheckedChange={(checked) => {
                    inventorySettingsMutation.mutate({ allowZeroStockSales: checked });
                  }}
                  disabled={inventorySettingsMutation.isPending}
                  data-testid="switch-allow-zero-stock-sales"
                />
              </div>
            </CardContent>
          </Card>

          <WarehouseSettings />
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
                  disabled={!floors?.length || !canCreateSub2("tables")}
                  data-testid="button-add-table"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t("settings.add_table")}
                </Button>
              </CardHeader>
              <CardContent>
                {!canCreateSub2("tables") && (
                  <div className="mb-4">
                    <UpgradeBanner
                      type="limit"
                      resourceName={t("form.tables")}
                      current={subUsage2.tables}
                      max={subLimits2.maxTables}
                      compact
                    />
                  </div>
                )}
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
                              <CouponEditor 
                                value={field.value || ""} 
                                onChange={field.onChange}
                                fontFamily={receiptForm.watch("receiptFontFamily") || "monospace"}
                                baseFontSize={receiptForm.watch("receiptFontSize") || 12}
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
              <div className="flex justify-center mt-4">
                <Button
                  onClick={async () => {
                    printBridge.clearCache();
                    const status = await printBridge.checkStatus();
                    if (status.isAvailable) {
                      const result = await printBridge.printReceipt({
                        language: tenant?.language || "en",
                        businessName: tenant?.name || "Business Name",
                        headerText: receiptForm.watch("receiptHeaderText") || undefined,
                        address: receiptForm.watch("receiptShowAddress") ? (tenant?.address || "123 Main Street, City") : undefined,
                        phone: receiptForm.watch("receiptShowPhone") ? (tenant?.phone || "(555) 123-4567") : undefined,
                        taxId: tenant?.receiptTaxId || undefined,
                        orderNumber: "TEST-1234",
                        date: new Date().toLocaleString(localeCode),
                        fontSize: receiptForm.watch("receiptFontSize") || 12,
                        fontFamily: receiptForm.watch("receiptFontFamily") || "monospace",
                        logoSize: receiptForm.watch("receiptLogoSize") || 200,
                        logoUrl: receiptLogoPath || undefined,
                        items: [
                          { name: `${t("printing.sample_item")} 1`, quantity: 2, unitPrice: 5.00, total: 10.00 },
                          { name: `${t("printing.sample_item")} 2`, quantity: 1, unitPrice: 15.00, total: 15.00 },
                        ],
                        subtotal: 25.00,
                        tax: 2.50,
                        taxRate: Number(tenant?.taxRate) || 10,
                        total: 27.50,
                        payments: [{ type: t("pos.payment_cash"), amount: 30.00 }],
                        change: 2.50,
                        currency: tenant?.currency || "$",
                        footerText: receiptForm.watch("receiptFooterText") || undefined,
                        couponEnabled: receiptForm.watch("couponEnabled") || false,
                        couponText: receiptForm.watch("couponText") || undefined,
                        cutPaper: true,
                      });
                      if (result.success) {
                        toast({ title: t("printing.test_printed") });
                      } else {
                        toast({ title: t("printing.test_error"), description: result.error, variant: "destructive" });
                      }
                    } else {
                      printTestReceiptBrowser();
                      toast({ title: t("printing.test_printed_browser") });
                    }
                  }}
                  data-testid="button-print-test-receipt"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  {t("printing.print_test")}
                </Button>
              </div>
            </CardContent>
          </Card>

          
          <Card>
            <CardHeader>
              <CardTitle>{t("printing.instructions")}</CardTitle>
            </CardHeader>
            <CardContent>
              {!printBridge.isElectronApp() && (
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
              )}

              <div className={printBridge.isElectronApp() ? "" : "hidden sm:block"}>
                <PrintBridgeSettings />
              </div>
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
                                role: user.role as "owner" | "admin" | "manager" | "cashier" | "kitchen" | "inventory",
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

        {/* Import Tab */}
        <TabsContent value="import" className="mt-6 space-y-6">
          <CsvImportSection />
        </TabsContent>

        {/* Downloads Tab */}
        <TabsContent value="downloads" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("downloads.title")}</CardTitle>
              <CardDescription>{t("downloads.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Download className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{t("downloads.desktop_app")}</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {t("downloads.desktop_app_desc")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <a 
                          href="https://github.com/felipemachucaruiz/flowp/releases/latest/download/Flowp-Setup.exe" 
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex"
                        >
                          <Button variant="default" data-testid="button-download-installer-win">
                            <Download className="w-4 h-4 mr-2" />
                            {t("downloads.download_installer")}
                          </Button>
                        </a>
                        <a 
                          href="https://github.com/felipemachucaruiz/flowp/releases/latest/download/Flowp-x64.dmg" 
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex"
                        >
                          <Button variant="default" data-testid="button-download-installer-mac">
                            <Download className="w-4 h-4 mr-2" />
                            {t("downloads.download_installer_mac")} (Intel)
                          </Button>
                        </a>
                        <a 
                          href="https://github.com/felipemachucaruiz/flowp/releases/latest/download/Flowp-arm64.dmg" 
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex"
                        >
                          <Button variant="default" data-testid="button-download-installer-mac-arm">
                            <Download className="w-4 h-4 mr-2" />
                            {t("downloads.download_installer_mac")} (Apple Silicon)
                          </Button>
                        </a>
                        <a 
                          href="https://github.com/felipemachucaruiz/flowp/archive/refs/heads/main.zip" 
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex"
                        >
                          <Button variant="outline" data-testid="button-download-source">
                            <Download className="w-4 h-4 mr-2" />
                            {t("downloads.download_source")}
                          </Button>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-green-500/10 rounded-lg">
                      <Smartphone className="w-6 h-6 text-green-500" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{t("downloads.mobile_app")}</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {t("downloads.mobile_app_desc")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <a 
                          href="https://github.com/felipemachucaruiz/flowp/releases/latest/download/Flowp.apk" 
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex"
                        >
                          <Button variant="default" data-testid="button-download-android">
                            <Download className="w-4 h-4 mr-2" />
                            {t("downloads.download_android")}
                          </Button>
                        </a>
                        <a 
                          href="https://apps.apple.com/app/flowp-pos" 
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex"
                        >
                          <Button variant="default" data-testid="button-download-ios">
                            <Download className="w-4 h-4 mr-2" />
                            {t("downloads.download_ios")}
                          </Button>
                        </a>
                        <a 
                          href="https://github.com/felipemachucaruiz/flowp-mobile/archive/refs/heads/main.zip" 
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex"
                        >
                          <Button variant="outline" data-testid="button-download-mobile-source">
                            <Download className="w-4 h-4 mr-2" />
                            {t("downloads.download_mobile_source")}
                          </Button>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                {!printBridge.isElectronApp() && (
                  <>
                    <Separator />

                    <div className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                          <Printer className="w-6 h-6 text-blue-500" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold">PrintBridge</h3>
                          <p className="text-sm text-muted-foreground mb-3">
                            {t("downloads.printbridge_desc")}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <a 
                              href="/printbridge/simple.zip" 
                              download="PrintBridge-Windows.zip"
                              className="inline-flex"
                            >
                              <Button variant="outline" data-testid="button-download-printbridge-win">
                                <Download className="w-4 h-4 mr-2" />
                                {t("downloads.download_windows")}
                              </Button>
                            </a>
                            <a 
                              href="/printbridge/mac.zip" 
                              download="PrintBridge-Mac.zip"
                              className="inline-flex"
                            >
                              <Button variant="outline" data-testid="button-download-printbridge-mac">
                                <Download className="w-4 h-4 mr-2" />
                                {t("downloads.download_mac")}
                              </Button>
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {!printBridge.isElectronApp() && (
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium text-sm mb-2">{t("downloads.instructions_title")}</h4>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>{t("downloads.instruction_1")}</li>
                    <li>{t("downloads.instruction_2")}</li>
                    <li>{t("downloads.instruction_3")}</li>
                    <li>{t("downloads.instruction_4")}</li>
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* My Notifications Tab - Available to all users */}
        <TabsContent value="notifications" className="mt-6 space-y-6">
          <EmailNotificationPreferences />
        </TabsContent>

        {/* Email Templates Tab - Admin/Owner only */}
        <TabsContent value="emails" className="mt-6 space-y-6">
          <EmailTemplateEditor />
        </TabsContent>

        {/* E-Billing Settings */}
        <TabsContent value="ebilling" className="mt-6 space-y-6">
          <EBillingSettings />
        </TabsContent>

        {/* Shopify Integration */}
        <TabsContent value="shopify" className="mt-6 space-y-6">
          <ShopifySettings />
        </TabsContent>

        {/* WhatsApp Integration */}
        <TabsContent value="whatsapp" className="mt-6 space-y-6">
          <WhatsAppSettings />
        </TabsContent>

        {/* Registers */}
        <TabsContent value="registers" className="mt-6 space-y-6">
          <RegistersSettings />
        </TabsContent>

        {/* Add-ons */}
        <TabsContent value="addons" className="mt-6 space-y-6">
          <AddonsSettings />
        </TabsContent>

        {/* Others / Otros */}
        <TabsContent value="otros" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.store_hours")}</CardTitle>
              <CardDescription>{t("settings.store_hours_description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">{t("settings.store_hours_enabled")}</Label>
                </div>
                <Switch
                  checked={(tenant as any)?.storeHoursEnabled ?? false}
                  onCheckedChange={(checked) => { autoLockMutation.mutate({ storeHoursEnabled: checked } as any); }}
                  disabled={autoLockMutation.isPending}
                  data-testid="switch-store-hours-enabled"
                />
              </div>
              {(tenant as any)?.storeHoursEnabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("settings.store_open_time")}</Label>
                    <Input
                      type="time"
                      value={(tenant as any)?.storeOpenTime || "08:00"}
                      onChange={(e) => { autoLockMutation.mutate({ storeOpenTime: e.target.value } as any); }}
                      data-testid="input-store-open-time"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("settings.store_close_time")}</Label>
                    <Input
                      type="time"
                      value={(tenant as any)?.storeCloseTime || "18:00"}
                      onChange={(e) => { autoLockMutation.mutate({ storeCloseTime: e.target.value } as any); }}
                      data-testid="input-store-close-time"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("settings.auto_lock")}</CardTitle>
              <CardDescription>{t("settings.auto_lock_description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">{t("settings.auto_lock_enabled")}</Label>
                  <p className="text-sm text-muted-foreground">{t("settings.auto_lock_requires_pin")}</p>
                </div>
                <Switch
                  checked={(tenant as any)?.autoLockEnabled ?? false}
                  onCheckedChange={(checked) => { autoLockMutation.mutate({ autoLockEnabled: checked }); }}
                  disabled={autoLockMutation.isPending}
                  data-testid="switch-auto-lock-enabled"
                />
              </div>
              {(tenant as any)?.autoLockEnabled && (
                <div className="flex items-center gap-4">
                  <Label className="whitespace-nowrap">{t("settings.auto_lock_timeout")}</Label>
                  <Select
                    value={String((tenant as any)?.autoLockTimeout || 5)}
                    onValueChange={(val) => { autoLockMutation.mutate({ autoLockTimeout: parseInt(val) }); }}
                  >
                    <SelectTrigger className="w-32" data-testid="select-auto-lock-timeout">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="15">15</SelectItem>
                      <SelectItem value="30">30</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* My Plan */}
        <TabsContent value="myplan" className="mt-6 space-y-6">
          <MyPlanTab />
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
                        <Input {...field} type="number" step="0.01" onFocus={(e) => e.target.select()} data-testid="input-product-price" />
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
                        <Input {...field} type="number" step="0.01" placeholder={t("products.cost_placeholder")} onFocus={(e) => e.target.select()} data-testid="input-product-cost" />
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
                        onFocus={(e) => e.target.select()}
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
                          <SelectItem value="owner">{t("form.role_owner")}</SelectItem>
                          <SelectItem value="admin">{t("form.role_admin")}</SelectItem>
                          <SelectItem value="manager">{t("form.role_manager")}</SelectItem>
                          <SelectItem value="cashier">{t("form.role_cashier")}</SelectItem>
                          <SelectItem value="kitchen">{t("form.role_kitchen")}</SelectItem>
                          <SelectItem value="inventory">{t("form.role_inventory")}</SelectItem>
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
                      <FormLabel>{t("settings.pin_optional")}</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          maxLength={6} 
                          placeholder={t("settings.pin_placeholder")}
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
    </div>
  );
}
