import { useQuery } from "@tanstack/react-query";
import { SUBSCRIPTION_FEATURES, type SubscriptionFeature } from "@shared/schema";

export interface TenantPlanInfo {
  tier: string;
  businessType: string;
  plan: { id: string; name: string } | null;
  limits: {
    maxRegisters: number;
    maxUsers: number;
    maxLocations: number;
    maxProducts: number;
    maxWarehouses: number;
    maxDianDocuments: number;
  };
  features: string[];
  usage: {
    registers: number;
    users: number;
    products: number;
    locations: number;
  };
}

export function useSubscription() {
  const { data, isLoading } = useQuery<TenantPlanInfo>({
    queryKey: ["/api/subscription/my-plan"],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const tier = data?.tier || "basic";
  const businessType = data?.businessType || "retail";
  const features = data?.features || [];
  const limits = data?.limits || { maxRegisters: 1, maxUsers: 1, maxLocations: 1, maxProducts: 100, maxWarehouses: 1, maxDianDocuments: 200 };
  const usage = data?.usage || { registers: 0, users: 0, products: 0, locations: 0 };

  const hasFeature = (feature: SubscriptionFeature): boolean => {
    return features.includes(feature);
  };

  const canCreate = (resource: "registers" | "users" | "products" | "locations"): boolean => {
    const limitMap: Record<string, { current: number; max: number }> = {
      registers: { current: usage.registers, max: limits.maxRegisters },
      users: { current: usage.users, max: limits.maxUsers },
      products: { current: usage.products, max: limits.maxProducts },
      locations: { current: usage.locations, max: limits.maxLocations },
    };
    const { current, max } = limitMap[resource];
    if (max === -1) return true;
    return current < max;
  };

  const getUsagePercent = (resource: "registers" | "users" | "products" | "locations"): number => {
    const limitMap: Record<string, { current: number; max: number }> = {
      registers: { current: usage.registers, max: limits.maxRegisters },
      users: { current: usage.users, max: limits.maxUsers },
      products: { current: usage.products, max: limits.maxProducts },
      locations: { current: usage.locations, max: limits.maxLocations },
    };
    const { current, max } = limitMap[resource];
    if (max === -1) return 0;
    return Math.round((current / max) * 100);
  };

  return {
    isLoading,
    tier,
    businessType,
    isRetail: businessType === "retail",
    isRestaurant: businessType === "restaurant",
    isBasic: tier === "basic",
    isPro: tier === "pro",
    isEnterprise: tier === "enterprise",
    plan: data?.plan || null,
    limits,
    usage,
    features,
    hasFeature,
    canCreate,
    getUsagePercent,
    FEATURES: SUBSCRIPTION_FEATURES,
  };
}
