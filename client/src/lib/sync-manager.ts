import { 
  getPendingOrders, 
  getFailedOrders,
  updateOrderStatus, 
  deleteOfflineOrder,
  updateSyncMetadata,
  type OfflineOrder 
} from './offline-storage';

const MAX_RETRY_COUNT = 3;
const SYNC_INTERVAL = 30000;

type SyncListener = (status: { 
  isOnline: boolean; 
  pendingCount: number; 
  syncing: boolean; 
  lastError?: string 
}) => void;

class SyncManager {
  private listeners: SyncListener[] = [];
  private isOnline: boolean = navigator.onLine;
  private isSyncing: boolean = false;
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;
  private pendingCount: number = 0;
  private lastError?: string;
  private onlineHandler: () => void;
  private offlineHandler: () => void;

  constructor() {
    this.onlineHandler = () => {
      this.isOnline = true;
      this.notifyListeners();
      this.syncAll();
    };
    this.offlineHandler = () => {
      this.isOnline = false;
      this.notifyListeners();
    };
    this.setupNetworkListeners();
    this.startSyncInterval();
    this.initializePendingCount();
  }

  private async initializePendingCount() {
    this.pendingCount = await this.getPendingCount();
    this.notifyListeners();
  }

  private setupNetworkListeners() {
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  private startSyncInterval() {
    this.syncIntervalId = setInterval(() => {
      if (this.isOnline && !this.isSyncing) {
        this.syncAll();
      }
    }, SYNC_INTERVAL);
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.push(listener);
    listener(this.getStatus());
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    const status = this.getStatus();
    this.listeners.forEach(listener => listener(status));
  }

  getStatus() {
    return {
      isOnline: this.isOnline,
      pendingCount: this.pendingCount,
      syncing: this.isSyncing,
      lastError: this.lastError,
    };
  }

  async syncAll() {
    if (this.isSyncing || !this.isOnline) return;

    this.isSyncing = true;
    this.lastError = undefined;
    this.notifyListeners();

    try {
      const pendingOrders = await getPendingOrders();
      const failedOrders = await getFailedOrders();
      const ordersToSync = [...pendingOrders, ...failedOrders.filter(o => o.retryCount < MAX_RETRY_COUNT)];

      this.pendingCount = ordersToSync.length;
      this.notifyListeners();

      for (const order of ordersToSync) {
        await this.syncOrder(order);
      }

      await updateSyncMetadata(true);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Sync failed';
    } finally {
      this.isSyncing = false;
      this.pendingCount = await this.getPendingCount();
      this.notifyListeners();
    }
  }

  private async syncOrder(order: OfflineOrder) {
    try {
      await updateOrderStatus(order.id, 'syncing');

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (order.orderData.tenantId) {
        headers['x-tenant-id'] = order.orderData.tenantId;
      }

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...order.orderData,
          offlineId: order.id,
          offlineTimestamp: order.timestamp,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || `HTTP ${response.status}`);
      }

      await deleteOfflineOrder(order.id);
      this.pendingCount = Math.max(0, this.pendingCount - 1);
      this.notifyListeners();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await updateOrderStatus(order.id, 'failed', errorMessage);
    }
  }

  private async getPendingCount(): Promise<number> {
    const pending = await getPendingOrders();
    const failed = await getFailedOrders();
    return pending.length + failed.filter(o => o.retryCount < MAX_RETRY_COUNT).length;
  }

  async refreshPendingCount() {
    this.pendingCount = await this.getPendingCount();
    this.notifyListeners();
  }

  destroy() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
  }
}

export const syncManager = new SyncManager();
