const PRINT_BRIDGE_URL = 'http://127.0.0.1:9638';
const TOKEN_STORAGE_KEY = 'flowp_print_bridge_token';

// Electron Desktop API (injected by preload.js when running in Electron)
interface FlowpDesktopAPI {
  isElectron: boolean;
  getVersion: () => Promise<string>;
  getPrinters: () => Promise<Array<{ name: string; isDefault: boolean }>>;
  printReceipt: (printerName: string, receipt: unknown) => Promise<{ success: boolean; error?: string }>;
  printRaw: (printerName: string, rawBase64: string) => Promise<{ success: boolean; error?: string }>;
  openCashDrawer: (printerName: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    flowpDesktop?: FlowpDesktopAPI;
  }
}

// Check if running in Electron desktop app
function isElectron(): boolean {
  return !!(window.flowpDesktop?.isElectron);
}

interface PrintBridgeStatus {
  isAvailable: boolean;
  version?: string;
  requiresAuth?: boolean;
  printerConfig?: {
    type: string;
    printerName?: string;
    networkIp?: string;
    networkPort?: number;
    paperWidth?: number;
  };
}

interface PrinterInfo {
  type: string;
  name: string;
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
  fontSize?: number;
  fontFamily?: string;
  logoSize?: number;
  logoUrl?: string;
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
  couponEnabled?: boolean;
  couponText?: string;
}

interface PrinterConfig {
  type: 'windows' | 'network';
  printerName?: string;
  networkIp?: string;
  networkPort?: number;
  paperWidth?: number;
}

class PrintBridgeClient {
  private statusCache: PrintBridgeStatus | null = null;
  private statusCacheTime: number = 0;
  private readonly CACHE_DURATION = 5000;
  private authToken: string | null = null;

  constructor() {
    this.authToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  clearCache(): void {
    this.statusCache = null;
    this.statusCacheTime = 0;
  }

  getToken(): string | null {
    return this.authToken;
  }

  setToken(token: string | null): void {
    this.authToken = token;
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    this.statusCache = null;
  }

  private getAuthHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    if (this.authToken) {
      headers['X-Auth-Token'] = this.authToken;
    }
    return headers;
  }

  async checkStatus(): Promise<PrintBridgeStatus> {
    const now = Date.now();
    if (this.statusCache && (now - this.statusCacheTime) < this.CACHE_DURATION) {
      return this.statusCache;
    }

    // Check if running in Electron desktop app first
    if (isElectron()) {
      try {
        const version = await window.flowpDesktop!.getVersion();
        console.log('[Electron] Desktop app detected, version:', version);
        this.statusCache = {
          isAvailable: true,
          version: `Electron ${version}`,
          requiresAuth: false
        };
        this.statusCacheTime = now;
        return this.statusCache;
      } catch (e) {
        console.log('[Electron] Error getting version:', e);
      }
    }

    // Fall back to PrintBridge HTTP connection
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${PRINT_BRIDGE_URL}/health?_=${now}`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        console.log('[PrintBridge] Response:', JSON.stringify(data));
        // Accept any PrintBridge that returns status ok and version
        if (data.status === 'ok' && data.version) {
          this.statusCache = {
            isAvailable: true,
            version: data.version,
            requiresAuth: data.requiresAuth,
            printerConfig: data.printer
          };
          this.statusCacheTime = now;
          return this.statusCache;
        }
        console.log('[PrintBridge] Invalid response format');
      }
      console.log('[PrintBridge] Health check failed:', response.status, response.statusText);
    } catch (error) {
      console.log('[PrintBridge] Connection error:', error instanceof Error ? error.message : 'Unknown error');
    }

    this.statusCache = { isAvailable: false };
    this.statusCacheTime = now;
    return this.statusCache;
  }

  async getPrinters(): Promise<PrinterInfo[]> {
    // Use Electron API if available
    if (isElectron()) {
      try {
        const printers = await window.flowpDesktop!.getPrinters();
        return printers.map(p => ({ type: 'windows', name: p.name }));
      } catch (e) {
        console.log('[Electron] Error getting printers:', e);
        return [];
      }
    }

    // Fall back to PrintBridge HTTP
    try {
      const response = await fetch(`${PRINT_BRIDGE_URL}/printers`, {
        headers: this.getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        return data.printers || [];
      }
    } catch {
    }
    return [];
  }

  async configurePrinter(config: PrinterConfig): Promise<boolean> {
    try {
      const response = await fetch(`${PRINT_BRIDGE_URL}/config`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(config)
      });
      
      if (response.ok) {
        this.statusCache = null;
        return true;
      }
    } catch {
    }
    return false;
  }

  async printReceipt(receipt: ReceiptData, printerName?: string): Promise<{ success: boolean; error?: string }> {
    // Use Electron API if available
    if (isElectron()) {
      try {
        // Get saved printer from localStorage, or fall back to default
        let targetPrinter = printerName;
        if (!targetPrinter) {
          targetPrinter = localStorage.getItem('flowp_electron_printer') || undefined;
        }
        if (!targetPrinter) {
          const printers = await window.flowpDesktop!.getPrinters();
          const defaultPrinter = printers.find(p => p.isDefault);
          targetPrinter = defaultPrinter?.name || printers[0]?.name;
        }
        if (!targetPrinter) {
          return { success: false, error: 'No printer available' };
        }
        return await window.flowpDesktop!.printReceipt(targetPrinter, receipt);
      } catch (e) {
        console.log('[Electron] Print error:', e);
        return { success: false, error: e instanceof Error ? e.message : 'Print failed' };
      }
    }

    // Fall back to PrintBridge HTTP
    try {
      const response = await fetch(`${PRINT_BRIDGE_URL}/print`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
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
        headers: this.getAuthHeaders(),
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

  async openCashDrawer(printerName?: string): Promise<{ success: boolean; error?: string }> {
    // Use Electron API if available
    if (isElectron()) {
      try {
        // Get saved printer from localStorage, or fall back to default
        let targetPrinter = printerName;
        if (!targetPrinter) {
          targetPrinter = localStorage.getItem('flowp_electron_printer') || undefined;
        }
        if (!targetPrinter) {
          const printers = await window.flowpDesktop!.getPrinters();
          const defaultPrinter = printers.find(p => p.isDefault);
          targetPrinter = defaultPrinter?.name || printers[0]?.name;
        }
        if (!targetPrinter) {
          return { success: false, error: 'No printer available' };
        }
        return await window.flowpDesktop!.openCashDrawer(targetPrinter);
      } catch (e) {
        console.log('[Electron] Cash drawer error:', e);
        return { success: false, error: e instanceof Error ? e.message : 'Cash drawer failed' };
      }
    }

    // Fall back to PrintBridge HTTP
    try {
      const response = await fetch(`${PRINT_BRIDGE_URL}/drawer`, {
        method: 'POST',
        headers: this.getAuthHeaders()
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

  // Check if running in Electron desktop app
  isElectronApp(): boolean {
    return isElectron();
  }
}

export const printBridge = new PrintBridgeClient();
export type { PrintBridgeStatus, PrinterInfo, ReceiptData, PrinterConfig };
