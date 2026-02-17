import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Plus, Trash2, FileText, Send, Loader2 } from "lucide-react";
import { Link } from "wouter";
import type { Supplier } from "@shared/schema";

interface LineItem {
  id: string;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
}

function createEmptyItem(): LineItem {
  return {
    id: crypto.randomUUID(),
    code: "",
    description: "",
    quantity: 1,
    unitPrice: 0,
    taxPercent: 0,
  };
}

export default function SupportDocumentPage() {
  const { tenant, user } = useAuth();
  const { t, language } = useI18n();
  const { toast } = useToast();
  const tenantId = tenant?.id || user?.tenantId || "";

  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierIdType, setSupplierIdType] = useState("cc");
  const [supplierIdNumber, setSupplierIdNumber] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([createEmptyItem()]);

  const getAuthHeaders = () => {
    const headers: Record<string, string> = { "x-tenant-id": tenantId };
    if (user?.id) headers["x-user-id"] = user.id;
    return headers;
  };

  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
    enabled: !!tenantId,
  });

  const handleSelectSupplier = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
    if (supplierId === "manual") {
      setSupplierName("");
      setSupplierIdType("cc");
      setSupplierIdNumber("");
      setSupplierEmail("");
      setSupplierPhone("");
      setSupplierAddress("");
      return;
    }
    const supplier = suppliers?.find(s => s.id === supplierId);
    if (supplier) {
      setSupplierName(supplier.name);
      setSupplierIdType(supplier.documentType || "cc");
      setSupplierIdNumber(supplier.identification || supplier.taxId || "");
      setSupplierEmail(supplier.email || "");
      setSupplierPhone(supplier.phone || "");
      setSupplierAddress(supplier.address || "");
    }
  };

  const addItem = () => {
    setItems(prev => [...prev, createEmptyItem()]);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const updateItem = (id: string, field: keyof LineItem, value: string | number) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    for (const item of items) {
      const lineExt = Math.round(item.quantity * item.unitPrice * 100) / 100;
      subtotal += lineExt;
      taxTotal += Math.round(lineExt * item.taxPercent / 100 * 100) / 100;
    }
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      grandTotal: Math.round((subtotal + taxTotal) * 100) / 100,
    };
  }, [items]);

  const currency = tenant?.currency || "COP";
  const formatCurrency = (amount: number) => {
    const localeMap: Record<string, string> = { en: "en-US", es: "es-CO", pt: "pt-BR" };
    return new Intl.NumberFormat(localeMap[language] || "es-CO", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        supplier: {
          name: supplierName,
          idType: supplierIdType,
          idNumber: supplierIdNumber,
          email: supplierEmail,
          phone: supplierPhone,
          address: supplierAddress,
        },
        items: items.filter(i => i.description.trim()).map(item => ({
          code: item.code || undefined,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxPercent: item.taxPercent,
        })),
        notes,
        date: new Date().toISOString(),
      };

      const response = await fetch("/api/billing/matias/support-doc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to submit");
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: t("ebilling.supportDoc.success"),
        description: `${t("ebilling.supportDoc.success_number")}: ${data.documentNumber}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/matias/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/ebilling/documents"] });
      setItems([createEmptyItem()]);
      setSupplierName("");
      setSupplierIdNumber("");
      setSupplierEmail("");
      setSupplierPhone("");
      setSupplierAddress("");
      setNotes("");
      setSelectedSupplierId("");
    },
    onError: (error: Error) => {
      toast({
        title: t("ebilling.supportDoc.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!supplierName.trim() || !supplierIdNumber.trim()) {
      toast({
        title: t("ebilling.supportDoc.validation_error"),
        variant: "destructive",
      });
      return;
    }
    const validItems = items.filter(i => i.description.trim());
    if (validItems.length === 0) {
      toast({
        title: t("ebilling.supportDoc.no_items"),
        variant: "destructive",
      });
      return;
    }
    const hasInvalidItem = validItems.some(i => i.quantity <= 0 || i.unitPrice <= 0);
    if (hasInvalidItem) {
      toast({
        title: t("ebilling.supportDoc.validation_error"),
        variant: "destructive",
      });
      return;
    }
    submitMutation.mutate();
  };

  const idTypeOptions = [
    { value: "cc", label: t("ebilling.supportDoc.id_type_cc") },
    { value: "nit", label: t("ebilling.supportDoc.id_type_nit") },
    { value: "passport", label: t("ebilling.supportDoc.id_type_passport") },
    { value: "ce", label: t("ebilling.supportDoc.id_type_ce") },
    { value: "ti", label: t("ebilling.supportDoc.id_type_ti") },
  ];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6 h-full overflow-y-auto">
      <div className="flex items-center gap-3">
        <Link href="/electronic-billing">
          <Button variant="ghost" size="icon" data-testid="button-back-ebilling">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-support-doc-title">
            {t("ebilling.supportDoc.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("ebilling.supportDoc.subtitle")}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t("ebilling.supportDoc.supplier_section")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {suppliers && suppliers.length > 0 && (
            <div>
              <Label>{t("ebilling.supportDoc.select_supplier")}</Label>
              <Select value={selectedSupplierId} onValueChange={handleSelectSupplier}>
                <SelectTrigger data-testid="select-supplier">
                  <SelectValue placeholder={t("ebilling.supportDoc.select_supplier")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">{t("ebilling.supportDoc.or_manual")}</SelectItem>
                  {suppliers.filter(s => s.isActive).map(s => (
                    <SelectItem key={s.id} value={s.id} data-testid={`option-supplier-${s.id}`}>
                      {s.name} {s.identification ? `(${s.identification})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{t("ebilling.supportDoc.supplier_name")} *</Label>
              <Input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                data-testid="input-supplier-name"
              />
            </div>
            <div>
              <Label>{t("ebilling.supportDoc.supplier_id_type")}</Label>
              <Select value={supplierIdType} onValueChange={setSupplierIdType}>
                <SelectTrigger data-testid="select-supplier-id-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {idTypeOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("ebilling.supportDoc.supplier_id_number")} *</Label>
              <Input
                value={supplierIdNumber}
                onChange={(e) => setSupplierIdNumber(e.target.value)}
                data-testid="input-supplier-id-number"
              />
            </div>
            <div>
              <Label>{t("ebilling.supportDoc.supplier_email")}</Label>
              <Input
                value={supplierEmail}
                onChange={(e) => setSupplierEmail(e.target.value)}
                type="email"
                data-testid="input-supplier-email"
              />
            </div>
            <div>
              <Label>{t("ebilling.supportDoc.supplier_phone")}</Label>
              <Input
                value={supplierPhone}
                onChange={(e) => setSupplierPhone(e.target.value)}
                data-testid="input-supplier-phone"
              />
            </div>
            <div>
              <Label>{t("ebilling.supportDoc.supplier_address")}</Label>
              <Input
                value={supplierAddress}
                onChange={(e) => setSupplierAddress(e.target.value)}
                data-testid="input-supplier-address"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
            <span>{t("ebilling.supportDoc.items_section")}</span>
            <Button onClick={addItem} variant="outline" size="sm" data-testid="button-add-item">
              <Plus className="h-4 w-4 mr-1" />
              {t("ebilling.supportDoc.add_item")}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, idx) => (
            <div key={item.id} className="border rounded-md p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  #{idx + 1}
                </span>
                {items.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(item.id)}
                    data-testid={`button-remove-item-${idx}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <div className="md:col-span-1">
                  <Label className="text-xs">{t("ebilling.supportDoc.item_code")}</Label>
                  <Input
                    value={item.code}
                    onChange={(e) => updateItem(item.id, "code", e.target.value)}
                    placeholder="001"
                    data-testid={`input-item-code-${idx}`}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">{t("ebilling.supportDoc.description")} *</Label>
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(item.id, "description", e.target.value)}
                    data-testid={`input-item-description-${idx}`}
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("ebilling.supportDoc.quantity")}</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, "quantity", Number(e.target.value) || 1)}
                    data-testid={`input-item-qty-${idx}`}
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("ebilling.supportDoc.unit_price")}</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.unitPrice}
                    onChange={(e) => updateItem(item.id, "unitPrice", Number(e.target.value) || 0)}
                    data-testid={`input-item-price-${idx}`}
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("ebilling.supportDoc.tax_percent")}</Label>
                  <Select
                    value={String(item.taxPercent)}
                    onValueChange={(v) => updateItem(item.id, "taxPercent", Number(v))}
                  >
                    <SelectTrigger data-testid={`select-item-tax-${idx}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="5">5%</SelectItem>
                      <SelectItem value="8">8%</SelectItem>
                      <SelectItem value="19">19%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                {t("ebilling.supportDoc.line_total")}: {formatCurrency(Math.round(item.quantity * item.unitPrice * (1 + item.taxPercent / 100) * 100) / 100)}
              </div>
            </div>
          ))}

          <Separator />

          <div className="space-y-2 text-right">
            <div className="flex justify-end gap-8">
              <span className="text-muted-foreground">{t("ebilling.supportDoc.subtotal")}:</span>
              <span className="font-medium w-32" data-testid="text-subtotal">{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-end gap-8">
              <span className="text-muted-foreground">{t("ebilling.supportDoc.tax_total")}:</span>
              <span className="font-medium w-32" data-testid="text-tax-total">{formatCurrency(totals.taxTotal)}</span>
            </div>
            <Separator />
            <div className="flex justify-end gap-8">
              <span className="font-bold">{t("ebilling.supportDoc.grand_total")}:</span>
              <span className="font-bold w-32 text-lg" data-testid="text-grand-total">{formatCurrency(totals.grandTotal)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Label>{t("ebilling.supportDoc.notes")}</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-2"
            data-testid="input-notes"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={submitMutation.isPending}
          className="min-w-[200px]"
          data-testid="button-submit-support-doc"
        >
          {submitMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t("ebilling.supportDoc.submitting")}
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              {t("ebilling.supportDoc.submit")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
