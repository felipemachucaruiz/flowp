import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { formatCurrency } from "@/lib/currency";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Package, Check, Users, Building2, Monitor, ShoppingBag, FileText, UtensilsCrossed, CookingPot, Warehouse } from "lucide-react";
import type { SubscriptionPlan } from "@shared/schema";

interface PlanFormData {
  name: string;
  tier: string;
  businessType: string;
  priceMonthly: number;
  priceYearly: number | null;
  currency: string;
  maxLocations: number;
  maxRegisters: number;
  maxUsers: number;
  maxWarehouses: number;
  maxProducts: number;
  maxDianDocuments: number;
  maxTables: number;
  maxRecipes: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
}

const defaultFormData: PlanFormData = {
  name: "",
  tier: "basic",
  businessType: "retail",
  priceMonthly: 0,
  priceYearly: null,
  currency: "USD",
  maxLocations: 1,
  maxRegisters: 2,
  maxUsers: 5,
  maxWarehouses: 1,
  maxProducts: 100,
  maxDianDocuments: 200,
  maxTables: 0,
  maxRecipes: 0,
  features: [],
  isActive: true,
  sortOrder: 0,
};

const RETAIL_BASE_FEATURES = [
  { id: "pos.core", label: "Point of Sale", description: "Core POS functionality" },
  { id: "inventory.core", label: "Inventory Management", description: "Stock tracking and management" },
  { id: "purchasing.core", label: "Purchasing", description: "Purchase orders and suppliers" },
  { id: "customers.core", label: "Customer Management", description: "Customer database and profiles" },
  { id: "reporting.core", label: "Reports", description: "Sales and inventory reports" },
  { id: "retail.barcode", label: "Barcode Scanning", description: "Scan product barcodes" },
  { id: "retail.returns", label: "Returns & Refunds", description: "Process returns and refunds" },
  { id: "retail.bulk_discounts", label: "Bulk Discounts", description: "Quantity-based pricing" },
];

const RESTAURANT_BASE_FEATURES = [
  { id: "pos.core", label: "Point of Sale", description: "Core POS functionality" },
  { id: "inventory.core", label: "Inventory Management", description: "Stock tracking and management" },
  { id: "purchasing.core", label: "Purchasing", description: "Purchase orders and suppliers" },
  { id: "customers.core", label: "Customer Management", description: "Customer database and profiles" },
  { id: "reporting.core", label: "Reports", description: "Sales and inventory reports" },
  { id: "restaurant.tables", label: "Table Management", description: "Floor and table layout" },
  { id: "restaurant.floors", label: "Multiple Floors", description: "Manage multiple floors" },
  { id: "restaurant.kitchen_tickets", label: "Kitchen Tickets", description: "Kitchen display system" },
  { id: "restaurant.modifiers", label: "Modifiers", description: "Product modifiers and options" },
  { id: "restaurant.courses", label: "Courses", description: "Course-based ordering" },
  { id: "restaurant.split_checks", label: "Split Checks", description: "Split bills between customers" },
  { id: "restaurant.tips", label: "Tips", description: "Tip management" },
];

const PRO_FEATURES = [
  { id: "label_designer", label: "Label Designer", description: "Design and print custom product labels" },
  { id: "restaurant_bom", label: "Ingredient Inventory (BOM)", description: "Recipe management with FIFO auto-consumption" },
  { id: "reports_detailed", label: "Pro Reports", description: "Payment methods, customer analytics, sales by category, discount analysis, inventory turnover" },
  { id: "multi_location", label: "Multi-Location", description: "Manage multiple store locations" },
  { id: "loyalty_program", label: "Loyalty Program", description: "Customer loyalty and rewards" },
  { id: "electronic_invoicing", label: "Electronic Invoicing", description: "DIAN electronic invoicing (Colombia)" },
  { id: "api_access", label: "API Access", description: "External API integrations" },
];

const ENTERPRISE_FEATURES = [
  { id: "reports_management", label: "Enterprise Reports", description: "Register performance, tax summary, hourly heatmap, employee productivity, financial summary" },
  { id: "reports_export", label: "Report Export (Excel/PDF)", description: "Export reports to Excel and branded PDF with store logo and information" },
  { id: "ecommerce_integrations", label: "E-Commerce Integrations", description: "Shopify and other platform integrations" },
  { id: "security_audit", label: "Security & Audit", description: "Advanced security logging and audit trails" },
];

export default function AdminBilling() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<SubscriptionPlan | null>(null);
  const [formData, setFormData] = useState<PlanFormData>(defaultFormData);
  const [planType, setPlanType] = useState<"retail" | "restaurant">("retail");

  const { data: plans = [], isLoading } = useQuery<SubscriptionPlan[]>({
    queryKey: ["/api/internal/plans"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: PlanFormData) => {
      const res = await apiRequest("POST", "/api/internal/plans", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal/plans"] });
      setIsCreateOpen(false);
      resetForm();
      toast({ title: t("admin.billing_plan_created") });
    },
    onError: () => {
      toast({ title: t("admin.billing_plan_create_error"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PlanFormData }) => {
      const res = await apiRequest("PUT", `/api/internal/plans/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal/plans"] });
      setEditingPlan(null);
      resetForm();
      toast({ title: t("admin.billing_plan_updated") });
    },
    onError: () => {
      toast({ title: t("admin.billing_plan_update_error"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/internal/plans/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal/plans"] });
      setDeletingPlan(null);
      toast({ title: t("admin.billing_plan_deleted") });
    },
    onError: (error: Error) => {
      toast({ title: error.message || t("admin.billing_plan_delete_error"), variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData(defaultFormData);
    setPlanType("retail");
  };

  const openEditDialog = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    const features = plan.features || [];
    const bt = (plan as any).businessType || (features.some(f => f.startsWith("restaurant.")) ? "restaurant" : "retail");
    setPlanType(bt as "retail" | "restaurant");
    setFormData({
      name: plan.name,
      tier: (plan as any).tier || "basic",
      businessType: bt,
      priceMonthly: parseFloat(plan.priceMonthly),
      priceYearly: plan.priceYearly ? parseFloat(plan.priceYearly) : null,
      currency: plan.currency || "USD",
      maxLocations: plan.maxLocations || 1,
      maxRegisters: plan.maxRegisters || 2,
      maxUsers: plan.maxUsers || 5,
      maxWarehouses: (plan as any).maxWarehouses ?? 1,
      maxProducts: (plan as any).maxProducts ?? 100,
      maxDianDocuments: (plan as any).maxDianDocuments ?? 200,
      maxTables: (plan as any).maxTables ?? 0,
      maxRecipes: (plan as any).maxRecipes ?? 0,
      features: features,
      isActive: plan.isActive !== false,
      sortOrder: plan.sortOrder || 0,
    });
  };

  const handleFeatureToggle = (featureId: string) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.includes(featureId)
        ? prev.features.filter(f => f !== featureId)
        : [...prev.features, featureId]
    }));
  };

  const handleSubmit = () => {
    if (editingPlan) {
      updateMutation.mutate({ id: editingPlan.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const baseFeatures = planType === "restaurant" ? RESTAURANT_BASE_FEATURES : RETAIL_BASE_FEATURES;

  const planFormContent = (
    <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto">
      <div className="grid gap-2">
        <Label htmlFor="name">{t("admin.billing_plan_name")}</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="e.g., Starter, Professional, Enterprise"
          data-testid="input-plan-name"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="priceMonthly">{t("admin.billing_monthly_price")}</Label>
          <Input
            id="priceMonthly"
            type="number"
            step="0.01"
            value={formData.priceMonthly}
            onChange={(e) => setFormData(prev => ({ ...prev, priceMonthly: parseFloat(e.target.value) || 0 }))}
            onFocus={(e) => e.target.select()}
            data-testid="input-plan-price-monthly"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="priceYearly">{t("admin.billing_yearly_price")}</Label>
          <Input
            id="priceYearly"
            type="number"
            step="0.01"
            value={formData.priceYearly ?? ""}
            onChange={(e) => setFormData(prev => ({ ...prev, priceYearly: e.target.value ? parseFloat(e.target.value) : null }))}
            onFocus={(e) => e.target.select()}
            data-testid="input-plan-price-yearly"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="currency">{t("admin.currency")}</Label>
          <Input
            id="currency"
            value={formData.currency}
            onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
            placeholder="USD"
            data-testid="input-plan-currency"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sortOrder">{t("admin.billing_sort_order")}</Label>
          <Input
            id="sortOrder"
            type="number"
            value={formData.sortOrder}
            onChange={(e) => setFormData(prev => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
            onFocus={(e) => e.target.select()}
            data-testid="input-plan-sort-order"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="tier">{t("admin.billing_tier")}</Label>
          <select
            id="tier"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={formData.tier}
            onChange={(e) => setFormData(prev => ({ ...prev, tier: e.target.value }))}
            data-testid="select-plan-tier"
          >
            <option value="basic">Basic / Starter</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise / Avanzado</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="maxLocations">{t("admin.billing_max_locations")}</Label>
          <Input
            id="maxLocations"
            type="number"
            min="-1"
            value={formData.maxLocations}
            onChange={(e) => setFormData(prev => ({ ...prev, maxLocations: parseInt(e.target.value) || 1 }))}
            onFocus={(e) => e.target.select()}
            data-testid="input-plan-max-locations"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="maxRegisters">{t("admin.billing_max_registers")}</Label>
          <Input
            id="maxRegisters"
            type="number"
            min="-1"
            value={formData.maxRegisters}
            onChange={(e) => setFormData(prev => ({ ...prev, maxRegisters: parseInt(e.target.value) || 1 }))}
            onFocus={(e) => e.target.select()}
            data-testid="input-plan-max-registers"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="maxUsers">{t("admin.billing_max_users")}</Label>
          <Input
            id="maxUsers"
            type="number"
            min="-1"
            value={formData.maxUsers}
            onChange={(e) => setFormData(prev => ({ ...prev, maxUsers: parseInt(e.target.value) || 1 }))}
            onFocus={(e) => e.target.select()}
            data-testid="input-plan-max-users"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="maxWarehouses">{t("admin.billing_max_warehouses")}</Label>
          <Input
            id="maxWarehouses"
            type="number"
            min="-1"
            value={formData.maxWarehouses}
            onChange={(e) => setFormData(prev => ({ ...prev, maxWarehouses: parseInt(e.target.value) || 1 }))}
            onFocus={(e) => e.target.select()}
            data-testid="input-plan-max-warehouses"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="maxProducts">{t("admin.billing_max_products")}</Label>
          <Input
            id="maxProducts"
            type="number"
            min="-1"
            value={formData.maxProducts}
            onChange={(e) => setFormData(prev => ({ ...prev, maxProducts: parseInt(e.target.value) ?? 100 }))}
            onFocus={(e) => e.target.select()}
            data-testid="input-plan-max-products"
          />
          <p className="text-xs text-muted-foreground">-1 = {t("admin.billing_unlimited")}</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="maxDianDocuments">{t("admin.billing_max_dian_docs")}</Label>
          <Input
            id="maxDianDocuments"
            type="number"
            min="-1"
            value={formData.maxDianDocuments}
            onChange={(e) => setFormData(prev => ({ ...prev, maxDianDocuments: parseInt(e.target.value) ?? 200 }))}
            onFocus={(e) => e.target.select()}
            data-testid="input-plan-max-dian-docs"
          />
          <p className="text-xs text-muted-foreground">-1 = {t("admin.billing_unlimited")}</p>
        </div>
      </div>

      {planType === "restaurant" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="maxTables">{t("admin.billing_max_tables")}</Label>
            <Input
              id="maxTables"
              type="number"
              min="-1"
              value={formData.maxTables}
              onChange={(e) => setFormData(prev => ({ ...prev, maxTables: parseInt(e.target.value) ?? 0 }))}
              onFocus={(e) => e.target.select()}
              data-testid="input-plan-max-tables"
            />
            <p className="text-xs text-muted-foreground">-1 = {t("admin.billing_unlimited")}, 0 = {t("admin.billing_na")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="maxRecipes">{t("admin.billing_max_recipes")}</Label>
            <Input
              id="maxRecipes"
              type="number"
              min="-1"
              value={formData.maxRecipes}
              onChange={(e) => setFormData(prev => ({ ...prev, maxRecipes: parseInt(e.target.value) ?? 0 }))}
              onFocus={(e) => e.target.select()}
              data-testid="input-plan-max-recipes"
            />
            <p className="text-xs text-muted-foreground">-1 = {t("admin.billing_unlimited")}, 0 = {t("admin.billing_na")}</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <Label>{t("admin.billing_plan_type")}</Label>
        <Tabs value={planType} onValueChange={(v) => {
          const bt = v as "retail" | "restaurant";
          setPlanType(bt);
          const sharedFeatureIds = [...PRO_FEATURES.map(f => f.id), ...ENTERPRISE_FEATURES.map(f => f.id)];
          const currentSharedFeatures = formData.features.filter(f => sharedFeatureIds.includes(f));
          setFormData(prev => ({
            ...prev,
            businessType: bt,
            features: currentSharedFeatures,
            maxTables: bt === "retail" ? 0 : prev.maxTables,
            maxRecipes: bt === "retail" ? 0 : prev.maxRecipes,
          }));
        }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="retail" data-testid="tab-retail">{t("admin.retail")}</TabsTrigger>
            <TabsTrigger value="restaurant" data-testid="tab-restaurant">{t("admin.restaurant")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-3">
        <Label>{t("admin.billing_base_modules")}</Label>
        <div className="border rounded-lg p-4 space-y-2 max-h-48 overflow-y-auto">
          {baseFeatures.map((feature) => (
            <div key={feature.id} className="flex items-start gap-3">
              <Checkbox
                id={`base-${feature.id}`}
                checked={formData.features.includes(feature.id)}
                onCheckedChange={() => handleFeatureToggle(feature.id)}
                data-testid={`checkbox-base-${feature.id}`}
              />
              <div className="grid gap-0.5">
                <label
                  htmlFor={`base-${feature.id}`}
                  className="text-sm font-medium cursor-pointer"
                >
                  {feature.label}
                </label>
                <p className="text-xs text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label>{t("admin.pro_features")}</Label>
        <div className="border rounded-lg p-4 space-y-2">
          {PRO_FEATURES.map((feature) => (
            <div key={feature.id} className="flex items-start gap-3">
              <Checkbox
                id={`pro-${feature.id}`}
                checked={formData.features.includes(feature.id)}
                onCheckedChange={() => handleFeatureToggle(feature.id)}
                data-testid={`checkbox-pro-${feature.id}`}
              />
              <div className="grid gap-0.5">
                <label
                  htmlFor={`pro-${feature.id}`}
                  className="text-sm font-medium cursor-pointer"
                >
                  {feature.label}
                </label>
                <p className="text-xs text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label>{t("admin.enterprise_features")}</Label>
        <div className="border rounded-lg p-4 space-y-2">
          {ENTERPRISE_FEATURES.map((feature) => (
            <div key={feature.id} className="flex items-start gap-3">
              <Checkbox
                id={`enterprise-${feature.id}`}
                checked={formData.features.includes(feature.id)}
                onCheckedChange={() => handleFeatureToggle(feature.id)}
                data-testid={`checkbox-enterprise-${feature.id}`}
              />
              <div className="grid gap-0.5">
                <label
                  htmlFor={`enterprise-${feature.id}`}
                  className="text-sm font-medium cursor-pointer"
                >
                  {feature.label}
                </label>
                <p className="text-xs text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="isActive"
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
          data-testid="switch-plan-active"
        />
        <Label htmlFor="isActive">{t("admin.billing_active")}</Label>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto touch-scroll">
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-billing-title">{t("admin.billing_title")}</h1>
          <p className="text-muted-foreground">{t("admin.billing_subtitle")}</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} data-testid="button-create-plan">
              <Plus className="h-4 w-4 mr-2" />
              {t("admin.billing_create_plan")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("admin.billing_create_plan")}</DialogTitle>
              <DialogDescription>{t("admin.billing_create_desc")}</DialogDescription>
            </DialogHeader>
            {planFormContent}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{t("admin.cancel")}</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-save-plan">
                {createMutation.isPending ? t("admin.saving") : t("admin.billing_create_plan")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {plans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t("admin.billing_no_plans")}</h3>
            <p className="text-muted-foreground text-center mb-4">
              {t("admin.billing_no_plans_desc")}
            </p>
            <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} data-testid="button-create-first-plan">
              <Plus className="h-4 w-4 mr-2" />
              {t("admin.billing_create_first")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className={!plan.isActive ? "opacity-60" : ""} data-testid={`card-plan-${plan.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {plan.name}
                      {!plan.isActive && <Badge variant="secondary">{t("admin.billing_inactive")}</Badge>}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      <span className="text-2xl font-bold text-foreground">
                        {formatCurrency(parseFloat(plan.priceMonthly), plan.currency || "COP")}
                      </span>
                      <span className="text-muted-foreground">/{t("admin.billing_month")}</span>
                      {plan.priceYearly && (
                        <span className="ml-2 text-sm">
                          ({formatCurrency(parseFloat(plan.priceYearly), plan.currency || "COP")}/{t("admin.billing_year")})
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(plan)}
                      data-testid={`button-edit-plan-${plan.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletingPlan(plan)}
                      data-testid={`button-delete-plan-${plan.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {(plan as any).tier && (
                  <Badge variant="outline">{(plan as any).tier} - {(plan as any).businessType || "retail"}</Badge>
                )}
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="flex items-center gap-1">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{plan.maxLocations} {t("admin.billing_loc")}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <span>{plan.maxRegisters} {t("admin.billing_reg")}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{plan.maxUsers} {t("admin.billing_users")}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Warehouse className="h-4 w-4 text-muted-foreground" />
                    <span>{(plan as any).maxWarehouses ?? 1} {t("admin.billing_warehouses")}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                    <span>{(plan as any).maxProducts === -1 ? t("admin.billing_unlimited") : ((plan as any).maxProducts ?? 100)} {t("admin.billing_products")}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{(plan as any).maxDianDocuments ?? 200} {t("admin.billing_dian_docs")}</span>
                  </div>
                  {((plan as any).businessType === "restaurant" || ((plan as any).maxTables > 0)) && (
                    <div className="flex items-center gap-1">
                      <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
                      <span>{(plan as any).maxTables ?? 0} {t("admin.billing_tables")}</span>
                    </div>
                  )}
                  {((plan as any).businessType === "restaurant") && (
                    <div className="flex items-center gap-1">
                      <CookingPot className="h-4 w-4 text-muted-foreground" />
                      <span>{(plan as any).maxRecipes === -1 ? t("admin.billing_unlimited") : ((plan as any).maxRecipes ?? 0)} {t("admin.billing_recipes")}</span>
                    </div>
                  )}
                </div>
                
                {plan.features && plan.features.length > 0 && (
                  <div className="space-y-1">
                    {plan.features.slice(0, 4).map((feature, i) => (
                      <div key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                        <Check className="h-3 w-3 text-green-500" />
                        {feature.replace(/_/g, ' ').replace(/\./g, ' - ')}
                      </div>
                    ))}
                    {plan.features.length > 4 && (
                      <div className="text-sm text-muted-foreground">
                        +{plan.features.length - 4} {t("admin.billing_more_features")}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("admin.billing_edit_plan")}</DialogTitle>
            <DialogDescription>{t("admin.billing_edit_desc")}</DialogDescription>
          </DialogHeader>
          {planFormContent}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPlan(null)}>{t("admin.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={updateMutation.isPending} data-testid="button-update-plan">
              {updateMutation.isPending ? t("admin.saving") : t("admin.save_changes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingPlan} onOpenChange={(open) => !open && setDeletingPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.billing_delete_plan")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.billing_delete_confirm").replace("{name}", deletingPlan?.name || "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingPlan && deleteMutation.mutate(deletingPlan.id)}
              data-testid="button-confirm-delete-plan"
            >
              {deleteMutation.isPending ? t("admin.billing_deleting") : t("admin.billing_delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </div>
  );
}
