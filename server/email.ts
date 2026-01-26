import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { storage } from "./storage";

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

  async sendPasswordResetEmail(email: string, resetToken: string, userName: string): Promise<boolean> {
    const template = await storage.getEmailTemplate("password_reset");
    const resetUrl = `${process.env.APP_URL || 'https://flowp.replit.app'}/reset-password?token=${resetToken}`;
    
    let subject = "Reset Your Password";
    let html = `
      <h1>Password Reset Request</h1>
      <p>Hello ${userName},</p>
      <p>You requested to reset your password. Click the link below to set a new password:</p>
      <p><a href="${resetUrl}" style="background-color: #6E51CD; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a></p>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
      <p>- The Flowp Team</p>
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

  async sendOrderConfirmation(email: string, orderId: string, orderTotal: string, items: Array<{ name: string; quantity: number; price: string }>, tenantId?: string): Promise<boolean> {
    const template = await storage.getEmailTemplate("order_confirmation");
    
    const itemsHtml = items.map(item => 
      `<tr><td>${item.name}</td><td>${item.quantity}</td><td>${item.price}</td></tr>`
    ).join("");

    let subject = `Order Confirmation - #${orderId}`;
    let html = `
      <h1>Order Confirmation</h1>
      <p>Thank you for your order!</p>
      <p><strong>Order #${orderId}</strong></p>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f5f5f5;">
            <th style="padding: 8px; text-align: left;">Item</th>
            <th style="padding: 8px; text-align: left;">Qty</th>
            <th style="padding: 8px; text-align: left;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      <p style="margin-top: 16px;"><strong>Total: ${orderTotal}</strong></p>
      <p>- The Flowp Team</p>
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

  async sendPaymentReceivedEmail(email: string, amount: string, paymentMethod: string, tenantId?: string): Promise<boolean> {
    const template = await storage.getEmailTemplate("payment_received");
    
    let subject = "Payment Received";
    let html = `
      <h1>Payment Confirmation</h1>
      <p>We have received your payment.</p>
      <p><strong>Amount:</strong> ${amount}</p>
      <p><strong>Payment Method:</strong> ${paymentMethod}</p>
      <p>Thank you for your business!</p>
      <p>- The Flowp Team</p>
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

  async sendLowStockAlert(email: string, productName: string, currentStock: number, tenantId?: string): Promise<boolean> {
    const template = await storage.getEmailTemplate("low_stock_alert");
    
    let subject = `Low Stock Alert: ${productName}`;
    let html = `
      <h1>Low Stock Alert</h1>
      <p>The following product is running low on stock:</p>
      <p><strong>Product:</strong> ${productName}</p>
      <p><strong>Current Stock:</strong> ${currentStock}</p>
      <p>Please consider restocking soon.</p>
      <p>- The Flowp Team</p>
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
