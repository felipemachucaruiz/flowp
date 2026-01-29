import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LoyaltyReward, Product } from "@shared/schema";
import {
  Gift,
  Plus,
  Award,
  Star,
  Edit,
  Trash2,
  Search,
} from "lucide-react";

export default function LoyaltyRewardsPage() {
  const { tenant } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [showRewardDialog, setShowRewardDialog] = useState(false);
  const [editingReward, setEditingReward] = useState<LoyaltyReward | null>(null);

  const [rewardForm, setRewardForm] = useState({
    name: "",
    description: "",
    pointsCost: "",
    rewardType: "discount" as "discount" | "product",
    discountType: "fixed",
    discountValue: "",
    productId: "",
  });

  const { data: rewards, isLoading: rewardsLoading } = useQuery<LoyaltyReward[]>({
    queryKey: ["/api/loyalty/rewards"],
    enabled: !!tenant?.id,
  });

  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    enabled: !!tenant?.id,
  });

  const formatCurrency = (amount: number | string) => {
    const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
    const currency = tenant?.currency || "USD";
    const localeMap: Record<string, string> = {
      COP: "es-CO", MXN: "es-MX", ARS: "es-AR", PEN: "es-PE", CLP: "es-CL",
      USD: "en-US", EUR: "de-DE", GBP: "en-GB", BRL: "pt-BR",
    };
    const locale = localeMap[currency] || "en-US";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(numAmount);
  };

  const createRewardMutation = useMutation({
    mutationFn: async (data: typeof rewardForm) => {
      return apiRequest("POST", "/api/loyalty/rewards", {
        name: data.name,
        description: data.description,
        pointsCost: parseInt(data.pointsCost),
        rewardType: data.rewardType,
        discountType: data.rewardType === "discount" ? data.discountType : null,
        discountValue: data.rewardType === "discount" ? parseFloat(data.discountValue) : null,
        productId: data.rewardType === "product" ? data.productId : null,
      });
    },
    onSuccess: () => {
      toast({ title: t("loyalty.reward_created") });
      setShowRewardDialog(false);
      resetRewardForm();
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty/rewards"] });
    },
    onError: () => {
      toast({ title: t("loyalty.reward_error"), variant: "destructive" });
    },
  });

  const updateRewardMutation = useMutation({
    mutationFn: async (data: typeof rewardForm & { id: string }) => {
      const { id, ...rest } = data;
      return apiRequest("PATCH", `/api/loyalty/rewards/${id}`, {
        name: rest.name,
        description: rest.description,
        pointsCost: parseInt(rest.pointsCost),
        rewardType: rest.rewardType,
        discountType: rest.rewardType === "discount" ? rest.discountType : null,
        discountValue: rest.rewardType === "discount" ? parseFloat(rest.discountValue) : null,
        productId: rest.rewardType === "product" ? rest.productId : null,
      });
    },
    onSuccess: () => {
      toast({ title: t("loyalty.reward_updated") });
      setShowRewardDialog(false);
      setEditingReward(null);
      resetRewardForm();
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty/rewards"] });
    },
    onError: () => {
      toast({ title: t("loyalty.update_error"), variant: "destructive" });
    },
  });

  const deleteRewardMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/loyalty/rewards/${id}`);
    },
    onSuccess: () => {
      toast({ title: t("loyalty.reward_deleted") });
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty/rewards"] });
    },
    onError: () => {
      toast({ title: t("loyalty.delete_error"), variant: "destructive" });
    },
  });

  const resetRewardForm = () => {
    setRewardForm({
      name: "",
      description: "",
      pointsCost: "",
      rewardType: "discount",
      discountType: "fixed",
      discountValue: "",
      productId: "",
    });
  };

  const handleEditReward = (reward: LoyaltyReward) => {
    setEditingReward(reward);
    setRewardForm({
      name: reward.name,
      description: reward.description || "",
      pointsCost: reward.pointsCost.toString(),
      rewardType: reward.rewardType as "discount" | "product",
      discountType: reward.discountType || "fixed",
      discountValue: reward.discountValue?.toString() || "",
      productId: reward.productId || "",
    });
    setShowRewardDialog(true);
  };

  const handleSubmitReward = () => {
    if (editingReward) {
      updateRewardMutation.mutate({ ...rewardForm, id: editingReward.id });
    } else {
      createRewardMutation.mutate(rewardForm);
    }
  };

  const filteredRewards = rewards?.filter(reward =>
    reward.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (reward.description && reward.description.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-semibold">{t("loyalty.title")}</h1>
          </div>
          <Button
            onClick={() => {
              resetRewardForm();
              setEditingReward(null);
              setShowRewardDialog(true);
            }}
            data-testid="button-add-reward"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t("loyalty.add_reward")}
          </Button>
        </div>
        <div className="relative mt-3 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("loyalty.search_rewards")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-rewards"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {rewardsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : filteredRewards.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredRewards.map((reward) => (
              <Card key={reward.id} className="hover-elevate">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Award className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{reward.name}</p>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {reward.description || t("loyalty.no_description")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        <Star className="w-3 h-3 mr-1" />
                        {reward.pointsCost} {t("loyalty.pts")}
                      </Badge>
                      <span className="text-sm text-green-600 font-medium">
                        {reward.rewardType === "product" 
                          ? t("loyalty.free_product")
                          : reward.discountType === "percentage"
                            ? `${reward.discountValue}% ${t("loyalty.off")}`
                            : formatCurrency(reward.discountValue || 0)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEditReward(reward)}
                        data-testid={`button-edit-reward-${reward.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteRewardMutation.mutate(reward.id)}
                        data-testid={`button-delete-reward-${reward.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-center">
            <Gift className="w-16 h-16 mb-4 opacity-30" />
            <p className="font-medium text-lg">{t("loyalty.no_rewards")}</p>
            <p className="text-sm">{t("loyalty.create_rewards_desc")}</p>
          </div>
        )}
      </div>

      <Dialog open={showRewardDialog} onOpenChange={setShowRewardDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingReward ? t("loyalty.edit_reward") : t("loyalty.add_reward")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("loyalty.reward_name")}</Label>
              <Input
                value={rewardForm.name}
                onChange={(e) => setRewardForm({ ...rewardForm, name: e.target.value })}
                placeholder={t("loyalty.reward_name_placeholder")}
                data-testid="input-reward-name"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("loyalty.description")}</Label>
              <Textarea
                value={rewardForm.description}
                onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })}
                placeholder={t("loyalty.description_placeholder")}
                data-testid="input-reward-description"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("loyalty.points_cost")}</Label>
              <Input
                type="number"
                value={rewardForm.pointsCost}
                onChange={(e) => setRewardForm({ ...rewardForm, pointsCost: e.target.value })}
                placeholder="1000"
                data-testid="input-reward-points"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("loyalty.reward_type")}</Label>
              <Select
                value={rewardForm.rewardType}
                onValueChange={(value: "discount" | "product") =>
                  setRewardForm({ ...rewardForm, rewardType: value })
                }
              >
                <SelectTrigger data-testid="select-reward-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discount">{t("loyalty.type_discount")}</SelectItem>
                  <SelectItem value="product">{t("loyalty.type_product")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {rewardForm.rewardType === "discount" && (
              <>
                <div className="space-y-2">
                  <Label>{t("loyalty.discount_type")}</Label>
                  <Select
                    value={rewardForm.discountType}
                    onValueChange={(value) => setRewardForm({ ...rewardForm, discountType: value })}
                  >
                    <SelectTrigger data-testid="select-discount-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">{t("loyalty.fixed_amount")}</SelectItem>
                      <SelectItem value="percentage">{t("loyalty.percentage")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("loyalty.discount_value")}</Label>
                  <Input
                    type="number"
                    value={rewardForm.discountValue}
                    onChange={(e) => setRewardForm({ ...rewardForm, discountValue: e.target.value })}
                    placeholder={rewardForm.discountType === "percentage" ? "10" : "5000"}
                    data-testid="input-discount-value"
                  />
                </div>
              </>
            )}
            {rewardForm.rewardType === "product" && (
              <div className="space-y-2">
                <Label>{t("loyalty.select_product")}</Label>
                <Select
                  value={rewardForm.productId}
                  onValueChange={(value) => setRewardForm({ ...rewardForm, productId: value })}
                >
                  <SelectTrigger data-testid="select-product">
                    <SelectValue placeholder={t("loyalty.select_product_placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} - {formatCurrency(product.price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRewardDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSubmitReward}
              disabled={createRewardMutation.isPending || updateRewardMutation.isPending}
              data-testid="button-submit-reward"
            >
              {editingReward ? t("common.save") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
