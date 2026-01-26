import { useState, useEffect } from 'react';
import { syncManager } from '@/lib/sync-manager';

interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
  lastError?: string;
}

export function useOfflineSync() {
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: navigator.onLine,
    pendingCount: 0,
    syncing: false,
  });

  useEffect(() => {
    const unsubscribe = syncManager.subscribe(setStatus);
    return unsubscribe;
  }, []);

  const forceSync = () => {
    syncManager.syncAll();
  };

  return {
    ...status,
    forceSync,
  };
}
