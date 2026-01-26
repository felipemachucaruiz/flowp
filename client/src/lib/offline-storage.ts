import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface OfflineOrder {
  id: string;
  timestamp: number;
  orderData: any;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  lastError?: string;
}

interface OfflineDB extends DBSchema {
  offlineOrders: {
    key: string;
    value: OfflineOrder;
    indexes: { 'by-status': string };
  };
  syncMetadata: {
    key: string;
    value: { id: string; lastSync: number; isOnline: boolean };
  };
}

const DB_NAME = 'flowp-offline-db';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<OfflineDB> | null = null;

async function getDB(): Promise<IDBPDatabase<OfflineDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<OfflineDB>(DB_NAME, DB_VERSION, {
    upgrade(db: IDBPDatabase<OfflineDB>) {
      if (!db.objectStoreNames.contains('offlineOrders')) {
        const orderStore = db.createObjectStore('offlineOrders', { keyPath: 'id' });
        orderStore.createIndex('by-status', 'status');
      }
      if (!db.objectStoreNames.contains('syncMetadata')) {
        db.createObjectStore('syncMetadata', { keyPath: 'id' });
      }
    },
  });

  return dbInstance;
}

export async function saveOfflineOrder(orderData: any): Promise<string> {
  const db = await getDB();
  const id = `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  await db.put('offlineOrders', {
    id,
    timestamp: Date.now(),
    orderData,
    status: 'pending',
    retryCount: 0,
  });
  
  return id;
}

export async function getPendingOrders(): Promise<OfflineOrder[]> {
  const db = await getDB();
  const tx = db.transaction('offlineOrders', 'readonly');
  const index = tx.store.index('by-status');
  return await index.getAll('pending');
}

export async function getFailedOrders(): Promise<OfflineOrder[]> {
  const db = await getDB();
  const tx = db.transaction('offlineOrders', 'readonly');
  const index = tx.store.index('by-status');
  return await index.getAll('failed');
}

export async function getAllOfflineOrders(): Promise<OfflineOrder[]> {
  const db = await getDB();
  return await db.getAll('offlineOrders');
}

export async function updateOrderStatus(
  id: string, 
  status: OfflineOrder['status'], 
  error?: string
): Promise<void> {
  const db = await getDB();
  const order = await db.get('offlineOrders', id);
  
  if (order) {
    order.status = status;
    if (status === 'failed') {
      order.retryCount += 1;
      order.lastError = error;
    }
    await db.put('offlineOrders', order);
  }
}

export async function deleteOfflineOrder(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('offlineOrders', id);
}

export async function clearSyncedOrders(): Promise<void> {
  const db = await getDB();
  const allOrders = await db.getAll('offlineOrders');
  const tx = db.transaction('offlineOrders', 'readwrite');
  
  for (const order of allOrders) {
    if (order.status !== 'pending' && order.status !== 'syncing') {
      await tx.store.delete(order.id);
    }
  }
  
  await tx.done;
}

export async function getOfflineOrderCount(): Promise<number> {
  const db = await getDB();
  const orders = await db.getAll('offlineOrders');
  return orders.filter((o: OfflineOrder) => o.status === 'pending' || o.status === 'failed').length;
}

export async function updateSyncMetadata(isOnline: boolean): Promise<void> {
  const db = await getDB();
  await db.put('syncMetadata', {
    id: 'main',
    lastSync: Date.now(),
    isOnline,
  } as any);
}

export async function getSyncMetadata(): Promise<{ lastSync: number; isOnline: boolean } | undefined> {
  const db = await getDB();
  return await db.get('syncMetadata', 'main');
}
