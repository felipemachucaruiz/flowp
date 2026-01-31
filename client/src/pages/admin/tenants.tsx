import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, Search, MoreHorizontal, Ban, CheckCircle, Settings, Key, Users } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Tenant {
  id: string;
  name: string;
  type: "retail" | "restaurant";
  status: "trial" | "active" | "past_due" | "suspended" | "cancelled";
  currency: string;
  featureFlags: string[];
  createdAt: string;
}

interface TenantUser {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
}

const AVAILABLE_FEATURES = [
  { id: "restaurant_bom", label: "Ingredient Inventory (BOM)", description: "Recipe management with FIFO auto-consumption" },
  { id: "advanced_reporting", label: "Advanced Reporting", description: "Detailed analytics and custom reports" },
  { id: "multi_location", label: "Multi-Location", description: "Manage multiple store locations" },
  { id: "loyalty_program", label: "Loyalty Program", description: "Customer loyalty and rewards" },
  { id: "electronic_invoicing", label: "Electronic Invoicing", description: "DIAN electronic invoicing (Colombia)" },
  { id: "api_access", label: "API Access", description: "External API integrations" },
];

export default function AdminTenants() {
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  
  // Feature management dialog
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [showFeaturesDialog, setShowFeaturesDialog] = useState(false);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  
  // Password reset dialog
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<TenantUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data: tenants, isLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/internal/tenants"],
  });

  const { data: tenantUsers } = useQuery<TenantUser[]>({
    queryKey: ["/api/internal/tenants", selectedTenant?.id, "users"],
    enabled: !!selectedTenant && showPasswordDialog,
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return apiRequest("POST", `/api/internal/tenants/${id}/suspend`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal/tenants"] });
      toast({ title: "Tenant suspended successfully" });
    },
    onError: () => {
      toast({ title: "Failed to suspend tenant", variant: "destructive" });
    },
  });

  const unsuspendMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/internal/tenants/${id}/unsuspend`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal/tenants"] });
      toast({ title: "Tenant unsuspended successfully" });
    },
    onError: () => {
      toast({ title: "Failed to unsuspend tenant", variant: "destructive" });
    },
  });

  const updateTenantMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { status?: string; featureFlags?: string[] } }) => {
      return apiRequest("PATCH", `/api/internal/tenants/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal/tenants"] });
      toast({ title: "Tenant updated successfully" });
      setShowFeaturesDialog(false);
    },
    onError: () => {
      toast({ title: "Failed to update tenant", variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ tenantId, userId, newPassword }: { tenantId: string; userId: string; newPassword: string }) => {
      return apiRequest("POST", `/api/internal/tenants/${tenantId}/users/${userId}/reset-password`, { newPassword });
    },
    onSuccess: () => {
      toast({ title: "Password reset successfully" });
      setShowPasswordDialog(false);
      setNewPassword("");
      setSelectedUser(null);
    },
    onError: () => {
      toast({ title: "Failed to reset password", variant: "destructive" });
    },
  });

  const openFeaturesDialog = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setSelectedFeatures(tenant.featureFlags || []);
    setSelectedStatus(tenant.status);
    setShowFeaturesDialog(true);
  };

  const openPasswordDialog = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setShowPasswordDialog(true);
    setSelectedUser(null);
    setNewPassword("");
  };

  const handleFeatureToggle = (featureId: string) => {
    setSelectedFeatures(prev => 
      prev.includes(featureId) 
        ? prev.filter(f => f !== featureId)
        : [...prev, featureId]
    );
  };

  const handleSaveFeatures = () => {
    if (selectedTenant) {
      updateTenantMutation.mutate({
        id: selectedTenant.id,
        data: {
          status: selectedStatus,
          featureFlags: selectedFeatures,
        },
      });
    }
  };

  const handleResetPassword = () => {
    if (selectedTenant && selectedUser && newPassword) {
      resetPasswordMutation.mutate({
        tenantId: selectedTenant.id,
        userId: selectedUser.id,
        newPassword,
      });
    }
  };

  const filteredTenants = tenants?.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500">Active</Badge>;
      case "trial":
        return <Badge variant="secondary">Trial</Badge>;
      case "suspended":
        return <Badge variant="destructive">Suspended</Badge>;
      case "past_due":
        return <Badge className="bg-yellow-500">Past Due</Badge>;
      case "cancelled":
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-tenants">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto touch-scroll">
    <div className="p-6 space-y-6" data-testid="admin-tenants">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-tenants-title">Tenants</h1>
          <p className="text-muted-foreground">Manage all customer accounts</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tenants..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search-tenants"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Features</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTenants?.map((tenant) => (
                <TableRow key={tenant.id} data-testid={`row-tenant-${tenant.id}`}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {tenant.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {tenant.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(tenant.status)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(tenant.featureFlags || []).length > 0 ? (
                        (tenant.featureFlags || []).slice(0, 2).map((f) => (
                          <Badge key={f} variant="secondary" className="text-xs">
                            {f.replace(/_/g, ' ')}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-sm">None</span>
                      )}
                      {(tenant.featureFlags || []).length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{(tenant.featureFlags || []).length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{tenant.currency}</TableCell>
                  <TableCell>
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-tenant-actions-${tenant.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openFeaturesDialog(tenant)}>
                          <Settings className="h-4 w-4 mr-2" />
                          Manage Subscription
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openPasswordDialog(tenant)}>
                          <Key className="h-4 w-4 mr-2" />
                          Reset User Password
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {tenant.status !== "suspended" ? (
                          <DropdownMenuItem
                            onClick={() =>
                              suspendMutation.mutate({
                                id: tenant.id,
                                reason: "Manual suspension by admin",
                              })
                            }
                            className="text-destructive"
                          >
                            <Ban className="h-4 w-4 mr-2" />
                            Suspend
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => unsuspendMutation.mutate(tenant.id)}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Unsuspend
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {(!filteredTenants || filteredTenants.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No tenants found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Manage Subscription Dialog */}
      <Dialog open={showFeaturesDialog} onOpenChange={setShowFeaturesDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Subscription - {selectedTenant?.name}</DialogTitle>
            <DialogDescription>
              Update subscription status and enable/disable Pro features for this tenant.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label>Subscription Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger data-testid="select-tenant-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Active (Pro)</SelectItem>
                  <SelectItem value="past_due">Past Due</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Pro Features</Label>
              <div className="border rounded-lg p-4 space-y-3">
                {AVAILABLE_FEATURES.map((feature) => (
                  <div key={feature.id} className="flex items-start gap-3">
                    <Checkbox
                      id={feature.id}
                      checked={selectedFeatures.includes(feature.id)}
                      onCheckedChange={() => handleFeatureToggle(feature.id)}
                      data-testid={`checkbox-feature-${feature.id}`}
                    />
                    <div className="grid gap-1">
                      <label
                        htmlFor={feature.id}
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFeaturesDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveFeatures}
              disabled={updateTenantMutation.isPending}
              data-testid="button-save-features"
            >
              {updateTenantMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset User Password - {selectedTenant?.name}</DialogTitle>
            <DialogDescription>
              Select a user and set a new password for them.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select User</Label>
              <Select 
                value={selectedUser?.id || ""} 
                onValueChange={(userId) => {
                  const user = tenantUsers?.find(u => u.id === userId);
                  setSelectedUser(user || null);
                }}
              >
                <SelectTrigger data-testid="select-user-reset">
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {tenantUsers?.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center gap-2">
                        <span>{user.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {user.role}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedUser && (
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Enter new password (min 6 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  data-testid="input-new-password"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleResetPassword}
              disabled={!selectedUser || newPassword.length < 6 || resetPasswordMutation.isPending}
              data-testid="button-reset-password"
            >
              {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
