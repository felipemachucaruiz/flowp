// Shopify API Types for Flowp Integration

// Shopify Webhook Topics we handle
export type ShopifyWebhookTopic = 
  | "orders/create"
  | "orders/paid"
  | "orders/updated"
  | "refunds/create";

// Shopify Money type
export interface ShopifyMoney {
  amount: string;
  currency_code: string;
}

// Shopify Price Set (shop + presentment currencies)
export interface ShopifyPriceSet {
  shop_money: ShopifyMoney;
  presentment_money: ShopifyMoney;
}

// Shopify Customer
export interface ShopifyCustomer {
  id: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  default_address?: {
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
    zip: string | null;
    phone: string | null;
  };
  tax_exempt: boolean;
  tax_exemptions: string[];
}

// Shopify Line Item
export interface ShopifyLineItem {
  id: number;
  variant_id: number | null;
  product_id: number | null;
  title: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  price: string;
  price_set: ShopifyPriceSet;
  total_discount: string;
  total_discount_set: ShopifyPriceSet;
  tax_lines: ShopifyTaxLine[];
  fulfillable_quantity: number;
  fulfillment_status: string | null;
  grams: number;
  requires_shipping: boolean;
  vendor: string | null;
  properties: Array<{ name: string; value: string }>;
}

// Shopify Tax Line
export interface ShopifyTaxLine {
  title: string;
  price: string;
  price_set: ShopifyPriceSet;
  rate: number;
  channel_liable: boolean;
}

// Shopify Discount Code
export interface ShopifyDiscountCode {
  code: string;
  amount: string;
  type: string;
}

// Shopify Shipping Line
export interface ShopifyShippingLine {
  id: number;
  title: string;
  price: string;
  price_set: ShopifyPriceSet;
  code: string | null;
  source: string;
  discounted_price: string;
  discounted_price_set: ShopifyPriceSet;
  tax_lines: ShopifyTaxLine[];
}

// Shopify Order (webhook payload)
export interface ShopifyOrder {
  id: number;
  admin_graphql_api_id: string;
  app_id: number | null;
  browser_ip: string | null;
  buyer_accepts_marketing: boolean;
  cancel_reason: string | null;
  cancelled_at: string | null;
  cart_token: string | null;
  checkout_id: number | null;
  checkout_token: string | null;
  closed_at: string | null;
  confirmed: boolean;
  contact_email: string | null;
  created_at: string;
  currency: string;
  current_subtotal_price: string;
  current_subtotal_price_set: ShopifyPriceSet;
  current_total_discounts: string;
  current_total_discounts_set: ShopifyPriceSet;
  current_total_price: string;
  current_total_price_set: ShopifyPriceSet;
  current_total_tax: string;
  current_total_tax_set: ShopifyPriceSet;
  customer: ShopifyCustomer | null;
  customer_locale: string | null;
  discount_codes: ShopifyDiscountCode[];
  email: string;
  financial_status: string;
  fulfillment_status: string | null;
  gateway: string | null;
  landing_site: string | null;
  landing_site_ref: string | null;
  line_items: ShopifyLineItem[];
  location_id: number | null;
  name: string;  // e.g., "#1001"
  note: string | null;
  note_attributes: Array<{ name: string; value: string }>;
  number: number;
  order_number: number;
  order_status_url: string;
  payment_gateway_names: string[];
  phone: string | null;
  processed_at: string;
  processing_method: string;
  referring_site: string | null;
  refunds: ShopifyRefund[];
  shipping_address: ShopifyAddress | null;
  billing_address: ShopifyAddress | null;
  shipping_lines: ShopifyShippingLine[];
  source_name: string;
  subtotal_price: string;
  subtotal_price_set: ShopifyPriceSet;
  tags: string;
  tax_lines: ShopifyTaxLine[];
  taxes_included: boolean;
  test: boolean;
  token: string;
  total_discounts: string;
  total_discounts_set: ShopifyPriceSet;
  total_line_items_price: string;
  total_line_items_price_set: ShopifyPriceSet;
  total_price: string;
  total_price_set: ShopifyPriceSet;
  total_tax: string;
  total_tax_set: ShopifyPriceSet;
  total_weight: number;
  updated_at: string;
  user_id: number | null;
}

// Shopify Address
export interface ShopifyAddress {
  first_name: string | null;
  last_name: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  province_code: string | null;
  country: string | null;
  country_code: string | null;
  zip: string | null;
  phone: string | null;
  name: string | null;
  company: string | null;
  latitude: number | null;
  longitude: number | null;
}

// Shopify Refund
export interface ShopifyRefund {
  id: number;
  admin_graphql_api_id: string;
  created_at: string;
  note: string | null;
  order_id: number;
  processed_at: string;
  restock: boolean;
  user_id: number | null;
  refund_line_items: ShopifyRefundLineItem[];
  transactions: ShopifyTransaction[];
  order_adjustments: ShopifyOrderAdjustment[];
}

// Shopify Refund Line Item
export interface ShopifyRefundLineItem {
  id: number;
  line_item_id: number;
  line_item: ShopifyLineItem;
  quantity: number;
  restock_type: string;
  subtotal: number;
  subtotal_set: ShopifyPriceSet;
  total_tax: number;
  total_tax_set: ShopifyPriceSet;
  location_id: number | null;
}

// Shopify Transaction
export interface ShopifyTransaction {
  id: number;
  admin_graphql_api_id: string;
  amount: string;
  authorization: string | null;
  created_at: string;
  currency: string;
  gateway: string;
  kind: string;
  order_id: number;
  parent_id: number | null;
  processed_at: string;
  status: string;
  test: boolean;
}

// Shopify Order Adjustment
export interface ShopifyOrderAdjustment {
  id: number;
  order_id: number;
  refund_id: number;
  amount: string;
  amount_set: ShopifyPriceSet;
  tax_amount: string;
  tax_amount_set: ShopifyPriceSet;
  kind: string;
  reason: string | null;
}

// Shopify Product (for product mapping)
export interface ShopifyProduct {
  id: number;
  admin_graphql_api_id: string;
  title: string;
  body_html: string | null;
  vendor: string | null;
  product_type: string;
  created_at: string;
  handle: string;
  updated_at: string;
  published_at: string | null;
  status: string;
  tags: string;
  variants: ShopifyVariant[];
  options: ShopifyProductOption[];
  images: ShopifyImage[];
  image: ShopifyImage | null;
}

// Shopify Variant
export interface ShopifyVariant {
  id: number;
  admin_graphql_api_id: string;
  product_id: number;
  title: string;
  price: string;
  sku: string | null;
  position: number;
  inventory_policy: string;
  compare_at_price: string | null;
  fulfillment_service: string;
  inventory_management: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  created_at: string;
  updated_at: string;
  taxable: boolean;
  barcode: string | null;
  grams: number;
  image_id: number | null;
  weight: number;
  weight_unit: string;
  inventory_item_id: number;
  inventory_quantity: number;
  old_inventory_quantity: number;
  requires_shipping: boolean;
}

// Shopify Product Option
export interface ShopifyProductOption {
  id: number;
  product_id: number;
  name: string;
  position: number;
  values: string[];
}

// Shopify Image
export interface ShopifyImage {
  id: number;
  product_id: number;
  position: number;
  created_at: string;
  updated_at: string;
  alt: string | null;
  width: number;
  height: number;
  src: string;
  variant_ids: number[];
}

// Shopify Location (for inventory)
export interface ShopifyLocation {
  id: number;
  admin_graphql_api_id: string;
  name: string;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  province_code: string | null;
  country: string;
  country_code: string;
  zip: string | null;
  phone: string | null;
  active: boolean;
  legacy: boolean;
  localized_country_name: string;
  localized_province_name: string;
}

// Shopify Inventory Level
export interface ShopifyInventoryLevel {
  inventory_item_id: number;
  location_id: number;
  available: number | null;
  updated_at: string;
}

// Shopify Inventory Item
export interface ShopifyInventoryItem {
  id: number;
  admin_graphql_api_id: string;
  sku: string | null;
  created_at: string;
  updated_at: string;
  requires_shipping: boolean;
  cost: string | null;
  country_code_of_origin: string | null;
  province_code_of_origin: string | null;
  harmonized_system_code: string | null;
  tracked: boolean;
}

// API Response wrappers
export interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

export interface ShopifyLocationsResponse {
  locations: ShopifyLocation[];
}

export interface ShopifyInventoryLevelsResponse {
  inventory_levels: ShopifyInventoryLevel[];
}

// Webhook Registration
export interface ShopifyWebhook {
  id: number;
  address: string;
  topic: string;
  created_at: string;
  updated_at: string;
  format: string;
  fields: string[];
  metafield_namespaces: string[];
  api_version: string;
}

export interface ShopifyWebhooksResponse {
  webhooks: ShopifyWebhook[];
}

// Flowp-specific types for order import
export interface FlowpOrderFromShopify {
  tenantId: string;
  orderNumber: number;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  total: string;
  channel: "shopify";
  externalOrderId: string;
  customerId?: string;
  notes?: string;
  items: FlowpOrderItemFromShopify[];
}

export interface FlowpOrderItemFromShopify {
  productId: string;
  quantity: number;
  unitPrice: string;
  notes?: string;
}

// Sync operation result
export interface SyncResult {
  success: boolean;
  message: string;
  itemsProcessed?: number;
  itemsFailed?: number;
  errors?: string[];
}
