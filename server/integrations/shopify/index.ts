// Shopify Integration for Flowp
// Handles order import, inventory sync, price sync, and product mapping

export { 
  ShopifyClient, 
  getShopifyClient, 
  saveShopifyConfig, 
  getShopifyConfig,
  verifyWebhookSignature,
  encrypt,
  decrypt,
  logSyncOperation,
} from "./shopifyClient";

export { 
  handleShopifyWebhook,
  retryFailedWebhooks,
} from "./webhookHandler";

export { 
  importShopifyOrder,
  importPendingShopifyOrder,
} from "./orderImport";

export { 
  processShopifyRefund,
} from "./refundHandler";

export { 
  syncInventoryToShopify,
  onFlowpStockChange,
  fullInventorySync,
  runInventoryReconciliation,
} from "./inventorySync";

export { 
  syncPriceToShopify,
  onFlowpPriceChange,
  fullPriceSync,
} from "./priceSync";

export { 
  autoMapProductsBySku,
  createManualMapping,
  removeMapping,
  getProductMappings,
  getUnmappedFlowpProducts,
  fetchShopifyProducts,
} from "./productMapping";

export * from "./types";
