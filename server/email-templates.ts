export interface EmailTemplateData {
  companyName?: string;
  companyLogo?: string;
  primaryColor?: string;
  language?: string;
}

const FLOWP_LOGO_URL = "https://pos.flowp.app/flowp-logo.png";

export function getEmailWrapper(content: string, data: EmailTemplateData = {}): string {
  const {
    companyName = "Flowp",
    companyLogo = FLOWP_LOGO_URL,
    primaryColor = "#6E51CD",
  } = data;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${companyName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background-color: #f4f4f5;
      color: #18181b;
      line-height: 1.6;
    }
    
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    
    .header {
      background: linear-gradient(135deg, ${primaryColor} 0%, #8B5CF6 100%);
      padding: 32px;
      text-align: center;
    }
    
    .header img {
      max-height: 48px;
      width: auto;
    }
    
    .header-text {
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.5px;
    }
    
    .content {
      padding: 40px 32px;
    }
    
    .content h1 {
      margin: 0 0 24px;
      font-size: 24px;
      font-weight: 600;
      color: #18181b;
    }
    
    .content p {
      margin: 0 0 16px;
      color: #52525b;
      font-size: 16px;
    }
    
    .button {
      display: inline-block;
      background: linear-gradient(135deg, ${primaryColor} 0%, #8B5CF6 100%);
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 16px 0;
      transition: transform 0.2s;
    }
    
    .button:hover {
      transform: translateY(-2px);
    }
    
    .info-box {
      background-color: #f4f4f5;
      border-radius: 12px;
      padding: 24px;
      margin: 24px 0;
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e4e4e7;
    }
    
    .info-row:last-child {
      border-bottom: none;
    }
    
    .info-label {
      color: #71717a;
      font-size: 14px;
    }
    
    .info-value {
      color: #18181b;
      font-weight: 600;
      font-size: 14px;
    }
    
    .table {
      width: 100%;
      border-collapse: collapse;
      margin: 24px 0;
    }
    
    .table th {
      background-color: #f4f4f5;
      padding: 12px 16px;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .table td {
      padding: 16px;
      border-bottom: 1px solid #e4e4e7;
      font-size: 14px;
      color: #18181b;
    }
    
    .table tr:last-child td {
      border-bottom: none;
    }
    
    .total-row {
      background-color: #f4f4f5;
    }
    
    .total-row td {
      font-weight: 700;
      font-size: 16px;
      color: ${primaryColor};
    }
    
    .alert-box {
      background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
      border-left: 4px solid #F59E0B;
      border-radius: 8px;
      padding: 20px 24px;
      margin: 24px 0;
    }
    
    .alert-box.danger {
      background: linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%);
      border-left-color: #EF4444;
    }
    
    .alert-box.success {
      background: linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%);
      border-left-color: #10B981;
    }
    
    .alert-title {
      font-weight: 600;
      color: #18181b;
      margin: 0 0 8px;
    }
    
    .alert-text {
      color: #52525b;
      margin: 0;
      font-size: 14px;
    }
    
    .footer {
      background-color: #18181b;
      padding: 32px;
      text-align: center;
    }
    
    .footer-logo {
      max-height: 32px;
      margin-bottom: 16px;
      filter: brightness(0) invert(1);
    }
    
    .footer p {
      color: #a1a1aa;
      font-size: 12px;
      margin: 0 0 8px;
    }
    
    .footer a {
      color: #a1a1aa;
      text-decoration: none;
    }
    
    .footer a:hover {
      color: #ffffff;
    }
    
    .social-links {
      margin-top: 16px;
    }
    
    .social-links a {
      display: inline-block;
      margin: 0 8px;
    }
    
    .divider {
      height: 1px;
      background-color: #e4e4e7;
      margin: 24px 0;
    }
    
    @media only screen and (max-width: 600px) {
      .content {
        padding: 24px 16px;
      }
      
      .header {
        padding: 24px 16px;
      }
      
      .footer {
        padding: 24px 16px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      ${companyLogo ? `<img src="${companyLogo}" alt="${companyName}" />` : `<h1 class="header-text">${companyName}</h1>`}
    </div>
    
    <div class="content">
      ${content}
    </div>
    
    <div class="footer">
      <img src="${FLOWP_LOGO_URL}" alt="Flowp" class="footer-logo" />
      <p>Powered by Flowp - Modern POS & Inventory Management</p>
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

export interface PasswordResetTemplateData extends EmailTemplateData {
  userName: string;
  resetUrl: string;
}

export function getPasswordResetTemplate(data: PasswordResetTemplateData, language: string = "en"): { subject: string; html: string } {
  const translations: Record<string, any> = {
    en: {
      subject: "Reset Your Password",
      title: "Password Reset Request",
      greeting: `Hello ${data.userName},`,
      message: "You requested to reset your password. Click the button below to set a new password:",
      button: "Reset Password",
      expiry: "This link will expire in 1 hour.",
      ignore: "If you didn't request this, please ignore this email. Your password will remain unchanged.",
      security: "For your security, this request was received from your account.",
    },
    es: {
      subject: "Restablecer tu Contraseña",
      title: "Solicitud de Restablecimiento",
      greeting: `Hola ${data.userName},`,
      message: "Solicitaste restablecer tu contraseña. Haz clic en el botón a continuación para establecer una nueva:",
      button: "Restablecer Contraseña",
      expiry: "Este enlace expirará en 1 hora.",
      ignore: "Si no solicitaste esto, ignora este correo. Tu contraseña permanecerá sin cambios.",
      security: "Por tu seguridad, esta solicitud fue recibida desde tu cuenta.",
    },
    pt: {
      subject: "Redefinir sua Senha",
      title: "Solicitação de Redefinição",
      greeting: `Olá ${data.userName},`,
      message: "Você solicitou a redefinição de sua senha. Clique no botão abaixo para definir uma nova:",
      button: "Redefinir Senha",
      expiry: "Este link expirará em 1 hora.",
      ignore: "Se você não solicitou isso, ignore este e-mail. Sua senha permanecerá inalterada.",
      security: "Para sua segurança, esta solicitação foi recebida de sua conta.",
    },
  };

  const t = translations[language] || translations.en;

  const content = `
    <h1>${t.title}</h1>
    <p>${t.greeting}</p>
    <p>${t.message}</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.resetUrl}" class="button">${t.button}</a>
    </div>
    <div class="alert-box">
      <p class="alert-title">⏱️ ${t.expiry}</p>
      <p class="alert-text">${t.ignore}</p>
    </div>
    <p style="font-size: 12px; color: #71717a;">${t.security}</p>
  `;

  return {
    subject: t.subject,
    html: getEmailWrapper(content, data),
  };
}

export interface OrderConfirmationTemplateData extends EmailTemplateData {
  orderId: string;
  orderTotal: string;
  items: Array<{ name: string; quantity: number; price: string }>;
  subtotal?: string;
  tax?: string;
  customerName?: string;
}

export function getOrderConfirmationTemplate(data: OrderConfirmationTemplateData, language: string = "en"): { subject: string; html: string } {
  const translations: Record<string, any> = {
    en: {
      subject: `Order Confirmation - #${data.orderId}`,
      title: "Thank you for your order!",
      orderNumber: "Order Number",
      item: "Item",
      qty: "Qty",
      price: "Price",
      subtotal: "Subtotal",
      tax: "Tax",
      total: "Total",
      message: "We've received your order and it's being processed. You'll receive another email when your order is ready.",
      questions: "Have questions? Contact us anytime.",
    },
    es: {
      subject: `Confirmación de Pedido - #${data.orderId}`,
      title: "¡Gracias por tu pedido!",
      orderNumber: "Número de Pedido",
      item: "Artículo",
      qty: "Cant.",
      price: "Precio",
      subtotal: "Subtotal",
      tax: "Impuesto",
      total: "Total",
      message: "Hemos recibido tu pedido y está siendo procesado. Recibirás otro correo cuando tu pedido esté listo.",
      questions: "¿Tienes preguntas? Contáctanos en cualquier momento.",
    },
    pt: {
      subject: `Confirmação de Pedido - #${data.orderId}`,
      title: "Obrigado pelo seu pedido!",
      orderNumber: "Número do Pedido",
      item: "Item",
      qty: "Qtd.",
      price: "Preço",
      subtotal: "Subtotal",
      tax: "Imposto",
      total: "Total",
      message: "Recebemos seu pedido e ele está sendo processado. Você receberá outro e-mail quando seu pedido estiver pronto.",
      questions: "Tem perguntas? Entre em contato conosco a qualquer momento.",
    },
  };

  const t = translations[language] || translations.en;

  const itemsHtml = data.items.map(item => `
    <tr>
      <td>${item.name}</td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: right;">${item.price}</td>
    </tr>
  `).join("");

  const content = `
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="display: inline-block; background: linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%); border-radius: 50%; padding: 16px; margin-bottom: 16px;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2">
          <polyline points="20,6 9,17 4,12"></polyline>
        </svg>
      </div>
      <h1 style="margin: 0;">${t.title}</h1>
    </div>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">${t.orderNumber}</span>
        <span class="info-value">#${data.orderId}</span>
      </div>
    </div>
    
    <table class="table">
      <thead>
        <tr>
          <th>${t.item}</th>
          <th style="text-align: center;">${t.qty}</th>
          <th style="text-align: right;">${t.price}</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
        <tr class="total-row">
          <td colspan="2" style="text-align: right;">${t.total}</td>
          <td style="text-align: right;">${data.orderTotal}</td>
        </tr>
      </tbody>
    </table>
    
    <p>${t.message}</p>
    <p style="font-size: 14px; color: #71717a;">${t.questions}</p>
  `;

  return {
    subject: t.subject,
    html: getEmailWrapper(content, data),
  };
}

export interface PaymentReceivedTemplateData extends EmailTemplateData {
  amount: string;
  paymentMethod: string;
  transactionId?: string;
  date?: string;
}

export function getPaymentReceivedTemplate(data: PaymentReceivedTemplateData, language: string = "en"): { subject: string; html: string } {
  const translations: Record<string, any> = {
    en: {
      subject: "Payment Received",
      title: "Payment Successful!",
      message: "We've received your payment. Here are the details:",
      amount: "Amount",
      method: "Payment Method",
      transaction: "Transaction ID",
      date: "Date",
      thankYou: "Thank you for your business!",
    },
    es: {
      subject: "Pago Recibido",
      title: "¡Pago Exitoso!",
      message: "Hemos recibido tu pago. Aquí están los detalles:",
      amount: "Monto",
      method: "Método de Pago",
      transaction: "ID de Transacción",
      date: "Fecha",
      thankYou: "¡Gracias por tu preferencia!",
    },
    pt: {
      subject: "Pagamento Recebido",
      title: "Pagamento Bem-sucedido!",
      message: "Recebemos seu pagamento. Aqui estão os detalhes:",
      amount: "Valor",
      method: "Método de Pagamento",
      transaction: "ID da Transação",
      date: "Data",
      thankYou: "Obrigado pela sua preferência!",
    },
  };

  const t = translations[language] || translations.en;

  const content = `
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="display: inline-block; background: linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%); border-radius: 50%; padding: 16px; margin-bottom: 16px;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2">
          <polyline points="20,6 9,17 4,12"></polyline>
        </svg>
      </div>
      <h1 style="margin: 0;">${t.title}</h1>
    </div>
    
    <p>${t.message}</p>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">${t.amount}</span>
        <span class="info-value" style="color: #10B981; font-size: 18px;">${data.amount}</span>
      </div>
      <div class="info-row">
        <span class="info-label">${t.method}</span>
        <span class="info-value">${data.paymentMethod}</span>
      </div>
      ${data.transactionId ? `
      <div class="info-row">
        <span class="info-label">${t.transaction}</span>
        <span class="info-value">${data.transactionId}</span>
      </div>
      ` : ""}
      ${data.date ? `
      <div class="info-row">
        <span class="info-label">${t.date}</span>
        <span class="info-value">${data.date}</span>
      </div>
      ` : ""}
    </div>
    
    <p style="text-align: center; font-size: 18px; font-weight: 600; color: #18181b;">${t.thankYou}</p>
  `;

  return {
    subject: t.subject,
    html: getEmailWrapper(content, data),
  };
}

export interface LowStockAlertTemplateData extends EmailTemplateData {
  productName: string;
  currentStock: number;
  minStock?: number;
  sku?: string;
}

export function getLowStockAlertTemplate(data: LowStockAlertTemplateData, language: string = "en"): { subject: string; html: string } {
  const translations: Record<string, any> = {
    en: {
      subject: `Low Stock Alert: ${data.productName}`,
      title: "Low Stock Alert",
      message: "The following product is running low on stock and may need restocking soon:",
      product: "Product",
      sku: "SKU",
      currentStock: "Current Stock",
      minStock: "Minimum Stock",
      action: "Please review your inventory and consider placing a reorder to avoid stockouts.",
      reorder: "Reorder Now",
    },
    es: {
      subject: `Alerta de Stock Bajo: ${data.productName}`,
      title: "Alerta de Stock Bajo",
      message: "El siguiente producto tiene stock bajo y puede necesitar reabastecimiento pronto:",
      product: "Producto",
      sku: "SKU",
      currentStock: "Stock Actual",
      minStock: "Stock Mínimo",
      action: "Por favor revisa tu inventario y considera hacer un pedido para evitar desabastecimiento.",
      reorder: "Reordenar Ahora",
    },
    pt: {
      subject: `Alerta de Estoque Baixo: ${data.productName}`,
      title: "Alerta de Estoque Baixo",
      message: "O seguinte produto está com estoque baixo e pode precisar de reabastecimento em breve:",
      product: "Produto",
      sku: "SKU",
      currentStock: "Estoque Atual",
      minStock: "Estoque Mínimo",
      action: "Por favor, revise seu inventário e considere fazer um pedido para evitar falta de estoque.",
      reorder: "Reordenar Agora",
    },
  };

  const t = translations[language] || translations.en;

  const content = `
    <div class="alert-box danger">
      <p class="alert-title" style="font-size: 18px;">⚠️ ${t.title}</p>
      <p class="alert-text">${t.message}</p>
    </div>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">${t.product}</span>
        <span class="info-value">${data.productName}</span>
      </div>
      ${data.sku ? `
      <div class="info-row">
        <span class="info-label">${t.sku}</span>
        <span class="info-value">${data.sku}</span>
      </div>
      ` : ""}
      <div class="info-row">
        <span class="info-label">${t.currentStock}</span>
        <span class="info-value" style="color: #EF4444; font-size: 18px; font-weight: 700;">${data.currentStock}</span>
      </div>
      ${data.minStock ? `
      <div class="info-row">
        <span class="info-label">${t.minStock}</span>
        <span class="info-value">${data.minStock}</span>
      </div>
      ` : ""}
    </div>
    
    <p>${t.action}</p>
  `;

  return {
    subject: t.subject,
    html: getEmailWrapper(content, data),
  };
}

export interface TransactionReceiptTemplateData extends EmailTemplateData {
  receiptNumber: string;
  date: string;
  items: Array<{ name: string; quantity: number; price: string }>;
  subtotal: string;
  tax: string;
  total: string;
  paymentMethod: string;
  cashier?: string;
  storeName?: string;
}

export function getTransactionReceiptTemplate(data: TransactionReceiptTemplateData, language: string = "en"): { subject: string; html: string } {
  const translations: Record<string, any> = {
    en: {
      subject: `Receipt #${data.receiptNumber}`,
      title: "Your Receipt",
      receiptNo: "Receipt #",
      date: "Date",
      item: "Item",
      qty: "Qty",
      price: "Price",
      subtotal: "Subtotal",
      tax: "Tax",
      total: "Total",
      paymentMethod: "Payment Method",
      cashier: "Cashier",
      thankYou: "Thank you for your purchase!",
      visitAgain: "We look forward to seeing you again soon.",
    },
    es: {
      subject: `Recibo #${data.receiptNumber}`,
      title: "Tu Recibo",
      receiptNo: "Recibo #",
      date: "Fecha",
      item: "Artículo",
      qty: "Cant.",
      price: "Precio",
      subtotal: "Subtotal",
      tax: "Impuesto",
      total: "Total",
      paymentMethod: "Método de Pago",
      cashier: "Cajero",
      thankYou: "¡Gracias por tu compra!",
      visitAgain: "Esperamos verte pronto de nuevo.",
    },
    pt: {
      subject: `Recibo #${data.receiptNumber}`,
      title: "Seu Recibo",
      receiptNo: "Recibo #",
      date: "Data",
      item: "Item",
      qty: "Qtd.",
      price: "Preço",
      subtotal: "Subtotal",
      tax: "Imposto",
      total: "Total",
      paymentMethod: "Método de Pagamento",
      cashier: "Caixa",
      thankYou: "Obrigado pela sua compra!",
      visitAgain: "Esperamos vê-lo novamente em breve.",
    },
  };

  const t = translations[language] || translations.en;

  const itemsHtml = data.items.map(item => `
    <tr>
      <td>${item.name}</td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: right;">${item.price}</td>
    </tr>
  `).join("");

  const content = `
    <h1 style="text-align: center;">${t.title}</h1>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">${t.receiptNo}</span>
        <span class="info-value">${data.receiptNumber}</span>
      </div>
      <div class="info-row">
        <span class="info-label">${t.date}</span>
        <span class="info-value">${data.date}</span>
      </div>
      ${data.cashier ? `
      <div class="info-row">
        <span class="info-label">${t.cashier}</span>
        <span class="info-value">${data.cashier}</span>
      </div>
      ` : ""}
    </div>
    
    <table class="table">
      <thead>
        <tr>
          <th>${t.item}</th>
          <th style="text-align: center;">${t.qty}</th>
          <th style="text-align: right;">${t.price}</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>
    
    <div class="info-box" style="background: linear-gradient(135deg, #f4f4f5 0%, #e4e4e7 100%);">
      <div class="info-row">
        <span class="info-label">${t.subtotal}</span>
        <span class="info-value">${data.subtotal}</span>
      </div>
      <div class="info-row">
        <span class="info-label">${t.tax}</span>
        <span class="info-value">${data.tax}</span>
      </div>
      <div class="info-row" style="border-bottom: none;">
        <span class="info-label" style="font-size: 18px; font-weight: 700; color: #18181b;">${t.total}</span>
        <span class="info-value" style="font-size: 24px; color: #6E51CD;">${data.total}</span>
      </div>
    </div>
    
    <div class="info-box">
      <div class="info-row" style="border-bottom: none;">
        <span class="info-label">${t.paymentMethod}</span>
        <span class="info-value">${data.paymentMethod}</span>
      </div>
    </div>
    
    <div style="text-align: center; margin-top: 32px;">
      <p style="font-size: 18px; font-weight: 600; color: #18181b; margin-bottom: 8px;">${t.thankYou}</p>
      <p style="color: #71717a;">${t.visitAgain}</p>
    </div>
  `;

  return {
    subject: t.subject,
    html: getEmailWrapper(content, data),
  };
}

export interface WelcomeEmailTemplateData extends EmailTemplateData {
  userName: string;
  businessName: string;
  loginUrl?: string;
}

const welcomeTranslations = {
  en: {
    subject: "Welcome to Flowp POS!",
    title: "Welcome to Flowp!",
    greeting: "Hello",
    intro: "Thank you for registering your business with Flowp POS. Your account is now ready to use!",
    businessLabel: "Business Name",
    getStarted: "Here's how to get started:",
    step1: "Add your products and categories",
    step2: "Configure your tax rates and payment methods",
    step3: "Invite your team members",
    step4: "Start making sales!",
    loginButton: "Go to Dashboard",
    support: "If you have any questions, our support team is here to help.",
    thanks: "Best regards,",
    team: "The Flowp Team",
  },
  es: {
    subject: "¡Bienvenido a Flowp POS!",
    title: "¡Bienvenido a Flowp!",
    greeting: "Hola",
    intro: "Gracias por registrar tu negocio en Flowp POS. ¡Tu cuenta está lista para usar!",
    businessLabel: "Nombre del Negocio",
    getStarted: "Así puedes comenzar:",
    step1: "Agrega tus productos y categorías",
    step2: "Configura tus tasas de impuestos y métodos de pago",
    step3: "Invita a los miembros de tu equipo",
    step4: "¡Comienza a vender!",
    loginButton: "Ir al Panel",
    support: "Si tienes alguna pregunta, nuestro equipo de soporte está aquí para ayudarte.",
    thanks: "Saludos cordiales,",
    team: "El Equipo de Flowp",
  },
  pt: {
    subject: "Bem-vindo ao Flowp POS!",
    title: "Bem-vindo ao Flowp!",
    greeting: "Olá",
    intro: "Obrigado por registrar seu negócio no Flowp POS. Sua conta está pronta para uso!",
    businessLabel: "Nome do Negócio",
    getStarted: "Veja como começar:",
    step1: "Adicione seus produtos e categorias",
    step2: "Configure suas taxas de impostos e métodos de pagamento",
    step3: "Convide os membros da sua equipe",
    step4: "Comece a vender!",
    loginButton: "Ir para o Painel",
    support: "Se você tiver alguma dúvida, nossa equipe de suporte está aqui para ajudar.",
    thanks: "Atenciosamente,",
    team: "A Equipe Flowp",
  },
};

export function getWelcomeEmailTemplate(data: WelcomeEmailTemplateData, language: string = "en"): { subject: string; html: string } {
  const t = welcomeTranslations[language as keyof typeof welcomeTranslations] || welcomeTranslations.en;
  const loginUrl = data.loginUrl || "https://pos.flowp.app/login";

  const content = `
    <h1>${t.title}</h1>
    <p>${t.greeting} ${data.userName},</p>
    <p>${t.intro}</p>
    
    <div class="info-box">
      <div class="info-row" style="border-bottom: none;">
        <span class="info-label">${t.businessLabel}</span>
        <span class="info-value">${data.businessName}</span>
      </div>
    </div>
    
    <p><strong>${t.getStarted}</strong></p>
    <ol style="color: #52525b; padding-left: 24px;">
      <li style="margin-bottom: 8px;">${t.step1}</li>
      <li style="margin-bottom: 8px;">${t.step2}</li>
      <li style="margin-bottom: 8px;">${t.step3}</li>
      <li style="margin-bottom: 8px;">${t.step4}</li>
    </ol>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${loginUrl}" class="button">${t.loginButton}</a>
    </div>
    
    <p>${t.support}</p>
    <p>${t.thanks}<br/>${t.team}</p>
  `;

  return {
    subject: t.subject,
    html: getEmailWrapper(content, data),
  };
}

export const defaultTemplates = {
  password_reset: {
    subject: "Reset Your Password",
    description: "Sent when a user requests to reset their password",
    variables: ["{{userName}}", "{{resetUrl}}"],
  },
  order_confirmation: {
    subject: "Order Confirmation - #{{orderId}}",
    description: "Sent when an order is placed",
    variables: ["{{orderId}}", "{{orderTotal}}", "{{orderItems}}"],
  },
  payment_received: {
    subject: "Payment Received",
    description: "Sent when a payment is processed successfully",
    variables: ["{{amount}}", "{{paymentMethod}}", "{{transactionId}}"],
  },
  low_stock_alert: {
    subject: "Low Stock Alert: {{productName}}",
    description: "Sent when a product falls below minimum stock level",
    variables: ["{{productName}}", "{{currentStock}}", "{{minStock}}"],
  },
  transaction_receipt: {
    subject: "Receipt #{{receiptNumber}}",
    description: "Digital receipt sent to customers",
    variables: ["{{receiptNumber}}", "{{date}}", "{{total}}", "{{items}}"],
  },
  welcome_email: {
    subject: "Welcome to Flowp POS!",
    description: "Sent when a new business registers",
    variables: ["{{userName}}", "{{businessName}}", "{{loginUrl}}"],
  },
};
