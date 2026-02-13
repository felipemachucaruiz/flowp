import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Search, MoreHorizontal, Ban, CheckCircle, Settings, Key, Gift, XCircle } from "lucide-react";
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
  subscriptionTier?: string;
}

interface TenantUser {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  tier: string;
  businessType: string;
  isActive: boolean;
}

interface TenantSubscription {
  id: string;
  planId: string;
  status: string;
  isComped: boolean;
  compedBy: string | null;
  compedAt: string | null;
  compedReason: string | null;
  paymentGateway: string | null;
  plan: SubscriptionPlan | null;
}

export default function AdminTenants() {
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const { t, formatDate } = useI18n();
  
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [showFeaturesDialog, setShowFeaturesDialog] = useState(false);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<TenantUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const [showCompDialog, setShowCompDialog] = useState(false);
  const [compPlanId, setCompPlanId] = useState("");
  const [compReason, setCompReason] = useState("");

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

  const { data: availablePlans } = useQuery<SubscriptionPlan[]>({
    queryKey: ["/api/subscription/plans"],
    queryFn: async () => {
      const res = await fetch("/api/subscription/plans");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showCompDialog,
  });

  const { data: tenantSubData } = useQuery<{ subscription: TenantSubscription | null }>({
    queryKey: ["/api/internal-admin/tenants", selectedTenant?.id, "subscription"],
    queryFn: async () => {
      const res = await adminFetch(`/api/internal-admin/tenants/${selectedTenant?.id}/subscription`);
      if (!res.ok) return { subscription: null };
      return res.json();
    },
    enabled: !!selectedTenant && showCompDialog,
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

  const compSubscriptionMutation = useMutation({
    mutationFn: async ({ tenantId, planId, reason }: { tenantId: string; planId: string; reason: string }) => {
      const res = await adminFetch(`/api/internal-admin/tenants/${tenantId}/comp-subscription`, {
        method: "POST",
        body: JSON.stringify({ planId, reason }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to grant free subscription");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/tenants", selectedTenant?.id, "subscription"] });
      toast({ title: t("admin.comp_granted" as any) });
      setShowCompDialog(false);
      setCompPlanId("");
      setCompReason("");
    },
    onError: (error: Error) => {
      toast({ title: t("admin.comp_granted_error" as any), description: error.message, variant: "destructive" });
    },
  });

  const revokeCompMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      const res = await adminFetch(`/api/internal-admin/tenants/${tenantId}/revoke-comp`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to revoke free subscription");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/internal-admin/tenants", selectedTenant?.id, "subscription"] });
      toast({ title: t("admin.comp_revoked" as any) });
    },
    onError: () => {
      toast({ title: t("admin.comp_revoked_error" as any), variant: "destructive" });
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

  const openCompDialog = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setCompPlanId("");
    setCompReason("");
    setShowCompDialog(true);
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

  const handleGrantComp = () => {
    if (selectedTenant && compPlanId) {
      compSubscriptionMutation.mutate({
        tenantId: selectedTenant.id,
        planId: compPlanId,
        reason: compReason,
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

  const currentSub = tenantSubData?.subscription;

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
                        <DropdownMenuItem onClick={() => openCompDialog(tenant)} data-testid={`button-comp-${tenant.id}`}>
                          <Gift className="h-4 w-4 mr-2" />
                          {t("admin.grant_free_subscription" as any)}
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
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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

      {/* Grant Free Subscription Dialog */}
      <Dialog open={showCompDialog} onOpenChange={setShowCompDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin.grant_free_subscription" as any)} - {selectedTenant?.name}</DialogTitle>
            <DialogDescription>
              {t("admin.grant_free_desc" as any)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {currentSub?.isComped && (
              <div className="border rounded-lg p-4 space-y-2 bg-muted/50">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label className="text-sm font-medium">{t("admin.current_subscription" as any)}</Label>
                  <Badge className="bg-green-600 text-white" data-testid="badge-comped">
                    {t("admin.comped_badge" as any)}
                  </Badge>
                </div>
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">{t("admin.select_plan" as any)}:</span> {currentSub.plan?.name || "—"}</p>
                  <p><span className="text-muted-foreground">{t("admin.subscription_tier" as any)}:</span> <span className="capitalize">{currentSub.plan?.tier || "—"}</span></p>
                  {currentSub.compedBy && (
                    <p><span className="text-muted-foreground">{t("admin.comped_by" as any)}:</span> {currentSub.compedBy}</p>
                  )}
                  {currentSub.compedAt && (
                    <p><span className="text-muted-foreground">{t("admin.comped_at" as any)}:</span> {formatDate(new Date(currentSub.compedAt))}</p>
                  )}
                  {currentSub.compedReason && (
                    <p><span className="text-muted-foreground">{t("admin.comped_reason" as any)}:</span> {currentSub.compedReason}</p>
                  )}
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="mt-2"
                  onClick={() => selectedTenant && revokeCompMutation.mutate(selectedTenant.id)}
                  disabled={revokeCompMutation.isPending}
                  data-testid="button-revoke-comp"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  {revokeCompMutation.isPending ? t("admin.revoking" as any) : t("admin.revoke_comp" as any)}
                </Button>
              </div>
            )}

            {!currentSub?.isComped && currentSub && (
              <div className="border rounded-lg p-4 space-y-1 bg-muted/50">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label className="text-sm font-medium">{t("admin.current_subscription" as any)}</Label>
                  <Badge variant="secondary">{currentSub.status}</Badge>
                </div>
                <p className="text-sm"><span className="text-muted-foreground">{t("admin.select_plan" as any)}:</span> {currentSub.plan?.name || "—"}</p>
                <p className="text-sm"><span className="text-muted-foreground">{t("admin.subscription_tier" as any)}:</span> <span className="capitalize">{currentSub.plan?.tier || "—"}</span></p>
              </div>
            )}

            <div className="space-y-2">
              <Label>{t("admin.select_plan" as any)}</Label>
              <Select value={compPlanId} onValueChange={setCompPlanId}>
                <SelectTrigger data-testid="select-comp-plan">
                  <SelectValue placeholder={t("admin.select_plan_placeholder" as any)} />
                </SelectTrigger>
                <SelectContent>
                  {(availablePlans || []).filter(p => p.isActive).map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} ({plan.tier}) - {plan.businessType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("admin.comp_reason" as any)}</Label>
              <Textarea
                placeholder={t("admin.comp_reason_placeholder" as any)}
                value={compReason}
                onChange={(e) => setCompReason(e.target.value)}
                className="resize-none"
                rows={2}
                data-testid="input-comp-reason"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompDialog(false)}>
              {t("admin.cancel")}
            </Button>
            <Button
              onClick={handleGrantComp}
              disabled={!compPlanId || compSubscriptionMutation.isPending}
              data-testid="button-grant-comp"
            >
              <Gift className="h-4 w-4 mr-2" />
              {compSubscriptionMutation.isPending ? t("admin.granting" as any) : t("admin.grant_free" as any)}
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
