# Flowp - Multi-Tenant Point of Sale System

## Overview
A production-ready, multi-tenant POS + Inventory system delivered as a Progressive Web App (PWA) with native desktop and mobile apps. Supports Windows, macOS, iOS, and Android with thermal printing, barcode scanning, and offline capability. The system supports both Retail and Restaurant tenants with feature flags controlling module availability.

## Current State
- **Status**: MVP Complete + Management Portal Phase 1 + Mobile App + Responsive Design + Email Notifications + DIAN/MATIAS Electronic Billing + Internal Admin Console
- **Last Updated**: February 1, 2026
- **Stack**: React + TypeScript frontend, Express + PostgreSQL backend
- **Platforms**: Web (PWA), Windows (Electron), macOS (Electron), iOS (Capacitor), Android (Capacitor)

## Responsive Design (1024x768 Optimized)
- **Sidebar**: 12rem width (collapsed by default on screens < 1280px)
- **Cart Panel**: Responsive width (w-64 / xl:w-80 / 2xl:w-[420px])
- **Product Grid**: 2 columns on mobile, 3+ on tablet/desktop (grid-cols-2 sm:3 md:4 lg:4 xl:5 2xl:6)
- **Tables/Kitchen**: Compact stats cards and grids with responsive spacing
- **Header**: Compact 10px height with smaller padding

## Mobile App Features (iPhone 16/17 Pro Max Optimized)
- **Full Screen Support**: Uses min-h-dvh and viewport-fit=cover for edge-to-edge display on notched iPhones
- **Sidebar Navigation**: Uses same sidebar as desktop (collapsible)
- **Safe Area Insets**: CSS utilities for iPhone notch and home indicator (safe-area-pt, safe-area-pb, safe-area-inset)
- **Camera Barcode Scanner**: Uses @capacitor-mlkit/barcode-scanning for native iOS/Android, @zxing/library for web fallback
- **Touch Targets**: Min 100px height for product cards
- **Portrait Lock**: PWA manifest locks to portrait-only orientation
- **Scroll Padding**: All pages have proper padding to prevent content overlap

### Native Capacitor Plugins (Required for iOS/Android)
Install these in the flowp-mobile project:
```bash
cd ~/flowp-mobile
npm install @capacitor-mlkit/barcode-scanning @capacitor-community/bluetooth-le
npx cap sync ios
```

**iOS Info.plist Permissions** (add to ios/App/App/Info.plist):
```xml
<key>NSCameraUsageDescription</key>
<string>Camera is used to scan product barcodes</string>
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Bluetooth is used to connect to thermal printers</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>Bluetooth is used to connect to thermal printers</string>
```

## User Preferences
- **Onboarding**: All fields are mandatory except for logo uploads (company logo and receipt logo are optional)
- **Display Language**: ALL text and dates must use the selected display language. Never use hardcoded English strings. Always use translation keys (t() function) for text and locale-aware date formatting. This is critical and applies to every page, component, and feature.
- **Receipt Logo**: Can be as large as the full width of receipt paper (no size restrictions up to max paper width)

## Management Portal (Phase 1 Complete)
Internal admin portal for SaaS management with role-based access control.

### Features Implemented
- **RBAC Schema**: portal_roles, portal_permissions, user_portal_roles tables
- **Tenant Management**: Status tracking (trial, active, past_due, suspended, cancelled)
- **Admin Dashboard**: Stats overview for tenants, e-billing, support
- **Tenant List**: View all tenants with suspend/unsuspend actions
- **Admin Sidebar**: Navigation for dashboard, tenants, e-billing, billing, support

### API Namespaces
- `/api/internal/*` - Internal admin routes (SuperAdmin, SupportAgent, BillingOps)
- `/api/tenant/*` - Tenant portal routes (Owner, Admin, Accountant, Manager)

### Internal Portal Roles (3 Total)
- **SuperAdmin**: Full platform control
- **SupportAgent**: Tenant support access
- **BillingOps**: Billing management

### Tenant User Roles (6 Total) - UI Enforced
- **Owner**: Full tenant control, can manage users/settings/taxes
- **Admin**: Operations management (no taxes/printing settings)
- **Manager**: Daily operations (reports, inventory, customers)
- **Cashier**: Sales only (POS screen, hold/resume)
- **Kitchen**: Kitchen display only (no prices visible)
- **Inventory**: Stock and purchasing management

### Permission Matrix (client/src/lib/permissions.ts)
Each role has granular permissions for:
- Navigation access (sidebar visibility)
- Feature access (view/create/edit/delete per module)
- Settings tabs (taxes, printing, users - owner only)

### Security Notes (Phase 2)
- Current auth uses localStorage (frontend-only session state)
- Phase 2 will add JWT/session-based server authentication
- RBAC permission enforcement needs token validation middleware

## Internal Admin Console (E-Billing SaaS Management)
Separate admin portal at `/internal-admin` for managing e-billing subscriptions, document operations, and tenant administration.

### Access URL
- **Login**: `/internal-admin/login`
- **Dashboard**: `/internal-admin/dashboard`

### Internal Admin Roles
- **superadmin**: Full platform control, all features
- **supportagent**: Tenant support, document ops, read-only billing
- **billingops**: Package management, subscription assignments, credits

### Features
- **Dashboard**: Stats overview (tenants, documents, alerts, packages)
- **Tenants List**: View, search, filter tenants with suspend/unsuspend actions
- **Tenant Detail**: Overview, e-billing subscription, usage metrics, documents, alerts
- **Documents**: List all DIAN documents with retry/download actions
- **Packages**: Create/edit e-billing packages (pricing, included docs, overage policies)
- **Alerts**: Usage threshold alerts (70%, 90%, 100%) with acknowledge actions
- **Audit Log**: Track all admin actions (suspend, credits, package changes)

### Database Tables
- `internal_users`: Internal admin accounts with bcrypt passwords
- `internal_audit_logs`: All admin actions logged
- `ebilling_packages`: Subscription package definitions
- `tenant_ebilling_subscriptions`: Tenant-package assignments
- `tenant_ebilling_usage`: Monthly document usage tracking
- `tenant_ebilling_credits`: Credit adjustments
- `ebilling_alerts`: Usage threshold alerts

### API Routes
- `/api/internal-admin/auth/login` - Internal admin login
- `/api/internal-admin/stats` - Dashboard statistics
- `/api/internal-admin/tenants` - Tenant management
- `/api/internal-admin/tenants/:id/overview` - Tenant detail with e-billing info
- `/api/internal-admin/ebilling/documents` - Document operations
- `/api/internal-admin/ebilling/packages` - Package CRUD
- `/api/internal-admin/ebilling/alerts` - Alert management
- `/api/internal-admin/audit` - Audit log

## Key Features

### Core POS
- Fast POS screen with product grid
- Category filtering and search
- Cart management with quantity controls
- Hold/resume orders
- Split payment support (cash/card)
- Tax calculation

### Desktop App (Electron)
- Windows and macOS installers
- Windows: Multi-language NSIS wizard (EN/ES/PT)
- macOS: DMG installer for Intel and Apple Silicon
- **Native local printing** - NO PrintBridge required when using desktop app
- Direct ESC/POS thermal printer support with cash drawer control
- Production URL: pos.flowp.app

### Mobile App (Capacitor)
- iOS and Android native apps wrapping the PWA
- Bluetooth LE thermal printing support
- Camera-based barcode scanning
- Haptic feedback for button interactions
- Same features as web app with native enhancements
- Source: flowp-mobile folder

### Restaurant Module (enabled for restaurant tenants)
- Floor and table management
- Table status tracking (free, occupied, dirty, reserved)
- Kitchen Display System (KDS) with real-time updates via WebSocket
- Ticket status flow: new → preparing → ready → served

### Email Notification System
- User-configurable email preferences (10 notification types)
- Active triggers: New Sale, Low Stock Alerts, Order Emails, System Alerts
- Coming soon: Daily/Weekly Reports, High Value Sales, Expiring Products, New Customer, Refunds
- Per-user preferences stored in JSON column with sensible defaults
- Multi-tenant email logging with template tracking
- SMTP configuration per tenant (TLS/SSL support)

### DIAN/MATIAS Electronic Billing (Colombian Tax Compliance)
- Full integration with MATIAS API for DIAN electronic invoicing
- Document types: POS (type 20), Invoice (1), Credit Note (91/94), Debit Note (92/93), Support Doc (11)
- Async document processing - checkout never blocks for DIAN submission
- Encrypted credential storage (AES-256-CBC) with SESSION_SECRET
- OAuth token caching with auto-refresh on 401
- Document numbering with row-level locks (SELECT FOR UPDATE) for safe allocation
- Queue-based processing with max 3 retries and status tracking (PENDING→SENT→ACCEPTED/REJECTED)
- UBL 2.1 XML format, digital signatures, CUFE codes, and QR codes
- Per-tenant configuration and resolution numbers
- Files: server/integrations/matias/* (matiasClient.ts, payloadBuilders.ts, documentQueue.ts, routes.ts)
- API routes: /api/billing/matias/*

### Inventory (Ledger-based)
- Immutable stock movements
- Movement types: sale, purchase, adjustment, waste
- Stock level tracking
- Low stock alerts

### Reporting
- Daily sales summary
- Order count and average order value
- Sales by hour chart
- Top products tracking

## Project Architecture

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   │   ├── ui/        # Shadcn components
│   │   │   └── app-sidebar.tsx
│   │   ├── pages/         # Route pages
│   │   │   ├── login.tsx
│   │   │   ├── register.tsx
│   │   │   ├── pos.tsx
│   │   │   ├── tables.tsx
│   │   │   ├── kitchen.tsx
│   │   │   ├── inventory.tsx
│   │   │   ├── reports.tsx
│   │   │   └── settings.tsx
│   │   ├── lib/           # Contexts and utilities
│   │   │   ├── auth-context.tsx
│   │   │   ├── pos-context.tsx
│   │   │   ├── theme-provider.tsx
│   │   │   └── queryClient.ts
│   │   └── App.tsx
│   └── public/
│       └── manifest.json   # PWA manifest
├── server/
│   ├── index.ts           # Express server entry
│   ├── routes.ts          # API endpoints
│   ├── storage.ts         # Database operations
│   └── db.ts              # Database connection
└── shared/
    └── schema.ts          # Drizzle schema + types
```

## Database Schema

### Core Tables
- **tenants**: Multi-tenant support with type (retail/restaurant) and feature flags
- **users**: User accounts with roles (admin, manager, cashier, kitchen)
- **registers**: POS terminals with printer configuration
- **categories**: Product categories
- **products**: Product catalog with pricing and inventory tracking

### Restaurant Tables
- **floors**: Floor layout organization
- **tables**: Restaurant tables with status and capacity
- **kitchen_tickets**: Kitchen order tickets with status tracking

### Order Tables
- **orders**: Order header with totals and status
- **order_items**: Line items with modifiers
- **payments**: Payment records

### Inventory Tables
- **stock_movements**: Immutable ledger for inventory tracking

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new tenant and admin
- `POST /api/auth/login` - User login

### Products
- `GET /api/categories` - List categories
- `POST /api/categories` - Create category
- `GET /api/products` - List products
- `POST /api/products` - Create product

### Orders
- `GET /api/orders` - List orders
- `POST /api/orders` - Create order

### Restaurant
- `GET /api/floors` - List floors
- `GET /api/tables` - List tables
- `PATCH /api/tables/:id` - Update table status
- `GET /api/kitchen/tickets` - Get active tickets
- `PATCH /api/kitchen/tickets/:id` - Update ticket status

### Inventory
- `GET /api/inventory/levels` - Get stock levels
- `POST /api/inventory/adjust` - Adjust stock

### Reports
- `GET /api/reports/dashboard` - Dashboard statistics

## Tenant Types & Feature Flags

### Retail Features
- pos.core, inventory.core, purchasing.core
- customers.core, reporting.core
- retail.barcode, retail.returns, retail.bulk_discounts

### Restaurant Features
- pos.core, inventory.core, purchasing.core
- customers.core, reporting.core
- restaurant.tables, restaurant.floors
- restaurant.kitchen_tickets, restaurant.modifiers

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption key

## Running the Application
- `npm run dev` - Start development server
- `npm run db:push` - Push schema changes to database

## User Preferences
- Dark mode support with system preference detection
- Persistent theme and auth state in localStorage
