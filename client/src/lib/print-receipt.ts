import type { Tenant } from "@shared/schema";
import { printBridge } from "./print-bridge";
import { renderCouponContent, getCouponPlainText } from "@/components/coupon-editor";
import QRCode from "qrcode";

// Generate QR code as data URL for embedding in receipts
async function generateQRCodeDataURL(data: string): Promise<string> {
  try {
    return await QRCode.toDataURL(data, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: "M",
    });
  } catch (error) {
    console.error("Failed to generate QR code:", error);
    return "";
  }
}

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

interface TaxEntry {
  name: string;
  rate: number;
  amount: number;
}

interface ElectronicBillingInfo {
  cufe?: string;
  qrCode?: string;
  documentNumber?: string;
  prefix?: string;
}

interface CustomerInfo {
  name?: string | null;
  idNumber?: string | null;
  idType?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  loyaltyPoints?: number | null;
}

interface ReceiptData {
  orderNumber: string;
  date: Date;
  items: ReceiptItem[];
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  taxes?: TaxEntry[];
  total: number;
  paymentMethod: string;
  cashReceived?: number;
  change?: number;
  cashier?: string;
  customer?: string;
  customerInfo?: CustomerInfo;
  discount?: number;
  discountPercent?: number;
  payments?: PaymentEntry[];
  electronicBilling?: ElectronicBillingInfo;
}

async function tryPrintBridge(tenant: Tenant | null, data: ReceiptData): Promise<boolean> {
  try {
    const status = await printBridge.checkStatus();
    if (!status.isAvailable) {
      return false;
    }

    // Get translated tax ID label based on language
    const lang = tenant?.language || "en";
    const taxIdLabels: Record<string, string> = {
      en: "Tax ID",
      es: "NIT",
      pt: "CNPJ/CPF",
    };
    const taxIdLabel = taxIdLabels[lang] || taxIdLabels.en;

    // Format date with proper locale - use 24h format to avoid AM/PM issues
    const dateLocale = lang === "es" ? "es-CO" : lang === "pt" ? "pt-BR" : "en-US";
    const formattedDate = new Intl.DateTimeFormat(dateLocale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(data.date);

    const result = await printBridge.printReceipt({
      language: lang,
      businessName: tenant?.name,
      headerText: tenant?.receiptHeaderText || undefined,
      address: tenant?.receiptShowAddress ? tenant.address || undefined : undefined,
      phone: tenant?.receiptShowPhone ? tenant.phone || undefined : undefined,
      taxId: tenant?.receiptTaxId || undefined,
      taxIdLabel: taxIdLabel,
      fontSize: tenant?.receiptFontSize || 12,
      fontFamily: tenant?.receiptFontFamily || "monospace",
      logoSize: tenant?.receiptLogoSize || 200,
      logoUrl: tenant?.receiptShowLogo ? (tenant?.receiptLogo || tenant?.logo || undefined) : undefined,
      orderNumber: data.orderNumber,
      date: formattedDate,
      cashier: data.cashier,
      customer: data.customer,
      customerInfo: data.customerInfo ? {
        name: data.customerInfo.name || undefined,
        idType: data.customerInfo.idType || undefined,
        idNumber: data.customerInfo.idNumber || undefined,
        phone: data.customerInfo.phone || undefined,
        email: data.customerInfo.email || undefined,
        address: data.customerInfo.address || undefined,
        loyaltyPoints: data.customerInfo.loyaltyPoints ?? undefined,
      } : undefined,
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
      taxes: data.taxes?.map(t => ({ name: t.name, rate: t.rate, amount: t.amount })),
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
      electronicBilling: data.electronicBilling ? {
        cufe: data.electronicBilling.cufe,
        qrCode: data.electronicBilling.qrCode,
        documentNumber: data.electronicBilling.documentNumber,
        prefix: data.electronicBilling.prefix,
      } : undefined,
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

  await printReceiptBrowser(tenant, data);
}

async function printReceiptBrowser(tenant: Tenant | null, data: ReceiptData) {
  // Generate QR code data URL if electronic billing info exists
  let qrCodeDataUrl = "";
  if (data.electronicBilling?.qrCode) {
    qrCodeDataUrl = await generateQRCodeDataURL(data.electronicBilling.qrCode);
  } else if (data.electronicBilling?.cufe) {
    const dianUrl = `https://catalogo-vpfe.dian.gov.co/User/SearchDocument?DocumentKey=${data.electronicBilling.cufe}`;
    qrCodeDataUrl = await generateQRCodeDataURL(dianUrl);
  }
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
      hour12: false,
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
    
    ${data.customerInfo ? `
    <div class="customer-info" style="margin: 10px 0; padding-bottom: 10px; border-bottom: 1px dashed #000; font-size: ${Math.round(fontSize * 0.9)}px;">
      <div style="font-weight: bold; margin-bottom: 5px;">${lang === "es" ? "Cliente" : lang === "pt" ? "Cliente" : "Customer"}:</div>
      ${data.customerInfo.name ? `<div>${data.customerInfo.name}</div>` : ""}
      ${data.customerInfo.idNumber ? `<div>${data.customerInfo.idType === "nit" ? "NIT" : data.customerInfo.idType === "cedula_ciudadania" ? "CC" : "ID"}: ${data.customerInfo.idNumber}</div>` : ""}
      ${data.customerInfo.phone ? `<div>${lang === "es" ? "Tel" : "Phone"}: ${data.customerInfo.phone}</div>` : ""}
      ${data.customerInfo.email ? `<div>${data.customerInfo.email}</div>` : ""}
      ${data.customerInfo.loyaltyPoints != null ? `<div style="margin-top: 3px;">${lang === "es" ? "Puntos de fidelidad" : lang === "pt" ? "Pontos de fidelidade" : "Loyalty Points"}: ${data.customerInfo.loyaltyPoints.toLocaleString()}</div>` : ""}
    </div>
    ` : ""}
    
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
      ${data.taxes && data.taxes.length > 0 
        ? data.taxes.map(tax => `<div><span>${tax.name} (${tax.rate}%):</span><span>${formatCurrency(tax.amount)}</span></div>`).join("")
        : `<div><span>${t.tax} (${data.taxRate}%):</span><span>${formatCurrency(data.taxAmount)}</span></div>`
      }
      <div class="total"><span>${t.total}:</span><span>${formatCurrency(data.total)}</span></div>
    </div>
    
    <div class="payment-info">
      <div><span>${t.payment}:</span><span>${data.paymentMethod === "cash" ? t.cash : t.card}</span></div>
      ${data.paymentMethod === "cash" && data.cashReceived ? `
        <div><span>${t.cashReceived}:</span><span>${formatCurrency(data.cashReceived)}</span></div>
        <div><span>${t.change}:</span><span>${formatCurrency(data.change || 0)}</span></div>
      ` : ""}
    </div>
    
    ${data.electronicBilling?.cufe ? `
    <div class="electronic-billing" style="margin: 15px 0; padding: 10px 0; border-top: 1px dashed #000; text-align: center;">
      ${data.electronicBilling.prefix && data.electronicBilling.documentNumber ? `
        <div style="font-weight: bold; margin-bottom: 8px; font-size: ${Math.round(fontSize * 1.0)}px;">
          ${lang === "es" ? "FACTURA ELECTRÓNICA" : lang === "pt" ? "FATURA ELETRÔNICA" : "ELECTRONIC INVOICE"} #: ${data.electronicBilling.prefix}${data.electronicBilling.documentNumber}
        </div>
      ` : `
        <div style="font-weight: bold; margin-bottom: 8px; font-size: ${Math.round(fontSize * 0.9)}px;">
          ${lang === "es" ? "FACTURA ELECTRÓNICA" : lang === "pt" ? "FATURA ELETRÔNICA" : "ELECTRONIC INVOICE"}
        </div>
      `}
      ${qrCodeDataUrl ? `
        <div style="margin: 10px auto; text-align: center;">
          <img src="${qrCodeDataUrl}" alt="QR Code DIAN" style="width: 35mm; height: 35mm; image-rendering: pixelated;" />
        </div>
      ` : ""}
      <div style="font-size: ${Math.round(fontSize * 0.7)}px; word-break: break-all; margin-top: 5px; line-height: 1.3;">
        <strong>CUFE:</strong><br/>
        ${data.electronicBilling.cufe}
      </div>
    </div>
    ` : data.electronicBilling?.documentNumber ? `
    <div class="electronic-billing-pending" style="margin: 15px 0; padding: 10px 0; border-top: 1px dashed #000; text-align: center;">
      <div style="font-weight: bold; margin-bottom: 8px; font-size: ${Math.round(fontSize * 0.9)}px;">
        ${lang === "es" ? "FACTURA ELECTRÓNICA PENDIENTE" : lang === "pt" ? "FATURA ELETRÔNICA PENDENTE" : "ELECTRONIC INVOICE PENDING"}
      </div>
      ${data.electronicBilling.prefix && data.electronicBilling.documentNumber ? `
        <div style="font-size: ${Math.round(fontSize * 0.85)}px; margin-bottom: 8px;">
          #: ${data.electronicBilling.prefix}${data.electronicBilling.documentNumber}
        </div>
      ` : ""}
      <div style="font-size: ${Math.round(fontSize * 0.75)}px; padding: 8px; background: #f5f5f5; border-radius: 4px; line-height: 1.4;">
        ${lang === "es" 
          ? "Conexión DIAN no disponible. El documento será enviado automáticamente cuando se restablezca la conexión." 
          : lang === "pt" 
            ? "Conexão DIAN indisponível. O documento será enviado automaticamente quando a conexão for restabelecida."
            : "DIAN connection unavailable. Document will be sent automatically when connection is restored."}
      </div>
    </div>
    ` : ""}
    
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
  
  <!-- FLOWP Branding Footer - Always last -->
  <div class="flowp-footer" style="
    margin-top: 15px;
    padding-top: 10px;
    border-top: 1px dashed #000;
    text-align: center;
    font-size: ${Math.round(fontSize * 0.75)}px;
    line-height: 1.4;
  ">
    <div>Controla todo tu flujo con FLOWP.app</div>
    <div>Activa tu prueba gratis por 30 días.</div>
    <div style="margin-top: 5px; font-weight: bold;">Software Cloud para tiendas, FLOWP</div>
  </div>
  
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
