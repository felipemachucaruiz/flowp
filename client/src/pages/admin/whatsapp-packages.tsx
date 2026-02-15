import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { adminFetch } from "@/lib/admin-fetch";
import { MessageCircle, Plus, Edit, Trash2, Package, BarChart3, Users } from "lucide-react";

interface PackageFormData {
  name: string;
  messageLimit: number;
  price: number;
  sortOrder: number;
  active: boolean;
}

interface WhatsappPackage {
  id: string;
  name: string;
  messageLimit: number;
  price: number;
  sortOrder: number;
  active: boolean;
}

interface WhatsappSubscription {
  tenantId: string;
  businessName: string | null;
  messagesUsed: number;
  messageLimit: number;
  status: string;
  packageId: string;
}

interface UsageData {
  subscriptions: WhatsappSubscription[];
  tenantConfigs: { tenantId: string; businessName: string | null; enabled: boolean; senderPhone: string; gupshupAppName: string }[];
  totalMessages: number;
}

const formatCOP = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

export default function AdminWhatsAppPackages() {
  const [editingPackage, setEditingPackage] = useState<WhatsappPackage | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PackageFormData>({
    name: "",
    messageLimit: 0,
    price: 0,
    sortOrder: 0,
    active: true,
  });
  const { toast } = useToast();

  const { data: packagesData, isLoading: packagesLoading } = useQuery({
    queryKey: ["/api/internal-admin/whatsapp/packages"],
    queryFn: async () => {
      const res = await adminFetch("/api/internal-admin/whatsapp/packages");
      if (!res.ok) throw new Error("Failed to load packages");
      return res.json();
    },
  });

  const { data: usageData, isLoading: usageLoading } = useQuery<UsageData>({
    queryKey: ["/api/internal-admin/whatsapp/usage"],
    queryFn: async () => {
      const res = await adminFetch("/api/internal-admin/whatsapp/usage");
      if (!res.ok) throw new Error("Failed to load usage");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: PackageFormData) => {
      const res = await adminFetch("/api/internal-admin/whatsapp/packages", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create package");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/whatsapp/packages"] });
      toast({ title: "Package created" });
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PackageFormData> }) => {
      const res = await adminFetch(`/api/internal-admin/whatsapp/packages/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update package");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/whatsapp/packages"] });
      toast({ title: "Package updated" });
      setIsDialogOpen(false);
      setEditingPackage(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await adminFetch(`/api/internal-admin/whatsapp/packages/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete package");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/whatsapp/packages"] });
      toast({ title: "Package deleted" });
      setDeleteConfirmId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setDeleteConfirmId(null);
    },
  });

  const handleOpenCreate = () => {
    setEditingPackage(null);
    setFormData({
      name: "",
      messageLimit: 0,
      price: 0,
      sortOrder: 0,
      active: true,
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (pkg: WhatsappPackage) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      messageLimit: pkg.messageLimit,
      price: pkg.price,
      sortOrder: pkg.sortOrder ?? 0,
      active: pkg.active,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingPackage) {
      updateMutation.mutate({ id: editingPackage.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const packages: WhatsappPackage[] = packagesData || [];

  return (
    <div className="h-full overflow-y-auto space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-6 w-6" />
          <h1 className="text-2xl font-bold" data-testid="text-whatsapp-packages-title">
            WhatsApp Packages
          </h1>
        </div>
        <Button onClick={handleOpenCreate} data-testid="button-create-whatsapp-package">
          <Plus className="mr-2 h-4 w-4" />
          Create Package
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Packages
          </CardTitle>
          <CardDescription>Manage WhatsApp message packages available for tenants</CardDescription>
        </CardHeader>
        <CardContent>
          {packagesLoading ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-packages-loading">
              Loading packages...
            </div>
          ) : packages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Package className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground" data-testid="text-no-packages">No packages configured</p>
              <Button className="mt-4" onClick={handleOpenCreate} data-testid="button-create-first-package">
                <Plus className="mr-2 h-4 w-4" />
                Create First Package
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Message Limit</TableHead>
                  <TableHead>Price (COP)</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg: WhatsappPackage) => (
                  <TableRow key={pkg.id} data-testid={`row-package-${pkg.id}`}>
                    <TableCell data-testid={`text-package-name-${pkg.id}`}>{pkg.name}</TableCell>
                    <TableCell data-testid={`text-package-limit-${pkg.id}`}>
                      {pkg.messageLimit.toLocaleString()}
                    </TableCell>
                    <TableCell data-testid={`text-package-price-${pkg.id}`}>
                      {formatCOP(pkg.price)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={pkg.active ? "default" : "secondary"}
                        data-testid={`badge-package-status-${pkg.id}`}
                      >
                        {pkg.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleOpenEdit(pkg)}
                          data-testid={`button-edit-package-${pkg.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteConfirmId(pkg.id)}
                          data-testid={`button-delete-package-${pkg.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Tenant WhatsApp Usage Overview
          </CardTitle>
          <CardDescription>Overview of tenant configurations, subscriptions, and messages</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {usageLoading ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-usage-loading">
              Loading usage data...
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Tenant Configs</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-total-configs">
                      {usageData?.tenantConfigs?.length ?? 0}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Subscriptions</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-total-subscriptions">
                      {usageData?.subscriptions?.length ?? 0}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
                    <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-total-messages">
                      {Number(usageData?.totalMessages ?? 0).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {usageData?.subscriptions && usageData.subscriptions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business Name</TableHead>
                      <TableHead>Tenant ID</TableHead>
                      <TableHead>Messages Used</TableHead>
                      <TableHead>Message Limit</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Package ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usageData.subscriptions.map((sub: WhatsappSubscription, index: number) => (
                      <TableRow key={`${sub.tenantId}-${index}`} data-testid={`row-subscription-${index}`}>
                        <TableCell className="font-medium" data-testid={`text-sub-business-${index}`}>
                          {sub.businessName || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs" data-testid={`text-sub-tenant-${index}`}>
                          {sub.tenantId}
                        </TableCell>
                        <TableCell data-testid={`text-sub-used-${index}`}>
                          {sub.messagesUsed.toLocaleString()}
                        </TableCell>
                        <TableCell data-testid={`text-sub-limit-${index}`}>
                          {sub.messageLimit.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={sub.status === "active" ? "default" : "secondary"}
                            data-testid={`badge-sub-status-${index}`}
                          >
                            {sub.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs" data-testid={`text-sub-package-${index}`}>
                          {sub.packageId}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground" data-testid="text-no-subscriptions">
                  No active subscriptions
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingPackage ? "Edit Package" : "Create Package"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pkg-name">Name</Label>
              <Input
                id="pkg-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="input-package-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pkg-message-limit">Message Limit</Label>
              <Input
                id="pkg-message-limit"
                type="number"
                value={formData.messageLimit}
                onChange={(e) => setFormData({ ...formData, messageLimit: parseInt(e.target.value) || 0 })}
                onFocus={(e) => e.target.select()}
                data-testid="input-package-message-limit"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pkg-price">Price (COP)</Label>
              <Input
                id="pkg-price"
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                onFocus={(e) => e.target.select()}
                data-testid="input-package-price"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pkg-sort-order">Sort Order</Label>
              <Input
                id="pkg-sort-order"
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                onFocus={(e) => e.target.select()}
                data-testid="input-package-sort-order"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="pkg-active"
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                data-testid="switch-package-active"
              />
              <Label htmlFor="pkg-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              data-testid="button-cancel-package"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-package"
            >
              {editingPackage ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle data-testid="text-delete-confirm-title">Delete Package</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this package? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmId(null)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
