import { db } from "../../db";
import { 
  tenants, 
  orders, 
  orderItems, 
  customers, 
  products,
  payments,
  tenantIntegrationsMatias,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { 
  MATIAS_PAYMENT_METHODS, 
  MATIAS_DOCUMENT_TYPES,
  type MatiasPayload,
  type MatiasNotePayload,
  type MatiasSupportDocPayload,
} from "./types";

function formatDate(date: Date = new Date()): string {
  return date.toISOString().split("T")[0];
}

function formatTime(date: Date = new Date()): string {
  return date.toISOString().split("T")[1].split(".")[0];
}

function roundTo2(num: number): number {
  return Math.round(num * 100) / 100;
}

function getPaymentMethodId(method: string | null): number {
  switch ((method || "cash").toLowerCase()) {
    case "cash":
      return MATIAS_PAYMENT_METHODS.CASH;
    case "card":
    case "credit_card":
      return MATIAS_PAYMENT_METHODS.CREDIT_CARD;
    case "debit_card":
      return MATIAS_PAYMENT_METHODS.DEBIT_CARD;
    case "transfer":
      return MATIAS_PAYMENT_METHODS.TRANSFER;
    case "split":
    case "mixed":
      return MATIAS_PAYMENT_METHODS.MIXED;
    default:
      return MATIAS_PAYMENT_METHODS.CASH;
  }
}

// Official DIAN ID Type mapping
// 1 = CC (Cédula de Ciudadanía)
// 2 = CE (Cédula de Extranjería)
// 3 = NIT (Número de Identificación Tributaria)
// 4 = TI (Tarjeta de Identidad)
// 5 = PP (Pasaporte)
// 10 = NURE (Número Único de Registro Económico)
function mapCustomerIdType(idType: string | null): number {
  switch (idType?.toLowerCase()) {
    case "cc":
    case "cedula_ciudadania":
      return 1;
    case "ce":
    case "cedula_extranjeria":
      return 2;
    case "nit":
      return 3;
    case "ti":
    case "tarjeta_identidad":
      return 4;
    case "pp":
    case "pasaporte":
    case "passport":
      return 5;
    case "nure":
      return 10;
    default:
      return 1; // Default to CC
  }
}

export async function buildPosPayload(
  orderId: string,
  resolutionNumber: string,
  prefix: string,
  documentNumber: number,
): Promise<MatiasPayload | null> {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });

  if (!order) return null;

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, order.tenantId),
  });

  if (!tenant) return null;

  const matiasConfig = await db.query.tenantIntegrationsMatias.findFirst({
    where: eq(tenantIntegrationsMatias.tenantId, order.tenantId),
  });

  if (!matiasConfig) return null;

  const items = await db.query.orderItems.findMany({
    where: eq(orderItems.orderId, orderId),
  });

  const productIds = items.map(item => item.productId);
  const productList = productIds.length > 0 
    ? await db.query.products.findMany({
        where: inArray(products.id, productIds),
      })
    : [];

  const productMap = new Map(productList.map(p => [p.id, p]));

  const orderPayments = await db.query.payments.findMany({
    where: eq(payments.orderId, orderId),
  });

  let paymentMethodId: number = MATIAS_PAYMENT_METHODS.CASH;
  if (orderPayments.length === 1) {
    paymentMethodId = getPaymentMethodId(orderPayments[0].method);
  } else if (orderPayments.length > 1) {
    paymentMethodId = MATIAS_PAYMENT_METHODS.MIXED;
  }

  let customer = null;
  if (order.customerId) {
    customer = await db.query.customers.findFirst({
      where: eq(customers.id, order.customerId),
    });
  }

  const now = new Date();
  const taxRate = Number(tenant.taxRate || 0);

  // DIAN 5.2 Tax Calculation per line:
  // 1. línea_subtotal = cantidad × precio_unitario
  // 2. Apply line discounts (if any)
  // 3. línea_base = línea_subtotal - descuentos = line_extension_amount
  // 4. línea_impuesto = línea_base × porcentaje_impuesto / 100 = tax_amount
  // 5. línea_total = línea_base + línea_impuesto
  const invoiceLines = items.map((item, index) => {
    const product = productMap.get(item.productId);
    const qty = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    // línea_base (after any discounts applied at order level)
    const lineTotal = roundTo2(qty * unitPrice);
    // línea_impuesto = línea_base × porcentaje / 100
    const taxAmount = taxRate > 0 ? roundTo2(lineTotal * (taxRate / 100)) : 0;

    return {
      unit_measure_id: 70,
      quantity_units_id: 70,
      invoiced_quantity: qty,
      line_extension_amount: lineTotal,
      free_of_charge_indicator: false,
      tax_totals: taxRate > 0 ? [{
        tax_id: 1,
        tax_amount: taxAmount,
        taxable_amount: lineTotal,
        percent: taxRate,
      }] : [],
      description: product?.name || `Item ${index + 1}`,
      notes: item.notes || undefined,
      code: product?.sku || item.productId || `ITEM-${index + 1}`,
      type_item_identification_id: 4,
      type_item_identifications_id: 4,
      price_amount: unitPrice,
      base_quantity: 1,
    };
  });

  // DIAN 5.2 Aggregate calculations:
  // total_base = Σ línea_base = line_extension_amount
  const lineExtensionAmount = roundTo2(invoiceLines.reduce((sum, line) => sum + line.line_extension_amount, 0));
  // total_impuestos = Σ línea_impuesto
  const totalTax = roundTo2(invoiceLines.reduce((sum, line) => 
    sum + (line.tax_totals?.[0]?.tax_amount || 0), 0
  ));
  // total_factura = total_base + total_impuestos
  const totalWithTax = roundTo2(lineExtensionAmount + totalTax);

  const customerData = {
    identification_number: customer?.idNumber || customer?.phone || "222222222222",
    dni: customer?.idNumber || customer?.phone || "222222222222",
    name: customer?.name || "Consumidor Final",
    company_name: customer?.name || "Consumidor Final",
    phone: customer?.phone || undefined,
    address: customer?.address || undefined,
    email: customer?.email || undefined,
    type_document_identification_id: customer ? mapCustomerIdType(customer.idType) : 13,
    type_organization_id: customer?.organizationTypeId || 2,
    type_liability_id: customer?.taxLiabilityId || 117,
    municipality_id: customer?.municipalityId || 1,
    type_regime_id: customer?.taxRegimeId || 2,
    country_id: parseInt(customer?.countryCode || "169", 10),
  };

  const payload: MatiasPayload = {
    type_document_id: MATIAS_DOCUMENT_TYPES.POS,
    resolution_number: resolutionNumber,
    prefix: prefix,
    number: documentNumber,
    date: formatDate(now),
    time: formatTime(now),
    notes: order.notes || undefined,
    order_reference: {
      id_order: String(order.orderNumber),
      issue_date: formatDate(now),
    },
    customer: customerData,
    payment_form: {
      payment_form_id: 1,
      payment_method_id: paymentMethodId,
    },
    payments: [{
      payment_form_id: 1,
      payment_method_id: 1,
      means_payment_id: paymentMethodId,
      value_paid: totalWithTax,
    }],
    legal_monetary_totals: {
      line_extension_amount: lineExtensionAmount,
      tax_exclusive_amount: lineExtensionAmount,
      tax_inclusive_amount: totalWithTax,
      payable_amount: totalWithTax,
    },
    tax_totals: taxRate > 0 ? [{
      tax_id: 1,
      tax_amount: totalTax,
      taxable_amount: lineExtensionAmount,
      percent: taxRate,
    }] : [{
      tax_id: 1,
      tax_amount: 0,
      taxable_amount: lineExtensionAmount,
      percent: 0,
    }],
    invoice_lines: invoiceLines,
    lines: invoiceLines,
  };

  return payload;
}

export async function buildPosCreditNotePayload(
  orderId: string,
  refundAmount: number,
  refundReason: string,
  resolutionNumber: string,
  prefix: string,
  documentNumber: number,
  originalCufe: string,
  originalNumber: string,
  originalDate: string,
  correctionConceptId: number = 1,
): Promise<MatiasNotePayload | null> {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });

  if (!order) return null;

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, order.tenantId),
  });

  if (!tenant) return null;

  const matiasConfig = await db.query.tenantIntegrationsMatias.findFirst({
    where: eq(tenantIntegrationsMatias.tenantId, order.tenantId),
  });

  if (!matiasConfig) return null;

  const now = new Date();
  const taxRate = Number(tenant.taxRate || 0);
  const taxAmount = taxRate > 0 ? roundTo2(refundAmount * (taxRate / (100 + taxRate))) : 0;
  const lineTotal = roundTo2(refundAmount - taxAmount);

  let customer = null;
  if (order.customerId) {
    customer = await db.query.customers.findFirst({
      where: eq(customers.id, order.customerId),
    });
  }

  const customerData = {
    identification_number: customer?.idNumber || customer?.phone || "222222222222",
    dni: customer?.idNumber || customer?.phone || "222222222222",
    name: customer?.name || "Consumidor Final",
    company_name: customer?.name || "Consumidor Final",
    phone: customer?.phone || undefined,
    address: customer?.address || undefined,
    email: customer?.email || undefined,
    type_document_identification_id: customer ? mapCustomerIdType(customer.idType) : 13,
    type_organization_id: customer?.organizationTypeId || 2,
    type_liability_id: customer?.taxLiabilityId || 117,
    municipality_id: customer?.municipalityId || 1,
    type_regime_id: customer?.taxRegimeId || 2,
    country_id: parseInt(customer?.countryCode || "169", 10),
  };

  const invoiceLines = [{
    unit_measure_id: 70,
    invoiced_quantity: 1,
    line_extension_amount: lineTotal,
    free_of_charge_indicator: false,
    tax_totals: taxRate > 0 ? [{
      tax_id: 1,
      tax_amount: taxAmount,
      taxable_amount: lineTotal,
      percent: taxRate,
    }] : [],
    description: `Nota crédito - ${refundReason}`,
    code: `NC-${orderId.slice(0, 8)}`,
    type_item_identification_id: 4,
    price_amount: lineTotal,
    base_quantity: 1,
  }];

  const payload: MatiasNotePayload = {
    type_document_id: MATIAS_DOCUMENT_TYPES.POS_CREDIT_NOTE,
    resolution_number: resolutionNumber,
    prefix: prefix,
    number: documentNumber,
    date: formatDate(now),
    time: formatTime(now),
    notes: refundReason,
    customer: customerData,
    billing_reference: {
      number: originalNumber,
      uuid: originalCufe,
      issue_date: originalDate,
      scheme_name: "CUFE-SHA384",
    },
    discrepancy_response: {
      correction_concept_id: correctionConceptId,
      description: refundReason,
    },
    legal_monetary_totals: {
      line_extension_amount: lineTotal,
      tax_exclusive_amount: lineTotal,
      tax_inclusive_amount: refundAmount,
      payable_amount: refundAmount,
    },
    tax_totals: taxRate > 0 ? [{
      tax_id: 1,
      tax_amount: taxAmount,
      taxable_amount: lineTotal,
      percent: taxRate,
    }] : undefined,
    invoice_lines: invoiceLines,
    point_of_sale: {
      cashier_term: matiasConfig.posTerminalNumber || "CAJA01",
      cashier_type: matiasConfig.posCashierType || "POS",
      sales_code: matiasConfig.posSalesCode || "0001",
      address: matiasConfig.posAddress || tenant.address || "Main Store",
    },
    software_manufacturer: matiasConfig.softwareId ? {
      software_id: matiasConfig.softwareId,
      software_pin: matiasConfig.softwarePin || "",
      manufacturer_name: matiasConfig.manufacturerName || "Flowp",
      manufacturer_nit: matiasConfig.manufacturerNit || "",
    } : undefined,
  };

  return payload;
}

export async function buildSupportDocumentPayload(
  tenantId: string,
  purchaseOrderId: string,
  resolutionNumber: string,
  prefix: string,
  documentNumber: number,
): Promise<MatiasSupportDocPayload | null> {
  return null;
}
