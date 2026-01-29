import type { Tenant } from "@shared/schema";
import { printBridge } from "./print-bridge";
import { renderCouponContent, getCouponPlainText } from "@/components/coupon-editor";

interface CouponLine {
  text: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
  size?: "small" | "normal" | "large" | "xlarge";
}

function parseCouponLines(couponText: string | null | undefined): CouponLine[] {
  if (!couponText) return [];
  try {
    const parsed = JSON.parse(couponText);
    if (parsed.lines && Array.isArray(parsed.lines)) {
      return parsed.lines;
    }
  } catch {
    if (couponText) {
      return [{ text: couponText, align: "center", size: "normal" }];
    }
  }
  return [];
}

interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
}

interface PaymentEntry {
  type: "cash" | "card";
  amount: number;
  transactionId?: string;
}

interface ReceiptData {
  orderNumber: string;
  date: Date;
  items: ReceiptItem[];
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  total: number;
  paymentMethod: string;
  cashReceived?: number;
  change?: number;
  cashier?: string;
  customer?: string;
  discount?: number;
  discountPercent?: number;
  payments?: PaymentEntry[];
}

async function tryPrintBridge(tenant: Tenant | null, data: ReceiptData): Promise<boolean> {
  try {
    const status = await printBridge.checkStatus();
    if (!status.isAvailable) {
      return false;
    }

    const result = await printBridge.printReceipt({
      language: tenant?.language || "en",
      businessName: tenant?.name,
      headerText: tenant?.receiptHeaderText || undefined,
      address: tenant?.receiptShowAddress ? tenant.address || undefined : undefined,
      phone: tenant?.receiptShowPhone ? tenant.phone || undefined : undefined,
      taxId: tenant?.receiptTaxId || undefined,
      fontSize: tenant?.receiptFontSize || 12,
      fontFamily: tenant?.receiptFontFamily || "monospace",
      logoSize: tenant?.receiptLogoSize || 200,
      logoUrl: tenant?.receiptShowLogo ? (tenant?.receiptLogo || tenant?.logo || undefined) : undefined,
      orderNumber: data.orderNumber,
      date: new Intl.DateTimeFormat(tenant?.language === "es" ? "es-CO" : tenant?.language === "pt" ? "pt-BR" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(data.date),
      cashier: data.cashier,
      customer: data.customer,
      items: data.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        total: item.total,
      })),
      subtotal: data.subtotal,
      discount: data.discount,
      discountPercent: data.discountPercent,
      tax: data.taxAmount,
      taxRate: data.taxRate,
      total: data.total,
      payments: data.payments?.map(p => ({
        type: p.type,
        amount: p.amount,
        transactionId: p.transactionId,
      })),
      change: data.change,
      currency: tenant?.currency || "USD",
      footerText: tenant?.receiptFooterText || undefined,
      openCashDrawer: data.paymentMethod === "cash" || data.payments?.some(p => p.type === "cash"),
      cutPaper: true,
      couponEnabled: tenant?.couponEnabled || false,
      couponLines: tenant?.couponEnabled ? parseCouponLines(tenant?.couponText) : undefined,
    });

    return result.success;
  } catch {
    return false;
  }
}

export async function printReceipt(tenant: Tenant | null, data: ReceiptData) {
  const useBridge = await tryPrintBridge(tenant, data);
  if (useBridge) {
    return;
  }

  printReceiptBrowser(tenant, data);
}

function printReceiptBrowser(tenant: Tenant | null, data: ReceiptData) {
  const lang = tenant?.language || "en";
  
  // Get font and logo settings from tenant
  const fontSize = tenant?.receiptFontSize || 12;
  const fontFamily = tenant?.receiptFontFamily || "monospace";
  const logoSize = tenant?.receiptLogoSize || 200;
  
  // Map font family names to CSS values
  const fontFamilyMap: Record<string, string> = {
    monospace: "'Courier New', monospace",
    "sans-serif": "Arial, Helvetica, sans-serif",
    serif: "'Times New Roman', Georgia, serif",
  };
  const cssFontFamily = fontFamilyMap[fontFamily] || fontFamilyMap.monospace;
  
  // Convert logo size (percentage of max width 60mm) to mm
  const logoMaxWidth = Math.round((logoSize / 100) * 60);
  const logoMaxHeight = Math.round((logoSize / 100) * 20);
  
  const translations: Record<string, Record<string, string>> = {
    en: {
      receipt: "Receipt",
      date: "Date",
      cashier: "Cashier",
      subtotal: "Subtotal",
      tax: "Tax",
      total: "TOTAL",
      payment: "Payment",
      cash: "CASH",
      card: "CARD",
      cashReceived: "Cash Received",
      change: "Change",
      thankYou: "Thank you for your purchase!",
      taxId: "Tax ID",
      tel: "Tel",
    },
    es: {
      receipt: "Recibo",
      date: "Fecha",
      cashier: "Cajero",
      subtotal: "Subtotal",
      tax: "Impuesto",
      total: "TOTAL",
      payment: "Pago",
      cash: "EFECTIVO",
      card: "TARJETA",
      cashReceived: "Efectivo Recibido",
      change: "Cambio",
      thankYou: "¡Gracias por su compra!",
      taxId: "NIT/RUT",
      tel: "Tel",
    },
    pt: {
      receipt: "Recibo",
      date: "Data",
      cashier: "Caixa",
      subtotal: "Subtotal",
      tax: "Imposto",
      total: "TOTAL",
      payment: "Pagamento",
      cash: "DINHEIRO",
      card: "CARTÃO",
      cashReceived: "Dinheiro Recebido",
      change: "Troco",
      thankYou: "Obrigado pela sua compra!",
      taxId: "CNPJ/CPF",
      tel: "Tel",
    },
  };
  
  const t = translations[lang] || translations.en;

  const formatCurrency = (amount: number) => {
    const currency = tenant?.currency || "USD";
    const localeMap: Record<string, string> = {
      COP: "es-CO",
      MXN: "es-MX",
      USD: "en-US",
      EUR: "de-DE",
      BRL: "pt-BR",
      ARS: "es-AR",
      PEN: "es-PE",
      CLP: "es-CL",
    };
    const locale = localeMap[currency] || "en-US";
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency,
        minimumFractionDigits: currency === "COP" ? 0 : 2,
        maximumFractionDigits: currency === "COP" ? 0 : 2,
      }).format(amount);
    } catch {
      return `$${amount.toFixed(2)}`;
    }
  };

  const dateLocaleMap: Record<string, string> = {
    en: "en-US",
    es: "es-CO",
    pt: "pt-BR",
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(dateLocaleMap[lang] || "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const receiptHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt #${data.orderNumber}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: ${cssFontFamily};
      font-size: ${fontSize}px;
      width: 80mm;
      max-width: 80mm;
      padding: 5mm;
      background: white;
      color: black;
    }
    .receipt {
      width: 100%;
    }
    .header {
      text-align: center;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px dashed #000;
    }
    .logo {
      max-width: ${logoMaxWidth}mm;
      max-height: ${logoMaxHeight}mm;
      margin-bottom: 5px;
    }
    .company-name {
      font-size: ${Math.round(fontSize * 1.33)}px;
      font-weight: bold;
      margin-bottom: 3px;
    }
    .company-info {
      font-size: ${Math.round(fontSize * 0.83)}px;
      line-height: 1.4;
    }
    .header-text {
      font-size: ${Math.round(fontSize * 0.83)}px;
      margin-top: 5px;
      font-style: italic;
    }
    .order-info {
      margin: 10px 0;
      padding-bottom: 10px;
      border-bottom: 1px dashed #000;
    }
    .order-info div {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
    }
    .items {
      margin: 10px 0;
      padding-bottom: 10px;
      border-bottom: 1px dashed #000;
    }
    .item {
      margin-bottom: 5px;
    }
    .item-name {
      font-weight: bold;
    }
    .item-details {
      display: flex;
      justify-content: space-between;
      padding-left: 10px;
      font-size: ${Math.round(fontSize * 0.92)}px;
    }
    .totals {
      margin: 10px 0;
      padding-bottom: 10px;
      border-bottom: 1px dashed #000;
    }
    .totals div {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
    }
    .totals .total {
      font-size: ${Math.round(fontSize * 1.17)}px;
      font-weight: bold;
      margin-top: 5px;
      padding-top: 5px;
      border-top: 1px solid #000;
    }
    .payment-info {
      margin: 10px 0;
    }
    .payment-info div {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
    }
    .footer {
      text-align: center;
      margin-top: 15px;
      padding-top: 10px;
      border-top: 1px dashed #000;
      font-size: ${Math.round(fontSize * 0.83)}px;
    }
    .footer-text {
      white-space: pre-wrap;
      margin-bottom: 10px;
    }
    .thank-you {
      font-size: ${fontSize}px;
      font-weight: bold;
      margin-top: 10px;
    }
    @media print {
      body {
        width: 80mm;
        padding: 2mm;
      }
      @page {
        size: 80mm auto;
        margin: 0;
      }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      ${tenant?.receiptShowLogo && (tenant?.receiptLogo || tenant?.logo) ? `<img src="${tenant.receiptLogo || tenant.logo}" alt="Logo" class="logo" />` : ""}
      <div class="company-name">${tenant?.name || "Store"}</div>
      <div class="company-info">
        ${tenant?.receiptShowAddress && tenant?.address ? `<div>${tenant.address}</div>` : ""}
        ${tenant?.city ? `<div>${tenant.city}${tenant?.country ? `, ${tenant.country}` : ""}</div>` : ""}
        ${tenant?.receiptShowPhone && tenant?.phone ? `<div>${t.tel}: ${tenant.phone}</div>` : ""}
        ${tenant?.receiptTaxId ? `<div>${t.taxId}: ${tenant.receiptTaxId}</div>` : ""}
      </div>
      ${tenant?.receiptHeaderText ? `<div class="header-text">${tenant.receiptHeaderText}</div>` : ""}
    </div>
    
    <div class="order-info">
      <div><span>${t.receipt} #:</span><span>${data.orderNumber}</span></div>
      <div><span>${t.date}:</span><span>${formatDate(data.date)}</span></div>
      ${data.cashier ? `<div><span>${t.cashier}:</span><span>${data.cashier}</span></div>` : ""}
    </div>
    
    <div class="items">
      ${data.items.map(item => `
        <div class="item">
          <div class="item-name">${item.name}</div>
          <div class="item-details">
            <span>${item.quantity} x ${formatCurrency(item.price)}</span>
            <span>${formatCurrency(item.total)}</span>
          </div>
        </div>
      `).join("")}
    </div>
    
    <div class="totals">
      <div><span>${t.subtotal}:</span><span>${formatCurrency(data.subtotal)}</span></div>
      <div><span>${t.tax} (${data.taxRate}%):</span><span>${formatCurrency(data.taxAmount)}</span></div>
      <div class="total"><span>${t.total}:</span><span>${formatCurrency(data.total)}</span></div>
    </div>
    
    <div class="payment-info">
      <div><span>${t.payment}:</span><span>${data.paymentMethod === "cash" ? t.cash : t.card}</span></div>
      ${data.paymentMethod === "cash" && data.cashReceived ? `
        <div><span>${t.cashReceived}:</span><span>${formatCurrency(data.cashReceived)}</span></div>
        <div><span>${t.change}:</span><span>${formatCurrency(data.change || 0)}</span></div>
      ` : ""}
    </div>
    
    <div class="footer">
      ${tenant?.receiptFooterText ? `<div class="footer-text">${tenant.receiptFooterText}</div>` : ""}
      <div class="thank-you">${t.thankYou}</div>
    </div>
  </div>
  
  ${tenant?.couponEnabled && tenant?.couponText ? `
  <!-- Coupon Section - with page break to simulate paper cut -->
  <div class="coupon-cut" style="
    page-break-before: always;
    border-top: 2px dashed #000;
    margin-top: 10px;
    padding-top: 10px;
  ">
    <div style="text-align: center; font-weight: bold; margin-bottom: 5px;">✂ - - - - - - - - - - - - - - - - ✂</div>
  </div>
  <div class="coupon" style="
    width: 100%;
    padding: 10px 5px;
    font-family: ${fontFamily};
  ">
    ${renderCouponContent(tenant.couponText, fontFamily, fontSize)}
    <div style="margin-top: 10px; border-top: 1px dashed #000; padding-top: 5px; font-size: ${Math.round(fontSize * 0.8)}px; text-align: center;">
      ${tenant?.name || ""}
    </div>
  </div>
  ` : ""}
  
  <script>
    window.onload = function() {
      window.print();
      window.onafterprint = function() {
        window.close();
      };
    };
  </script>
</body>
</html>
  `;

  const printWindow = window.open("", "_blank", "width=350,height=600");
  if (printWindow) {
    printWindow.document.write(receiptHTML);
    printWindow.document.close();
  }
}
