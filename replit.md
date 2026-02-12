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
- **Payment Gateway**: Use MercadoPago (not PayPal or Stripe) for subscription checkout and recurring billing. MercadoPago is preferred for the Latin American market (COP, PSE, Nequi, credit cards).

## System Architecture
Flowp is built with a React + TypeScript frontend and an Express + PostgreSQL backend. It is designed to be responsive, optimized for various screen sizes from mobile to large desktops, with a primary optimization for 1024x768.

**UI/UX Decisions:**
- **Responsive Design**: Features a collapsible sidebar, responsive cart panel, and dynamic product grid columns (2 on mobile, up to 6 on larger screens).
- **Mobile App Optimization**: Full-screen support, sidebar navigation, safe area insets for notches, and large touch targets for product cards. The PWA manifest locks to portrait orientation.
- **Shadcn components**: Utilized for reusable UI elements.

**Technical Implementations & Feature Specifications:**
- **Multi-Tenant Architecture**: Supports distinct configurations (retail/restaurant) and feature flags per tenant.
- **Role-Based Access Control (RBAC)**: Implemented for both the Management Portal (SuperAdmin, SupportAgent, BillingOps) and Tenant Users (Owner, Admin, Manager, Cashier, Kitchen, Inventory) with granular permissions.
- **Core POS Functionality**: Fast POS screen, category filtering, search, cart management, order holding/resuming, split payments, and tax calculation.
- **Desktop App (Electron)**: Provides native installers for Windows and macOS, offering direct ESC/POS thermal printer support with cash drawer control and silent printing. Supports separate printer configurations for receipt and barcode/label printers.
- **Mobile App (Capacitor)**: Wraps the PWA for native iOS/Android experience, including Bluetooth LE thermal printing, camera-based barcode scanning, and haptic feedback.
- **Restaurant Module**: Includes floor and table management, table status tracking, and a real-time Kitchen Display System (KDS) via WebSockets.
- **Email Notification System**: User-configurable email preferences for various notification types with multi-tenant logging and SMTP configuration.
- **DIAN/MATIAS Electronic Billing (Colombia)**: Full integration for electronic invoicing (POS, Invoice, Credit/Debit Notes) with asynchronous processing, encrypted credential storage, OAuth token caching, numbering with row-level locks, and a queue-based retry mechanism. Each tenant has unique, encrypted MATIAS API credentials managed in the Admin Console.
- **Inventory System**: Ledger-based with immutable stock movements and low stock alerts.
- **Reporting**: Provides daily sales summaries, order statistics, sales by hour, and top product tracking.
- **Unified Admin Console**: A single platform for Flowp staff to manage tenants, e-billing subscriptions, documents, and per-tenant MATIAS API credentials.
- **Subscription Tier Gating**: Implements 'Starter', 'Pro', and 'Avanzado' tiers with quantity limits (registers, locations, users, warehouses, products, DIAN documents) and business-type-aware feature flags. Retail and restaurant tenants have separate feature sets per tier (`RETAIL_TIER_FEATURES` / `RESTAURANT_TIER_FEATURES` in `shared/schema.ts`). Backend enforces limits via `checkSubscriptionLimit()` and features via `hasSubscriptionFeature()`. Frontend `useSubscription()` hook provides UI gating with `hasFeature()`, `canCreate()`, `isRetail`, `isRestaurant`. Retail Pro features: `user_management`, `inventory_advanced`, `reports_detailed`, `label_designer`. Restaurant Pro features: `user_management`, `reports_detailed`, `kds_advanced`, `ingredients_recipes`, `modifiers_advanced`, `inventory_advanced`. Enterprise adds: `multi_location`, `reports_management`, `ecommerce_integrations`, `security_audit` (+ `tips_analytics` for restaurants). Restaurant Basic includes `label_designer`. Tier limits are also business-type-aware (`RETAIL_TIER_LIMITS` / `RESTAURANT_TIER_LIMITS`): Restaurant basic: 1 register, 2 users, 1 location, 1 warehouse, 50 products, 500 DIAN docs, 10 tables, 0 recipes. Restaurant Pro: 2 registers, 5 users, 1 location, 2 warehouses, 200 products, 1500 DIAN docs, 30 tables, 50 recipes. Restaurant Enterprise: 5 registers, 15 users, 3 locations, 5 warehouses, unlimited products, 4000 DIAN docs, 100 tables, unlimited recipes. Retail tiers have 0 tables and 0 recipes (not applicable). Limits enforced on POST /api/tables and POST /api/recipes routes via checkSubscriptionLimit(). Only -1 means unlimited, 0 means none allowed.
- **Shopify Integration**: A paid add-on enabling Shopify order import (via webhooks or polling), refund handling, and inventory/price synchronization from Flowp to Shopify. It uses encrypted credentials and supports webhook verification and idempotency. Global Shopify app credentials are managed in the admin console, allowing tenants to connect their stores via OAuth.
- **WhatsApp/Gupshup Notifications**: A paid add-on for tenants to send and receive WhatsApp notifications. Features include admin-managed message packages with quotas, metered billing, encrypted Gupshup API key storage, and outbound notifications (receipts, low stock alerts) and inbound commands (e.g., RECIBO, HORARIO). All tenants currently use Flowp's centralized WhatsApp account, with global Gupshup credentials managed by the admin.
- **Auto-Lock Screen (Standby with PIN)**: Configurable auto-lock feature that locks the POS screen after inactivity. Users unlock with their 4-digit PIN. Settings include enable/disable toggle and timeout (1-30 min) in Settings > Inventory tab. PIN is verified server-side via `POST /api/auth/verify-pin` with rate limiting (5 attempts/minute). The `LockScreen` component renders a full-screen overlay with OTP input. PIN data is never sent to the client; a `hasPin` flag is used instead. The feature requires users to have a PIN configured in their user profile.
- **MercadoPago Subscription Billing**: Full subscription billing gateway using MercadoPago PreApproval API for recurring payments. Supports COP currency with PSE, Nequi, credit cards. Flow: tenant selects plan → backend creates preapproval via MercadoPago API → user redirected to MercadoPago checkout → returns to app → backend verifies preapproval status and external_reference with MercadoPago API before activating subscription. Includes webhook handler for async status updates, payment history tracking via `saas_payments` table, subscription cancellation. Schema stores `mp_preapproval_id`, `mp_payer_email`, `payment_gateway` on subscriptions table. Backend module: `server/mercadopago.ts`. Trial expiration gate blocks the entire app (full-screen overlay) when trial expires and tenant status is suspended, directing users to the subscription page.

**System Design Choices:**
- **PWA Manifest**: Configured for web and mobile experience.
- **Database Schema**: Core tables for tenants, users, registers, categories, products, restaurant features, orders, payments, and inventory stock movements.
- **API Endpoints**: Structured for authentication, products, orders, restaurant-specific actions, inventory, reports, and internal admin functionalities.
- **Environment Variables**: Used for sensitive configurations like `DATABASE_URL` and `SESSION_SECRET`.

## External Dependencies
- **PostgreSQL**: Primary database.
- **@capacitor-mlkit/barcode-scanning**: For native mobile camera barcode scanning.
- **@capacitor-community/bluetooth-le**: For Bluetooth Low Energy thermal printing on mobile.
- **@zxing/library**: Web fallback for barcode scanning.
- **MATIAS API v2**: External service for DIAN electronic billing compliance in Colombia.
- **Electron**: Framework for cross-platform desktop applications.
- **Capacitor**: Framework for native mobile applications.
- **Nodemailer**: For sending email notifications.
- **Shopify API**: For e-commerce integration.
- **Gupshup API**: For WhatsApp messaging integration.
- **MercadoPago SDK (mercadopago)**: For subscription billing and recurring payments.