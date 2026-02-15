import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { adminFetch } from "@/lib/admin-fetch";
import { Package, Plus, Edit, DollarSign, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";

interface PackageFormData {
  name: string;
  displayName: string;
  description: string;
  billingCycle: "monthly" | "annual";
  priceUsdCents: number;
  includedDocuments: number;
  overageDefaultPolicy: "block" | "allow_and_charge" | "allow_and_mark_overage";
  overageDefaultPricePerDocUsdCents: number;
  isActive: boolean;
}

export default function AdminPackages() {
  const [editingPackage, setEditingPackage] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/internal-admin/ebilling/packages"],
    queryFn: () => adminFetch("/api/internal-admin/ebilling/packages").then(r => r.json()),
  });

  const form = useForm<PackageFormData>({
    defaultValues: {
      name: "",
      displayName: "",
      description: "",
      billingCycle: "monthly",
      priceUsdCents: 0,
      includedDocuments: 100,
      overageDefaultPolicy: "block",
      overageDefaultPricePerDocUsdCents: 10,
      isActive: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: PackageFormData) => {
      return adminFetch("/api/internal-admin/ebilling/packages", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/ebilling/packages"] });
      toast({ title: "Package created" });
      setIsDialogOpen(false);
      form.reset();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PackageFormData> }) => {
      return adminFetch(`/api/internal-admin/ebilling/packages/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/ebilling/packages"] });
      toast({ title: "Package updated" });
      setIsDialogOpen(false);
      setEditingPackage(null);
      form.reset();
    },
  });

  const handleOpenCreate = () => {
    setEditingPackage(null);
    form.reset({
      name: "",
      displayName: "",
      description: "",
      billingCycle: "monthly",
      priceUsdCents: 0,
      includedDocuments: 100,
      overageDefaultPolicy: "block",
      overageDefaultPricePerDocUsdCents: 10,
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (pkg: any) => {
    setEditingPackage(pkg);
    form.reset({
      name: pkg.name,
      displayName: pkg.displayName,
      description: pkg.description || "",
      billingCycle: pkg.billingCycle,
      priceUsdCents: pkg.priceUsdCents,
      includedDocuments: pkg.includedDocuments,
      overageDefaultPolicy: pkg.overageDefaultPolicy,
      overageDefaultPricePerDocUsdCents: pkg.overageDefaultPricePerDocUsdCents,
      isActive: pkg.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: PackageFormData) => {
    if (editingPackage) {
      updateMutation.mutate({ id: editingPackage.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  };

  return (
    <div className="h-full overflow-y-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-testid="text-packages-title">E-Billing Packages</h1>
        <Button onClick={handleOpenCreate} data-testid="button-create-package">
          <Plus className="mr-2 h-4 w-4" />
          New Package
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data?.packages?.map((pkg: any) => (
          <Card key={pkg.id} className={!pkg.isActive ? "opacity-60" : ""}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    {pkg.displayName}
                  </CardTitle>
                  <CardDescription>{pkg.name}</CardDescription>
                </div>
                <Badge variant={pkg.isActive ? "default" : "secondary"}>
                  {pkg.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold">{formatPrice(pkg.priceUsdCents)}</span>
                <span className="text-muted-foreground">/{pkg.billingCycle}</span>
              </div>

              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>{pkg.includedDocuments} documents included</span>
              </div>

              <div className="text-sm text-muted-foreground">
                Overage: {pkg.overageDefaultPolicy.replace(/_/g, " ")}
                {pkg.overageDefaultPolicy !== "block" && (
                  <span> @ {formatPrice(pkg.overageDefaultPricePerDocUsdCents)}/doc</span>
                )}
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleOpenEdit(pkg)}
                data-testid={`button-edit-package-${pkg.id}`}
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit Package
              </Button>
            </CardContent>
          </Card>
        ))}

        {(!data?.packages || data.packages.length === 0) && !isLoading && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Package className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No packages configured</p>
              <Button className="mt-4" onClick={handleOpenCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Create First Package
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPackage ? "Edit Package" : "Create Package"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Internal Name</Label>
                <Input id="name" {...form.register("name")} data-testid="input-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input id="displayName" {...form.register("displayName")} data-testid="input-display-name" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" {...form.register("description")} data-testid="input-description" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="billingCycle">Billing Cycle</Label>
                <select
                  {...form.register("billingCycle")}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  data-testid="select-billing-cycle"
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priceUsdCents">Price (cents)</Label>
                <Input
                  id="priceUsdCents"
                  type="number"
                  {...form.register("priceUsdCents", { valueAsNumber: true })}
                  onFocus={e => e.target.select()}
                  data-testid="input-price"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="includedDocuments">Included Documents</Label>
              <Input
                id="includedDocuments"
                type="number"
                {...form.register("includedDocuments", { valueAsNumber: true })}
                onFocus={e => e.target.select()}
                data-testid="input-included-docs"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="overageDefaultPolicy">Overage Policy</Label>
                <select
                  {...form.register("overageDefaultPolicy")}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  data-testid="select-overage-policy"
                >
                  <option value="block">Block</option>
                  <option value="allow_and_charge">Allow & Charge</option>
                  <option value="allow_and_mark_overage">Allow & Mark</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="overageDefaultPricePerDocUsdCents">Overage $/doc (cents)</Label>
                <Input
                  id="overageDefaultPricePerDocUsdCents"
                  type="number"
                  {...form.register("overageDefaultPricePerDocUsdCents", { valueAsNumber: true })}
                  onFocus={e => e.target.select()}
                  data-testid="input-overage-price"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="isActive"
                checked={form.watch("isActive")}
                onCheckedChange={(checked) => form.setValue("isActive", checked)}
                data-testid="switch-is-active"
              />
              <Label htmlFor="isActive">Active</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-package"
              >
                {editingPackage ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
