import type { Tenant } from "@shared/schema";

interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
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
}

export function printReceipt(tenant: Tenant | null, data: ReceiptData) {
  const lang = tenant?.language || "en";
  
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
      font-family: 'Courier New', monospace;
      font-size: 12px;
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
      max-width: 60mm;
      max-height: 20mm;
      margin-bottom: 5px;
    }
    .company-name {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 3px;
    }
    .company-info {
      font-size: 10px;
      line-height: 1.4;
    }
    .header-text {
      font-size: 10px;
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
      font-size: 11px;
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
      font-size: 14px;
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
      font-size: 10px;
    }
    .footer-text {
      white-space: pre-wrap;
      margin-bottom: 10px;
    }
    .thank-you {
      font-size: 12px;
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
      ${tenant?.receiptShowLogo && tenant?.logo ? `<img src="${tenant.logo}" alt="Logo" class="logo" />` : ""}
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
