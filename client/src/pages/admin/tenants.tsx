import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
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
import { queryClient } from "@/lib/queryClient";
import { adminFetch } from "@/lib/admin-fetch";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";

interface Tenant {
  id: string;
  supportId: string | null;
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

export default function AdminTenants() {
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const { t, formatDate } = useI18n();
  
  // Feature management dialog
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [showFeaturesDialog, setShowFeaturesDialog] = useState(false);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  
  // Password reset dialog
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<TenantUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const AVAILABLE_FEATURES = [
    { id: "restaurant_bom", label: t("admin.feature_bom"), description: t("admin.feature_bom_desc") },
    { id: "advanced_reporting", label: t("admin.feature_reporting"), description: t("admin.feature_reporting_desc") },
    { id: "multi_location", label: t("admin.feature_multi_location"), description: t("admin.feature_multi_location_desc") },
    { id: "loyalty_program", label: t("admin.feature_loyalty"), description: t("admin.feature_loyalty_desc") },
    { id: "electronic_invoicing", label: t("admin.feature_invoicing"), description: t("admin.feature_invoicing_desc") },
    { id: "api_access", label: t("admin.feature_api"), description: t("admin.feature_api_desc") },
  ];

  const { data: tenants, isLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/internal-admin/tenants"],
    queryFn: async () => {
      const res = await adminFetch("/api/internal-admin/tenants");
      if (!res.ok) throw new Error("Failed to fetch tenants");
      const data = await res.json();
      return data.tenants || [];
    },
  });

  const { data: tenantUsers } = useQuery<TenantUser[]>({
    queryKey: ["/api/internal-admin/tenants", selectedTenant?.id, "users"],
    queryFn: async () => {
      const res = await adminFetch(`/api/internal-admin/tenants/${selectedTenant?.id}/users`);
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: !!selectedTenant && showPasswordDialog,
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await adminFetch(`/api/internal-admin/tenants/${id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error("Failed to suspend tenant");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/tenants"] });
      toast({ title: t("admin.tenant_suspended") });
    },
    onError: () => {
      toast({ title: t("admin.tenant_suspended_error"), variant: "destructive" });
    },
  });

  const unsuspendMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await adminFetch(`/api/internal-admin/tenants/${id}/unsuspend`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to unsuspend tenant");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/tenants"] });
      toast({ title: t("admin.tenant_unsuspended") });
    },
    onError: () => {
      toast({ title: t("admin.tenant_unsuspended_error"), variant: "destructive" });
    },
  });

  const updateTenantMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { status?: string; featureFlags?: string[] } }) => {
      const res = await adminFetch(`/api/internal-admin/tenants/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || `Failed to update tenant (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/tenants"] });
      toast({ title: t("admin.tenant_updated") });
      setShowFeaturesDialog(false);
    },
    onError: (error: Error) => {
      toast({ title: t("admin.tenant_updated_error"), description: error.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ tenantId, userId, newPassword }: { tenantId: string; userId: string; newPassword: string }) => {
      const res = await adminFetch(`/api/internal-admin/tenants/${tenantId}/users/${userId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) throw new Error("Failed to reset password");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("admin.password_reset") });
      setShowPasswordDialog(false);
      setNewPassword("");
      setSelectedUser(null);
    },
    onError: () => {
      toast({ title: t("admin.password_reset_error"), variant: "destructive" });
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
        return <Badge className="bg-green-500">{t("admin.active")}</Badge>;
      case "trial":
        return <Badge variant="secondary">{t("admin.trial")}</Badge>;
      case "suspended":
        return <Badge variant="destructive">{t("admin.suspended")}</Badge>;
      case "past_due":
        return <Badge className="bg-yellow-500">{t("admin.past_due")}</Badge>;
      case "cancelled":
        return <Badge variant="outline">{t("admin.cancelled")}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    return (
      <Badge variant="outline" className="capitalize">
        {type === "retail" ? t("admin.retail") : t("admin.restaurant")}
      </Badge>
    );
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
          <h1 className="text-2xl font-bold" data-testid="text-tenants-title">{t("admin.tenants")}</h1>
          <p className="text-muted-foreground">{t("admin.manage_accounts")}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("admin.search_tenants")}
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
                <TableHead>{t("admin.name")}</TableHead>
                <TableHead>{t("admin.support_id" as any) || "Support ID"}</TableHead>
                <TableHead>{t("admin.type")}</TableHead>
                <TableHead>{t("admin.status")}</TableHead>
                <TableHead>{t("admin.features")}</TableHead>
                <TableHead>{t("admin.currency")}</TableHead>
                <TableHead>{t("admin.created")}</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTenants?.map((tenant) => (
                <TableRow key={tenant.id} data-testid={`row-tenant-${tenant.id}`}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/tenants/${tenant.id}`}>
                      <div className="flex items-center gap-2 hover:underline cursor-pointer">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {tenant.name}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded" data-testid={`text-support-id-${tenant.id}`}>
                      {tenant.supportId || "—"}
                    </code>
                  </TableCell>
                  <TableCell>{getTypeBadge(tenant.type)}</TableCell>
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
                        <span className="text-muted-foreground text-sm">{t("admin.none")}</span>
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
                    {formatDate(new Date(tenant.createdAt))}
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
                          {t("admin.manage_subscription")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openPasswordDialog(tenant)}>
                          <Key className="h-4 w-4 mr-2" />
                          {t("admin.reset_user_password")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {tenant.status !== "suspended" ? (
                          <DropdownMenuItem
                            onClick={() =>
                              suspendMutation.mutate({
                                id: tenant.id,
                                reason: t("admin.manual_suspension"),
                              })
                            }
                            className="text-destructive"
                          >
                            <Ban className="h-4 w-4 mr-2" />
                            {t("admin.suspend")}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => unsuspendMutation.mutate(tenant.id)}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {t("admin.unsuspend")}
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
                    {t("admin.no_tenants")}
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
            <DialogTitle>{t("admin.manage_subscription")} - {selectedTenant?.name}</DialogTitle>
            <DialogDescription>
              {t("admin.update_status_features")}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label>{t("admin.subscription_status")}</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger data-testid="select-tenant-status">
                  <SelectValue placeholder={t("admin.status")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">{t("admin.trial")}</SelectItem>
                  <SelectItem value="active">{t("admin.active_pro")}</SelectItem>
                  <SelectItem value="past_due">{t("admin.past_due")}</SelectItem>
                  <SelectItem value="suspended">{t("admin.suspended")}</SelectItem>
                  <SelectItem value="cancelled">{t("admin.cancelled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>{t("admin.pro_features")}</Label>
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
              {t("admin.cancel")}
            </Button>
            <Button 
              onClick={handleSaveFeatures}
              disabled={updateTenantMutation.isPending}
              data-testid="button-save-features"
            >
              {updateTenantMutation.isPending ? t("admin.saving") : t("admin.save_changes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.reset_user_password")} - {selectedTenant?.name}</DialogTitle>
            <DialogDescription>
              {t("admin.select_user_reset")}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("admin.select_user")}</Label>
              <Select 
                value={selectedUser?.id || ""} 
                onValueChange={(userId) => {
                  const user = tenantUsers?.find(u => u.id === userId);
                  setSelectedUser(user || null);
                }}
              >
                <SelectTrigger data-testid="select-user-reset">
                  <SelectValue placeholder={t("admin.select_user_placeholder")} />
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
                <Label htmlFor="newPassword">{t("admin.new_password")}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder={t("admin.new_password_placeholder")}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  data-testid="input-new-password"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
              {t("admin.cancel")}
            </Button>
            <Button 
              onClick={handleResetPassword}
              disabled={!selectedUser || newPassword.length < 6 || resetPasswordMutation.isPending}
              data-testid="button-reset-password"
            >
              {resetPasswordMutation.isPending ? t("admin.resetting") : t("admin.reset_password")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
