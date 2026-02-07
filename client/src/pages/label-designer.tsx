import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import type { Product } from "@shared/schema";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import {
  Printer,
  Plus,
  Trash2,
  Move,
  Type,
  Image,
  QrCode,
  Barcode,
  DollarSign,
  Hash,
  Search,
  Save,
  FolderOpen,
  Eye,
  GripVertical,
  X,
  Minus,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";

type BarcodeFormat = "CODE128" | "CODE39" | "EAN13" | "EAN8" | "UPC" | "QR";

interface LabelElement {
  id: string;
  type: "logo" | "productName" | "price" | "sku" | "barcode" | "customText";
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  barcodeFormat?: BarcodeFormat;
  customText?: string;
  logoUrl?: string;
}

interface LabelTemplate {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
}

interface SelectedProduct {
  product: Product;
  quantity: number;
}

const LABEL_PRESETS = [
  { name: "40 x 30 mm", width: 40, height: 30 },
  { name: "50 x 25 mm", width: 50, height: 25 },
  { name: "50 x 30 mm", width: 50, height: 30 },
  { name: "60 x 40 mm", width: 60, height: 40 },
  { name: "70 x 50 mm", width: 70, height: 50 },
  { name: "100 x 50 mm", width: 100, height: 50 },
];

const MM_TO_PX = 3.78;
const GRID_SIZE = 2;

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function getElementLabel(type: LabelElement["type"], t: (key: any) => string): string {
  switch (type) {
    case "logo": return t("labels.element_logo");
    case "productName": return t("labels.element_name");
    case "price": return t("labels.element_price");
    case "sku": return t("labels.element_sku");
    case "barcode": return t("labels.element_barcode");
    case "customText": return t("labels.element_custom_text");
    default: return type;
  }
}

function BarcodeCanvas({ value, format, width, height }: { value: string; format: BarcodeFormat; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    if (!value) return;

    if (format === "QR") {
      QRCode.toDataURL(value, {
        width: Math.min(width, height),
        margin: 0,
        color: { dark: "#000000", light: "#ffffff" },
      }).then(setQrDataUrl).catch(() => setQrDataUrl(""));
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      JsBarcode(canvas, value, {
        format: format,
        width: Math.max(1, width / (value.length * 8)),
        height: Math.max(10, height - 14),
        displayValue: true,
        fontSize: Math.max(8, Math.min(12, height * 0.2)),
        margin: 0,
        textMargin: 1,
      });
    } catch {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ef4444";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Invalid", canvas.width / 2, canvas.height / 2);
      }
    }
  }, [value, format, width, height]);

  if (format === "QR") {
    return qrDataUrl ? (
      <img src={qrDataUrl} alt="QR" style={{ width: Math.min(width, height), height: Math.min(width, height), objectFit: "contain" }} />
    ) : (
      <div className="flex items-center justify-center text-muted-foreground text-xs" style={{ width, height }}>QR</div>
    );
  }

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", objectFit: "contain" }} />;
}

function DraggableElement({
  element,
  isSelected,
  onSelect,
  onMove,
  onResize,
  canvasScale,
  sampleText,
  logoUrl,
}: {
  element: LabelElement;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (dx: number, dy: number) => void;
  onResize: (dw: number, dh: number) => void;
  canvasScale: number;
  sampleText: string;
  logoUrl?: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    setIsDragging(true);
    startRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [onSelect]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isDragging) {
      const dx = (e.clientX - startRef.current.x) / canvasScale;
      const dy = (e.clientY - startRef.current.y) / canvasScale;
      startRef.current = { x: e.clientX, y: e.clientY };
      onMove(dx, dy);
    } else if (isResizing) {
      const dx = (e.clientX - startRef.current.x) / canvasScale;
      const dy = (e.clientY - startRef.current.y) / canvasScale;
      startRef.current = { x: e.clientX, y: e.clientY };
      onResize(dx, dy);
    }
  }, [isDragging, isResizing, canvasScale, onMove, onResize]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  const handleResizeDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    setIsResizing(true);
    startRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [onSelect]);

  const renderContent = () => {
    const w = element.width * MM_TO_PX;
    const h = element.height * MM_TO_PX;
    const fontSize = (element.fontSize || 10) * (canvasScale > 0.5 ? 1 : 1.5);

    switch (element.type) {
      case "logo":
        return logoUrl ? (
          <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted/50 border border-dashed border-muted-foreground/30 rounded-sm">
            <Image className="w-4 h-4 text-muted-foreground" />
          </div>
        );
      case "productName":
        return (
          <div className="w-full h-full overflow-hidden flex items-center" style={{ fontSize, fontWeight: element.fontWeight || "bold", textAlign: element.textAlign || "left" }}>
            <span className="truncate w-full" style={{ textAlign: element.textAlign || "left", display: "block" }}>{sampleText || "Product Name"}</span>
          </div>
        );
      case "price":
        return (
          <div className="w-full h-full overflow-hidden flex items-center" style={{ fontSize, fontWeight: element.fontWeight || "bold", textAlign: element.textAlign || "left" }}>
            <span className="truncate w-full" style={{ textAlign: element.textAlign || "left", display: "block" }}>$9,900</span>
          </div>
        );
      case "sku":
        return (
          <div className="w-full h-full overflow-hidden flex items-center" style={{ fontSize: fontSize * 0.85, fontWeight: element.fontWeight || "normal", textAlign: element.textAlign || "left" }}>
            <span className="truncate w-full" style={{ textAlign: element.textAlign || "left", display: "block" }}>SKU-001</span>
          </div>
        );
      case "barcode":
        return <BarcodeCanvas value="123456789012" format={element.barcodeFormat || "CODE128"} width={w} height={h} />;
      case "customText":
        return (
          <div className="w-full h-full overflow-hidden flex items-center" style={{ fontSize, fontWeight: element.fontWeight || "normal", textAlign: element.textAlign || "center" }}>
            <span className="truncate w-full" style={{ textAlign: element.textAlign || "center", display: "block" }}>{element.customText || "Text"}</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      data-testid={`label-element-${element.id}`}
      className={`absolute cursor-move select-none ${isSelected ? "ring-2 ring-primary ring-offset-1" : "ring-1 ring-transparent hover:ring-muted-foreground/40"}`}
      style={{
        left: element.x * MM_TO_PX,
        top: element.y * MM_TO_PX,
        width: element.width * MM_TO_PX,
        height: element.height * MM_TO_PX,
        zIndex: isSelected ? 10 : 1,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {renderContent()}
      {isSelected && (
        <div
          className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-full cursor-se-resize"
          onPointerDown={handleResizeDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      )}
    </div>
  );
}

function PrintPreview({
  template,
  selectedProducts,
  formatCurrency,
  logoUrl,
  t,
}: {
  template: LabelTemplate;
  selectedProducts: SelectedProduct[];
  formatCurrency: (n: number) => string;
  logoUrl?: string;
  t: (key: any) => string;
}) {
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const [qrUrls, setQrUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const newQrUrls = new Map<string, string>();
    const promises: Promise<void>[] = [];

    selectedProducts.forEach(({ product }) => {
      template.elements.forEach((el) => {
        if (el.type === "barcode") {
          const barcodeValue = product.barcode || product.sku || String(product.id);
          if (el.barcodeFormat === "QR") {
            const key = `${product.id}-${el.id}`;
            const p = QRCode.toDataURL(barcodeValue, {
              width: Math.min(el.width, el.height) * MM_TO_PX,
              margin: 0,
            }).then(url => { newQrUrls.set(key, url); }).catch(() => {});
            promises.push(p);
          }
        }
      });
    });

    Promise.all(promises).then(() => setQrUrls(newQrUrls));
  }, [selectedProducts, template.elements]);

  useEffect(() => {
    selectedProducts.forEach(({ product }) => {
      template.elements.forEach((el) => {
        if (el.type === "barcode" && el.barcodeFormat !== "QR") {
          const key = `${product.id}-${el.id}`;
          const canvas = canvasRefs.current.get(key);
          if (!canvas) return;
          const barcodeValue = product.barcode || product.sku || String(product.id);
          try {
            JsBarcode(canvas, barcodeValue, {
              format: el.barcodeFormat || "CODE128",
              width: 1.5,
              height: Math.max(10, el.height * MM_TO_PX - 14),
              displayValue: true,
              fontSize: 9,
              margin: 0,
              textMargin: 1,
            });
          } catch {}
        }
      });
    });
  }, [selectedProducts, template.elements]);

  return (
    <div className="print-labels space-y-1">
      {selectedProducts.flatMap(({ product, quantity }) =>
        Array.from({ length: quantity }, (_, i) => (
          <div
            key={`${product.id}-${i}`}
            className="label-single relative bg-white text-black overflow-hidden"
            style={{
              width: `${template.widthMm}mm`,
              height: `${template.heightMm}mm`,
              pageBreakInside: "avoid",
            }}
          >
            {template.elements.map((el) => {
              const barcodeValue = product.barcode || product.sku || String(product.id);
              const key = `${product.id}-${el.id}`;
              return (
                <div
                  key={el.id}
                  className="absolute overflow-hidden"
                  style={{
                    left: `${el.x}mm`,
                    top: `${el.y}mm`,
                    width: `${el.width}mm`,
                    height: `${el.height}mm`,
                  }}
                >
                  {el.type === "logo" && logoUrl && (
                    <img src={logoUrl} alt="" className="w-full h-full object-contain" />
                  )}
                  {el.type === "productName" && (
                    <div className="w-full h-full flex items-center overflow-hidden" style={{ fontSize: `${el.fontSize || 10}px`, fontWeight: el.fontWeight || "bold", textAlign: el.textAlign || "left" }}>
                      <span className="truncate w-full" style={{ textAlign: el.textAlign, display: "block" }}>{product.name}</span>
                    </div>
                  )}
                  {el.type === "price" && (
                    <div className="w-full h-full flex items-center overflow-hidden" style={{ fontSize: `${el.fontSize || 10}px`, fontWeight: el.fontWeight || "bold", textAlign: el.textAlign || "left" }}>
                      <span className="truncate w-full" style={{ textAlign: el.textAlign, display: "block" }}>{formatCurrency(Number(product.price))}</span>
                    </div>
                  )}
                  {el.type === "sku" && (
                    <div className="w-full h-full flex items-center overflow-hidden" style={{ fontSize: `${(el.fontSize || 10) * 0.85}px`, fontWeight: el.fontWeight || "normal", textAlign: el.textAlign || "left" }}>
                      <span className="truncate w-full" style={{ textAlign: el.textAlign, display: "block" }}>{product.sku || "-"}</span>
                    </div>
                  )}
                  {el.type === "barcode" && el.barcodeFormat === "QR" && qrUrls.get(key) && (
                    <img src={qrUrls.get(key)} alt="QR" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  )}
                  {el.type === "barcode" && el.barcodeFormat !== "QR" && (
                    <canvas
                      ref={(c) => { if (c) canvasRefs.current.set(key, c); }}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  )}
                  {el.type === "customText" && (
                    <div className="w-full h-full flex items-center overflow-hidden" style={{ fontSize: `${el.fontSize || 10}px`, fontWeight: el.fontWeight || "normal", textAlign: el.textAlign || "center" }}>
                      <span className="truncate w-full" style={{ textAlign: el.textAlign, display: "block" }}>{el.customText || ""}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

export default function LabelDesignerPage() {
  const { tenant } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();

  const formatCurrency = (amount: number) => {
    const currency = tenant?.currency || "USD";
    const localeMap: Record<string, string> = { COP: "es-CO", MXN: "es-MX", USD: "en-US", EUR: "de-DE", BRL: "pt-BR" };
    const locale = localeMap[currency] || "en-US";
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    } catch {
      return `${currency} ${amount.toLocaleString()}`;
    }
  };

  const [template, setTemplate] = useState<LabelTemplate>({
    id: generateId(),
    name: t("labels.untitled_template"),
    widthMm: 50,
    heightMm: 30,
    elements: [],
  });

  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [activeTab, setActiveTab] = useState("design");
  const [showPreview, setShowPreview] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<LabelTemplate[]>(() => {
    try {
      const saved = localStorage.getItem("flowp_label_templates");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [customTextInput, setCustomTextInput] = useState("");
  const [logoUrl, setLogoUrl] = useState<string>("");

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasScale, setCanvasScale] = useState(1);

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  useEffect(() => {
    if (tenant?.receiptLogo) {
      setLogoUrl(tenant.receiptLogo);
    } else if (tenant?.logo) {
      setLogoUrl(tenant.logo);
    }
  }, [tenant]);

  useEffect(() => {
    const updateScale = () => {
      if (!canvasRef.current) return;
      const container = canvasRef.current.parentElement;
      if (!container) return;
      const containerWidth = container.clientWidth - 32;
      const containerHeight = container.clientHeight - 32;
      const labelWidth = template.widthMm * MM_TO_PX;
      const labelHeight = template.heightMm * MM_TO_PX;
      const scaleX = containerWidth / labelWidth;
      const scaleY = containerHeight / labelHeight;
      setCanvasScale(Math.min(scaleX, scaleY, 3));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [template.widthMm, template.heightMm]);

  const selectedElement = template.elements.find(el => el.id === selectedElementId) || null;

  const addElement = (type: LabelElement["type"]) => {
    const defaults: Record<string, Partial<LabelElement>> = {
      logo: { width: 12, height: 10 },
      productName: { width: 30, height: 6, fontSize: 10, fontWeight: "bold" },
      price: { width: 20, height: 6, fontSize: 12, fontWeight: "bold" },
      sku: { width: 20, height: 5, fontSize: 8 },
      barcode: { width: 30, height: 12, barcodeFormat: "CODE128" },
      customText: { width: 20, height: 5, fontSize: 9 },
    };
    const d = defaults[type] || {};
    const newEl: LabelElement = {
      id: generateId(),
      type,
      x: 2,
      y: 2,
      width: d.width || 20,
      height: d.height || 8,
      fontSize: d.fontSize,
      fontWeight: d.fontWeight,
      textAlign: "left",
      barcodeFormat: d.barcodeFormat,
      customText: type === "customText" ? (customTextInput || "Text") : undefined,
    };
    setTemplate(prev => ({ ...prev, elements: [...prev.elements, newEl] }));
    setSelectedElementId(newEl.id);
  };

  const moveElement = useCallback((id: string, dx: number, dy: number) => {
    setTemplate(prev => ({
      ...prev,
      elements: prev.elements.map(el => {
        if (el.id !== id) return el;
        const newX = snapToGrid(Math.max(0, Math.min(prev.widthMm - el.width, el.x + dx)));
        const newY = snapToGrid(Math.max(0, Math.min(prev.heightMm - el.height, el.y + dy)));
        return { ...el, x: newX, y: newY };
      }),
    }));
  }, []);

  const resizeElement = useCallback((id: string, dw: number, dh: number) => {
    setTemplate(prev => ({
      ...prev,
      elements: prev.elements.map(el => {
        if (el.id !== id) return el;
        const newW = snapToGrid(Math.max(4, Math.min(prev.widthMm - el.x, el.width + dw)));
        const newH = snapToGrid(Math.max(4, Math.min(prev.heightMm - el.y, el.height + dh)));
        return { ...el, width: newW, height: newH };
      }),
    }));
  }, []);

  const removeElement = (id: string) => {
    setTemplate(prev => ({ ...prev, elements: prev.elements.filter(el => el.id !== id) }));
    if (selectedElementId === id) setSelectedElementId(null);
  };

  const updateElement = (id: string, updates: Partial<LabelElement>) => {
    setTemplate(prev => ({
      ...prev,
      elements: prev.elements.map(el => (el.id === id ? { ...el, ...updates } : el)),
    }));
  };

  const saveTemplate = () => {
    const existing = savedTemplates.findIndex(t => t.id === template.id);
    let updated: LabelTemplate[];
    if (existing >= 0) {
      updated = [...savedTemplates];
      updated[existing] = template;
    } else {
      updated = [...savedTemplates, template];
    }
    setSavedTemplates(updated);
    localStorage.setItem("flowp_label_templates", JSON.stringify(updated));
    toast({ title: t("labels.template_saved"), description: template.name });
  };

  const loadTemplate = (tmpl: LabelTemplate) => {
    setTemplate(tmpl);
    setSelectedElementId(null);
    setLoadDialogOpen(false);
  };

  const deleteTemplate = (id: string) => {
    const updated = savedTemplates.filter(t => t.id !== id);
    setSavedTemplates(updated);
    localStorage.setItem("flowp_label_templates", JSON.stringify(updated));
  };

  const handlePrint = () => {
    if (selectedProducts.length === 0) {
      toast({ title: t("labels.no_products_selected"), variant: "destructive" });
      return;
    }
    setShowPreview(true);
    setTimeout(() => window.print(), 300);
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku || "").toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.barcode || "").toLowerCase().includes(productSearch.toLowerCase())
  );

  const toggleProduct = (product: Product) => {
    setSelectedProducts(prev => {
      const exists = prev.find(sp => sp.product.id === product.id);
      if (exists) return prev.filter(sp => sp.product.id !== product.id);
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string | number, quantity: number) => {
    setSelectedProducts(prev =>
      prev.map(sp => (String(sp.product.id) === String(productId) ? { ...sp, quantity: Math.max(1, quantity) } : sp))
    );
  };

  const totalLabels = selectedProducts.reduce((sum, sp) => sum + sp.quantity, 0);

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-labels, .print-labels * { visibility: visible !important; }
          .print-labels {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: auto !important;
            background: white !important;
          }
          .label-single {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          @page {
            size: ${template.widthMm}mm ${template.heightMm}mm;
            margin: 0;
          }
        }
      `}</style>

      <div className="h-full flex flex-col overflow-hidden print:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <Barcode className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">{t("labels.title")}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLoadDialogOpen(true)} data-testid="button-load-template">
              <FolderOpen className="w-4 h-4 mr-1" />
              {t("labels.load")}
            </Button>
            <Button variant="outline" size="sm" onClick={saveTemplate} data-testid="button-save-template">
              <Save className="w-4 h-4 mr-1" />
              {t("labels.save")}
            </Button>
            <Button size="sm" onClick={handlePrint} disabled={selectedProducts.length === 0} data-testid="button-print-labels">
              <Printer className="w-4 h-4 mr-1" />
              {t("labels.print")} {totalLabels > 0 && `(${totalLabels})`}
            </Button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-64 border-r flex flex-col shrink-0 overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
              <TabsList className="mx-2 mt-2 shrink-0">
                <TabsTrigger value="design" data-testid="tab-design">{t("labels.design")}</TabsTrigger>
                <TabsTrigger value="products" data-testid="tab-products">{t("labels.products_tab")}</TabsTrigger>
              </TabsList>

              <TabsContent value="design" className="flex-1 overflow-auto px-3 pb-3 mt-0">
                <div className="space-y-4 pt-3">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">{t("labels.template_name")}</Label>
                    <Input
                      value={template.name}
                      onChange={e => setTemplate(prev => ({ ...prev, name: e.target.value }))}
                      className="mt-1"
                      data-testid="input-template-name"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">{t("labels.label_size")}</Label>
                    <Select
                      value={`${template.widthMm}x${template.heightMm}`}
                      onValueChange={(v) => {
                        const [w, h] = v.split("x").map(Number);
                        setTemplate(prev => ({ ...prev, widthMm: w, heightMm: h }));
                      }}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-label-size">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LABEL_PRESETS.map(p => (
                          <SelectItem key={`${p.width}x${p.height}`} value={`${p.width}x${p.height}`}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2 mt-2">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">{t("labels.width_mm")}</Label>
                        <Input
                          type="number"
                          min={10}
                          max={200}
                          value={template.widthMm}
                          onChange={e => setTemplate(prev => ({ ...prev, widthMm: Number(e.target.value) || 50 }))}
                          data-testid="input-label-width"
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">{t("labels.height_mm")}</Label>
                        <Input
                          type="number"
                          min={10}
                          max={200}
                          value={template.heightMm}
                          onChange={e => setTemplate(prev => ({ ...prev, heightMm: Number(e.target.value) || 30 }))}
                          data-testid="input-label-height"
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">{t("labels.add_elements")}</Label>
                    <div className="grid grid-cols-2 gap-1.5 mt-2">
                      <Button variant="outline" size="sm" onClick={() => addElement("logo")} data-testid="button-add-logo">
                        <Image className="w-3.5 h-3.5 mr-1" /> {t("labels.logo")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => addElement("productName")} data-testid="button-add-name">
                        <Type className="w-3.5 h-3.5 mr-1" /> {t("labels.name")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => addElement("price")} data-testid="button-add-price">
                        <DollarSign className="w-3.5 h-3.5 mr-1" /> {t("labels.price")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => addElement("sku")} data-testid="button-add-sku">
                        <Hash className="w-3.5 h-3.5 mr-1" /> SKU
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => addElement("barcode")} data-testid="button-add-barcode">
                        <Barcode className="w-3.5 h-3.5 mr-1" /> {t("labels.barcode")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => addElement("customText")} data-testid="button-add-text">
                        <Type className="w-3.5 h-3.5 mr-1" /> {t("labels.text")}
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  {selectedElement && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">{getElementLabel(selectedElement.type, t)}</Label>
                        <Button variant="ghost" size="icon" onClick={() => removeElement(selectedElement.id)} data-testid="button-remove-element">
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">X (mm)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={template.widthMm}
                            value={Math.round(selectedElement.x)}
                            onChange={e => updateElement(selectedElement.id, { x: Number(e.target.value) })}
                            data-testid="input-element-x"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Y (mm)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={template.heightMm}
                            value={Math.round(selectedElement.y)}
                            onChange={e => updateElement(selectedElement.id, { y: Number(e.target.value) })}
                            data-testid="input-element-y"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("labels.width_mm")}</Label>
                          <Input
                            type="number"
                            min={4}
                            max={template.widthMm}
                            value={Math.round(selectedElement.width)}
                            onChange={e => updateElement(selectedElement.id, { width: Number(e.target.value) })}
                            data-testid="input-element-width"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("labels.height_mm")}</Label>
                          <Input
                            type="number"
                            min={4}
                            max={template.heightMm}
                            value={Math.round(selectedElement.height)}
                            onChange={e => updateElement(selectedElement.id, { height: Number(e.target.value) })}
                            data-testid="input-element-height"
                          />
                        </div>
                      </div>

                      {selectedElement.type !== "logo" && selectedElement.type !== "barcode" && (
                        <>
                          <div>
                            <Label className="text-xs text-muted-foreground">{t("labels.font_size")}</Label>
                            <Input
                              type="number"
                              min={6}
                              max={36}
                              value={selectedElement.fontSize || 10}
                              onChange={e => updateElement(selectedElement.id, { fontSize: Number(e.target.value) })}
                              data-testid="input-font-size"
                            />
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant={selectedElement.fontWeight === "bold" ? "default" : "outline"}
                              size="sm"
                              onClick={() => updateElement(selectedElement.id, { fontWeight: selectedElement.fontWeight === "bold" ? "normal" : "bold" })}
                              data-testid="button-toggle-bold"
                            >
                              B
                            </Button>
                            <Button
                              variant={selectedElement.textAlign === "left" ? "default" : "outline"}
                              size="sm"
                              onClick={() => updateElement(selectedElement.id, { textAlign: "left" })}
                              data-testid="button-align-left"
                            >
                              {t("labels.left")}
                            </Button>
                            <Button
                              variant={selectedElement.textAlign === "center" ? "default" : "outline"}
                              size="sm"
                              onClick={() => updateElement(selectedElement.id, { textAlign: "center" })}
                              data-testid="button-align-center"
                            >
                              {t("labels.center")}
                            </Button>
                            <Button
                              variant={selectedElement.textAlign === "right" ? "default" : "outline"}
                              size="sm"
                              onClick={() => updateElement(selectedElement.id, { textAlign: "right" })}
                              data-testid="button-align-right"
                            >
                              {t("labels.right")}
                            </Button>
                          </div>
                        </>
                      )}

                      {selectedElement.type === "barcode" && (
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("labels.barcode_type")}</Label>
                          <Select
                            value={selectedElement.barcodeFormat || "CODE128"}
                            onValueChange={v => updateElement(selectedElement.id, { barcodeFormat: v as BarcodeFormat })}
                          >
                            <SelectTrigger data-testid="select-barcode-format">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CODE128">Code 128</SelectItem>
                              <SelectItem value="CODE39">Code 39</SelectItem>
                              <SelectItem value="EAN13">EAN-13</SelectItem>
                              <SelectItem value="EAN8">EAN-8</SelectItem>
                              <SelectItem value="UPC">UPC-A</SelectItem>
                              <SelectItem value="QR">QR Code</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {selectedElement.type === "customText" && (
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("labels.custom_text")}</Label>
                          <Input
                            value={selectedElement.customText || ""}
                            onChange={e => updateElement(selectedElement.id, { customText: e.target.value })}
                            data-testid="input-custom-text"
                          />
                        </div>
                      )}

                      {selectedElement.type === "logo" && (
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("labels.logo_url")}</Label>
                          <Input
                            value={logoUrl}
                            onChange={e => setLogoUrl(e.target.value)}
                            placeholder={t("labels.logo_url_placeholder")}
                            data-testid="input-logo-url"
                          />
                          {tenant?.receiptLogo && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-1 w-full"
                              onClick={() => setLogoUrl(tenant.receiptLogo!)}
                              data-testid="button-use-receipt-logo"
                            >
                              {t("labels.use_receipt_logo")}
                            </Button>
                          )}
                          {tenant?.logo && tenant.logo !== tenant.receiptLogo && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-1 w-full"
                              onClick={() => setLogoUrl(tenant.logo!)}
                              data-testid="button-use-company-logo"
                            >
                              {t("labels.use_company_logo")}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {!selectedElement && template.elements.length > 0 && (
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">{t("labels.elements_list")}</Label>
                      <div className="mt-1 space-y-1">
                        {template.elements.map(el => (
                          <div
                            key={el.id}
                            className="flex items-center justify-between gap-1 px-2 py-1 rounded-md hover-elevate cursor-pointer"
                            onClick={() => setSelectedElementId(el.id)}
                            data-testid={`element-list-item-${el.id}`}
                          >
                            <span className="text-xs truncate">{getElementLabel(el.type, t)}</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); removeElement(el.id); }}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="products" className="flex-1 overflow-hidden px-3 pb-3 mt-0">
                <div className="flex flex-col h-full pt-3">
                  <div className="relative shrink-0">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                      placeholder={t("labels.search_products")}
                      className="pl-8"
                      data-testid="input-search-products"
                    />
                  </div>

                  {selectedProducts.length > 0 && (
                    <div className="mt-2 shrink-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("labels.selected")} ({selectedProducts.length})
                        </span>
                        <Badge variant="secondary">{totalLabels} {t("labels.labels_count")}</Badge>
                      </div>
                      <div className="space-y-1 mt-1 max-h-32 overflow-auto">
                        {selectedProducts.map(sp => (
                          <div key={sp.product.id} className="flex items-center gap-1 text-xs" data-testid={`selected-product-${sp.product.id}`}>
                            <span className="truncate flex-1">{sp.product.name}</span>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => updateQuantity(sp.product.id, sp.quantity - 1)}>
                                <Minus className="w-3 h-3" />
                              </Button>
                              <Input
                                type="number"
                                min={1}
                                value={sp.quantity}
                                onChange={e => updateQuantity(sp.product.id, Number(e.target.value))}
                                className="w-10 h-5 text-center text-xs p-0"
                              />
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => updateQuantity(sp.product.id, sp.quantity + 1)}>
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => toggleProduct(sp.product)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Separator className="mt-2" />
                    </div>
                  )}

                  <ScrollArea className="flex-1 mt-2">
                    {productsLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {filteredProducts.map(product => {
                          const isSelected = selectedProducts.some(sp => sp.product.id === product.id);
                          return (
                            <div
                              key={product.id}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover-elevate ${isSelected ? "bg-primary/10" : ""}`}
                              onClick={() => toggleProduct(product)}
                              data-testid={`product-item-${product.id}`}
                            >
                              <Checkbox checked={isSelected} className="shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{product.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {product.sku || "-"} | {formatCurrency(Number(product.price))}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                        {filteredProducts.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-4">{t("labels.no_products_found")}</p>
                        )}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-muted/30" onClick={() => setSelectedElementId(null)}>
            <div
              ref={canvasRef}
              className="relative bg-white border-2 border-dashed border-muted-foreground/30 shadow-sm"
              style={{
                width: template.widthMm * MM_TO_PX,
                height: template.heightMm * MM_TO_PX,
                transform: `scale(${canvasScale})`,
                transformOrigin: "center center",
              }}
              onClick={e => e.stopPropagation()}
              data-testid="label-canvas"
            >
              <div
                className="absolute inset-0 pointer-events-none opacity-10"
                style={{
                  backgroundImage: `
                    linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)
                  `,
                  backgroundSize: `${GRID_SIZE * MM_TO_PX}px ${GRID_SIZE * MM_TO_PX}px`,
                }}
              />

              {template.elements.map(el => (
                <DraggableElement
                  key={el.id}
                  element={el}
                  isSelected={selectedElementId === el.id}
                  onSelect={() => setSelectedElementId(el.id)}
                  onMove={(dx, dy) => moveElement(el.id, dx, dy)}
                  onResize={(dw, dh) => resizeElement(el.id, dw, dh)}
                  canvasScale={canvasScale}
                  sampleText="Product Name"
                  logoUrl={logoUrl}
                />
              ))}

              {template.elements.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
                  <div className="text-center">
                    <Move className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">{t("labels.empty_canvas")}</p>
                    <p className="text-xs">{t("labels.add_elements_hint")}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-50 bg-background/80 flex flex-col print:bg-transparent print:static">
          <div className="flex items-center justify-between p-3 border-b print:hidden">
            <h2 className="font-semibold">{t("labels.print_preview")}</h2>
            <Button variant="ghost" size="icon" onClick={() => setShowPreview(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-4 flex justify-center">
            <PrintPreview
              template={template}
              selectedProducts={selectedProducts}
              formatCurrency={formatCurrency}
              logoUrl={logoUrl}
              t={t}
            />
          </div>
          <div className="flex items-center justify-center gap-2 p-3 border-t print:hidden">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => window.print()} data-testid="button-confirm-print">
              <Printer className="w-4 h-4 mr-1" />
              {t("labels.print")}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("labels.load_template")}</DialogTitle>
          </DialogHeader>
          {savedTemplates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t("labels.no_saved_templates")}</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-auto">
              {savedTemplates.map(tmpl => (
                <div key={tmpl.id} className="flex items-center justify-between gap-2 p-2 rounded-md border" data-testid={`template-${tmpl.id}`}>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadTemplate(tmpl)}>
                    <p className="text-sm font-medium truncate">{tmpl.name}</p>
                    <p className="text-xs text-muted-foreground">{tmpl.widthMm}x{tmpl.heightMm}mm | {tmpl.elements.length} {t("labels.elements")}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteTemplate(tmpl.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
