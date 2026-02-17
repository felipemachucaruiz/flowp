import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { storage } from "./storage";
import { getEmailTranslation, replaceVariables } from "./email-translations";
import {
  getEmailWrapper,
  getPasswordResetTemplate,
  getOrderConfirmationTemplate,
  getPaymentReceivedTemplate,
  getLowStockAlertTemplate,
  getTransactionReceiptTemplate,
  getWelcomeEmailTemplate,
  getNewSaleNotificationTemplate,
  type PasswordResetTemplateData,
  type OrderConfirmationTemplateData,
  type PaymentReceivedTemplateData,
  type LowStockAlertTemplateData,
  type TransactionReceiptTemplateData,
  type WelcomeEmailTemplateData,
  type NewSaleNotificationTemplateData,
} from "./email-templates";
import { generateReceiptPDF } from "./pdf-receipt";

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
}

interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

class EmailService {
  private transporter: Transporter | null = null;
  private config: SmtpConfig | null = null;

  async initialize(): Promise<boolean> {
    try {
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT;
      const smtpUser = process.env.SMTP_USER;
      const smtpPassword = process.env.SMTP_PASSWORD;
      const smtpFromEmail = process.env.SMTP_FROM_EMAIL;
      const smtpFromName = process.env.SMTP_FROM_NAME || "Flowp";

      if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword || !smtpFromEmail) {
        console.log("SMTP env vars not configured - trying database config...");
        return await this.initTransporter();
      }

      this.config = {
        host: smtpHost,
        port: parseInt(smtpPort, 10),
        secure: parseInt(smtpPort, 10) === 465,
        user: smtpUser,
        password: smtpPassword,
        fromEmail: smtpFromEmail,
        fromName: smtpFromName,
      };

      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.user,
          pass: this.config.password,
        },
      });

      await this.transporter.verify();
      console.log("SMTP connection verified successfully");
      return true;
    } catch (error) {
      console.error("Failed to initialize SMTP:", error);
      this.transporter = null;
      return false;
    }
  }

  async initTransporter(): Promise<boolean> {
    try {
      const smtpSetting = await storage.getSystemSetting("smtp_config");
      
      if (!smtpSetting?.value) {
        console.log("SMTP not configured in database - email functionality disabled");
        return false;
      }

      const dbConfig = smtpSetting.value as {
        host: string;
        port: number;
        secure: boolean;
        auth: { user: string; pass: string };
        fromEmail: string;
        fromName: string;
      };

      if (!dbConfig.host || !dbConfig.auth?.user || !dbConfig.auth?.pass || !dbConfig.fromEmail) {
        console.log("SMTP config incomplete in database - email functionality disabled");
        return false;
      }

      this.config = {
        host: (dbConfig.host || '').trim(),
        port: dbConfig.port || 587,
        secure: dbConfig.secure || false,
        user: (dbConfig.auth.user || '').trim(),
        password: dbConfig.auth.pass,
        fromEmail: (dbConfig.fromEmail || '').trim(),
        fromName: (dbConfig.fromName || 'Flowp').trim(),
      };

      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.user,
          pass: this.config.password,
        },
      });

      await this.transporter.verify();
      console.log("SMTP connection verified successfully from database config");
      return true;
    } catch (error) {
      console.error("Failed to initialize SMTP from database:", error);
      this.transporter = null;
      return false;
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.transporter || !this.config) {
      console.log("SMTP not configured - attempting to reinitialize...");
      const initialized = await this.initTransporter();
      if (!initialized) {
        console.log("Failed to initialize SMTP - skipping email send");
        return false;
      }
    }

    try {
      const mailOptions: any = {
        from: `"${this.config!.fromName}" <${this.config!.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ""),
      };

      if (options.attachments && options.attachments.length > 0) {
        mailOptions.attachments = options.attachments.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType || 'application/pdf',
        }));
      }

      await this.transporter!.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error("Failed to send email:", error);
      return false;
    }
  }

  async sendPasswordResetEmail(email: string, resetToken: string, userName: string, language: string = "en", tenantData?: { companyName?: string; companyLogo?: string }): Promise<boolean> {
    const customTemplate = await storage.getEmailTemplate("password_reset");
    const resetUrl = `${process.env.APP_URL || 'https://flowp.replit.app'}/reset-password?token=${resetToken}`;
    
    let subject: string;
    let html: string;

    if (customTemplate?.isActive && customTemplate.htmlBody) {
      subject = customTemplate.subject
        .replace(/\{\{userName\}\}/g, userName);
      const bodyContent = customTemplate.htmlBody
        .replace(/\{\{userName\}\}/g, userName)
        .replace(/\{\{resetUrl\}\}/g, resetUrl);
      html = getEmailWrapper(bodyContent, { companyName: tenantData?.companyName, companyLogo: tenantData?.companyLogo, language });
    } else {
      const template = getPasswordResetTemplate({
        userName,
        resetUrl,
        companyName: tenantData?.companyName,
        companyLogo: tenantData?.companyLogo,
      }, language);
      subject = template.subject;
      html = template.html;
    }

    const sent = await this.sendEmail({ to: email, subject, html });
    
    await storage.createEmailLog({
      templateType: "password_reset",
      recipientEmail: email,
      subject,
      status: sent ? "sent" : "failed",
      errorMessage: sent ? null : "SMTP not configured or send failed",
    });

    return sent;
  }

  async sendWelcomeEmail(
    email: string,
    userName: string,
    businessName: string,
    tenantId?: string,
    language: string = "en"
  ): Promise<boolean> {
    const customTemplate = await storage.getEmailTemplate("welcome_email");
    const loginUrl = `${process.env.APP_URL || 'https://pos.flowp.app'}/login`;
    
    let subject: string;
    let html: string;

    if (customTemplate?.isActive && customTemplate.htmlBody) {
      subject = customTemplate.subject
        .replace(/\{\{userName\}\}/g, userName)
        .replace(/\{\{businessName\}\}/g, businessName);
      const bodyContent = customTemplate.htmlBody
        .replace(/\{\{userName\}\}/g, userName)
        .replace(/\{\{businessName\}\}/g, businessName)
        .replace(/\{\{loginUrl\}\}/g, loginUrl);
      html = getEmailWrapper(bodyContent, { language });
    } else {
      const template = getWelcomeEmailTemplate({
        userName,
        businessName,
        loginUrl,
      }, language);
      subject = template.subject;
      html = template.html;
    }

    const sent = await this.sendEmail({ to: email, subject, html });
    
    await storage.createEmailLog({
      tenantId,
      templateType: "welcome_email",
      recipientEmail: email,
      subject,
      status: sent ? "sent" : "failed",
      errorMessage: sent ? null : "SMTP not configured or send failed",
    });

    return sent;
  }

  async sendOrderConfirmation(
    email: string,
    orderId: string,
    orderTotal: string,
    items: Array<{ name: string; quantity: number; price: string; imageUrl?: string }>,
    tenantId?: string,
    language: string = "en",
    tenantData?: { companyName?: string; companyLogo?: string }
  ): Promise<boolean> {
    const customTemplate = await storage.getEmailTemplate("order_confirmation");
    
    let subject: string;
    let html: string;

    if (customTemplate?.isActive && customTemplate.htmlBody) {
      const placeholderImg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Crect fill='%23f4f4f5' width='60' height='60' rx='6'/%3E%3Cpath d='M20 38l6-8 4 5 8-10 8 13H14z' fill='%23d4d4d8'/%3E%3Ccircle cx='22' cy='24' r='4' fill='%23d4d4d8'/%3E%3C/svg%3E`;
      const itemsHtml = items.map(item => {
        const imgSrc = item.imageUrl || placeholderImg;
        return `<tr>
          <td style="padding:8px 0;vertical-align:middle;width:50px;"><img src="${imgSrc}" alt="${item.name}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid #e4e4e7;" /></td>
          <td style="padding:8px;vertical-align:middle;">${item.name}</td>
          <td style="padding:8px;vertical-align:middle;text-align:center;">x${item.quantity}</td>
          <td style="padding:8px 0;vertical-align:middle;text-align:right;font-weight:600;">${item.price}</td>
        </tr>`;
      }).join("");
      
      const storeName = tenantData?.companyName || "Flowp";
      subject = customTemplate.subject.replace(/\{\{orderId\}\}/g, orderId).replace(/\{\{storeName\}\}/g, storeName);
      const bodyContent = customTemplate.htmlBody
        .replace(/\{\{storeName\}\}/g, storeName)
        .replace(/\{\{orderId\}\}/g, orderId)
        .replace(/\{\{orderTotal\}\}/g, orderTotal)
        .replace(/\{\{orderItems\}\}/g, itemsHtml);
      html = getEmailWrapper(bodyContent, { companyName: tenantData?.companyName, companyLogo: tenantData?.companyLogo, language });
    } else {
      const template = getOrderConfirmationTemplate({
        orderId,
        orderTotal,
        items,
        companyName: tenantData?.companyName,
        companyLogo: tenantData?.companyLogo,
      }, language);
      subject = template.subject;
      html = template.html;
    }

    const sent = await this.sendEmail({ to: email, subject, html });
    
    await storage.createEmailLog({
      tenantId,
      templateType: "order_confirmation",
      recipientEmail: email,
      subject,
      status: sent ? "sent" : "failed",
      errorMessage: sent ? null : "SMTP not configured or send failed",
    });

    return sent;
  }

  async sendPaymentReceivedEmail(
    email: string,
    amount: string,
    paymentMethod: string,
    tenantId?: string,
    language: string = "en",
    tenantData?: { companyName?: string; companyLogo?: string; transactionId?: string; date?: string }
  ): Promise<boolean> {
    const customTemplate = await storage.getEmailTemplate("payment_received");
    
    let subject: string;
    let html: string;

    if (customTemplate?.isActive && customTemplate.htmlBody) {
      const storeName = tenantData?.companyName || "Flowp";
      subject = customTemplate.subject.replace(/\{\{storeName\}\}/g, storeName);
      const bodyContent = customTemplate.htmlBody
        .replace(/\{\{storeName\}\}/g, storeName)
        .replace(/\{\{amount\}\}/g, amount)
        .replace(/\{\{paymentMethod\}\}/g, paymentMethod);
      html = getEmailWrapper(bodyContent, { companyName: tenantData?.companyName, companyLogo: tenantData?.companyLogo, language });
    } else {
      const template = getPaymentReceivedTemplate({
        amount,
        paymentMethod,
        transactionId: tenantData?.transactionId,
        date: tenantData?.date,
        companyName: tenantData?.companyName,
        companyLogo: tenantData?.companyLogo,
      }, language);
      subject = template.subject;
      html = template.html;
    }

    const sent = await this.sendEmail({ to: email, subject, html });
    
    await storage.createEmailLog({
      tenantId,
      templateType: "payment_received",
      recipientEmail: email,
      subject,
      status: sent ? "sent" : "failed",
      errorMessage: sent ? null : "SMTP not configured or send failed",
    });

    return sent;
  }

  async sendLowStockAlert(
    email: string,
    productName: string,
    currentStock: number,
    tenantId?: string,
    language: string = "en",
    tenantData?: { companyName?: string; companyLogo?: string; minStock?: number; sku?: string }
  ): Promise<boolean> {
    const customTemplate = await storage.getEmailTemplate("low_stock_alert");
    
    let subject: string;
    let html: string;

    if (customTemplate?.isActive && customTemplate.htmlBody) {
      const storeName = tenantData?.companyName || "Flowp";
      subject = customTemplate.subject.replace(/\{\{productName\}\}/g, productName).replace(/\{\{storeName\}\}/g, storeName);
      const bodyContent = customTemplate.htmlBody
        .replace(/\{\{storeName\}\}/g, storeName)
        .replace(/\{\{productName\}\}/g, productName)
        .replace(/\{\{currentStock\}\}/g, String(currentStock));
      html = getEmailWrapper(bodyContent, { companyName: tenantData?.companyName, companyLogo: tenantData?.companyLogo, language });
    } else {
      const template = getLowStockAlertTemplate({
        productName,
        currentStock,
        minStock: tenantData?.minStock,
        sku: tenantData?.sku,
        companyName: tenantData?.companyName,
        companyLogo: tenantData?.companyLogo,
      }, language);
      subject = template.subject;
      html = template.html;
    }

    const sent = await this.sendEmail({ to: email, subject, html });
    
    await storage.createEmailLog({
      tenantId,
      templateType: "low_stock_alert",
      recipientEmail: email,
      subject,
      status: sent ? "sent" : "failed",
      errorMessage: sent ? null : "SMTP not configured or send failed",
    });

    return sent;
  }

  async sendTransactionReceipt(
    email: string,
    data: TransactionReceiptTemplateData,
    tenantId?: string,
    language: string = "en"
  ): Promise<boolean> {
    const customTemplate = await storage.getEmailTemplate("transaction_receipt");
    
    let subject: string;
    let html: string;

    if (customTemplate?.isActive && customTemplate.htmlBody) {
      const itemsHtml = data.items.map(item => 
        `<tr><td>${item.name}</td><td>${item.quantity}</td><td>${item.price}</td></tr>`
      ).join("");
      
      const storeName = data.companyName || "Flowp";
      subject = customTemplate.subject.replace(/\{\{receiptNumber\}\}/g, data.receiptNumber).replace(/\{\{storeName\}\}/g, storeName);
      const bodyContent = customTemplate.htmlBody
        .replace(/\{\{storeName\}\}/g, storeName)
        .replace(/\{\{receiptNumber\}\}/g, data.receiptNumber)
        .replace(/\{\{date\}\}/g, data.date)
        .replace(/\{\{total\}\}/g, data.total)
        .replace(/\{\{items\}\}/g, itemsHtml);
      html = getEmailWrapper(bodyContent, { companyName: data.companyName, companyLogo: data.companyLogo, language });
    } else {
      const template = getTransactionReceiptTemplate(data, language);
      subject = template.subject;
      html = template.html;
    }

    let pdfBuffer: Buffer | undefined;
    try {
      pdfBuffer = await generateReceiptPDF({
        receiptNumber: data.receiptNumber,
        date: data.date,
        cashier: data.cashier,
        items: data.items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
        subtotal: data.subtotal,
        tax: data.tax,
        total: data.total,
        paymentMethod: data.paymentMethod,
        companyName: data.companyName || 'Flowp POS',
        companyLogo: data.companyLogo,
      }, language);
    } catch (error) {
      console.error("Failed to generate PDF receipt:", error);
    }

    const attachments = pdfBuffer ? [{
      filename: `receipt-${data.receiptNumber}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }] : undefined;

    const sent = await this.sendEmail({ to: email, subject, html, attachments });
    
    await storage.createEmailLog({
      tenantId,
      templateType: "transaction_receipt",
      recipientEmail: email,
      subject,
      status: sent ? "sent" : "failed",
      errorMessage: sent ? null : "SMTP not configured or send failed",
    });

    return sent;
  }

  async sendNewSaleNotification(
    email: string,
    data: {
      orderNumber: string;
      total: number;
      itemCount: number;
      paymentMethod: string;
      customerName?: string;
      cashierName?: string;
    },
    tenantId: string,
    language: string = "en",
    tenantData?: { companyName?: string; companyLogo?: string; currency?: string }
  ): Promise<boolean> {
    const templateData: NewSaleNotificationTemplateData = {
      orderNumber: data.orderNumber,
      total: data.total,
      itemCount: data.itemCount,
      paymentMethod: data.paymentMethod,
      customerName: data.customerName,
      cashierName: data.cashierName,
      companyName: tenantData?.companyName,
      companyLogo: tenantData?.companyLogo,
      currency: tenantData?.currency,
    };

    const template = getNewSaleNotificationTemplate(templateData, language);
    
    const sent = await this.sendEmail({ to: email, subject: template.subject, html: template.html });
    
    await storage.createEmailLog({
      tenantId,
      templateType: "new_sale_notification",
      recipientEmail: email,
      subject: template.subject,
      status: sent ? "sent" : "failed",
      errorMessage: sent ? null : "SMTP not configured or send failed",
    });

    return sent;
  }

  async testSmtpConnection(config: SmtpConfig): Promise<{ success: boolean; error?: string }> {
    try {
      const testTransporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.password,
        },
      });

      await testTransporter.verify();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async sendTestEmail(toEmail: string, config: SmtpConfig): Promise<{ success: boolean; error?: string }> {
    try {
      const testTransporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.password,
        },
      });

      await testTransporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: toEmail,
        subject: "Test Email from Flowp",
        html: `
          <h1>Test Email</h1>
          <p>This is a test email from Flowp to verify your SMTP configuration is working correctly.</p>
          <p>If you received this email, your email settings are configured properly!</p>
          <p>- The Flowp Team</p>
        `,
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export const emailService = new EmailService();
