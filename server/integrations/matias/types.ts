import { z } from "zod";

// MATIAS API Authentication
export interface MatiasAuthRequest {
  email: string;
  password: string;
  remember_me: 0 | 1;
}

export interface MatiasAuthResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  expires_at?: string;
  user?: {
    id: number;
    email: string;
    name: string;
  };
  message?: string;
  success?: boolean;
}

// MATIAS Payment Method Codes
export const MATIAS_PAYMENT_METHODS = {
  CASH: 10,
  CREDIT_CARD: 48,
  DEBIT_CARD: 49,
  TRANSFER: 31,
  CHECK: 20,
  CREDIT: 30,
  MIXED: 1,
} as const;

// MATIAS Document Type IDs
export const MATIAS_DOCUMENT_TYPES = {
  INVOICE: 1,
  CREDIT_NOTE: 91,
  DEBIT_NOTE: 92,
  POS: 20,
  POS_CREDIT_NOTE: 94,
  POS_DEBIT_NOTE: 93,
  SUPPORT_DOC: 11,
  SUPPORT_ADJUSTMENT: 15,
} as const;

// MATIAS Tax Codes
export const MATIAS_TAX_CODES = {
  IVA: "01",
  INC: "04",
  IVA_INC: "ZZ",
  NO_TAX: "ZY",
} as const;

// Zod Schemas for MATIAS Payloads

// Line item allowance/charge
export const matiasAllowanceChargeSchema = z.object({
  charge_indicator: z.boolean(),
  allowance_charge_reason: z.string(),
  base_amount: z.number(),
  amount: z.number(),
  percentage: z.number().optional(),
});

// Tax total per line or document
export const matiasTaxTotalSchema = z.object({
  tax_id: z.number(),
  tax_amount: z.number(),
  taxable_amount: z.number(),
  percent: z.number(),
});

// Line item
export const matiasLineSchema = z.object({
  unit_measure_id: z.number(),
  invoiced_quantity: z.number(),
  line_extension_amount: z.number(),
  free_of_charge_indicator: z.boolean().optional(),
  tax_totals: z.array(matiasTaxTotalSchema).optional(),
  allowance_charges: z.array(matiasAllowanceChargeSchema).optional(),
  description: z.string(),
  notes: z.string().optional(),
  code: z.string(),
  type_item_identification_id: z.number(),
  price_amount: z.number(),
  base_quantity: z.number(),
});

// Payment
export const matiasPaymentSchema = z.object({
  payment_form_id: z.number(),
  payment_method_id: z.number(),
  payment_due_date: z.string().optional(),
  duration_measure: z.string().optional(),
});

// Legal monetary totals
export const matiasLegalMonetaryTotalsSchema = z.object({
  line_extension_amount: z.number(),
  tax_exclusive_amount: z.number(),
  tax_inclusive_amount: z.number(),
  allowance_total_amount: z.number().optional(),
  charge_total_amount: z.number().optional(),
  payable_amount: z.number(),
});

// Customer/Accounting
export const matiasCustomerSchema = z.object({
  identification_number: z.string(),
  name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  email: z.string().optional(),
  merchant_registration: z.string().optional(),
  type_document_identification_id: z.number().optional(),
  type_organization_id: z.number().optional(),
  type_liability_id: z.number().optional(),
  municipality_id: z.number().optional(),
  type_regime_id: z.number().optional(),
});

// Point of Sale info
export const matiasPointOfSaleSchema = z.object({
  cashier_term: z.string(),
  cashier_type: z.string(),
  sales_code: z.string(),
  address: z.string(),
});

// Software manufacturer
export const matiasSoftwareManufacturerSchema = z.object({
  software_id: z.string(),
  software_pin: z.string(),
  manufacturer_name: z.string(),
  manufacturer_nit: z.string(),
});

// Document signature
export const matiasDocumentSignatureSchema = z.object({
  software_security_code: z.string(),
});

// Billing reference (for credit/debit notes)
export const matiasBillingReferenceSchema = z.object({
  number: z.string(),
  uuid: z.string(),
  issue_date: z.string(),
  scheme_name: z.string().optional(),
});

// Discrepancy response (for credit/debit notes)
export const matiasDiscrepancyResponseSchema = z.object({
  correction_concept_id: z.number(),
  description: z.string(),
});

// Full POS Document Payload
export const matiasPosPayloadSchema = z.object({
  type_document_id: z.number(),
  resolution_number: z.string(),
  prefix: z.string(),
  number: z.number(),
  operation_type_id: z.number().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  notes: z.string().optional(),
  order_reference: z.object({
    id_order: z.string(),
    issue_date: z.string().optional(),
  }).optional(),
  customer: matiasCustomerSchema,
  payment_form: matiasPaymentSchema.optional(),
  payment_forms: z.array(matiasPaymentSchema).optional(),
  legal_monetary_totals: matiasLegalMonetaryTotalsSchema,
  tax_totals: z.array(matiasTaxTotalSchema).optional(),
  invoice_lines: z.array(matiasLineSchema),
  point_of_sale: matiasPointOfSaleSchema.optional(),
  software_manufacturer: matiasSoftwareManufacturerSchema.optional(),
  document_signature: matiasDocumentSignatureSchema.optional(),
});

// Credit/Debit Note Payload
export const matiasPosNotePayloadSchema = matiasPosPayloadSchema.extend({
  billing_reference: matiasBillingReferenceSchema,
  discrepancy_response: matiasDiscrepancyResponseSchema,
});

// Support Document Payload
export const matiasSupportDocPayloadSchema = z.object({
  type_document_id: z.literal(11),
  resolution_number: z.string(),
  prefix: z.string(),
  number: z.number(),
  date: z.string().optional(),
  time: z.string().optional(),
  notes: z.string().optional(),
  supplier: matiasCustomerSchema,
  legal_monetary_totals: matiasLegalMonetaryTotalsSchema,
  tax_totals: z.array(matiasTaxTotalSchema).optional(),
  invoice_lines: z.array(matiasLineSchema),
});

// Support Adjustment Note Payload
export const matiasSupportAdjustmentPayloadSchema = matiasSupportDocPayloadSchema.extend({
  type_document_id: z.literal(15),
  billing_reference: matiasBillingReferenceSchema,
  discrepancy_response: matiasDiscrepancyResponseSchema,
});

// API Response types
export interface MatiasDocumentResponse {
  success: boolean;
  message?: string;
  data?: {
    number: number;
    uuid: string;
    cufe?: string;
    cude?: string;
    qr_code?: string;
    track_id?: string;
  };
  errors?: Record<string, string[]>;
}

export interface MatiasStatusResponse {
  success: boolean;
  data?: {
    status: string;
    status_message?: string;
    document_key?: string;
    cufe?: string;
    cude?: string;
    qr_code?: string;
  };
}

export interface MatiasDocumentSearchParams {
  order_number?: string;
  number?: number;
  resolution?: string;
  prefix?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  per_page?: number;
}

export interface MatiasLastDocumentParams {
  resolution: string;
  prefix: string;
}

export type MatiasPayload = z.infer<typeof matiasPosPayloadSchema>;
export type MatiasNotePayload = z.infer<typeof matiasPosNotePayloadSchema>;
export type MatiasSupportDocPayload = z.infer<typeof matiasSupportDocPayloadSchema>;
export type MatiasSupportAdjustmentPayload = z.infer<typeof matiasSupportAdjustmentPayloadSchema>;
