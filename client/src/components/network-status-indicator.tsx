import { useOfflineSync } from '@/hooks/use-offline-sync';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { WifiOff, CloudOff, RefreshCw, Cloud, AlertCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export function NetworkStatusIndicator() {
  const { isOnline, pendingCount, syncing, lastError, forceSync } = useOfflineSync();
  const { t } = useI18n();

  if (isOnline && pendingCount === 0 && !syncing) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-600 border-green-500/30" data-testid="badge-network-online">
            <Cloud className="h-3 w-3" />
            {t("network.online")}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{t("network.connected")}</TooltipContent>
      </Tooltip>
    );
  }

  if (!isOnline) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 bg-yellow-500/10 text-yellow-600 border-yellow-500/30" data-testid="badge-network-offline">
            <WifiOff className="h-3 w-3" />
            {t("network.offline")}
            {pendingCount > 0 && (
              <span className="ml-1 bg-yellow-500/20 px-1 rounded text-xs">
                {pendingCount}
              </span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {t("network.offline_mode")}
          {pendingCount > 0 && ` - ${pendingCount} ${t("network.pending_sync")}`}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (syncing) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-600 border-blue-500/30" data-testid="badge-network-syncing">
            <RefreshCw className="h-3 w-3 animate-spin" />
            {t("network.syncing")}
            {pendingCount > 0 && (
              <span className="ml-1 bg-blue-500/20 px-1 rounded text-xs">
                {pendingCount}
              </span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{t("network.syncing_orders")}</TooltipContent>
      </Tooltip>
    );
  }

  if (pendingCount > 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className="gap-1 bg-orange-500/10 text-orange-600 border-orange-500/30 cursor-pointer" 
            onClick={forceSync}
            data-testid="badge-network-pending"
          >
            <CloudOff className="h-3 w-3" />
            {t("network.pending")}
            <span className="ml-1 bg-orange-500/20 px-1 rounded text-xs">
              {pendingCount}
            </span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {pendingCount} {t("network.orders_pending")}
          {lastError && (
            <div className="text-destructive text-xs mt-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {lastError}
            </div>
          )}
          <div className="text-xs mt-1">{t("network.click_to_sync")}</div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return null;
}
