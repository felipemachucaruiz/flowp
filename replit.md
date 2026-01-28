# Flowp - Multi-Tenant Point of Sale System

## Overview
A production-ready, multi-tenant POS + Inventory system delivered as a Progressive Web App (PWA), optimized for Windows devices with one-click receipt printing support. The system supports both Retail and Restaurant tenants with feature flags controlling module availability.

## Current State
- **Status**: MVP Complete + Management Portal Phase 1
- **Last Updated**: January 26, 2026
- **Stack**: React + TypeScript frontend, Express + PostgreSQL backend

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

### Roles (7 Total)
- **Internal**: SuperAdmin, SupportAgent, BillingOps
- **Tenant**: Owner, Admin, Accountant, Manager

### Security Notes (Phase 2)
- Current auth uses localStorage (frontend-only session state)
- Phase 2 will add JWT/session-based server authentication
- RBAC permission enforcement needs token validation middleware

## Key Features

### Core POS
- Fast POS screen with product grid
- Category filtering and search
- Cart management with quantity controls
- Hold/resume orders
- Split payment support (cash/card)
- Tax calculation

### Desktop App (Electron)
- Windows installer with multi-language wizard (EN/ES/PT)
- **Native local printing** - NO PrintBridge required when using desktop app
- App detects Electron environment and shows native printer selection in Settings
- Direct ESC/POS thermal printer support with cash drawer control
- Production URL: pos.flowp.app

### Restaurant Module (enabled for restaurant tenants)
- Floor and table management
- Table status tracking (free, occupied, dirty, reserved)
- Kitchen Display System (KDS) with real-time updates via WebSocket
- Ticket status flow: new → preparing → ready → served

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
