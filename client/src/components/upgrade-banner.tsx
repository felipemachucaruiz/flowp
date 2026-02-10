import { useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Crown, Lock } from "lucide-react";

interface UpgradeBannerProps {
  type: "limit" | "feature";
  resourceName?: string;
  current?: number;
  max?: number;
  featureName?: string;
  requiredTier?: string;
  compact?: boolean;
}

export function UpgradeBanner({
  type,
  resourceName,
  current,
  max,
  featureName,
  requiredTier = "Pro",
  compact = false,
}: UpgradeBannerProps) {
  const [, navigate] = useLocation();
  const { t } = useI18n();

  const handleUpgrade = () => {
    navigate("/subscription");
  };

  if (type === "limit" && compact) {
    return (
      <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md text-sm" data-testid="banner-upgrade-limit">
        <Crown className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="flex-1 text-amber-700 dark:text-amber-300">
          {t("upgrade.limit_reached_short")} ({current}/{max} {resourceName})
        </span>
        <Button size="sm" onClick={handleUpgrade} data-testid="button-upgrade-plan">
          <ArrowRight className="w-3 h-3 mr-1" />
          {t("upgrade.upgrade")}
        </Button>
      </div>
    );
  }

  if (type === "limit") {
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md" data-testid="banner-upgrade-limit">
        <Crown className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {t("upgrade.limit_reached")}
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
            {t("upgrade.limit_description").replace("{current}", String(current ?? 0)).replace("{max}", String(max ?? 0)).replace("{resource}", resourceName || "")}
          </p>
        </div>
        <Button size="sm" onClick={handleUpgrade} data-testid="button-upgrade-plan">
          <Crown className="w-3 h-3 mr-1" />
          {t("upgrade.upgrade")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-muted/50 border rounded-md" data-testid="banner-upgrade-feature">
      <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {featureName || t("upgrade.feature_locked")}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("upgrade.feature_description").replace("{tier}", requiredTier)}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={handleUpgrade} data-testid="button-upgrade-feature">
        <Crown className="w-3 h-3 mr-1" />
        {t("upgrade.unlock")} {requiredTier}
      </Button>
    </div>
  );
}

interface UpgradeOverlayProps {
  featureName: string;
  requiredTier?: string;
}

export function UpgradeOverlay({ featureName, requiredTier = "Pro" }: UpgradeOverlayProps) {
  const [, navigate] = useLocation();
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center" data-testid="overlay-upgrade">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Lock className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{featureName}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">
        {t("upgrade.feature_description").replace("{tier}", requiredTier)}
      </p>
      <Button onClick={() => navigate("/subscription")} data-testid="button-upgrade-overlay">
        <Crown className="w-4 h-4 mr-2" />
        {t("upgrade.upgrade_to").replace("{tier}", requiredTier)}
      </Button>
    </div>
  );
}
