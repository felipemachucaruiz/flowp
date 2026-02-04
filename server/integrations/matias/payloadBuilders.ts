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

  // MATIAS API v2 Customer fields:
  // - identity_document_id (not type_document_identification_id)
  // - city_id (not municipality_id)
  // - tax_regime_id (not type_regime_id)
  // - tax_level_id (not type_liability_id) - must be 1-5
  const customerData = {
    dni: customer?.idNumber || customer?.phone || "222222222222",
    company_name: customer?.name || "CONSUMIDOR FINAL",
    name: customer?.name || "CONSUMIDOR FINAL",
    mobile: customer?.phone || undefined,
    phone: customer?.phone || undefined,
    address: customer?.address || "Sin direccion",
    email: customer?.email || "noreply@flowp.com",
    postal_code: "110111",
    country_id: String(customer?.countryCode || 45),  // 45 = Colombia in MATIAS v2
    city_id: String(customer?.municipalityId || 149),  // 149 = Medellín default
    identity_document_id: String(customer ? mapCustomerIdType(customer.idType) : 6),  // 6 = Consumidor Final
    type_organization_id: customer?.organizationTypeId || 2,  // 2 = Persona Natural
    tax_regime_id: customer?.taxRegimeId || 2,  // 2 = No responsable de IVA
    tax_level_id: mapTaxLevelId(customer?.taxLiabilityId),  // Maps old values to 1-5 range
  };

  // Build lines array with MATIAS API v2 field names
  const lines = items.map((item, index) => {
    const product = productMap.get(item.productId);
    const qty = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const lineTotal = roundTo2(qty * unitPrice);
    const taxAmount = taxRate > 0 ? roundTo2(lineTotal * (taxRate / 100)) : 0;

    return {
      invoiced_quantity: String(qty),
      quantity_units_id: "1093",  // Unidad estándar
      line_extension_amount: String(lineTotal.toFixed(2)),
      free_of_charge_indicator: false,
      description: product?.name || `Item ${index + 1}`,
      code: product?.sku || item.productId || `ITEM-${index + 1}`,
      type_item_identifications_id: "4",
      reference_price_id: "1",
      price_amount: String(unitPrice),
      base_quantity: String(qty),
      tax_totals: taxRate > 0 ? [{
        tax_id: "1",
        tax_amount: taxAmount,
        taxable_amount: lineTotal,
        percent: taxRate,
      }] : [],
    };
  });

  const payload: MatiasPayload = {
    type_document_id: MATIAS_DOCUMENT_TYPES.INVOICE,  // Use 7 (Factura de Venta)
    resolution_number: resolutionNumber,
    prefix: prefix,
    document_number: String(documentNumber),  // MATIAS uses document_number as string
    operation_type_id: 1,  // 1 = Standard operation
    graphic_representation: 0,  // 0 = No graphic
    send_email: 0,  // 0 = Don't send email
    customer: customerData,
    lines: lines,  // Use 'lines' field (not 'invoice_lines')
    legal_monetary_totals: {
      line_extension_amount: String(lineExtensionAmount.toFixed(2)),
      tax_exclusive_amount: String(lineExtensionAmount.toFixed(2)),
      tax_inclusive_amount: String(totalWithTax.toFixed(2)),
      payable_amount: totalWithTax,
    },
    tax_totals: taxRate > 0 ? [{
      tax_id: "1",
      tax_amount: totalTax,
      taxable_amount: lineExtensionAmount,
      percent: taxRate,
    }] : [{
      tax_id: "1",
      tax_amount: 0,
      taxable_amount: lineExtensionAmount,
      percent: 0,
    }],
    payments: [{
      payment_method_id: paymentMethodId,
      means_payment_id: meansPaymentId,
      value_paid: String(totalWithTax.toFixed(2)),
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

  // MATIAS API v2 lines format
  const lines = [{
    invoiced_quantity: "1",
    quantity_units_id: "1093",
    line_extension_amount: String(lineTotal.toFixed(2)),
    free_of_charge_indicator: false,
    description: `Nota crédito - ${refundReason}`,
    code: `NC-${orderId.slice(0, 8)}`,
    type_item_identifications_id: "4",
    reference_price_id: "1",
    price_amount: String(lineTotal),
    base_quantity: "1",
    tax_totals: taxRate > 0 ? [{
      tax_id: "1",
      tax_amount: taxAmount,
      taxable_amount: lineTotal,
      percent: taxRate,
    }] : [],
  }];

  const payload: MatiasNotePayload = {
    type_document_id: MATIAS_DOCUMENT_TYPES.CREDIT_NOTE,
    resolution_number: resolutionNumber,
    prefix: prefix,
    document_number: String(documentNumber),
    operation_type_id: 12,  // 12 = Credit note with invoice reference
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
      country_id: String(customer?.countryCode || "45"),
      city_id: String(customer?.municipalityId || "836"),
      identity_document_id: String(customer ? mapCustomerIdType(customer.idType) : 6),
      type_organization_id: customer?.organizationTypeId || 2,
      tax_regime_id: customer?.taxRegimeId || 2,
      tax_level_id: mapTaxLevelId(customer?.taxLiabilityId),
    },
    billing_reference: {
      number: originalNumber,
      uuid: originalCufe,
      date: originalDate,  // MATIAS expects 'date' not 'issue_date'
      scheme_name: "CUFE-SHA384",
    },
    discrepancy_response: {
      reference_id: "1",  // Required by MATIAS - references billing_reference
      response_id: "1",   // Required by MATIAS - matches reference_id
      correction_concept_id: correctionConceptId,
      description: refundReason,
    },
    lines: lines,
    legal_monetary_totals: {
      line_extension_amount: String(lineTotal.toFixed(2)),
      tax_exclusive_amount: String(lineTotal.toFixed(2)),
      tax_inclusive_amount: String(refundAmount.toFixed(2)),
      payable_amount: refundAmount,
    },
    tax_totals: taxRate > 0 ? [{
      tax_id: "1",
      tax_amount: taxAmount,
      taxable_amount: lineTotal,
      percent: taxRate,
    }] : undefined,
    payments: [{
      payment_method_id: 1,
      means_payment_id: 10,
      value_paid: String(refundAmount.toFixed(2)),
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
