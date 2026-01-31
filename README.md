# Flowp - Multi-Tenant Point of Sale System

A production-ready, multi-tenant POS + Inventory system delivered as a Progressive Web App (PWA) with native desktop and mobile apps.

## Features

### Core POS
- Fast POS screen with product grid and category filtering
- Cart management with quantity controls
- Hold/resume orders
- Split payment support (cash/card)
- Tax calculation
- Thermal printing support

### Restaurant Module
- Floor and table management
- Table status tracking (free, occupied, dirty, reserved)
- Kitchen Display System (KDS) with real-time WebSocket updates
- Ticket status flow: new → preparing → ready → served

### Inventory Management
- Ledger-based immutable stock movements
- Movement types: sale, purchase, adjustment, waste
- Low stock alerts
- Ingredient tracking with FIFO auto-consumption (Pro)
- Recipe/BOM management (Pro)

### Purchasing
- Supplier management
- Purchase order creation and tracking
- Stock receiving with lot tracking
- Quick reorder system for low-stock items

### Reporting
- Daily sales summary
- Order count and average order value
- Sales by hour charts
- Top products tracking

## Platforms

- **Web (PWA)** - Works on any modern browser
- **Windows** - Electron desktop app with native printing
- **macOS** - Electron desktop app (Intel & Apple Silicon)
- **iOS** - Capacitor native app
- **Android** - Capacitor native app

## Tech Stack

- **Frontend:** React + TypeScript + Vite
- **Backend:** Express.js + Node.js
- **Database:** PostgreSQL (Neon-backed)
- **Styling:** Tailwind CSS + shadcn/ui
- **State Management:** TanStack Query
- **Real-time:** WebSocket

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

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption key

## Tenant Types

### Retail
- Barcode scanning
- Returns processing
- Bulk discounts

### Restaurant
- Table management
- Kitchen tickets
- Modifiers support
- Ingredient inventory (Pro)

## License

Proprietary - All rights reserved

## Support

For support, please contact the Flowp team.
