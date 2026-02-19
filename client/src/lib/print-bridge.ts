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

interface ElectronAPI {
  isElectron: boolean;
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  printSilent: (html: string, printerName?: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    flowpDesktop?: FlowpDesktopAPI;
    electronAPI?: ElectronAPI;
  }
}

// Check if running in Electron desktop app
function isElectron(): boolean {
  return !!(window.flowpDesktop?.isElectron) || !!(window.electronAPI?.isElectron);
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

interface CustomerInfo {
  name?: string;
  idType?: string;
  idNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  loyaltyPoints?: number;
}

interface ReceiptData {
  language?: string;
  businessName?: string;
  headerText?: string;
  address?: string;
  phone?: string;
  taxId?: string;
  taxIdLabel?: string;
  orderNumber?: string;
  date?: string;
  cashier?: string;
  customer?: string;
  customerInfo?: CustomerInfo;
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
  taxes?: Array<{
    name: string;
    rate: number;
    amount: number;
  }>;
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
  cutBeforeCoupon?: boolean;
  couponEnabled?: boolean;
  couponLines?: Array<{
    text: string;
    bold?: boolean;
    align?: "left" | "center" | "right";
    size?: "small" | "normal" | "large" | "xlarge";
  }>;
  electronicBilling?: {
    cufe?: string;
    qrCode?: string;
    documentNumber?: string;
    prefix?: string;
    resolutionNumber?: string;
    resolutionStartDate?: string;
    resolutionEndDate?: string;
    authRangeFrom?: string;
    authRangeTo?: string;
  };
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
        const version = window.flowpDesktop
          ? await window.flowpDesktop.getVersion()
          : window.electronAPI
            ? await window.electronAPI.getAppVersion()
            : 'unknown';
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

  private async resolveElectronPrinter(printerName?: string): Promise<string | undefined> {
    let targetPrinter = printerName;
    if (!targetPrinter) {
      targetPrinter = localStorage.getItem('flowp_electron_printer') || undefined;
    }
    if (!targetPrinter && window.flowpDesktop) {
      try {
        const printers = await window.flowpDesktop.getPrinters();
        const defaultPrinter = printers.find(p => p.isDefault);
        targetPrinter = defaultPrinter?.name || printers[0]?.name;
      } catch (e) {
        console.log('[Electron] Error getting printers:', e);
      }
    }
    return targetPrinter;
  }

  async printReceipt(receipt: ReceiptData, printerName?: string): Promise<{ success: boolean; error?: string }> {
    // Use Electron API if available
    if (isElectron()) {
      const targetPrinter = await this.resolveElectronPrinter(printerName);

      // Try flowpDesktop.printReceipt first (sends structured data to main process)
      if (window.flowpDesktop?.printReceipt && targetPrinter) {
        try {
          const result = await window.flowpDesktop.printReceipt(targetPrinter, receipt);
          if (result.success) return result;
          console.log('[Electron] flowpDesktop.printReceipt failed:', result.error);
        } catch (e) {
          console.log('[Electron] flowpDesktop.printReceipt error, trying fallback:', e);
        }
      }

      // Fallback: generate HTML and use electronAPI.printSilent
      if (window.electronAPI?.printSilent) {
        try {
          const html = this.generateReceiptHTML(receipt);
          const result = await window.electronAPI.printSilent(html, targetPrinter);
          return result;
        } catch (e) {
          console.log('[Electron] electronAPI.printSilent error:', e);
          return { success: false, error: e instanceof Error ? e.message : 'Print failed' };
        }
      }

      if (!targetPrinter) {
        return { success: false, error: 'No printer available' };
      }
      return { success: false, error: 'No Electron print API available' };
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

  async printSilentHTML(html: string, printerName?: string): Promise<{ success: boolean; error?: string }> {
    if (isElectron() && window.electronAPI?.printSilent) {
      try {
        const targetPrinter = await this.resolveElectronPrinter(printerName);
        return await window.electronAPI.printSilent(html, targetPrinter);
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Print failed' };
      }
    }
    return { success: false, error: 'electronAPI.printSilent not available' };
  }

  private generateReceiptHTML(receipt: ReceiptData): string {
    const items = receipt.items || [];
    const payments = receipt.payments || [];
    const taxes = receipt.taxes || [];
    const fontSize = receipt.fontSize || 12;
    const logoHtml = receipt.logoUrl
      ? `<div style="text-align:center;margin-bottom:4px;"><img src="${receipt.logoUrl}" style="max-width:${receipt.logoSize ? `${receipt.logoSize}px` : '100%'};height:auto;" /></div>`
      : '';
    const customerHtml = receipt.customerInfo
      ? `<div style="border-top:1px dashed #000;padding-top:4px;margin-top:4px;font-size:11px;">
          ${receipt.customerInfo.name ? `<div>${receipt.customerInfo.name}</div>` : ''}
          ${receipt.customerInfo.idNumber ? `<div>${receipt.customerInfo.idType || 'ID'}: ${receipt.customerInfo.idNumber}</div>` : ''}
          ${receipt.customerInfo.phone ? `<div>Tel: ${receipt.customerInfo.phone}</div>` : ''}
        </div>`
      : '';
    const eBillingHtml = receipt.electronicBilling
      ? `<div style="border-top:1px dashed #000;padding-top:6px;margin-top:6px;text-align:center;">
          ${receipt.electronicBilling.documentNumber ? `<div style="font-size:${fontSize}px;font-weight:bold;">${receipt.electronicBilling.prefix || ''}${receipt.electronicBilling.documentNumber}</div>` : ''}
          ${receipt.electronicBilling.resolutionNumber ? `<div style="margin-top:4px;font-size:${Math.max(fontSize - 1, 10)}px;">Resolucion DIAN No.<br/>${receipt.electronicBilling.resolutionNumber}</div>` : ''}
          ${receipt.electronicBilling.resolutionStartDate && receipt.electronicBilling.resolutionEndDate ? `<div style="font-size:${Math.max(fontSize - 1, 10)}px;">Vigencia: ${receipt.electronicBilling.resolutionStartDate} - ${receipt.electronicBilling.resolutionEndDate}</div>` : ''}
          ${receipt.electronicBilling.authRangeFrom && receipt.electronicBilling.authRangeTo ? `<div style="font-size:${Math.max(fontSize - 1, 10)}px;">Rango: ${receipt.electronicBilling.prefix || ''}${receipt.electronicBilling.authRangeFrom} - ${receipt.electronicBilling.prefix || ''}${receipt.electronicBilling.authRangeTo}</div>` : ''}
          ${receipt.electronicBilling.cufe ? `<div style="margin-top:4px;font-size:${Math.max(fontSize - 2, 9)}px;word-break:break-all;text-align:left;line-height:1.3;">CUFE:<br/>${receipt.electronicBilling.cufe}</div>` : ''}
        </div>`
      : '';

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
      @page{margin:0mm 1mm;size:auto;}
      *{box-sizing:border-box;}
      body{font-family:monospace;font-size:${fontSize}px;margin:0;padding:1mm 2mm;width:100%;max-width:76mm;}
      table{width:100%;border-collapse:collapse;table-layout:fixed;}
      td{padding:1px 0;vertical-align:top;word-wrap:break-word;overflow-wrap:break-word;}
      td:last-child{width:30%;text-align:right;white-space:nowrap;}
      .right{text-align:right;}.center{text-align:center;}.bold{font-weight:bold;}
      .line{border-top:1px dashed #000;margin:4px 0;}
      img{max-width:100%!important;}
      </style></head><body>
      ${logoHtml}
      <div class="center bold">${receipt.businessName || ''}</div>
      ${receipt.taxId ? `<div class="center">${receipt.taxIdLabel || 'NIT'}: ${receipt.taxId}</div>` : ''}
      ${receipt.address ? `<div class="center">${receipt.address}</div>` : ''}
      ${receipt.phone ? `<div class="center">${receipt.phone}</div>` : ''}
      ${receipt.headerText ? `<div class="center">${receipt.headerText}</div>` : ''}
      <div class="line"></div>
      ${receipt.orderNumber ? `<div><strong>#${receipt.orderNumber}</strong></div>` : ''}
      ${receipt.date ? `<div>${receipt.date}</div>` : ''}
      ${receipt.cashier ? `<div>${receipt.cashier}</div>` : ''}
      ${customerHtml}
      <div class="line"></div>
      <table>${items.map(item => `<tr><td>${item.quantity}x ${item.name}${item.modifiers ? `<br><small>${item.modifiers}</small>` : ''}</td><td class="right">$${item.total.toLocaleString()}</td></tr>`).join('')}</table>
      <div class="line"></div>
      <table>
        <tr><td>Subtotal</td><td class="right">$${(receipt.subtotal || 0).toLocaleString()}</td></tr>
        ${receipt.discount ? `<tr><td>Desc${receipt.discountPercent ? ` (${receipt.discountPercent}%)` : ''}</td><td class="right">-$${receipt.discount.toLocaleString()}</td></tr>` : ''}
        ${taxes.map(tax => `<tr><td>${tax.name} (${tax.rate}%)</td><td class="right">$${tax.amount.toLocaleString()}</td></tr>`).join('')}
        ${receipt.tax && taxes.length === 0 ? `<tr><td>IVA${receipt.taxRate ? ` (${receipt.taxRate}%)` : ''}</td><td class="right">$${receipt.tax.toLocaleString()}</td></tr>` : ''}
        <tr class="bold"><td><strong>TOTAL</strong></td><td class="right"><strong>$${(receipt.total || 0).toLocaleString()}</strong></td></tr>
      </table>
      ${payments.length > 0 ? `<div class="line"></div><table>${payments.map(p => `<tr><td>${p.type}</td><td class="right">$${p.amount.toLocaleString()}</td></tr>`).join('')}</table>` : ''}
      ${receipt.change ? `<div>Cambio: $${receipt.change.toLocaleString()}</div>` : ''}
      ${eBillingHtml}
      ${receipt.footerText ? `<div class="line"></div><div class="center">${receipt.footerText}</div>` : ''}
      </body></html>`;
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
