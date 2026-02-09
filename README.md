# Flowp - Multi-Tenant Point of Sale System

<p align="center">
  <img src="electron/resources/icon.png" alt="Flowp Logo" width="120" />
</p>

A production-ready, multi-tenant POS and Inventory management system delivered as a Progressive Web App (PWA) with native desktop (Windows, macOS) and mobile (iOS, Android) applications. Built for Retail and Restaurant businesses with Colombian DIAN electronic billing compliance.

## Features

### Core POS
- Fast POS screen with product grid and category filtering
- Barcode scanning (camera-based and hardware scanners)
- Cart management with quantity controls
- Hold/resume orders
- Split payment support (cash, card)
- Tax calculation
- Thermal receipt printing (ESC/POS)

### Multi-Tenant Architecture
- Tenant isolation with feature flags per business type
- Role-Based Access Control (RBAC) with granular permissions
- Management roles: SuperAdmin, SupportAgent, BillingOps
- Tenant roles: Owner, Admin, Manager, Cashier, Kitchen, Inventory
- Paid add-on system for premium integrations

### Restaurant Module
- Floor and table management with visual layout
- Table status tracking (free, occupied, dirty, reserved)
- Kitchen Display System (KDS) with real-time WebSocket updates
- Ticket status flow: new -> preparing -> ready -> served
- Modifiers support for menu items

### Inventory Management
- Ledger-based immutable stock movements
- Movement types: sale, purchase, adjustment, waste
- Low stock alerts with configurable thresholds
- Separate SKU and barcode fields per product

### Purchasing
- Supplier management
- Purchase order creation and tracking
- Stock receiving with lot tracking
- Quick reorder system for low-stock items

### DIAN Electronic Billing (Colombia)
- Full MATIAS API v2 integration for electronic invoicing
- Document types: POS documents, Invoices, Credit Notes, Debit Notes
- Asynchronous processing with queue-based retry mechanism
- Encrypted credential storage (AES-256-GCM)
- OAuth token caching and automatic refresh
- Numbering with row-level locks to prevent duplicates
- Credit notes with DIAN correction concepts support

### Shopify Integration (Paid Add-on)
- Bi-directional sync: orders, inventory, and prices
- OAuth flow with global app credentials
- Webhook support (orders/create, orders/updated) with polling fallback
- Auto-match products by SKU with manual override
- Refund handling with automatic DIAN credit notes
- HMAC-SHA256 webhook signature verification
- Idempotent order imports

### WhatsApp Notifications (Paid Add-on)
- Gupshup API integration for WhatsApp Business
- Outbound: receipt on sale, low stock alerts (fire-and-forget)
- Inbound commands: RECIBO, HORARIO, AYUDA
- International phone number support with country code selector
- Metered billing with admin-managed message packages
- Delivery tracking (sent, delivered, read, failed)

### Email Notifications
- Configurable notification preferences per user
- Support for: new sale, low stock alerts, daily summaries
- Multi-tenant SMTP configuration

### Reporting
- Daily sales summary
- Order count and average order value
- Sales by hour charts
- Top products tracking

### Admin Console
- Unified platform at `/admin` for Flowp staff
- Tenant management with MATIAS credential configuration
- Add-on Store for managing paid integrations
- Shopify global OAuth configuration
- WhatsApp/Gupshup global credentials management
- Billing and subscription management

## Platforms

| Platform | Technology | Features |
|----------|-----------|----------|
| **Web (PWA)** | React + Vite | Works on any modern browser, installable |
| **Windows** | Electron | Native ESC/POS printing, cash drawer, NSIS installer |
| **macOS** | Electron | DMG installer, Intel & Apple Silicon support |
| **iOS** | Capacitor | Bluetooth LE printing, camera barcode scanning, haptic feedback |
| **Android** | Capacitor | Bluetooth LE printing, camera barcode scanning, haptic feedback |

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Express.js + Node.js
- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **Styling:** Tailwind CSS + shadcn/ui
- **State Management:** TanStack Query v5
- **Real-time:** WebSocket
- **Desktop:** Electron 28
- **Mobile:** Capacitor
- **i18n:** Custom translation system (English, Spanish, Portuguese)

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Installation

```bash
# Install dependencies
npm install

# Push database schema
npm run db:push

# Start development server
npm run dev
```

The application will be available at `http://localhost:5000`

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Session encryption key |

## Desktop App (Electron)

### Building for Windows

```bash
cd electron

# Install dependencies
npm install

# Copy web build to electron/web-build
# (build the web app first with npm run build in root)

# Build Windows installer
npx electron-builder --win --publish never
```

Output: `electron/dist/Flowp POS Setup x.x.x.exe` (NSIS installer)

### Building for macOS

```bash
cd electron
npx electron-builder --mac --publish never
```

Output: `electron/dist/Flowp POS-x.x.x.dmg`

### Desktop Features

- Direct ESC/POS thermal printer support (no PrintBridge needed)
- Separate printer configuration for receipts and barcode labels
- Cash drawer control via printer commands
- Silent printing (no popup windows)
- Settings > Printing for printer selection

## Mobile App (Capacitor)

### iOS

```bash
npx cap sync ios
npx cap open ios
```

Requires Xcode and an Apple Developer account.

### Android

```bash
npx cap sync android
npx cap open android
```

Requires Android Studio.

### Mobile Features

- Bluetooth LE thermal printing
- Camera-based barcode scanning (MLKit)
- Haptic feedback
- Portrait orientation lock
- Safe area insets for notched devices

## Tenant Types

### Retail
- Barcode scanning and label printing
- Returns processing with DIAN credit notes
- Product SKU and barcode management

### Restaurant
- Floor and table management
- Kitchen Display System (KDS)
- Order modifiers
- Table-based checkout flow

## Project Structure

```
flowp/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Route pages
│   │   ├── lib/            # Utilities, i18n, permissions
│   │   └── hooks/          # Custom React hooks
│   └── public/             # Static assets
├── server/                 # Express backend
│   ├── routes.ts           # API endpoints
│   ├── storage.ts          # Database operations
│   └── services/           # Business logic (MATIAS, Shopify, Gupshup)
├── shared/                 # Shared types and schemas
│   └── schema.ts           # Drizzle ORM schema
├── electron/               # Desktop app
│   ├── main.js             # Electron main process
│   ├── preload.js          # Preload script for IPC
│   ├── resources/          # Icons and installer graphics
│   └── package.json        # Electron build configuration
└── capacitor/              # Mobile app configuration
```

## License

Proprietary - All rights reserved.

## Support

For support, please contact the Flowp team.
