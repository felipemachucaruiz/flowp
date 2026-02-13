import { useQuery } from "@tanstack/react-query";
import { SUBSCRIPTION_FEATURES, type SubscriptionFeature } from "@shared/schema";

export interface TrialInfo {
  isTrialing: boolean;
  trialEndsAt: string | null;
  daysRemaining: number;
  trialExpired: boolean;
}

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
    maxTables: number;
    maxRecipes: number;
  };
  features: string[];
  usage: {
    registers: number;
    users: number;
    products: number;
    locations: number;
    warehouses: number;
    tables: number;
    recipes: number;
  };
  trial?: TrialInfo;
  status?: string;
  isComped?: boolean;
}

type LimitResource = "registers" | "users" | "products" | "locations" | "warehouses" | "tables" | "recipes";

export function useSubscription() {
  const { data, isLoading } = useQuery<TenantPlanInfo>({
    queryKey: ["/api/subscription/my-plan"],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const tier = data?.tier || "basic";
  const businessType = data?.businessType || "retail";
  const features = data?.features || [];
  const limits = data?.limits || { maxRegisters: 1, maxUsers: 1, maxLocations: 1, maxProducts: 100, maxWarehouses: 1, maxDianDocuments: 200, maxTables: 0, maxRecipes: 0 };
  const usage = data?.usage || { registers: 0, users: 0, products: 0, locations: 0, warehouses: 0, tables: 0, recipes: 0 };
  const trial: TrialInfo = data?.trial || { isTrialing: false, trialEndsAt: null, daysRemaining: 0, trialExpired: false };
  const status = data?.status || "trial";
  const isComped = data?.isComped || false;

  const hasFeature = (feature: SubscriptionFeature): boolean => {
    return features.includes(feature);
  };

  const canCreate = (resource: LimitResource): boolean => {
    const limitMap: Record<string, { current: number; max: number }> = {
      registers: { current: usage.registers, max: limits.maxRegisters },
      users: { current: usage.users, max: limits.maxUsers },
      products: { current: usage.products, max: limits.maxProducts },
      locations: { current: usage.locations, max: limits.maxLocations },
      warehouses: { current: usage.warehouses, max: limits.maxWarehouses },
      tables: { current: usage.tables, max: limits.maxTables },
      recipes: { current: usage.recipes, max: limits.maxRecipes },
    };
    const { current, max } = limitMap[resource];
    if (max === -1) return true;
    return current < max;
  };

  const getUsagePercent = (resource: LimitResource): number => {
    const limitMap: Record<string, { current: number; max: number }> = {
      registers: { current: usage.registers, max: limits.maxRegisters },
      users: { current: usage.users, max: limits.maxUsers },
      products: { current: usage.products, max: limits.maxProducts },
      locations: { current: usage.locations, max: limits.maxLocations },
      warehouses: { current: usage.warehouses, max: limits.maxWarehouses },
      tables: { current: usage.tables, max: limits.maxTables },
      recipes: { current: usage.recipes, max: limits.maxRecipes },
    };
    const { current, max } = limitMap[resource];
    if (max === -1) return 0;
    if (max === 0) return 100;
    return Math.round((current / max) * 100);
  };

  return {
    isLoading,
    tier,
    businessType,
    status,
    isComped,
    isRetail: businessType === "retail",
    isRestaurant: businessType === "restaurant",
    isBasic: tier === "basic",
    isPro: tier === "pro",
    isEnterprise: tier === "enterprise",
    plan: data?.plan || null,
    limits,
    usage,
    features,
    trial,
    hasFeature,
    canCreate,
    getUsagePercent,
    FEATURES: SUBSCRIPTION_FEATURES,
  };
}
