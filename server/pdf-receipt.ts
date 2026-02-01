import PDFDocument from "pdfkit";

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: string;
  total?: string;
}

export interface ReceiptData {
  receiptNumber: string;
  date: string;
  time?: string;
  cashier?: string;
  items: ReceiptItem[];
  subtotal: string;
  tax: string;
  total: string;
  paymentMethod: string;
  companyName: string;
  companyLogo?: string;
  companyAddress?: string;
  companyPhone?: string;
  currency?: string;
}

const translations: Record<string, Record<string, string>> = {
  en: {
    receipt: "Receipt",
    date: "Date",
    time: "Time",
    cashier: "Cashier",
    item: "Item",
    qty: "Qty",
    price: "Price",
    total: "Total",
    subtotal: "Subtotal",
    tax: "Tax",
    paymentMethod: "Payment Method",
    thankYou: "Thank you for your purchase!",
    poweredBy: "Powered by Flowp POS",
  },
  es: {
    receipt: "Recibo",
    date: "Fecha",
    time: "Hora",
    cashier: "Cajero",
    item: "Artículo",
    qty: "Cant.",
    price: "Precio",
    total: "Total",
    subtotal: "Subtotal",
    tax: "Impuesto",
    paymentMethod: "Método de Pago",
    thankYou: "¡Gracias por su compra!",
    poweredBy: "Desarrollado por Flowp POS",
  },
  pt: {
    receipt: "Recibo",
    date: "Data",
    time: "Hora",
    cashier: "Caixa",
    item: "Item",
    qty: "Qtd.",
    price: "Preço",
    total: "Total",
    subtotal: "Subtotal",
    tax: "Imposto",
    paymentMethod: "Método de Pagamento",
    thankYou: "Obrigado pela sua compra!",
    poweredBy: "Desenvolvido por Flowp POS",
  },
};

export async function generateReceiptPDF(
  data: ReceiptData,
  language: string = "en"
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const t = translations[language] || translations.en;
      const chunks: Buffer[] = [];

      const doc = new PDFDocument({
        size: [226, 600],
        margins: { top: 20, bottom: 20, left: 15, right: 15 },
        autoFirstPage: true,
      });

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = 226;
      const contentWidth = pageWidth - 30;
      const centerX = pageWidth / 2;

      doc.fontSize(14).font("Helvetica-Bold");
      doc.text(data.companyName, 15, doc.y, {
        width: contentWidth,
        align: "center",
      });

      if (data.companyAddress) {
        doc.fontSize(8).font("Helvetica");
        doc.text(data.companyAddress, 15, doc.y + 5, {
          width: contentWidth,
          align: "center",
        });
      }

      if (data.companyPhone) {
        doc.fontSize(8).font("Helvetica");
        doc.text(data.companyPhone, 15, doc.y + 2, {
          width: contentWidth,
          align: "center",
        });
      }

      doc.moveDown(0.5);
      doc
        .moveTo(15, doc.y)
        .lineTo(pageWidth - 15, doc.y)
        .stroke();
      doc.moveDown(0.3);

      doc.fontSize(12).font("Helvetica-Bold");
      doc.text(`${t.receipt} #${data.receiptNumber}`, 15, doc.y, {
        width: contentWidth,
        align: "center",
      });

      doc.moveDown(0.3);
      doc.fontSize(9).font("Helvetica");
      doc.text(`${t.date}: ${data.date}`, 15, doc.y, { width: contentWidth });
      if (data.time) {
        doc.text(`${t.time}: ${data.time}`, 15, doc.y, { width: contentWidth });
      }
      if (data.cashier) {
        doc.text(`${t.cashier}: ${data.cashier}`, 15, doc.y, {
          width: contentWidth,
        });
      }

      doc.moveDown(0.5);
      doc
        .moveTo(15, doc.y)
        .lineTo(pageWidth - 15, doc.y)
        .stroke();
      doc.moveDown(0.3);

      doc.fontSize(8).font("Helvetica-Bold");
      const col1 = 15;
      const col2 = 120;
      const col3 = 150;
      const col4 = 180;

      doc.text(t.item, col1, doc.y, { width: 100 });
      const headerY = doc.y - 10;
      doc.text(t.qty, col2, headerY, { width: 25 });
      doc.text(t.price, col3, headerY, { width: 30 });

      doc.moveDown(0.3);
      doc
        .moveTo(15, doc.y)
        .lineTo(pageWidth - 15, doc.y)
        .stroke();
      doc.moveDown(0.3);

      doc.font("Helvetica").fontSize(8);
      for (const item of data.items) {
        const itemY = doc.y;
        doc.text(item.name, col1, itemY, { width: 100 });
        const nextY = doc.y;
        doc.text(item.quantity.toString(), col2, itemY, { width: 25 });
        doc.text(item.price, col3, itemY, { width: 50 });
        doc.y = nextY;
      }

      doc.moveDown(0.5);
      doc
        .moveTo(15, doc.y)
        .lineTo(pageWidth - 15, doc.y)
        .stroke();
      doc.moveDown(0.3);

      doc.fontSize(9).font("Helvetica");
      const labelX = 15;
      const valueX = 140;

      doc.text(t.subtotal, labelX, doc.y, { continued: false });
      doc.text(data.subtotal, valueX, doc.y - 11, { width: 60, align: "right" });

      doc.text(t.tax, labelX, doc.y, { continued: false });
      doc.text(data.tax, valueX, doc.y - 11, { width: 60, align: "right" });

      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").fontSize(11);
      doc.text(t.total, labelX, doc.y, { continued: false });
      doc.text(data.total, valueX, doc.y - 13, { width: 60, align: "right" });

      doc.moveDown(0.5);
      doc.font("Helvetica").fontSize(9);
      doc.text(`${t.paymentMethod}: ${data.paymentMethod}`, 15, doc.y, {
        width: contentWidth,
      });

      doc.moveDown(1);
      doc
        .moveTo(15, doc.y)
        .lineTo(pageWidth - 15, doc.y)
        .stroke();
      doc.moveDown(0.5);

      doc.fontSize(10).font("Helvetica-Bold");
      doc.text(t.thankYou, 15, doc.y, {
        width: contentWidth,
        align: "center",
      });

      doc.moveDown(0.5);
      doc.fontSize(7).font("Helvetica").fillColor("#666666");
      doc.text(t.poweredBy, 15, doc.y, {
        width: contentWidth,
        align: "center",
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
