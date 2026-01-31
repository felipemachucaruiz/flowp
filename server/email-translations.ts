type Language = "en" | "es" | "pt";

interface EmailTranslations {
  password_reset: {
    subject: string;
    greeting: string;
    message: string;
    button: string;
    expiry: string;
    ignore: string;
    signature: string;
  };
  order_confirmation: {
    subject: string;
    title: string;
    thank_you: string;
    order_number: string;
    item: string;
    qty: string;
    price: string;
    total: string;
    signature: string;
  };
  payment_received: {
    subject: string;
    title: string;
    message: string;
    amount: string;
    payment_method: string;
    thank_you: string;
    signature: string;
  };
  low_stock_alert: {
    subject: string;
    title: string;
    message: string;
    product: string;
    current_stock: string;
    action: string;
    signature: string;
  };
}

const translations: Record<Language, EmailTranslations> = {
  en: {
    password_reset: {
      subject: "Reset Your Password",
      greeting: "Hello {{userName}},",
      message: "You requested to reset your password. Click the link below to set a new password:",
      button: "Reset Password",
      expiry: "This link will expire in 1 hour.",
      ignore: "If you didn't request this, please ignore this email.",
      signature: "- The Flowp Team",
    },
    order_confirmation: {
      subject: "Order Confirmation - #{{orderId}}",
      title: "Order Confirmation",
      thank_you: "Thank you for your order!",
      order_number: "Order #{{orderId}}",
      item: "Item",
      qty: "Qty",
      price: "Price",
      total: "Total: {{orderTotal}}",
      signature: "- The Flowp Team",
    },
    payment_received: {
      subject: "Payment Received",
      title: "Payment Confirmation",
      message: "We have received your payment.",
      amount: "Amount",
      payment_method: "Payment Method",
      thank_you: "Thank you for your business!",
      signature: "- The Flowp Team",
    },
    low_stock_alert: {
      subject: "Low Stock Alert: {{productName}}",
      title: "Low Stock Alert",
      message: "The following product is running low on stock:",
      product: "Product",
      current_stock: "Current Stock",
      action: "Please consider restocking soon.",
      signature: "- The Flowp Team",
    },
  },
  es: {
    password_reset: {
      subject: "Restablecer tu Contraseña",
      greeting: "Hola {{userName}},",
      message: "Solicitaste restablecer tu contraseña. Haz clic en el enlace a continuación para establecer una nueva contraseña:",
      button: "Restablecer Contraseña",
      expiry: "Este enlace expirará en 1 hora.",
      ignore: "Si no solicitaste esto, por favor ignora este correo.",
      signature: "- El Equipo de Flowp",
    },
    order_confirmation: {
      subject: "Confirmación de Pedido - #{{orderId}}",
      title: "Confirmación de Pedido",
      thank_you: "¡Gracias por tu pedido!",
      order_number: "Pedido #{{orderId}}",
      item: "Artículo",
      qty: "Cant.",
      price: "Precio",
      total: "Total: {{orderTotal}}",
      signature: "- El Equipo de Flowp",
    },
    payment_received: {
      subject: "Pago Recibido",
      title: "Confirmación de Pago",
      message: "Hemos recibido tu pago.",
      amount: "Monto",
      payment_method: "Método de Pago",
      thank_you: "¡Gracias por tu preferencia!",
      signature: "- El Equipo de Flowp",
    },
    low_stock_alert: {
      subject: "Alerta de Stock Bajo: {{productName}}",
      title: "Alerta de Stock Bajo",
      message: "El siguiente producto tiene stock bajo:",
      product: "Producto",
      current_stock: "Stock Actual",
      action: "Por favor considera reabastecer pronto.",
      signature: "- El Equipo de Flowp",
    },
  },
  pt: {
    password_reset: {
      subject: "Redefinir sua Senha",
      greeting: "Olá {{userName}},",
      message: "Você solicitou a redefinição de sua senha. Clique no link abaixo para definir uma nova senha:",
      button: "Redefinir Senha",
      expiry: "Este link expirará em 1 hora.",
      ignore: "Se você não solicitou isso, por favor ignore este e-mail.",
      signature: "- A Equipe Flowp",
    },
    order_confirmation: {
      subject: "Confirmação de Pedido - #{{orderId}}",
      title: "Confirmação de Pedido",
      thank_you: "Obrigado pelo seu pedido!",
      order_number: "Pedido #{{orderId}}",
      item: "Item",
      qty: "Qtd",
      price: "Preço",
      total: "Total: {{orderTotal}}",
      signature: "- A Equipe Flowp",
    },
    payment_received: {
      subject: "Pagamento Recebido",
      title: "Confirmação de Pagamento",
      message: "Recebemos seu pagamento.",
      amount: "Valor",
      payment_method: "Método de Pagamento",
      thank_you: "Obrigado pela sua preferência!",
      signature: "- A Equipe Flowp",
    },
    low_stock_alert: {
      subject: "Alerta de Estoque Baixo: {{productName}}",
      title: "Alerta de Estoque Baixo",
      message: "O seguinte produto está com estoque baixo:",
      product: "Produto",
      current_stock: "Estoque Atual",
      action: "Por favor considere reabastecer em breve.",
      signature: "- A Equipe Flowp",
    },
  },
};

export function getEmailTranslation(lang: string = "en"): EmailTranslations {
  const language = (lang in translations ? lang : "en") as Language;
  return translations[language];
}

export function replaceVariables(text: string, variables: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}
