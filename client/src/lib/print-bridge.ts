const PRINT_BRIDGE_URL = 'http://127.0.0.1:9638';

interface PrintBridgeStatus {
  isAvailable: boolean;
  version?: string;
  printerConfig?: {
    type: string;
    vendorId?: number;
    productId?: number;
    networkIp?: string;
    networkPort?: number;
    paperWidth?: number;
  };
}

interface PrinterInfo {
  type: string;
  name: string;
  vendorId?: number;
  productId?: number;
}

interface ReceiptData {
  language?: string;
  businessName?: string;
  headerText?: string;
  address?: string;
  phone?: string;
  taxId?: string;
  orderNumber?: string;
  date?: string;
  cashier?: string;
  customer?: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice?: number;
    total: number;
    modifiers?: string;
  }>;
  subtotal: number;
  discount?: number;
  discountPercent?: number;
  tax?: number;
  taxRate?: number;
  total: number;
  payments?: Array<{
    type: string;
    amount: number;
    transactionId?: string;
  }>;
  change?: number;
  currency?: string;
  footerText?: string;
  openCashDrawer?: boolean;
  cutPaper?: boolean;
}

interface PrinterConfig {
  type: 'usb' | 'network';
  vendorId?: number;
  productId?: number;
  networkIp?: string;
  networkPort?: number;
  paperWidth?: number;
}

class PrintBridgeClient {
  private statusCache: PrintBridgeStatus | null = null;
  private statusCacheTime: number = 0;
  private readonly CACHE_DURATION = 5000;

  async checkStatus(): Promise<PrintBridgeStatus> {
    const now = Date.now();
    if (this.statusCache && (now - this.statusCacheTime) < this.CACHE_DURATION) {
      return this.statusCache;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${PRINT_BRIDGE_URL}/health`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        this.statusCache = {
          isAvailable: true,
          version: data.version,
          printerConfig: data.printer
        };
        this.statusCacheTime = now;
        return this.statusCache;
      }
    } catch {
      // Bridge not available
    }

    this.statusCache = { isAvailable: false };
    this.statusCacheTime = now;
    return this.statusCache;
  }

  async getPrinters(): Promise<PrinterInfo[]> {
    try {
      const response = await fetch(`${PRINT_BRIDGE_URL}/printers`);
      if (response.ok) {
        const data = await response.json();
        return data.printers || [];
      }
    } catch {
      // Bridge not available
    }
    return [];
  }

  async configurePrinter(config: PrinterConfig): Promise<boolean> {
    try {
      const response = await fetch(`${PRINT_BRIDGE_URL}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      
      if (response.ok) {
        this.statusCache = null;
        return true;
      }
    } catch {
      // Bridge not available
    }
    return false;
  }

  async printReceipt(receipt: ReceiptData): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${PRINT_BRIDGE_URL}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt })
      });
      
      const data = await response.json();
      return data;
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Print bridge not available' 
      };
    }
  }

  async printRaw(base64Data: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${PRINT_BRIDGE_URL}/print-raw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64Data })
      });
      
      const data = await response.json();
      return data;
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Print bridge not available' 
      };
    }
  }
}

export const printBridge = new PrintBridgeClient();
export type { PrintBridgeStatus, PrinterInfo, ReceiptData, PrinterConfig };
