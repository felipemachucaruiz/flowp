import { db } from "../../db";
import { 
  tenants, 
  orders, 
  orderItems, 
  customers, 
  products,
  payments,
  tenantIntegrationsMatias,
  matiasDocumentQueue,
} from "@shared/schema";
import { eq, inArray, and } from "drizzle-orm";
import { 
  MATIAS_MEANS_PAYMENT,
  MATIAS_PAYMENT_METHOD,
  MATIAS_PAYMENT_METHODS, 
  MATIAS_DOCUMENT_TYPES,
  MATIAS_CURRENCY,
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

// Returns means_payment_id (Medio de Pago - instrumento específico)
function getMeansPaymentId(method: string | null): number {
  switch ((method || "cash").toLowerCase()) {
    case "cash":
      return MATIAS_MEANS_PAYMENT.CASH;         // 10
    case "card":
    case "credit_card":
      return MATIAS_MEANS_PAYMENT.CREDIT_CARD;  // 41
    case "debit_card":
      return MATIAS_MEANS_PAYMENT.DEBIT_CARD;   // 40
    case "transfer":
      return MATIAS_MEANS_PAYMENT.TRANSFER;     // 42
    case "check":
      return MATIAS_MEANS_PAYMENT.CHECK;        // 02
    default:
      return MATIAS_MEANS_PAYMENT.CASH;         // 10
  }
}

// Returns payment_method_id (Método de Pago - categoría general)
function getPaymentMethodId(isMixed: boolean, isCredit: boolean = false): number {
  if (isMixed) return MATIAS_PAYMENT_METHOD.MIXED;     // 3
  if (isCredit) return MATIAS_PAYMENT_METHOD.CREDITO;  // 2
  return MATIAS_PAYMENT_METHOD.CONTADO;                // 1
}

// MATIAS API ID Type mapping (identity_document_id)
// IMPORTANT: Always use MATIAS API codes, not DIAN codes
// Código | Tipo
// 1      | Cédula de Ciudadanía
// 2      | NIT
// 3      | Pasaporte
// 4      | Documento de Extranjería
// 5      | Tarjeta de Identidad
// 6      | Consumidor Final
function mapCustomerIdType(idType: string | null): number {
  switch (idType?.toLowerCase()) {
    case "cc":
    case "cedula_ciudadania":
      return 1;
    case "nit":
      return 2;
    case "pp":
    case "pasaporte":
    case "passport":
      return 3;
    case "ce":
    case "cedula_extranjeria":
      return 4;
    case "ti":
    case "tarjeta_identidad":
      return 5;
    case "cf":
    case "consumidor_final":
      return 6;
    default:
      return 1; // Default to CC
  }
}

// MATIAS API v2 tax_level_id mapping
// Maps old type_liability_id values to new tax_level_id (1-5)
// Código | Nivel de Responsabilidad
// 1      | Gran Contribuyente
// 2      | Autorretenedor  
// 3      | Agente de Retención IVA
// 4      | Régimen Simple de Tributación
// 5      | No responsable de IVA (most common for consumers)
function mapTaxLevelId(oldLiabilityId: number | null | undefined): number {
  // If already in valid range 1-5, use it
  if (oldLiabilityId && oldLiabilityId >= 1 && oldLiabilityId <= 5) {
    return oldLiabilityId;
  }
  // Map old DIAN type_liability_id codes to new tax_level_id
  switch (oldLiabilityId) {
    case 117: // Old "Autorretenedor" or similar
    case 49:  // O-49 Autorretenedor  
      return 2;
    case 3:   // Agente de retención
      return 3;
    case 48:  // R-99-PN No Aplica
      return 5; // No responsable de IVA
    default:
      return 5; // Default: No responsable de IVA (most common for POS consumers)
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

  // Determine payment IDs based on MATIAS API structure
  const isMixedPayment = orderPayments.length > 1;
  const paymentMethodId = getPaymentMethodId(isMixedPayment);  // Método de Pago (1=Contado, 2=Crédito, 3=Mixto)
  const meansPaymentId = orderPayments.length === 1 
    ? getMeansPaymentId(orderPayments[0].method)  // Medio de Pago (10=Efectivo, 41=TC, etc.)
    : MATIAS_MEANS_PAYMENT.CASH;  // Default for mixed

  let customer = null;
  if (order.customerId) {
    customer = await db.query.customers.findFirst({
      where: eq(customers.id, order.customerId),
    });
  }

  const now = new Date();
  const taxRate = Number(tenant.taxRate || 0);

  // DIAN 5.2 Tax Calculation per line:
  // 1. línea_base = cantidad × precio_unitario = line_extension_amount
  // 2. línea_impuesto = línea_base × porcentaje_impuesto / 100 = tax_amount
  // 3. línea_total = línea_base + línea_impuesto
  // IMPORTANT: Compute all values from the SAME source to avoid FAU04 mismatch
  const lines = items.map((item, index) => {
    const product = productMap.get(item.productId);
    const qty = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const lineTotal = roundTo2(qty * unitPrice);
    const taxAmount = taxRate > 0 ? roundTo2(lineTotal * (taxRate / 100)) : 0;
    // Sanitize product code: remove special chars, limit length, ensure not empty
    let productCode = (product?.sku || product?.barcode || `P${index + 1}`).replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 20);
    if (!productCode) productCode = `P${index + 1}`;

    return {
      invoiced_quantity: String(qty),
      quantity_units_id: "1093",
      line_extension_amount: lineTotal.toFixed(2),
      free_of_charge_indicator: false,
      description: (product?.name || `Item ${index + 1}`).substring(0, 300),
      code: productCode,
      type_item_identifications_id: "4",
      reference_price_id: "1",
      price_amount: unitPrice.toFixed(2),
      base_quantity: String(qty),
      tax_totals: taxRate > 0 ? [{
        tax_id: 1,
        tax_amount: roundTo2(taxAmount),
        taxable_amount: roundTo2(lineTotal),
        percent: taxRate,
      }] : [{
        tax_id: 1,
        tax_amount: 0,
        taxable_amount: roundTo2(lineTotal),
        percent: 0,
      }],
    };
  });

  // DIAN 5.2 Aggregate calculations - computed from the SAME lines array
  // to guarantee FAU04 consistency (sum of line bases == document base)
  const lineExtensionAmount = roundTo2(lines.reduce((sum, line) => sum + parseFloat(line.line_extension_amount), 0));
  const totalTax = roundTo2(lines.reduce((sum, line) => 
    sum + (line.tax_totals?.[0]?.tax_amount || 0), 0
  ));
  const totalWithTax = roundTo2(lineExtensionAmount + totalTax);

  // Customer data - MATIAS API v2 field names
  // country_id: 170 = Colombia (ISO 3166-1 numeric), NOT 45
  const customerData = {
    dni: customer?.idNumber || customer?.phone || "222222222222",
    company_name: customer?.name || "CONSUMIDOR FINAL",
    name: customer?.name || "CONSUMIDOR FINAL",
    mobile: customer?.phone || undefined,
    phone: customer?.phone || undefined,
    address: customer?.address || "Sin direccion",
    email: customer?.email || "noreply@flowp.com",
    postal_code: "110111",
    country_id: String(customer?.countryCode || 170),
    city_id: String(customer?.municipalityId || 149),
    identity_document_id: String(customer ? mapCustomerIdType(customer.idType) : 6),
    type_organization_id: customer?.organizationTypeId || 2,
    tax_regime_id: customer?.taxRegimeId || 2,
    tax_level_id: mapTaxLevelId(customer?.taxLiabilityId),
  };

  const payload: MatiasPayload = {
    type_document_id: MATIAS_DOCUMENT_TYPES.INVOICE,
    resolution_number: resolutionNumber,
    prefix: prefix,
    document_number: String(documentNumber),
    operation_type_id: 1,
    graphic_representation: 0,
    send_email: 0,
    customer: customerData,
    lines: lines,
    legal_monetary_totals: {
      line_extension_amount: lineExtensionAmount.toFixed(2),
      tax_exclusive_amount: lineExtensionAmount.toFixed(2),
      tax_inclusive_amount: totalWithTax.toFixed(2),
      payable_amount: totalWithTax.toFixed(2),
    },
    tax_totals: [{
      tax_id: 1,
      tax_amount: roundTo2(totalTax),
      taxable_amount: roundTo2(lineExtensionAmount),
      percent: taxRate,
    }],
    payments: [{
      payment_method_id: paymentMethodId,
      means_payment_id: meansPaymentId,
      value_paid: totalWithTax.toFixed(2),
    }],
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

  // Get the original invoice prefix from the POS document queue record
  const originalPosDoc = await db.query.matiasDocumentQueue.findFirst({
    where: and(
      eq(matiasDocumentQueue.sourceId, orderId),
      eq(matiasDocumentQueue.kind, "POS"),
    ),
  });
  
  // Combine original invoice prefix + number for the full reference (e.g., "LZT281")
  const originalInvoicePrefix = originalPosDoc?.prefix || matiasConfig?.defaultPrefix || "";
  const fullOriginalReference = `${originalInvoicePrefix}${originalNumber}`;

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

  // MATIAS API v2 lines format - consistent types with invoice payload
  const lines = [{
    invoiced_quantity: "1",
    quantity_units_id: "1093",
    line_extension_amount: lineTotal.toFixed(2),
    free_of_charge_indicator: false,
    description: `Nota crédito - ${refundReason}`,
    code: `NC-${orderId.slice(0, 8).replace(/[^a-zA-Z0-9]/g, '')}`,
    type_item_identifications_id: "4",
    reference_price_id: "1",
    price_amount: lineTotal.toFixed(2),
    base_quantity: "1",
    tax_totals: [{
      tax_id: 1,
      tax_amount: roundTo2(taxAmount),
      taxable_amount: roundTo2(lineTotal),
      percent: taxRate,
    }],
  }];

  const payload: MatiasNotePayload = {
    type_document_id: MATIAS_DOCUMENT_TYPES.CREDIT_NOTE,
    resolution_number: resolutionNumber,
    prefix: prefix,
    document_number: String(documentNumber),
    operation_type_id: 12,
    graphic_representation: 0,
    send_email: 0,
    customer: {
      dni: customer?.idNumber || customer?.phone || "222222222222",
      company_name: customer?.name || "CONSUMIDOR FINAL",
      name: customer?.name || "CONSUMIDOR FINAL",
      mobile: customer?.phone || undefined,
      address: customer?.address || "Sin direccion",
      email: customer?.email || "noreply@flowp.com",
      postal_code: "110111",
      country_id: String(customer?.countryCode || 170),
      city_id: String(customer?.municipalityId || 149),
      identity_document_id: String(customer ? mapCustomerIdType(customer.idType) : 6),
      type_organization_id: customer?.organizationTypeId || 2,
      tax_regime_id: customer?.taxRegimeId || 2,
      tax_level_id: mapTaxLevelId(customer?.taxLiabilityId),
    },
    billing_reference: {
      number: fullOriginalReference,
      uuid: originalCufe,
      date: originalDate,
      scheme_name: "CUFE-SHA384",
    },
    discrepancy_response: {
      reference_id: fullOriginalReference,
      response_id: "2",
      correction_concept_id: correctionConceptId,
      description: refundReason,
    },
    lines: lines,
    legal_monetary_totals: {
      line_extension_amount: lineTotal.toFixed(2),
      tax_exclusive_amount: lineTotal.toFixed(2),
      tax_inclusive_amount: refundAmount.toFixed(2),
      payable_amount: refundAmount.toFixed(2),
    },
    tax_totals: [{
      tax_id: 1,
      tax_amount: roundTo2(taxAmount),
      taxable_amount: roundTo2(lineTotal),
      percent: taxRate,
    }],
    payments: [{
      payment_method_id: 1,
      means_payment_id: 10,
      value_paid: refundAmount.toFixed(2),
    }],
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
