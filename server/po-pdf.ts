import PDFDocument from "pdfkit";

export interface POCompanyInfo {
  name: string;
  address?: string | null;
  phone?: string | null;
  taxId?: string | null;
  logo?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface POSupplierInfo {
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  documentType?: string | null;
  identification?: string | null;
  paymentTermsType?: string | null;
  paymentTermsDays?: number | null;
}

export interface POLineItem {
  code?: string | null;
  description: string;
  quantity: number;
  unitCost: number;
  total: number;
}

export interface POData {
  orderNumber: string;
  date: string;
  expectedDate?: string | null;
  status: string;
  notes?: string | null;
  createdByName?: string | null;
  warehouseName?: string | null;
  items: POLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  company: POCompanyInfo;
  supplier: POSupplierInfo;
}

const LOCALE_MAP: Record<string, string> = { en: "en-US", es: "es-ES", pt: "pt-BR" };

function getLocale(lang: string) {
  return LOCALE_MAP[lang] || "en-US";
}

function fmtCurrency(val: number, currency: string, lang: string): string {
  try {
    return new Intl.NumberFormat(getLocale(lang), { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(val);
  } catch {
    return `$${val.toFixed(2)}`;
  }
}

function fmtDate(dateStr: string, lang: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(getLocale(lang), { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

const LABELS: Record<string, Record<string, string>> = {
  en: {
    purchase_order: "Purchase Order",
    date: "Date",
    order_no: "Order No.",
    supplier: "Supplier",
    delivery_to: "Deliver To",
    contact: "Contact",
    phone: "Phone",
    email: "Email",
    address: "Address",
    tax_id: "Tax ID",
    payment_terms: "Payment Terms",
    cash: "Cash",
    credit: "Credit",
    days: "days",
    code: "Code",
    description: "Description",
    qty: "Qty",
    unit_price: "Unit Price",
    total: "Total",
    subtotal: "Subtotal",
    tax: "Tax",
    notes: "Notes",
    authorized_by: "Authorized by",
    expected_date: "Expected Date",
    warehouse: "Warehouse",
    page: "Page",
    of: "of",
    status_draft: "Draft",
    status_sent: "Sent",
    status_partial: "Partially Received",
    status_received: "Received",
    status_cancelled: "Cancelled",
  },
  es: {
    purchase_order: "Orden de Compra",
    date: "Fecha",
    order_no: "No. Orden",
    supplier: "Proveedor",
    delivery_to: "Entregar a",
    contact: "Contacto",
    phone: "Teléfono",
    email: "Email",
    address: "Dirección",
    tax_id: "NIT / ID Fiscal",
    payment_terms: "Condiciones de Pago",
    cash: "Contado",
    credit: "Crédito",
    days: "días",
    code: "Código",
    description: "Descripción",
    qty: "Cant.",
    unit_price: "Precio Unit.",
    total: "Total",
    subtotal: "Subtotal",
    tax: "IVA",
    notes: "Instrucciones",
    authorized_by: "Autorizado por",
    expected_date: "Fecha Esperada",
    warehouse: "Bodega",
    page: "Página",
    of: "de",
    status_draft: "Borrador",
    status_sent: "Enviada",
    status_partial: "Parcialmente Recibida",
    status_received: "Recibida",
    status_cancelled: "Cancelada",
  },
  pt: {
    purchase_order: "Ordem de Compra",
    date: "Data",
    order_no: "No. Pedido",
    supplier: "Fornecedor",
    delivery_to: "Entregar em",
    contact: "Contato",
    phone: "Telefone",
    email: "Email",
    address: "Endereço",
    tax_id: "CNPJ / ID Fiscal",
    payment_terms: "Condições de Pagamento",
    cash: "À Vista",
    credit: "Crédito",
    days: "dias",
    code: "Código",
    description: "Descrição",
    qty: "Qtd.",
    unit_price: "Preço Unit.",
    total: "Total",
    subtotal: "Subtotal",
    tax: "Imposto",
    notes: "Instruções",
    authorized_by: "Autorizado por",
    expected_date: "Data Prevista",
    warehouse: "Armazém",
    page: "Página",
    of: "de",
    status_draft: "Rascunho",
    status_sent: "Enviado",
    status_partial: "Parcialmente Recebido",
    status_received: "Recebido",
    status_cancelled: "Cancelado",
  },
};

const ACCENT = "#16a34a";
const ACCENT_LIGHT = "#dcfce7";
const HEADER_BG = "#f0fdf4";
const BORDER = "#d1d5db";

export async function generatePurchaseOrderPDF(data: POData, language: string = "es"): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const t = LABELS[language] || LABELS.es;
      const chunks: Buffer[] = [];
      const pageW = 595.28;
      const pageH = 841.89;
      const marginL = 40;
      const marginR = 40;
      const contentW = pageW - marginL - marginR;

      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 40, bottom: 60, left: marginL, right: marginR },
        bufferPages: true,
        info: {
          Title: `${t.purchase_order} - ${data.orderNumber}`,
          Author: data.company.name,
        },
      });

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      let y = 40;

      doc.rect(0, 0, pageW, 90).fill(ACCENT);
      doc.fontSize(22).font("Helvetica-Bold").fillColor("#ffffff");
      doc.text(data.company.name, marginL, 20, { width: contentW * 0.6 });
      doc.fontSize(20).font("Helvetica-Bold").fillColor("#ffffff");
      doc.text(t.purchase_order.toUpperCase(), pageW - marginR - 200, 20, { width: 200, align: "right" });

      doc.fontSize(9).font("Helvetica").fillColor("#e0f2e0");
      let headerInfoY = 50;
      if (data.company.address) { doc.text(data.company.address, marginL, headerInfoY); headerInfoY += 12; }
      if (data.company.city) { doc.text(data.company.city, marginL, headerInfoY); headerInfoY += 12; }
      if (data.company.phone) { doc.text(`${t.phone}: ${data.company.phone}`, marginL, headerInfoY); headerInfoY += 12; }
      if (data.company.taxId) { doc.text(`${t.tax_id}: ${data.company.taxId}`, marginL, headerInfoY); }

      doc.fontSize(9).font("Helvetica").fillColor("#e0f2e0");
      doc.text(`${t.date}: ${fmtDate(data.date, language)}`, pageW - marginR - 200, 50, { width: 200, align: "right" });
      doc.text(`${t.order_no}: ${data.orderNumber}`, pageW - marginR - 200, 62, { width: 200, align: "right" });

      y = 105;

      const boxW = (contentW - 15) / 2;

      doc.rect(marginL, y, boxW, 16).fill(ACCENT);
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#ffffff");
      doc.text(t.supplier, marginL + 8, y + 3);

      doc.rect(marginL + boxW + 15, y, boxW, 16).fill(ACCENT);
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#ffffff");
      doc.text(t.delivery_to, marginL + boxW + 23, y + 3);

      y += 16;
      const boxH = 80;

      doc.rect(marginL, y, boxW, boxH).lineWidth(0.5).strokeColor(BORDER).stroke();
      doc.rect(marginL + boxW + 15, y, boxW, boxH).lineWidth(0.5).strokeColor(BORDER).stroke();

      doc.fontSize(9).font("Helvetica").fillColor("#111827");
      let sY = y + 6;
      doc.font("Helvetica-Bold").text(data.supplier.name, marginL + 8, sY);
      sY += 13;
      doc.font("Helvetica");
      if (data.supplier.contactName) { doc.text(`${t.contact}: ${data.supplier.contactName}`, marginL + 8, sY); sY += 12; }
      if (data.supplier.phone) { doc.text(`${t.phone}: ${data.supplier.phone}`, marginL + 8, sY); sY += 12; }
      if (data.supplier.email) { doc.text(`${t.email}: ${data.supplier.email}`, marginL + 8, sY); sY += 12; }
      if (data.supplier.address) { doc.text(`${t.address}: ${data.supplier.address}`, marginL + 8, sY); sY += 12; }
      if (data.supplier.taxId || data.supplier.identification) {
        const idLabel = data.supplier.documentType ? data.supplier.documentType.toUpperCase() : t.tax_id;
        doc.text(`${idLabel}: ${data.supplier.identification || data.supplier.taxId || ""}`, marginL + 8, sY);
      }

      let dY = y + 6;
      const rightX = marginL + boxW + 23;
      doc.font("Helvetica-Bold").text(data.company.name, rightX, dY);
      dY += 13;
      doc.font("Helvetica");
      if (data.company.address) { doc.text(data.company.address, rightX, dY); dY += 12; }
      if (data.company.city) { doc.text(data.company.city, rightX, dY); dY += 12; }
      if (data.company.phone) { doc.text(`${t.phone}: ${data.company.phone}`, rightX, dY); dY += 12; }
      if (data.warehouseName) { doc.text(`${t.warehouse}: ${data.warehouseName}`, rightX, dY); dY += 12; }

      y += boxH + 10;

      const metaBoxW = contentW / 3;
      doc.rect(marginL, y, contentW, 28).fill(HEADER_BG).lineWidth(0.5).strokeColor(BORDER).stroke();
      doc.fontSize(8).font("Helvetica").fillColor("#6b7280");
      doc.text(t.payment_terms, marginL + 8, y + 3);
      doc.text(t.expected_date, marginL + metaBoxW + 8, y + 3);
      doc.text(t.authorized_by, marginL + metaBoxW * 2 + 8, y + 3);

      doc.fontSize(9).font("Helvetica-Bold").fillColor("#111827");
      const paymentTerms = data.supplier.paymentTermsType === "credit"
        ? `${t.credit} (${data.supplier.paymentTermsDays || 0} ${t.days})`
        : t.cash;
      doc.text(paymentTerms, marginL + 8, y + 15);
      doc.text(data.expectedDate ? fmtDate(data.expectedDate, language) : "-", marginL + metaBoxW + 8, y + 15);
      doc.text(data.createdByName || "-", marginL + metaBoxW * 2 + 8, y + 15);

      y += 38;

      const colCode = 55;
      const colDesc = contentW - colCode - 60 - 80 - 80;
      const colQty = 60;
      const colPrice = 80;
      const colTotal = 80;

      doc.rect(marginL, y, contentW, 20).fill(ACCENT);
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#ffffff");
      let cx = marginL + 6;
      doc.text(t.code, cx, y + 5, { width: colCode });
      cx += colCode;
      doc.text(t.description, cx, y + 5, { width: colDesc });
      cx += colDesc;
      doc.text(t.qty, cx, y + 5, { width: colQty, align: "center" });
      cx += colQty;
      doc.text(t.unit_price, cx, y + 5, { width: colPrice, align: "right" });
      cx += colPrice;
      doc.text(t.total, cx, y + 5, { width: colTotal, align: "right" });

      y += 20;

      doc.font("Helvetica").fontSize(9).fillColor("#111827");
      data.items.forEach((item, idx) => {
        if (y > pageH - 120) {
          doc.addPage();
          y = 40;
        }

        const bg = idx % 2 === 0 ? "#ffffff" : "#f9fafb";
        doc.rect(marginL, y, contentW, 18).fill(bg);
        doc.rect(marginL, y, contentW, 18).lineWidth(0.3).strokeColor("#e5e7eb").stroke();

        doc.fillColor("#111827");
        cx = marginL + 6;
        doc.text(item.code || "-", cx, y + 4, { width: colCode });
        cx += colCode;
        doc.text(item.description, cx, y + 4, { width: colDesc });
        cx += colDesc;
        doc.text(String(item.quantity), cx, y + 4, { width: colQty, align: "center" });
        cx += colQty;
        doc.text(fmtCurrency(item.unitCost, data.currency, language), cx, y + 4, { width: colPrice, align: "right" });
        cx += colPrice;
        doc.text(fmtCurrency(item.total, data.currency, language), cx, y + 4, { width: colTotal, align: "right" });

        y += 18;
      });

      if (data.items.length === 0) {
        doc.rect(marginL, y, contentW, 30).lineWidth(0.3).strokeColor("#e5e7eb").stroke();
        doc.fillColor("#9ca3af").text("-", marginL + 6, y + 10);
        y += 30;
      }

      doc.rect(marginL, y, contentW, 0.5).fill(ACCENT);
      y += 8;

      if (data.notes) {
        if (y > pageH - 120) { doc.addPage(); y = 40; }
        doc.fontSize(8).font("Helvetica-Bold").fillColor(ACCENT).text(t.notes, marginL, y);
        y += 12;
        doc.rect(marginL, y, contentW * 0.55, 40).lineWidth(0.5).strokeColor(BORDER).stroke();
        doc.fontSize(8).font("Helvetica").fillColor("#374151");
        doc.text(data.notes, marginL + 6, y + 5, { width: contentW * 0.55 - 12, height: 32 });
      }

      const totalsX = pageW - marginR - 180;
      let tY = y;
      doc.fontSize(9).font("Helvetica").fillColor("#374151");
      doc.text(t.subtotal, totalsX, tY, { width: 100, align: "right" });
      doc.font("Helvetica-Bold").text(fmtCurrency(data.subtotal, data.currency, language), totalsX + 100, tY, { width: 80, align: "right" });
      tY += 16;
      doc.font("Helvetica").text(t.tax, totalsX, tY, { width: 100, align: "right" });
      doc.font("Helvetica-Bold").text(fmtCurrency(data.tax, data.currency, language), totalsX + 100, tY, { width: 80, align: "right" });
      tY += 18;
      doc.rect(totalsX, tY - 2, 180, 20).fill(ACCENT);
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#ffffff");
      doc.text(t.total.toUpperCase(), totalsX + 8, tY + 2, { width: 88, align: "right" });
      doc.text(fmtCurrency(data.total, data.currency, language), totalsX + 100, tY + 2, { width: 72, align: "right" });

      y = Math.max(y, tY) + 40;

      if (y > pageH - 80) { doc.addPage(); y = 40; }
      doc.fontSize(8).font("Helvetica").fillColor("#6b7280");
      doc.text(`${t.authorized_by}:`, marginL, y);
      y += 30;
      doc.moveTo(marginL, y).lineTo(marginL + 180, y).lineWidth(0.5).strokeColor(BORDER).stroke();
      y += 5;
      doc.text(data.createdByName || "", marginL, y);

      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(7).font("Helvetica").fillColor("#9ca3af");
        doc.text(
          `${t.page} ${i + 1} ${t.of} ${pageCount}`,
          marginL,
          pageH - 30,
          { width: contentW, align: "center" }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
