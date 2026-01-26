const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;
const NUL = 0x00;

const COMMANDS = {
  INIT: Buffer.from([ESC, 0x40]),
  ALIGN_LEFT: Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_RIGHT: Buffer.from([ESC, 0x61, 0x02]),
  BOLD_ON: Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([ESC, 0x45, 0x00]),
  DOUBLE_HEIGHT_ON: Buffer.from([GS, 0x21, 0x10]),
  DOUBLE_WIDTH_ON: Buffer.from([GS, 0x21, 0x20]),
  DOUBLE_SIZE_ON: Buffer.from([GS, 0x21, 0x30]),
  NORMAL_SIZE: Buffer.from([GS, 0x21, 0x00]),
  UNDERLINE_ON: Buffer.from([ESC, 0x2D, 0x01]),
  UNDERLINE_OFF: Buffer.from([ESC, 0x2D, 0x00]),
  CUT_PAPER: Buffer.from([GS, 0x56, 0x00]),
  CUT_PAPER_PARTIAL: Buffer.from([GS, 0x56, 0x01]),
  FEED_LINES: (n) => Buffer.from([ESC, 0x64, n]),
  CASH_DRAWER: Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA])
};

const defaultLabels = {
  en: {
    order: "Order #",
    date: "Date:",
    cashier: "Cashier:",
    customer: "Customer:",
    subtotal: "Subtotal:",
    discount: "Discount",
    tax: "Tax",
    total: "TOTAL:",
    payments: "PAYMENTS:",
    change: "Change:",
    thankYou: "Thank you for your purchase!",
    ref: "Ref:",
    each: "each",
    tel: "Tel:",
    taxId: "Tax ID:",
    cash: "Cash",
    card: "Card"
  },
  es: {
    order: "Orden #",
    date: "Fecha:",
    cashier: "Cajero:",
    customer: "Cliente:",
    subtotal: "Subtotal:",
    discount: "Descuento",
    tax: "Impuesto",
    total: "TOTAL:",
    payments: "PAGOS:",
    change: "Cambio:",
    thankYou: "¡Gracias por su compra!",
    ref: "Ref:",
    each: "c/u",
    tel: "Tel:",
    taxId: "NIT/RUC:",
    cash: "Efectivo",
    card: "Tarjeta"
  },
  pt: {
    order: "Pedido #",
    date: "Data:",
    cashier: "Caixa:",
    customer: "Cliente:",
    subtotal: "Subtotal:",
    discount: "Desconto",
    tax: "Imposto",
    total: "TOTAL:",
    payments: "PAGAMENTOS:",
    change: "Troco:",
    thankYou: "Obrigado pela sua compra!",
    ref: "Ref:",
    each: "cada",
    tel: "Tel:",
    taxId: "CNPJ/CPF:",
    cash: "Dinheiro",
    card: "Cartão"
  }
};

function buildEscPosReceipt(receipt, paperWidth = 80) {
  const charsPerLine = paperWidth === 80 ? 48 : 32;
  const buffers = [];
  const lang = receipt.language || 'en';
  const labels = defaultLabels[lang] || defaultLabels.en;
  
  buffers.push(COMMANDS.INIT);
  
  if (receipt.businessName) {
    buffers.push(COMMANDS.ALIGN_CENTER);
    buffers.push(COMMANDS.DOUBLE_SIZE_ON);
    buffers.push(COMMANDS.BOLD_ON);
    buffers.push(textToBuffer(receipt.businessName));
    buffers.push(Buffer.from([LF]));
    buffers.push(COMMANDS.NORMAL_SIZE);
    buffers.push(COMMANDS.BOLD_OFF);
  }
  
  if (receipt.headerText) {
    buffers.push(COMMANDS.ALIGN_CENTER);
    buffers.push(textToBuffer(receipt.headerText));
    buffers.push(Buffer.from([LF]));
  }
  
  if (receipt.address) {
    buffers.push(COMMANDS.ALIGN_CENTER);
    buffers.push(textToBuffer(receipt.address));
    buffers.push(Buffer.from([LF]));
  }
  
  if (receipt.phone) {
    buffers.push(COMMANDS.ALIGN_CENTER);
    buffers.push(textToBuffer(`${labels.tel} ${receipt.phone}`));
    buffers.push(Buffer.from([LF]));
  }
  
  if (receipt.taxId) {
    buffers.push(COMMANDS.ALIGN_CENTER);
    buffers.push(textToBuffer(`${labels.taxId} ${receipt.taxId}`));
    buffers.push(Buffer.from([LF]));
  }
  
  buffers.push(Buffer.from([LF]));
  buffers.push(textToBuffer(repeatChar('-', charsPerLine)));
  buffers.push(Buffer.from([LF]));
  
  buffers.push(COMMANDS.ALIGN_LEFT);
  if (receipt.orderNumber) {
    buffers.push(COMMANDS.BOLD_ON);
    buffers.push(textToBuffer(`${labels.order}${receipt.orderNumber}`));
    buffers.push(COMMANDS.BOLD_OFF);
    buffers.push(Buffer.from([LF]));
  }
  
  if (receipt.date) {
    buffers.push(textToBuffer(`${labels.date} ${receipt.date}`));
    buffers.push(Buffer.from([LF]));
  }
  
  if (receipt.cashier) {
    buffers.push(textToBuffer(`${labels.cashier} ${receipt.cashier}`));
    buffers.push(Buffer.from([LF]));
  }
  
  if (receipt.customer) {
    buffers.push(textToBuffer(`${labels.customer} ${receipt.customer}`));
    buffers.push(Buffer.from([LF]));
  }
  
  buffers.push(textToBuffer(repeatChar('-', charsPerLine)));
  buffers.push(Buffer.from([LF]));
  
  if (receipt.items && receipt.items.length > 0) {
    const qtyWidth = 4;
    const priceWidth = 10;
    const nameWidth = charsPerLine - qtyWidth - priceWidth - 2;
    
    receipt.items.forEach(item => {
      const qty = String(item.quantity).padStart(qtyWidth);
      const name = truncateText(item.name, nameWidth);
      const price = formatPrice(item.total, receipt.currency).padStart(priceWidth);
      
      buffers.push(textToBuffer(`${qty} ${name.padEnd(nameWidth)} ${price}`));
      buffers.push(Buffer.from([LF]));
      
      if (item.unitPrice && item.quantity > 1) {
        const unitPriceText = `     @ ${formatPrice(item.unitPrice, receipt.currency)} ${labels.each}`;
        buffers.push(textToBuffer(unitPriceText));
        buffers.push(Buffer.from([LF]));
      }
      
      if (item.modifiers) {
        buffers.push(textToBuffer(`     ${item.modifiers}`));
        buffers.push(Buffer.from([LF]));
      }
    });
  }
  
  buffers.push(textToBuffer(repeatChar('-', charsPerLine)));
  buffers.push(Buffer.from([LF]));
  
  const labelWidth = charsPerLine - 15;
  const valueWidth = 15;
  
  if (receipt.subtotal !== undefined) {
    buffers.push(textToBuffer(
      labels.subtotal.padEnd(labelWidth) + 
      formatPrice(receipt.subtotal, receipt.currency).padStart(valueWidth)
    ));
    buffers.push(Buffer.from([LF]));
  }
  
  if (receipt.discount && receipt.discount > 0) {
    buffers.push(textToBuffer(
      `${labels.discount} (${receipt.discountPercent || 0}%):`.padEnd(labelWidth) + 
      `-${formatPrice(receipt.discount, receipt.currency)}`.padStart(valueWidth)
    ));
    buffers.push(Buffer.from([LF]));
  }
  
  if (receipt.tax !== undefined) {
    buffers.push(textToBuffer(
      `${labels.tax} (${receipt.taxRate || 0}%):`.padEnd(labelWidth) + 
      formatPrice(receipt.tax, receipt.currency).padStart(valueWidth)
    ));
    buffers.push(Buffer.from([LF]));
  }
  
  buffers.push(COMMANDS.BOLD_ON);
  buffers.push(COMMANDS.DOUBLE_HEIGHT_ON);
  buffers.push(textToBuffer(
    labels.total.padEnd(labelWidth - 5) + 
    formatPrice(receipt.total, receipt.currency).padStart(valueWidth + 5)
  ));
  buffers.push(Buffer.from([LF]));
  buffers.push(COMMANDS.NORMAL_SIZE);
  buffers.push(COMMANDS.BOLD_OFF);
  
  buffers.push(textToBuffer(repeatChar('-', charsPerLine)));
  buffers.push(Buffer.from([LF]));
  
  if (receipt.payments && receipt.payments.length > 0) {
    buffers.push(textToBuffer(labels.payments));
    buffers.push(Buffer.from([LF]));
    
    receipt.payments.forEach(payment => {
      let paymentLabel;
      if (payment.type === 'cash') {
        paymentLabel = labels.cash;
      } else if (payment.type === 'card') {
        paymentLabel = labels.card;
      } else {
        paymentLabel = payment.type.charAt(0).toUpperCase() + payment.type.slice(1);
      }
      buffers.push(textToBuffer(
        `  ${paymentLabel}:`.padEnd(labelWidth) + 
        formatPrice(payment.amount, receipt.currency).padStart(valueWidth)
      ));
      buffers.push(Buffer.from([LF]));
      
      if (payment.transactionId) {
        buffers.push(textToBuffer(`    ${labels.ref} ${payment.transactionId}`));
        buffers.push(Buffer.from([LF]));
      }
    });
  }
  
  if (receipt.change && receipt.change > 0) {
    buffers.push(COMMANDS.BOLD_ON);
    buffers.push(textToBuffer(
      labels.change.padEnd(labelWidth) + 
      formatPrice(receipt.change, receipt.currency).padStart(valueWidth)
    ));
    buffers.push(Buffer.from([LF]));
    buffers.push(COMMANDS.BOLD_OFF);
  }
  
  buffers.push(Buffer.from([LF]));
  
  if (receipt.footerText) {
    buffers.push(COMMANDS.ALIGN_CENTER);
    buffers.push(textToBuffer(receipt.footerText));
    buffers.push(Buffer.from([LF]));
  }
  
  buffers.push(COMMANDS.ALIGN_CENTER);
  buffers.push(textToBuffer(labels.thankYou));
  buffers.push(Buffer.from([LF]));
  
  buffers.push(COMMANDS.FEED_LINES(4));
  
  if (receipt.openCashDrawer) {
    buffers.push(COMMANDS.CASH_DRAWER);
  }
  
  if (receipt.cutPaper !== false) {
    buffers.push(COMMANDS.CUT_PAPER_PARTIAL);
  }
  
  return Buffer.concat(buffers);
}

function textToBuffer(text) {
  return Buffer.from(text, 'utf8');
}

function repeatChar(char, count) {
  return char.repeat(count);
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function formatPrice(amount, currency = 'USD') {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  const symbols = {
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'COP': '$',
    'MXN': '$',
    'BRL': 'R$',
    'ARS': '$',
    'PEN': 'S/',
    'CLP': '$'
  };
  const symbol = symbols[currency] || '$';
  return `${symbol}${num.toFixed(2)}`;
}

module.exports = { buildEscPosReceipt, COMMANDS };
