import { MercadoPagoConfig, PreApproval, Preference } from "mercadopago";

const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || "";
const publicKey = process.env.MERCADOPAGO_PUBLIC_KEY || "";

const client = new MercadoPagoConfig({ accessToken });
const preapproval = new PreApproval(client);
const preference = new Preference(client);

export function getMercadoPagoPublicKey() {
  return publicKey;
}

export function isMercadoPagoEnabled() {
  return !!accessToken && !!publicKey;
}

export async function createSubscriptionPreapproval(params: {
  planName: string;
  amount: number;
  currency: string;
  frequency: number;
  frequencyType: "months" | "days";
  payerEmail: string;
  externalReference: string;
  backUrl: string;
}) {
  const result = await preapproval.create({
    body: {
      reason: params.planName,
      payer_email: params.payerEmail,
      auto_recurring: {
        frequency: params.frequency,
        frequency_type: params.frequencyType,
        transaction_amount: params.amount,
        currency_id: params.currency === "COP" ? "COP" : params.currency,
      },
      external_reference: params.externalReference,
      back_url: params.backUrl,
      status: "pending",
    },
  });

  return {
    id: result.id,
    initPoint: result.init_point,
    status: result.status,
  };
}

export async function getPreapprovalStatus(preapprovalId: string) {
  const result = await preapproval.get({ id: preapprovalId });
  return {
    id: result.id,
    status: result.status,
    payerEmail: result.payer_email,
    externalReference: (result as any).external_reference,
    nextPaymentDate: result.next_payment_date,
    dateCreated: result.date_created,
  };
}

export async function cancelPreapproval(preapprovalId: string) {
  const result = await preapproval.update({
    id: preapprovalId,
    body: { status: "cancelled" },
  });
  return { id: result.id, status: result.status };
}

export async function createOneTimePaymentPreference(params: {
  title: string;
  amount: number;
  currency: string;
  externalReference: string;
  payerEmail: string;
  backUrls: {
    success: string;
    failure: string;
    pending: string;
  };
  notificationUrl?: string;
}) {
  const result = await preference.create({
    body: {
      items: [
        {
          id: params.externalReference,
          title: params.title,
          quantity: 1,
          unit_price: params.amount,
          currency_id: params.currency,
        },
      ],
      payer: {
        email: params.payerEmail,
      },
      external_reference: params.externalReference,
      back_urls: params.backUrls,
      notification_url: params.notificationUrl,
      auto_return: "approved",
    },
  });

  return {
    id: result.id,
    initPoint: result.init_point,
    sandboxInitPoint: result.sandbox_init_point,
  };
}
