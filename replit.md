# Flowp - Multi-Tenant Point of Sale System

## Overview
Flowp is a production-ready, multi-tenant Point of Sale (POS) and Inventory management system designed as a Progressive Web App (PWA) with native desktop (Windows, macOS) and mobile (iOS, Android) applications. It supports features like thermal printing, barcode scanning, and offline capabilities. The system caters to both Retail and Restaurant businesses, utilizing feature flags to control module availability based on tenant type.

## User Preferences
- **Onboarding**: All fields are mandatory except for logo uploads (company logo and receipt logo are optional)
- **Display Language**: ALL text and dates must use the selected display language. Never use hardcoded English strings. Always use translation keys (t() function) for text and locale-aware date formatting. This is critical and applies to every page, component, and feature.
- **Receipt Logo**: Can be as large as the full width of receipt paper (no size restrictions up to max paper width)
- Dark mode support with system preference detection
- Persistent theme and auth state in localStorage
- **Admin Panel**: ALL SaaS administration options (tenant management, MATIAS credentials, billing, etc.) must be located under `/admin`. Do not create separate internal admin pages elsewhere.
- **Add-on Integrations**: When completing a new add-on integration, always add its key to `INTEGRATION_KEY_OPTIONS` in `client/src/pages/admin/addon-store.tsx` so admins can select it from the dropdown instead of typing the internal ID manually.
- **Add-on Store Architecture**: The customer-side add-on settings (`/settings` → Add-ons tab) must only display add-ons that have been configured in the admin-side addon store (`/admin` → Add-on Store). Customer add-ons are fetched from the `addon_definitions` table, which is populated exclusively by admin configuration. Never hardcode add-on definitions on the customer side.

## System Architecture
Flowp is built with a React + TypeScript frontend and an Express + PostgreSQL backend. It is designed to be responsive, optimized for various screen sizes from mobile to large desktops, with a primary optimization for 1024x768.

**UI/UX Decisions:**
- **Responsive Design**: Sidebar (12rem, collapsible), responsive cart panel, and dynamic product grid columns (2 on mobile, up to 6 on larger screens).
- **Mobile App Optimization**: Full-screen support using `min-h-dvh` and `viewport-fit=cover`, sidebar navigation, safe area insets for notches, and touch targets with a minimum height of 100px for product cards. The PWA manifest locks to portrait orientation.
- **Shadcn components**: Utilized for reusable UI elements.

**Technical Implementations & Feature Specifications:**
- **Multi-Tenant Architecture**: Supports multiple tenants with distinct configurations (retail/restaurant) and feature flags.
- **Role-Based Access Control (RBAC)**: Implemented for both the Management Portal (SuperAdmin, SupportAgent, BillingOps) and Tenant Users (Owner, Admin, Manager, Cashier, Kitchen, Inventory), with granular permissions defined in `client/src/lib/permissions.ts`.
- **Core POS Functionality**: Fast POS screen, category filtering, search, cart management, hold/resume orders, split payments, and tax calculation.
- **Desktop App (Electron)**: Provides native installers for Windows (multi-language NSIS with custom branded graphics) and macOS (DMG), offering direct ESC/POS thermal printer support with cash drawer control without needing PrintBridge. Supports separate printer configuration for receipt printer and barcode/label printer via Settings → Printing. Silent printing via IPC (no popup windows). Printer selections stored in localStorage (`flowp_electron_printer`, `flowp_electron_barcode_printer`).
- **Mobile App (Capacitor)**: Wraps the PWA for native iOS/Android experience, including Bluetooth LE thermal printing, camera-based barcode scanning, and haptic feedback.
- **Restaurant Module**: Includes floor and table management, table status tracking, and a real-time Kitchen Display System (KDS) via WebSockets.
- **Email Notification System**: User-configurable email preferences for various notification types (e.g., New Sale, Low Stock Alerts) with multi-tenant logging and SMTP configuration.
- **DIAN/MATIAS Electronic Billing (Colombia)**: Full integration for electronic invoicing, supporting multiple document types (POS, Invoice, Credit/Debit Notes). Features include asynchronous processing, encrypted credential storage, OAuth token caching, numbering with row-level locks, and a queue-based retry mechanism. **Each tenant has unique MATIAS API login credentials** (email/password) stored separately and encrypted. Per-tenant MATIAS credentials are managed in the Admin Console (`/admin`) under Tenants > [Tenant Name] > MATIAS tab.
- **Inventory System**: Ledger-based with immutable stock movements (sale, purchase, adjustment, waste) and low stock alerts.
- **Reporting**: Provides daily sales summaries, order statistics, sales by hour, and top product tracking.
- **Unified Admin Console**: A single platform for Flowp staff (`/admin`) to manage tenants, e-billing subscriptions, documents, and per-tenant MATIAS API credentials.

**System Design Choices:**
- **PWA Manifest**: Configured for web and mobile experience.
- **Database Schema**: Core tables for tenants, users, registers, categories, products, and specific tables for restaurant features (floors, tables, kitchen_tickets), orders, payments, and inventory stock movements.
- **API Endpoints**: Structured for authentication, products, orders, restaurant-specific actions, inventory, and reports. Internal Admin APIs are also provided.
- **Environment Variables**: Essential for database connection (`DATABASE_URL`) and session encryption (`SESSION_SECRET`).

## Implemented Features

### Nota Crédito (Credit Note) - IMPLEMENTED
- Create credit notes from completed orders with valid CUFE
- type_document_id: 5 (MATIAS API)
- Requires billing_reference with `uuid`, `number`, `date`, `scheme_name: "CUFE-SHA384"`
- Requires discrepancy_response with `reference_id: "1"`, `response_id: "1"`, `correction_concept_id` (1-5), `description`
- DIAN Correction Concepts: 1=Devolución, 2=Anulación, 3=Descuento, 4=Ajuste precio, 5=Otros
- Flow: Select order → Specify amount + reason → Submit to MATIAS → Receive CUDE
- Supports full and partial refunds
- **IMPORTANT**: Credit notes require a separate DIAN resolution registered specifically for Nota Crédito. Configure `credit_note_resolution_number` and `credit_note_prefix` in the MATIAS integration settings (Admin > Tenants > MATIAS tab).

### Shopify Integration - IMPLEMENTED
- **Paid add-on** for tenants who also sell on Shopify
- **Billing Gate**: All `/api/shopify/*` endpoints require active `shopify_integration` add-on in `tenant_addons` table
- **Add-on Management**: Admin Console (`/admin`) → Tenants → Add-ons tab (SuperAdmin/BillingOps only)
- **Order Flow**: Shopify orders import to Flowp via webhooks (orders/create, orders/updated) or polling fallback
- **Order Polling**: `/api/shopify/sync/orders` fetches orders from last 24h (fallback when webhooks unavailable)
- **Refund Handling**: Shopify refunds auto-create Flowp returns with credit notes to DIAN
- **Inventory Sync**: Flowp → Shopify (Flowp is source of truth)
- **Price Sync**: Flowp → Shopify (automatic when product price changes)
- **Product Mapping**: Auto-match by SKU, manual override supported
- **Webhook Verification**: HMAC-SHA256 signature validation
- **Idempotency**: Prevents duplicate order imports via shopify_event_id tracking
- **Encrypted Credentials**: Same encryption pattern as MATIAS (AES-256-GCM)
- **Database Tables**: tenant_shopify_integrations, shopify_orders, shopify_webhook_logs, shopify_product_map, shopify_sync_logs, tenant_addons
- **API Routes**: `/api/shopify/*` - status, config, webhooks, mappings, sync, orders
- **Admin Routes**: `/internal/api/tenants/:tenantId/addons` - GET, POST, DELETE for add-on management
- **NOTE**: Shopify requires "Protected Customer Data Access" approval before order/customer data is accessible

### WhatsApp/Gupshup Notifications - IMPLEMENTED
- **Paid add-on** for tenants who want WhatsApp notifications
- **Billing Gate**: All `/api/whatsapp/*` endpoints require active `whatsapp_notifications` add-on in `tenant_addons` table
- **Add-on Management**: Admin Console (`/admin`) > Add-on Store (SuperAdmin/BillingOps only)
- **Message Packages**: Admin-managed packages with COP pricing and message quotas
- **Metered Billing**: Each message deducted from tenant's active subscription quota
- **Credential Storage**: Gupshup API key encrypted with AES-256-GCM (same pattern as MATIAS/Shopify)
- **Outbound Notifications**: Receipt on sale completion, low stock alerts (fire-and-forget, never blocks checkout)
- **Inbound Commands**: RECIBO (last receipt), HORARIO (business hours), AYUDA (support info)
- **Delivery Tracking**: Webhook processes Gupshup delivery status callbacks (sent/delivered/read/failed)
- **Database Tables**: tenant_whatsapp_integrations, whatsapp_packages, tenant_whatsapp_subscriptions, whatsapp_message_logs
- **API Routes**: `/api/whatsapp/*` - addon-status, config, test-connection, subscribe, usage, logs, send-receipt, webhook
- **Admin Routes**: `/api/internal-admin/whatsapp/packages` - CRUD, `/api/internal-admin/whatsapp/usage` - overview, `/api/internal-admin/whatsapp/global-config` - GET/POST global Gupshup credentials, `/api/internal-admin/whatsapp/test-global-connection` - POST test
- **Settings UI**: Settings > WhatsApp tab (visible when addon active) - notification prefs, packages, message logs (no API credentials shown to tenants)
- **Admin UI**: `/admin/whatsapp-config` - global Gupshup credentials management, `/admin/whatsapp-packages` - package management and tenant usage overview
- **Stage 1 Architecture**: All tenants use Flowp's centralized WhatsApp account. Global Gupshup credentials (API key, app name, sender phone) stored encrypted in `platformConfig` table with keys: `gupshup_api_key`, `gupshup_app_name`, `gupshup_sender_phone`, `whatsapp_global_enabled`. Tenants cannot configure API credentials - they only manage notification preferences and subscribe to message packages.
- **Encryption**: Global WhatsApp credentials use AES-256-GCM encryption (same as gupshup service) via `gupshupEncrypt`/`gupshupDecrypt`. Uses WHATSAPP_ENCRYPTION_KEY or SESSION_SECRET env var.
- **Gupshup API**: Template messages for notifications, session messages for 24-hour window replies. `sendTemplateMessage`, `sendSessionMessage`, and `testConnection` all use `getGlobalGupshupCredentials()` from `platformConfig` table.

## Planned Features (TODO)
- Shopify OAuth flow UI
- Tenant settings UI for Shopify configuration
- **WhatsApp Phase 2**: Per-tenant Gupshup configuration (paid premium). Each tenant can connect their own WhatsApp account with their own Gupshup API keys. Service should check tenant-specific credentials first, falling back to global Flowp credentials if not configured.

## External Dependencies
- **PostgreSQL**: Primary database for all application data.
- **@capacitor-mlkit/barcode-scanning**: For native iOS/Android camera barcode scanning.
- **@capacitor-community/bluetooth-le**: For Bluetooth Low Energy thermal printing on native mobile apps.
- **@zxing/library**: Web fallback for barcode scanning.
- **MATIAS API v2**: External service for DIAN electronic billing compliance in Colombia.
  - **Base URL**: `https://api-v2.matias-api.com/api/ubl2.1` (for both auth and document submission)
  - **Auth endpoint**: `/auth/login` (under the base URL - official docs incorrectly say auth-v2 domain)
  - **Documentation**: https://docs.matias-api.com/docs/intro/
- **Electron**: Framework for building cross-platform desktop applications.
- **Capacitor**: Framework for building native mobile applications from web technologies.
- **Nodemailer**: For sending email notifications.