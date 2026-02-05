import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { adminFetch } from "@/lib/admin-fetch";
import { Puzzle, Plus, Edit, DollarSign, Tag, Zap, ShoppingBag, MessageCircle, Package } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useForm, Controller } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";

interface AddonFormData {
  addonKey: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  monthlyPrice: number;
  yearlyPrice?: number;
  trialDays: number;
  includedInTiers: string[];
  isActive: boolean;
  sortOrder: number;
}

const ICON_OPTIONS = [
  { value: "ShoppingBag", label: "Shopping Bag", Icon: ShoppingBag },
  { value: "MessageCircle", label: "Message Circle", Icon: MessageCircle },
  { value: "Zap", label: "Zap", Icon: Zap },
  { value: "Package", label: "Package", Icon: Package },
  { value: "Puzzle", label: "Puzzle", Icon: Puzzle },
];

const CATEGORY_OPTIONS = [
  { value: "integration", label: "Integration" },
  { value: "feature", label: "Feature" },
  { value: "premium", label: "Premium" },
];

const INTEGRATION_KEY_OPTIONS = [
  { value: "shopify_integration", label: "Shopify Integration", description: "Sync inventory and orders with Shopify" },
  { value: "whatsapp_notifications", label: "WhatsApp Notifications", description: "Send notifications via WhatsApp/Gupshup" },
  { value: "advanced_reporting", label: "Advanced Reporting", description: "Extended analytics and reports" },
  { value: "multi_location", label: "Multi-Location", description: "Manage multiple store locations" },
  { value: "loyalty_program", label: "Loyalty Program", description: "Customer loyalty and rewards" },
  { value: "api_access", label: "API Access", description: "External API access for integrations" },
  { value: "custom_branding", label: "Custom Branding", description: "White-label and custom branding" },
  { value: "priority_support", label: "Priority Support", description: "24/7 priority customer support" },
];

export default function AdminAddonStore() {
  const [editingAddon, setEditingAddon] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["/internal/api/addon-store"],
    queryFn: () => adminFetch("/internal/api/addon-store").then(r => r.json()),
  });

  const form = useForm<AddonFormData>({
    defaultValues: {
      addonKey: "",
      name: "",
      description: "",
      icon: "Puzzle",
      category: "integration",
      monthlyPrice: 0,
      yearlyPrice: undefined,
      trialDays: 0,
      includedInTiers: [],
      isActive: true,
      sortOrder: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (formData: AddonFormData) => {
      const response = await adminFetch("/internal/api/addon-store", {
        method: "POST",
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to create add-on");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/internal/api/addon-store"] });
      toast({ title: "Add-on created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Failed to create add-on", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ addonKey, data }: { addonKey: string; data: Partial<AddonFormData> }) => {
      const response = await adminFetch(`/internal/api/addon-store/${addonKey}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to update add-on");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/internal/api/addon-store"] });
      toast({ title: "Add-on updated successfully" });
      setIsDialogOpen(false);
      setEditingAddon(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Failed to update add-on", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenCreate = () => {
    setEditingAddon(null);
    form.reset({
      addonKey: "",
      name: "",
      description: "",
      icon: "Puzzle",
      category: "integration",
      monthlyPrice: 0,
      yearlyPrice: undefined,
      trialDays: 0,
      includedInTiers: [],
      isActive: true,
      sortOrder: 0,
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (addon: any) => {
    setEditingAddon(addon);
    form.reset({
      addonKey: addon.addonKey,
      name: addon.name,
      description: addon.description || "",
      icon: addon.icon || "Puzzle",
      category: addon.category || "integration",
      monthlyPrice: addon.monthlyPrice || 0,
      yearlyPrice: addon.yearlyPrice,
      trialDays: addon.trialDays || 0,
      includedInTiers: addon.includedInTiers || [],
      isActive: addon.isActive !== false,
      sortOrder: addon.sortOrder || 0,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (formData: AddonFormData) => {
    if (editingAddon) {
      updateMutation.mutate({ addonKey: editingAddon.addonKey, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  const getIconComponent = (iconName: string) => {
    const iconOption = ICON_OPTIONS.find(opt => opt.value === iconName);
    if (iconOption) {
      const IconComp = iconOption.Icon;
      return <IconComp className="h-5 w-5" />;
    }
    return <Puzzle className="h-5 w-5" />;
  };

  const addons = data?.addons || [];
  const tiers = data?.tiers || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-addon-store-title">Add-on Store</h2>
          <p className="text-muted-foreground">Configure available add-ons and their pricing</p>
        </div>
        <Button onClick={handleOpenCreate} data-testid="button-create-addon">
          <Plus className="h-4 w-4 mr-2" />
          New Add-on
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {addons.map((addon: any) => (
          <Card key={addon.id} className={!addon.isActive ? "opacity-60" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    {getIconComponent(addon.icon)}
                  </div>
                  <div>
                    <CardTitle className="text-lg" data-testid={`text-addon-name-${addon.addonKey}`}>
                      {addon.name}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {addon.category}
                      </Badge>
                      {!addon.isActive && (
                        <Badge variant="secondary" className="text-xs">
                          Inactive
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => handleOpenEdit(addon)}
                  data-testid={`button-edit-addon-${addon.addonKey}`}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground line-clamp-2">
                {addon.description || "No description"}
              </p>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold" data-testid={`text-addon-price-${addon.addonKey}`}>
                    {addon.monthlyPrice > 0 ? formatPrice(addon.monthlyPrice) : "Free"}
                  </span>
                  {addon.monthlyPrice > 0 && (
                    <span className="text-xs text-muted-foreground">/month</span>
                  )}
                </div>
                {addon.trialDays > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {addon.trialDays} day trial
                  </Badge>
                )}
              </div>

              {addon.includedInTiers?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Included in:</p>
                  <div className="flex flex-wrap gap-1">
                    {addon.includedInTiers.map((tier: string) => (
                      <Badge key={tier} variant="outline" className="text-xs capitalize">
                        {tier}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {addons.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Puzzle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No add-ons configured</h3>
            <p className="text-muted-foreground text-sm mb-4">Create your first add-on to get started</p>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Add-on
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAddon ? "Edit Add-on" : "Create Add-on"}</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Integration Type</Label>
                <Controller
                  name="addonKey"
                  control={form.control}
                  render={({ field }) => (
                    <Select 
                      value={field.value} 
                      onValueChange={(val) => {
                        field.onChange(val);
                        const selected = INTEGRATION_KEY_OPTIONS.find(opt => opt.value === val);
                        if (selected && !editingAddon) {
                          form.setValue("name", selected.label);
                          form.setValue("description", selected.description);
                        }
                      }}
                      disabled={!!editingAddon}
                    >
                      <SelectTrigger data-testid="select-addon-key">
                        <SelectValue placeholder="Select integration..." />
                      </SelectTrigger>
                      <SelectContent>
                        {INTEGRATION_KEY_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex flex-col">
                              <span>{opt.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted-foreground">Integration ID (cannot be changed after creation)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Shopify Integration"
                  {...form.register("name")}
                  data-testid="input-addon-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what this add-on provides..."
                {...form.register("description")}
                rows={2}
                data-testid="input-addon-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Icon</Label>
                <Controller
                  name="icon"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger data-testid="select-addon-icon">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ICON_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex items-center gap-2">
                              <opt.Icon className="h-4 w-4" />
                              {opt.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Controller
                  name="category"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger data-testid="select-addon-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="monthlyPrice">Monthly Price (cents)</Label>
                <Input
                  id="monthlyPrice"
                  type="number"
                  min="0"
                  {...form.register("monthlyPrice", { valueAsNumber: true })}
                  data-testid="input-addon-monthly-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="yearlyPrice">Yearly Price (cents)</Label>
                <Input
                  id="yearlyPrice"
                  type="number"
                  min="0"
                  {...form.register("yearlyPrice", { valueAsNumber: true })}
                  data-testid="input-addon-yearly-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trialDays">Trial Days</Label>
                <Input
                  id="trialDays"
                  type="number"
                  min="0"
                  {...form.register("trialDays", { valueAsNumber: true })}
                  data-testid="input-addon-trial-days"
                />
              </div>
            </div>

            {tiers.length > 0 && (
              <div className="space-y-2">
                <Label>Include Free in Tiers</Label>
                <Controller
                  name="includedInTiers"
                  control={form.control}
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-3">
                      {tiers.map((tier: any) => (
                        <div key={tier.tier || tier.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`tier-${tier.tier || tier.id}`}
                            checked={field.value?.includes(tier.tier)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                field.onChange([...field.value, tier.tier]);
                              } else {
                                field.onChange(field.value.filter((t: string) => t !== tier.tier));
                              }
                            }}
                            data-testid={`checkbox-tier-${tier.tier}`}
                          />
                          <Label htmlFor={`tier-${tier.tier || tier.id}`} className="text-sm capitalize">
                            {tier.name || tier.tier}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Selected tiers get this add-on for free
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sortOrder">Sort Order</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  {...form.register("sortOrder", { valueAsNumber: true })}
                  data-testid="input-addon-sort-order"
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Controller
                  name="isActive"
                  control={form.control}
                  render={({ field }) => (
                    <Switch
                      id="isActive"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-addon-active"
                    />
                  )}
                />
                <Label htmlFor="isActive">Active</Label>
              </div>
            </div>

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                data-testid="button-cancel-addon"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-addon"
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Add-on"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
