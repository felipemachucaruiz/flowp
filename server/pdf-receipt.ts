import PDFDocument from "pdfkit";
import QRCode from "qrcode";

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: string;
  total?: string;
}

export interface ReceiptElectronicBilling {
  cufe?: string;
  documentNumber?: string;
  prefix?: string;
  resolutionNumber?: string;
  resolutionStartDate?: string;
  resolutionEndDate?: string;
  authRangeFrom?: number;
  authRangeTo?: number;
}

export interface ReceiptCustomerInfo {
  name?: string | null;
  idNumber?: string | null;
  idType?: string | null;
  phone?: string | null;
  email?: string | null;
  loyaltyPoints?: number | null;
}

export interface ReceiptPayment {
  type: "cash" | "card";
  amount: string;
}

export interface ReceiptTax {
  name: string;
  rate: string;
  amount: string;
}

export interface ReceiptData {
  receiptNumber: string;
  date: string;
  time?: string;
  cashier?: string;
  items: ReceiptItem[];
  subtotal: string;
  tax: string;
  taxes?: ReceiptTax[];
  total: string;
  paymentMethod: string;
  payments?: ReceiptPayment[];
  cashReceived?: string;
  change?: string;
  discount?: string;
  companyName: string;
  companyLogo?: string;
  companyAddress?: string;
  companyCity?: string;
  companyPhone?: string;
  companyTaxId?: string;
  headerText?: string;
  footerText?: string;
  currency?: string;
  customerInfo?: ReceiptCustomerInfo;
  electronicBilling?: ReceiptElectronicBilling;
  couponLines?: { text: string; bold?: boolean; align?: string; size?: string }[];
}

const translations: Record<string, Record<string, string>> = {
  en: {
    receipt: "Receipt",
    date: "Date",
    time: "Time",
    cashier: "Cashier",
    customer: "Customer",
    item: "Item",
    qty: "Qty",
    price: "Price",
    total: "Total",
    subtotal: "Subtotal",
    tax: "Tax",
    discount: "Discount",
    paymentMethod: "Payment Method",
    payment: "Payment",
    cash: "CASH",
    card: "CARD",
    cashReceived: "Cash Received",
    change: "Change",
    thankYou: "Thank you for your purchase!",
    poweredBy: "Powered by Flowp POS",
    loyaltyPoints: "Loyalty Points",
    tel: "Tel",
    taxId: "Tax ID",
    electronicInvoice: "ELECTRONIC INVOICE",
  },
  es: {
    receipt: "Recibo",
    date: "Fecha",
    time: "Hora",
    cashier: "Cajero",
    customer: "Cliente",
    item: "Artículo",
    qty: "Cant.",
    price: "Precio",
    total: "Total",
    subtotal: "Subtotal",
    tax: "Impuesto",
    discount: "Descuento",
    paymentMethod: "Método de Pago",
    payment: "Pago",
    cash: "EFECTIVO",
    card: "TARJETA",
    cashReceived: "Efectivo Recibido",
    change: "Cambio",
    thankYou: "¡Gracias por su compra!",
    poweredBy: "Desarrollado por Flowp POS",
    loyaltyPoints: "Puntos de fidelidad",
    tel: "Tel",
    taxId: "NIT/RUT",
    electronicInvoice: "FACTURA ELECTRÓNICA",
  },
  pt: {
    receipt: "Recibo",
    date: "Data",
    time: "Hora",
    cashier: "Caixa",
    customer: "Cliente",
    item: "Item",
    qty: "Qtd.",
    price: "Preço",
    total: "Total",
    subtotal: "Subtotal",
    tax: "Imposto",
    discount: "Desconto",
    paymentMethod: "Método de Pagamento",
    payment: "Pagamento",
    cash: "DINHEIRO",
    card: "CARTÃO",
    cashReceived: "Dinheiro Recebido",
    change: "Troco",
    thankYou: "Obrigado pela sua compra!",
    poweredBy: "Desenvolvido por Flowp POS",
    loyaltyPoints: "Pontos de fidelidade",
    tel: "Tel",
    taxId: "CNPJ/CPF",
    electronicInvoice: "FATURA ELETRÔNICA",
  },
};

async function fetchLogoBuffer(logoUrl: string): Promise<Buffer | null> {
  try {
    if (logoUrl.startsWith("/objects/")) {
      const baseUrl = process.env.REPLIT_DEPLOYMENT_URL
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
        || process.env.APP_URL
        || `http://localhost:5000`;
      logoUrl = `${baseUrl}${logoUrl}`;
    } else if (!logoUrl.startsWith("http")) {
      return null;
    }

    const response = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error("[pdf-receipt] Failed to fetch logo:", error);
    return null;
  }
}

export async function generateReceiptPDF(
  data: ReceiptData,
  language: string = "en"
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const t = translations[language] || translations.en;
      const chunks: Buffer[] = [];

      let logoBuffer: Buffer | null = null;
      if (data.companyLogo) {
        logoBuffer = await fetchLogoBuffer(data.companyLogo);
      }

      const doc = new PDFDocument({
        size: [226, 800],
        margins: { top: 20, bottom: 20, left: 15, right: 15 },
        autoFirstPage: true,
      });

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = 226;
      const contentWidth = pageWidth - 30;

      if (logoBuffer) {
        try {
          const maxLogoWidth = 80;
          const maxLogoHeight = 60;
          const x = (pageWidth - maxLogoWidth) / 2;
          const startY = doc.y;
          doc.image(logoBuffer, x, startY, {
            fit: [maxLogoWidth, maxLogoHeight],
            align: "center",
            valign: "center",
          });
          doc.y = startY + maxLogoHeight + 5;
        } catch (err) {
          console.error("[pdf-receipt] Logo embed failed:", err);
        }
      }

      doc.fontSize(14).font("Helvetica-Bold");
      doc.text(data.companyName, 15, doc.y, {
        width: contentWidth,
        align: "center",
      });

      doc.fontSize(8).font("Helvetica");
      if (data.companyAddress) {
        doc.text(data.companyAddress, 15, doc.y + 3, {
          width: contentWidth,
          align: "center",
        });
      }

      if (data.companyCity) {
        doc.text(data.companyCity, 15, doc.y + 2, {
          width: contentWidth,
          align: "center",
        });
      }

      if (data.companyPhone) {
        doc.text(`${t.tel}: ${data.companyPhone}`, 15, doc.y + 2, {
          width: contentWidth,
          align: "center",
        });
      }

      if (data.companyTaxId) {
        doc.text(`${t.taxId}: ${data.companyTaxId}`, 15, doc.y + 2, {
          width: contentWidth,
          align: "center",
        });
      }

      if (data.headerText) {
        doc.moveDown(0.3);
        doc.fontSize(8).font("Helvetica-Oblique");
        doc.text(data.headerText, 15, doc.y, {
          width: contentWidth,
          align: "center",
        });
      }

      doc.moveDown(0.5);
      doc.moveTo(15, doc.y).lineTo(pageWidth - 15, doc.y).stroke();
      doc.moveDown(0.3);

      doc.fontSize(12).font("Helvetica-Bold");
      doc.text(`${t.receipt} #${data.receiptNumber}`, 15, doc.y, {
        width: contentWidth,
        align: "center",
      });

      doc.moveDown(0.3);
      doc.fontSize(9).font("Helvetica");

      const labelX = 15;
      const valueX = 100;

      doc.text(`${t.date}:`, labelX, doc.y, { continued: false });
      doc.text(data.date, valueX, doc.y - 11, { width: contentWidth - valueX + 15 });

      if (data.time) {
        doc.text(`${t.time}:`, labelX, doc.y, { continued: false });
        doc.text(data.time, valueX, doc.y - 11, { width: contentWidth - valueX + 15 });
      }

      if (data.cashier) {
        doc.text(`${t.cashier}:`, labelX, doc.y, { continued: false });
        doc.text(data.cashier, valueX, doc.y - 11, { width: contentWidth - valueX + 15 });
      }

      if (data.customerInfo) {
        doc.moveDown(0.5);
        doc.moveTo(15, doc.y).lineTo(pageWidth - 15, doc.y).stroke();
        doc.moveDown(0.3);

        doc.fontSize(9).font("Helvetica-Bold");
        doc.text(`${t.customer}:`, labelX, doc.y, { width: contentWidth });

        doc.fontSize(8).font("Helvetica");
        if (data.customerInfo.name) {
          doc.text(data.customerInfo.name, labelX, doc.y, { width: contentWidth });
        }
        if (data.customerInfo.idNumber) {
          const idLabel = data.customerInfo.idType === "nit" ? "NIT" :
            data.customerInfo.idType === "cedula_ciudadania" ? "CC" :
            data.customerInfo.idType === "cedula_extranjeria" ? "CE" :
            data.customerInfo.idType === "pasaporte" ? "Pasaporte" : "ID";
          doc.text(`${idLabel}: ${data.customerInfo.idNumber}`, labelX, doc.y, { width: contentWidth });
        }
        if (data.customerInfo.phone) {
          doc.text(`${t.tel}: ${data.customerInfo.phone}`, labelX, doc.y, { width: contentWidth });
        }
        if (data.customerInfo.email) {
          doc.text(data.customerInfo.email, labelX, doc.y, { width: contentWidth });
        }
        if (data.customerInfo.loyaltyPoints != null) {
          doc.text(`${t.loyaltyPoints}: ${data.customerInfo.loyaltyPoints.toLocaleString()}`, labelX, doc.y + 2, { width: contentWidth });
        }
      }

      doc.moveDown(0.5);
      doc.moveTo(15, doc.y).lineTo(pageWidth - 15, doc.y).stroke();
      doc.moveDown(0.3);

      doc.fontSize(8).font("Helvetica-Bold");
      const col1 = 15;
      const col2 = 120;
      const col3 = 150;

      doc.text(t.item, col1, doc.y, { width: 100 });
      const headerY = doc.y - 10;
      doc.text(t.qty, col2, headerY, { width: 25 });
      doc.text(t.price, col3, headerY, { width: 50 });

      doc.moveDown(0.3);
      doc.moveTo(15, doc.y).lineTo(pageWidth - 15, doc.y).stroke();
      doc.moveDown(0.3);

      doc.font("Helvetica").fontSize(8);
      for (const item of data.items) {
        const itemY = doc.y;
        doc.text(item.name, col1, itemY, { width: 100 });
        const nextY = doc.y;
        doc.text(item.quantity.toString(), col2, itemY, { width: 25 });
        doc.text(item.price, col3, itemY, { width: 55 });
        doc.y = nextY;
      }

      doc.moveDown(0.5);
      doc.moveTo(15, doc.y).lineTo(pageWidth - 15, doc.y).stroke();
      doc.moveDown(0.3);

      const totLabelX = 15;
      const totValueX = 140;

      doc.fontSize(9).font("Helvetica");
      doc.text(t.subtotal, totLabelX, doc.y, { continued: false });
      doc.text(data.subtotal, totValueX, doc.y - 11, { width: 60, align: "right" });

      if (data.discount) {
        doc.text(t.discount, totLabelX, doc.y, { continued: false });
        doc.text(`-${data.discount}`, totValueX, doc.y - 11, { width: 60, align: "right" });
      }

      if (data.taxes && data.taxes.length > 0) {
        for (const tax of data.taxes) {
          doc.text(`${tax.name} (${tax.rate}%)`, totLabelX, doc.y, { continued: false });
          doc.text(tax.amount, totValueX, doc.y - 11, { width: 60, align: "right" });
        }
      } else {
        doc.text(t.tax, totLabelX, doc.y, { continued: false });
        doc.text(data.tax, totValueX, doc.y - 11, { width: 60, align: "right" });
      }

      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").fontSize(11);
      doc.text(`${t.total}:`, totLabelX, doc.y, { continued: false });
      doc.text(data.total, totValueX, doc.y - 13, { width: 60, align: "right" });

      doc.moveDown(0.5);
      doc.font("Helvetica").fontSize(9);

      if (data.payments && data.payments.length > 0) {
        for (const p of data.payments) {
          const pLabel = p.type === "cash" ? t.cash : t.card;
          doc.text(`${t.payment} (${pLabel}):`, totLabelX, doc.y, { continued: false });
          doc.text(p.amount, totValueX, doc.y - 11, { width: 60, align: "right" });
        }
      } else {
        const methodLabel = data.paymentMethod === "cash" ? t.cash :
          data.paymentMethod === "card" ? t.card : data.paymentMethod;
        doc.text(`${t.payment}:`, totLabelX, doc.y, { continued: false });
        doc.text(methodLabel, totValueX, doc.y - 11, { width: 60, align: "right" });
      }

      if (data.cashReceived) {
        doc.text(`${t.cashReceived}:`, totLabelX, doc.y, { continued: false });
        doc.text(data.cashReceived, totValueX, doc.y - 11, { width: 60, align: "right" });
      }

      if (data.change) {
        doc.text(`${t.change}:`, totLabelX, doc.y, { continued: false });
        doc.text(data.change, totValueX, doc.y - 11, { width: 60, align: "right" });
      }

      if (data.electronicBilling?.cufe || data.electronicBilling?.resolutionNumber) {
        doc.moveDown(0.5);
        doc.moveTo(15, doc.y).lineTo(pageWidth - 15, doc.y).dash(3, { space: 2 }).stroke();
        doc.undash();
        doc.moveDown(0.3);

        if (data.electronicBilling.prefix && data.electronicBilling.documentNumber) {
          doc.fontSize(9).font("Helvetica-Bold").fillColor("#000000");
          doc.text(`${t.electronicInvoice} #: ${data.electronicBilling.prefix}${data.electronicBilling.documentNumber}`, 15, doc.y, {
            width: contentWidth,
            align: "center",
          });
        }

        if (data.electronicBilling.resolutionNumber) {
          doc.moveDown(0.3);
          doc.fontSize(7).font("Helvetica").fillColor("#000000");
          let resLine = `RES.DIAN# ${data.electronicBilling.resolutionNumber}`;
          if (data.electronicBilling.resolutionStartDate && data.electronicBilling.resolutionEndDate) {
            const start = new Date(data.electronicBilling.resolutionStartDate);
            const end = new Date(data.electronicBilling.resolutionEndDate);
            const months = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
            resLine += ` VIG ${months} MESES`;
          }
          doc.text(resLine, 15, doc.y, { width: contentWidth });

          if (data.electronicBilling.resolutionStartDate && data.electronicBilling.resolutionEndDate) {
            doc.text(`DEL ${data.electronicBilling.resolutionStartDate} AL ${data.electronicBilling.resolutionEndDate}`, 15, doc.y, { width: contentWidth });
          }

          if (data.electronicBilling.prefix && data.electronicBilling.authRangeFrom != null && data.electronicBilling.authRangeTo != null) {
            doc.text(`RANG.AUT ${data.electronicBilling.prefix} ${data.electronicBilling.authRangeFrom} AL ${data.electronicBilling.prefix} ${data.electronicBilling.authRangeTo}`, 15, doc.y, { width: contentWidth });
          }
        }

        if (data.electronicBilling.cufe) {
          doc.moveDown(0.3);

          try {
            const dianUrl = `https://catalogo-vpfe.dian.gov.co/User/SearchDocument?DocumentKey=${data.electronicBilling.cufe}`;
            const qrDataUrl = await QRCode.toDataURL(dianUrl, {
              width: 200,
              margin: 1,
              errorCorrectionLevel: "M",
            });
            const qrBuffer = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
            const qrSize = 80;
            const qrX = (pageWidth - qrSize) / 2;
            const qrStartY = doc.y;
            doc.image(qrBuffer, qrX, qrStartY, { width: qrSize, height: qrSize });
            doc.y = qrStartY + qrSize + 5;
          } catch (err) {
            console.error("[pdf-receipt] QR code generation failed:", err);
          }

          doc.fontSize(6).font("Helvetica").fillColor("#000000");
          doc.text("CUFE:", 15, doc.y, { width: contentWidth });
          doc.text(data.electronicBilling.cufe, 15, doc.y, { width: contentWidth });
        }
      }

      doc.moveDown(0.8);
      doc.moveTo(15, doc.y).lineTo(pageWidth - 15, doc.y).stroke();
      doc.moveDown(0.5);

      if (data.footerText) {
        doc.fontSize(8).font("Helvetica").fillColor("#000000");
        doc.text(data.footerText, 15, doc.y, {
          width: contentWidth,
          align: "center",
        });
        doc.moveDown(0.3);
      }

      doc.fontSize(10).font("Helvetica-Bold").fillColor("#000000");
      doc.text(t.thankYou, 15, doc.y, {
        width: contentWidth,
        align: "center",
      });

      if (data.couponLines && data.couponLines.length > 0) {
        doc.moveDown(0.5);
        doc.moveTo(15, doc.y).lineTo(pageWidth - 15, doc.y).dash(3, { space: 2 }).stroke();
        doc.undash();
        doc.moveDown(0.5);

        for (const line of data.couponLines) {
          if (!line || !line.text) continue;
          const fontSize = line.size === "xlarge" ? 14 : line.size === "large" ? 12 : line.size === "small" ? 7 : 9;
          doc.fontSize(fontSize).font(line.bold ? "Helvetica-Bold" : "Helvetica").fillColor("#000000");
          const align = (line.align === "left" || line.align === "right" || line.align === "center") ? line.align : "center";
          doc.text(line.text, 15, doc.y, {
            width: contentWidth,
            align: align as "left" | "right" | "center",
          });
        }
      }

      doc.moveDown(0.8);
      doc.moveTo(15, doc.y).lineTo(pageWidth - 15, doc.y).stroke();
      doc.moveDown(0.3);
      doc.fontSize(7).font("Helvetica").fillColor("#666666");
      doc.text("Controla todo tu flujo con FLOWP.app", 15, doc.y, {
        width: contentWidth,
        align: "center",
      });
      doc.text("Activa tu prueba gratis por 30 días.", 15, doc.y, {
        width: contentWidth,
        align: "center",
      });
      doc.moveDown(0.2);
      doc.font("Helvetica-Bold");
      doc.text("Software Cloud para tiendas, FLOWP", 15, doc.y, {
        width: contentWidth,
        align: "center",
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
