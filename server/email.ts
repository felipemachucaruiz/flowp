import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { storage } from "./storage";
import { getEmailTranslation, replaceVariables } from "./email-translations";

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  fromEmail: string;
  fromName: string;
}

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: Transporter | null = null;
  private config: SmtpConfig | null = null;

  async getSmtpConfig(): Promise<SmtpConfig | null> {
    try {
      const setting = await storage.getSystemSetting("smtp_config");
      if (setting?.value) {
        return setting.value as SmtpConfig;
      }
    } catch (error) {
      console.error("Failed to get SMTP config:", error);
    }
    return null;
  }

  async initTransporter(): Promise<boolean> {
    this.config = await this.getSmtpConfig();
    
    if (!this.config?.host || !this.config?.auth?.user) {
      console.log("SMTP not configured");
      return false;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port || 587,
        secure: this.config.secure || false,
        auth: {
          user: this.config.auth.user,
          pass: this.config.auth.pass,
        },
      });

      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error("Failed to init email transporter:", error);
      this.transporter = null;
      return false;
    }
  }

  async sendEmail(payload: EmailPayload): Promise<boolean> {
    if (!this.transporter) {
      const initialized = await this.initTransporter();
      if (!initialized) {
        console.log("Email not sent - SMTP not configured");
        return false;
      }
    }

    if (!this.config) {
      return false;
    }

    try {
      await this.transporter!.sendMail({
        from: `"${this.config.fromName || 'Flowp'}" <${this.config.fromEmail || this.config.auth.user}>`,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });

      return true;
    } catch (error) {
      console.error("Failed to send email:", error);
      return false;
    }
  }

  async sendPasswordResetEmail(email: string, resetToken: string, userName: string, language: string = "en"): Promise<boolean> {
    const template = await storage.getEmailTemplate("password_reset");
    const resetUrl = `${process.env.APP_URL || 'https://flowp.replit.app'}/reset-password?token=${resetToken}`;
    const t = getEmailTranslation(language).password_reset;
    
    let subject = replaceVariables(t.subject, { userName });
    let html = `
      <h1>${t.subject}</h1>
      <p>${replaceVariables(t.greeting, { userName })}</p>
      <p>${t.message}</p>
      <p><a href="${resetUrl}" style="background-color: #6E51CD; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">${t.button}</a></p>
      <p>${t.expiry}</p>
      <p>${t.ignore}</p>
      <p>${t.signature}</p>
    `;

    if (template?.isActive) {
      subject = template.subject
        .replace(/\{\{userName\}\}/g, userName);
      html = template.htmlBody
        .replace(/\{\{userName\}\}/g, userName)
        .replace(/\{\{resetUrl\}\}/g, resetUrl);
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

  async sendOrderConfirmation(email: string, orderId: string, orderTotal: string, items: Array<{ name: string; quantity: number; price: string }>, tenantId?: string, language: string = "en"): Promise<boolean> {
    const template = await storage.getEmailTemplate("order_confirmation");
    const t = getEmailTranslation(language).order_confirmation;
    
    const itemsHtml = items.map(item => 
      `<tr><td>${item.name}</td><td>${item.quantity}</td><td>${item.price}</td></tr>`
    ).join("");

    let subject = replaceVariables(t.subject, { orderId });
    let html = `
      <h1>${t.title}</h1>
      <p>${t.thank_you}</p>
      <p><strong>${replaceVariables(t.order_number, { orderId })}</strong></p>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f5f5f5;">
            <th style="padding: 8px; text-align: left;">${t.item}</th>
            <th style="padding: 8px; text-align: left;">${t.qty}</th>
            <th style="padding: 8px; text-align: left;">${t.price}</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      <p style="margin-top: 16px;"><strong>${replaceVariables(t.total, { orderTotal })}</strong></p>
      <p>${t.signature}</p>
    `;

    if (template?.isActive) {
      subject = template.subject.replace(/\{\{orderId\}\}/g, orderId);
      html = template.htmlBody
        .replace(/\{\{orderId\}\}/g, orderId)
        .replace(/\{\{orderTotal\}\}/g, orderTotal)
        .replace(/\{\{orderItems\}\}/g, itemsHtml);
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

  async sendPaymentReceivedEmail(email: string, amount: string, paymentMethod: string, tenantId?: string, language: string = "en"): Promise<boolean> {
    const template = await storage.getEmailTemplate("payment_received");
    const t = getEmailTranslation(language).payment_received;
    
    let subject = t.subject;
    let html = `
      <h1>${t.title}</h1>
      <p>${t.message}</p>
      <p><strong>${t.amount}:</strong> ${amount}</p>
      <p><strong>${t.payment_method}:</strong> ${paymentMethod}</p>
      <p>${t.thank_you}</p>
      <p>${t.signature}</p>
    `;

    if (template?.isActive) {
      subject = template.subject;
      html = template.htmlBody
        .replace(/\{\{amount\}\}/g, amount)
        .replace(/\{\{paymentMethod\}\}/g, paymentMethod);
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

  async sendLowStockAlert(email: string, productName: string, currentStock: number, tenantId?: string, language: string = "en"): Promise<boolean> {
    const template = await storage.getEmailTemplate("low_stock_alert");
    const t = getEmailTranslation(language).low_stock_alert;
    
    let subject = replaceVariables(t.subject, { productName });
    let html = `
      <h1>${t.title}</h1>
      <p>${t.message}</p>
      <p><strong>${t.product}:</strong> ${productName}</p>
      <p><strong>${t.current_stock}:</strong> ${currentStock}</p>
      <p>${t.action}</p>
      <p>${t.signature}</p>
    `;

    if (template?.isActive) {
      subject = template.subject.replace(/\{\{productName\}\}/g, productName);
      html = template.htmlBody
        .replace(/\{\{productName\}\}/g, productName)
        .replace(/\{\{currentStock\}\}/g, String(currentStock));
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

  async testSmtpConnection(config: SmtpConfig): Promise<{ success: boolean; error?: string }> {
    try {
      const testTransporter = nodemailer.createTransport({
        host: config.host,
        port: config.port || 587,
        secure: config.secure || false,
        auth: {
          user: config.auth.user,
          pass: config.auth.pass,
        },
      });

      await testTransporter.verify();
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
}

export const emailService = new EmailService();
