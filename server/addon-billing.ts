import { storage } from "./storage";
import { createOneTimePaymentPreference } from "./mercadopago";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import {
  addonDefinitions,
  tenantAddons,
  whatsappPackages,
  tenantWhatsappSubscriptions,
} from "@shared/schema";

interface AddonChargeItem {
  type: "addon" | "whatsapp_package";
  refId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export async function getTenantBillableItems(tenantId: string): Promise<{
  addons: AddonChargeItem[];
  totalAmount: number;
}> {
  const activeAddons = await storage.getTenantActiveAddons(tenantId);

  const allDefs = await db
    .select()
    .from(addonDefinitions)
    .where(eq(addonDefinitions.isActive, true));

  const items: AddonChargeItem[] = [];

  for (const addon of activeAddons) {
    const def = allDefs.find((d) => d.addonKey === addon.addonType);
    if (!def || !def.monthlyPrice || def.monthlyPrice <= 0) continue;

    const priceInCents = def.monthlyPrice;
    items.push({
      type: "addon",
      refId: addon.id,
      description: def.name,
      quantity: 1,
      unitPrice: priceInCents,
      total: priceInCents,
    });
  }

  const totalAmount = items.reduce((sum, item) => sum + item.total, 0);
  return { addons: items, totalAmount };
}

export async function createAddonInvoice(
  tenantId: string,
  items: AddonChargeItem[],
  currency: string = "COP"
): Promise<{ invoiceId: string; totalAmount: number }> {
  const totalAmount = items.reduce((sum, item) => sum + item.total, 0);
  const totalInMajor = (totalAmount / 100).toFixed(2);

  const invoice = await storage.createInvoice({
    tenantId,
    amount: totalInMajor,
    currency,
    status: "pending",
    invoiceType: "addon",
    billingPeriodStart: new Date(),
    billingPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  for (const item of items) {
    await storage.createInvoiceLineItem({
      invoiceId: invoice.id,
      type: item.type,
      refId: item.refId,
      description: item.description,
      quantity: item.quantity,
      unitPrice: (item.unitPrice / 100).toFixed(2),
      total: (item.total / 100).toFixed(2),
    });
  }

  return { invoiceId: invoice.id, totalAmount };
}

export async function createWhatsappPackageInvoice(
  tenantId: string,
  packageId: string,
  currency: string = "COP"
): Promise<{ invoiceId: string; totalAmount: number; packageName: string }> {
  const [pkg] = await db
    .select()
    .from(whatsappPackages)
    .where(eq(whatsappPackages.id, packageId));

  if (!pkg) throw new Error("WhatsApp package not found");

  const totalInMajor = (pkg.price / 100).toFixed(2);

  const invoice = await storage.createInvoice({
    tenantId,
    amount: totalInMajor,
    currency,
    status: "pending",
    invoiceType: "whatsapp_package",
  });

  await storage.createInvoiceLineItem({
    invoiceId: invoice.id,
    type: "whatsapp_package",
    refId: packageId,
    description: `${pkg.name} (${pkg.messageLimit} messages)`,
    quantity: 1,
    unitPrice: totalInMajor,
    total: totalInMajor,
  });

  return { invoiceId: invoice.id, totalAmount: pkg.price, packageName: pkg.name };
}

export async function createAddonPaymentPreference(params: {
  tenantId: string;
  invoiceId: string;
  title: string;
  amount: number;
  currency: string;
  payerEmail: string;
  baseUrl: string;
}) {
  const externalReference = `addon|${params.tenantId}|${params.invoiceId}`;

  const result = await createOneTimePaymentPreference({
    title: params.title,
    amount: params.amount / 100,
    currency: params.currency,
    externalReference,
    payerEmail: params.payerEmail,
    backUrls: {
      success: `${params.baseUrl}/subscription?addon_payment=success&invoice_id=${params.invoiceId}`,
      failure: `${params.baseUrl}/subscription?addon_payment=failure&invoice_id=${params.invoiceId}`,
      pending: `${params.baseUrl}/subscription?addon_payment=pending&invoice_id=${params.invoiceId}`,
    },
    notificationUrl: `${params.baseUrl}/api/webhooks/mercadopago`,
  });

  await storage.updateInvoice(params.invoiceId, {
    mpPreferenceId: result.id as string,
  });

  return result;
}

export async function handleAddonPaymentApproved(
  tenantId: string,
  invoiceId: string,
  mpPaymentId: string
) {
  const invoice = await storage.getInvoice(invoiceId);
  if (!invoice) return;

  if (invoice.status === "paid") {
    console.log(`Invoice ${invoiceId} already paid, skipping duplicate webhook`);
    return;
  }

  const existingPayments = await storage.getSubscriptionPayments(tenantId);
  const alreadyProcessed = existingPayments.find(
    (p: any) => p.providerRef === mpPaymentId || p.mpPaymentId === mpPaymentId
  );
  if (alreadyProcessed) {
    console.log(`Payment ${mpPaymentId} already processed, skipping duplicate webhook`);
    return;
  }

  await storage.updateInvoice(invoiceId, {
    status: "paid",
    paidAt: new Date(),
  });

  await storage.createSaasPayment({
    tenantId,
    invoiceId,
    amount: invoice.amount,
    method: "mercadopago_onetime",
    providerRef: mpPaymentId,
    status: "completed",
    paymentPurpose: invoice.invoiceType || "addon",
    mpPaymentId,
  });

  if (invoice.invoiceType === "whatsapp_package") {
    const lineItems = await storage.getInvoiceLineItems(invoiceId);
    const packageItem = lineItems.find((li) => li.type === "whatsapp_package");
    if (packageItem && packageItem.refId) {
      const [pkg] = await db
        .select()
        .from(whatsappPackages)
        .where(eq(whatsappPackages.id, packageItem.refId));
      if (pkg) {
        const existingSubs = await db
          .select()
          .from(tenantWhatsappSubscriptions)
          .where(
            and(
              eq(tenantWhatsappSubscriptions.tenantId, tenantId),
              eq(tenantWhatsappSubscriptions.packageId, pkg.id),
              eq(tenantWhatsappSubscriptions.status, "active")
            )
          );
        if (existingSubs.length === 0) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          await db.insert(tenantWhatsappSubscriptions).values({
            tenantId,
            packageId: pkg.id,
            messageLimit: pkg.messageLimit,
            messagesUsed: 0,
            status: "active",
            expiresAt,
          });
        }
      }
    }
  }
}
