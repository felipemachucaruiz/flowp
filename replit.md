# Flowp - Multi-Tenant Point of Sale System

## Overview
Flowp is a production-ready, multi-tenant Point of Sale (POS) and Inventory management system delivered as a Progressive Web App (PWA) with native desktop (Windows, macOS) and mobile (iOS, Android) applications. It offers features like thermal printing, barcode scanning, and offline capabilities, catering to both Retail and Restaurant businesses through configurable feature flags. The project aims to provide a comprehensive and adaptable solution for businesses, with a focus on the Latin American market for payment processing and specific compliance (e.g., Colombian electronic billing).

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
- **Gupshup API**: Use ONLY the regular Gupshup API (`api.gupshup.io/wa/api/v1/msg`), NOT the Partner API. Audio messages must be MP3 format served via the server's public URL (not GCS signed URLs).

## System Architecture
Flowp utilizes a React + TypeScript frontend and an Express + PostgreSQL backend, designed for responsiveness across various screen sizes (optimized for 1024x768).

**UI/UX Decisions:**
- **Responsive Design**: Features a collapsible sidebar, responsive cart panel, and dynamic product grid columns.
- **Mobile App Optimization**: Edge-to-edge display with `viewport-fit=cover`, `overlaysWebView: true` in Capacitor config, and `black-translucent` status bar. Background colors extend behind Dynamic Island and home indicator while content stays in safe zones via `env(safe-area-inset-*)`.
- **Edge-to-Edge Safe Area Strategy**: AppLayout header uses `safe-area-pt` so bg-card extends behind Dynamic Island. Bottom nav uses `safe-area-pb` so bg extends behind home indicator. Sheet component (`sheet.tsx`) automatically applies safe area top/bottom padding for left/right side sheets. Main content area uses `pb-[calc(72px+env(safe-area-inset-bottom,0px))]` on mobile.
- **Mobile Bottom Navigation**: On mobile (< 768px), sidebar is hidden and replaced with a fixed bottom nav bar (`MobileBottomNav`, h-[72px]) with 4 main tabs + "More" sheet. Icons are w-7 h-7 with min-w-[80px] touch targets. AppLayout adds safe-area-aware bottom padding to prevent content overlap.
- **Mobile Components**: Reusable `MobileDataCard`, `MobilePageHeader`, `MobileSearchBar` components in `client/src/components/mobile-data-card.tsx` for consistent mobile patterns.
- **Mobile CSS Utilities**: `mobile-touch-target`, `mobile-card-list`, `mobile-sticky-actions`, `mobile-full-width-form`, `mobile-page-padding`, `mobile-section-gap` utilities in `index.css` (active only below 768px).
- **Shadcn components**: Used for reusable UI elements.

**Technical Implementations & Feature Specifications:**
- **Multi-Tenant Architecture**: Supports distinct configurations (retail/restaurant) and feature flags per tenant.
- **Role-Based Access Control (RBAC)**: Implemented for both internal staff roles (SuperAdmin, SupportAgent, BillingOps) and tenant user roles (Owner, Admin, Manager, Cashier, Kitchen, Inventory) with granular permissions.
- **Core POS Functionality**: Fast POS screen with category filtering, search, cart management, order holding/resuming, split payments, and tax calculation.
- **Desktop App (Electron)**: Provides native installers for Windows/macOS with direct ESC/POS thermal printer support, cash drawer control, and silent printing for receipts and labels.
- **Mobile App (Capacitor)**: Wraps the PWA for native iOS/Android, enabling Bluetooth LE thermal printing, camera-based barcode scanning, and haptic feedback.
- **Restaurant Module**: Includes floor/table management, table status tracking, and a real-time Kitchen Display System (KDS) via WebSockets.
- **Email Notification System**: User-configurable preferences for various notification types with multi-tenant logging and SMTP configuration.
- **DIAN/MATIAS Electronic Billing (Colombia)**: Full integration for electronic invoicing (POS, Invoice, Credit/Debit Notes, Documento Soporte) with asynchronous processing, encrypted credentials, OAuth token caching, numbering with row-level locks, and a queue-based retry mechanism. Includes UI for creating `Documento Soporte` (support documents).
- **Multi-Location Inventory**: POS registers are linked to specific warehouses, automatically deducting stock from the assigned warehouse during sales.
- **Inventory System**: Ledger-based with immutable stock movements and low stock alerts.
- **Reporting**: Provides daily sales summaries, order statistics, sales by hour, and top product tracking.
- **Unified Admin Console**: A single platform for Flowp staff to manage tenants, e-billing subscriptions, documents, and MATIAS API credentials.
- **Subscription Tier Gating**: Implements 'Starter', 'Pro', and 'Avanzado' tiers with business-type-aware quantity limits (registers, locations, users, warehouses, products, DIAN documents, tables, recipes) and feature flags. Backend enforces limits and features, while frontend provides UI gating.
- **Shopify Integration**: A paid add-on for Shopify order import, refund handling, and inventory/price synchronization from Flowp to Shopify, using webhooks or polling and encrypted credentials.
- **WhatsApp/Gupshup Notifications**: A paid add-on for sending and receiving WhatsApp notifications. Features include admin-managed message packages, metered billing, encrypted Gupshup API key storage, outbound notifications (receipts, low stock alerts), and inbound commands. Includes a WhatsApp Template Manager for creating and managing message templates tied to business event triggers.
- **WhatsApp Two-Way Chat**: A Pro/Enterprise feature enabling real-time two-way WhatsApp messaging between tenants and customers, supporting rich media. Tracks conversation windows and provides a "Conversation Starter Template" for re-engaging customers.
- **WhatsApp Catalog**: Send interactive multi-product messages (up to 30 products in up to 10 sections grouped by category) via Gupshup's product_details API. Requires a Meta Commerce Catalog ID configured per tenant. Handles incoming order webhooks from customer cart submissions, persisting them in `whatsapp_catalog_orders` table.
- **Auto-Lock Screen (Standby with PIN)**: Configurable auto-lock feature for the POS screen after inactivity, requiring a 4-digit PIN for unlock. PIN verification is server-side with rate limiting.
- **MercadoPago Subscription Billing**: Full subscription billing gateway using MercadoPago PreApproval API for recurring payments (COP, PSE, Nequi, credit cards). Includes webhook handling for status updates, payment history, and trial expiration gating.
- **Report Export (Excel/PDF)**: Enterprise-tier feature allowing export of reports to Excel (.xlsx) or branded PDF, including tenant branding details.

**System Design Choices:**
- **PWA Manifest**: Configured for web and mobile experience.
- **Database Schema**: Core tables for tenants, users, registers, categories, products, restaurant features, orders, payments, and inventory stock movements.
- **API Endpoints**: Structured for authentication, products, orders, restaurant-specific actions, inventory, reports, and internal admin functionalities.
- **Environment Variables**: Used for sensitive configurations.

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