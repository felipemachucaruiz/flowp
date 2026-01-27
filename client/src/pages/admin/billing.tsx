import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
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
import { Plus, Pencil, Trash2, Package, DollarSign, Users, Building2, Monitor } from "lucide-react";
import type { SubscriptionPlan } from "@shared/schema";

interface PlanFormData {
  name: string;
  priceMonthly: number;
  priceYearly: number | null;
  currency: string;
  maxLocations: number;
  maxRegisters: number;
  maxUsers: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
}

const defaultFormData: PlanFormData = {
  name: "",
  priceMonthly: 0,
  priceYearly: null,
  currency: "USD",
  maxLocations: 1,
  maxRegisters: 2,
  maxUsers: 5,
  features: [],
  isActive: true,
  sortOrder: 0,
};

export default function AdminBilling() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<SubscriptionPlan | null>(null);
  const [formData, setFormData] = useState<PlanFormData>(defaultFormData);
  const [featuresText, setFeaturesText] = useState("");

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
      toast({ title: "Plan created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create plan", variant: "destructive" });
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
      toast({ title: "Plan updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update plan", variant: "destructive" });
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
      toast({ title: "Plan deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Failed to delete plan", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData(defaultFormData);
    setFeaturesText("");
  };

  const openEditDialog = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      priceMonthly: parseFloat(plan.priceMonthly),
      priceYearly: plan.priceYearly ? parseFloat(plan.priceYearly) : null,
      currency: plan.currency || "USD",
      maxLocations: plan.maxLocations || 1,
      maxRegisters: plan.maxRegisters || 2,
      maxUsers: plan.maxUsers || 5,
      features: plan.features || [],
      isActive: plan.isActive !== false,
      sortOrder: plan.sortOrder || 0,
    });
    setFeaturesText((plan.features || []).join("\n"));
  };

  const handleSubmit = () => {
    const features = featuresText
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    const submitData = { ...formData, features };

    if (editingPlan) {
      updateMutation.mutate({ id: editingPlan.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const PlanForm = () => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Plan Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Starter, Professional, Enterprise"
          data-testid="input-plan-name"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="priceMonthly">Monthly Price</Label>
          <Input
            id="priceMonthly"
            type="number"
            step="0.01"
            value={formData.priceMonthly}
            onChange={(e) => setFormData({ ...formData, priceMonthly: parseFloat(e.target.value) || 0 })}
            data-testid="input-plan-price-monthly"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="priceYearly">Yearly Price (optional)</Label>
          <Input
            id="priceYearly"
            type="number"
            step="0.01"
            value={formData.priceYearly ?? ""}
            onChange={(e) => setFormData({ ...formData, priceYearly: e.target.value ? parseFloat(e.target.value) : null })}
            data-testid="input-plan-price-yearly"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            value={formData.currency}
            onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
            placeholder="USD"
            data-testid="input-plan-currency"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sortOrder">Sort Order</Label>
          <Input
            id="sortOrder"
            type="number"
            value={formData.sortOrder}
            onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
            data-testid="input-plan-sort-order"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="maxLocations">Max Locations</Label>
          <Input
            id="maxLocations"
            type="number"
            value={formData.maxLocations}
            onChange={(e) => setFormData({ ...formData, maxLocations: parseInt(e.target.value) || 1 })}
            data-testid="input-plan-max-locations"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="maxRegisters">Max Registers</Label>
          <Input
            id="maxRegisters"
            type="number"
            value={formData.maxRegisters}
            onChange={(e) => setFormData({ ...formData, maxRegisters: parseInt(e.target.value) || 2 })}
            data-testid="input-plan-max-registers"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="maxUsers">Max Users</Label>
          <Input
            id="maxUsers"
            type="number"
            value={formData.maxUsers}
            onChange={(e) => setFormData({ ...formData, maxUsers: parseInt(e.target.value) || 5 })}
            data-testid="input-plan-max-users"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="features">Features (one per line)</Label>
        <Textarea
          id="features"
          value={featuresText}
          onChange={(e) => setFeaturesText(e.target.value)}
          placeholder="Unlimited products
Priority support
Advanced reporting"
          rows={4}
          data-testid="input-plan-features"
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="isActive"
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
          data-testid="switch-plan-active"
        />
        <Label htmlFor="isActive">Active</Label>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-billing-title">Subscription Plans</h1>
          <p className="text-muted-foreground">Manage pricing packages for your tenants</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} data-testid="button-create-plan">
              <Plus className="h-4 w-4 mr-2" />
              Create Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Subscription Plan</DialogTitle>
              <DialogDescription>Add a new pricing package for tenants</DialogDescription>
            </DialogHeader>
            <PlanForm />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-save-plan">
                {createMutation.isPending ? "Creating..." : "Create Plan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {plans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Plans Yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first subscription plan to start billing tenants
            </p>
            <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} data-testid="button-create-first-plan">
              <Plus className="h-4 w-4 mr-2" />
              Create First Plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className={!plan.isActive ? "opacity-60" : ""} data-testid={`card-plan-${plan.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {plan.name}
                      {!plan.isActive && <Badge variant="secondary">Inactive</Badge>}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      <span className="text-2xl font-bold text-foreground">
                        ${parseFloat(plan.priceMonthly).toFixed(2)}
                      </span>
                      <span className="text-muted-foreground">/month</span>
                      {plan.priceYearly && (
                        <span className="ml-2 text-sm">
                          (${parseFloat(plan.priceYearly).toFixed(2)}/year)
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
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="flex items-center gap-1">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{plan.maxLocations} loc</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <span>{plan.maxRegisters} reg</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{plan.maxUsers} users</span>
                  </div>
                </div>
                
                {plan.features && plan.features.length > 0 && (
                  <div className="space-y-1">
                    {plan.features.slice(0, 4).map((feature, i) => (
                      <div key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                        <DollarSign className="h-3 w-3" />
                        {feature}
                      </div>
                    ))}
                    {plan.features.length > 4 && (
                      <div className="text-sm text-muted-foreground">
                        +{plan.features.length - 4} more features
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Plan</DialogTitle>
            <DialogDescription>Update the subscription plan details</DialogDescription>
          </DialogHeader>
          <PlanForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPlan(null)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={updateMutation.isPending} data-testid="button-update-plan">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingPlan} onOpenChange={(open) => !open && setDeletingPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Plan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the "{deletingPlan?.name}" plan? This action cannot be undone.
              Plans with active subscriptions cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingPlan && deleteMutation.mutate(deletingPlan.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-plan"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </div>
  );
}
