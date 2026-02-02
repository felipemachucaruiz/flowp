# Flowp - Multi-Tenant Point of Sale System

## Overview
Flowp is a production-ready, multi-tenant Point of Sale (POS) and Inventory management system designed as a Progressive Web App (PWA) with native desktop (Windows, macOS) and mobile (iOS, Android) applications. It supports features like thermal printing, barcode scanning, and offline capabilities. The system caters to both Retail and Restaurant businesses, utilizing feature flags to control module availability based on tenant type.

## User Preferences
- **Onboarding**: All fields are mandatory except for logo uploads (company logo and receipt logo are optional)
- **Display Language**: ALL text and dates must use the selected display language. Never use hardcoded English strings. Always use translation keys (t() function) for text and locale-aware date formatting. This is critical and applies to every page, component, and feature.
- **Receipt Logo**: Can be as large as the full width of receipt paper (no size restrictions up to max paper width)
- Dark mode support with system preference detection
- Persistent theme and auth state in localStorage

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
- **Desktop App (Electron)**: Provides native installers for Windows (multi-language NSIS) and macOS (DMG), offering direct ESC/POS thermal printer support with cash drawer control without needing PrintBridge.
- **Mobile App (Capacitor)**: Wraps the PWA for native iOS/Android experience, including Bluetooth LE thermal printing, camera-based barcode scanning, and haptic feedback.
- **Restaurant Module**: Includes floor and table management, table status tracking, and a real-time Kitchen Display System (KDS) via WebSockets.
- **Email Notification System**: User-configurable email preferences for various notification types (e.g., New Sale, Low Stock Alerts) with multi-tenant logging and SMTP configuration.
- **DIAN/MATIAS Electronic Billing (Colombia)**: Full integration for electronic invoicing, supporting multiple document types (POS, Invoice, Credit/Debit Notes). Features include asynchronous processing, encrypted credential storage, OAuth token caching, numbering with row-level locks, and a queue-based retry mechanism. Global MATIAS credentials are managed in the Internal Admin Console.
- **Inventory System**: Ledger-based with immutable stock movements (sale, purchase, adjustment, waste) and low stock alerts.
- **Reporting**: Provides daily sales summaries, order statistics, sales by hour, and top product tracking.
- **Unified Admin Console**: A single platform for Flowp staff (`/admin`) to manage tenants, e-billing subscriptions, documents, and global configurations like MATIAS API credentials.

**System Design Choices:**
- **PWA Manifest**: Configured for web and mobile experience.
- **Database Schema**: Core tables for tenants, users, registers, categories, products, and specific tables for restaurant features (floors, tables, kitchen_tickets), orders, payments, and inventory stock movements.
- **API Endpoints**: Structured for authentication, products, orders, restaurant-specific actions, inventory, and reports. Internal Admin APIs are also provided.
- **Environment Variables**: Essential for database connection (`DATABASE_URL`) and session encryption (`SESSION_SECRET`).

## External Dependencies
- **PostgreSQL**: Primary database for all application data.
- **@capacitor-mlkit/barcode-scanning**: For native iOS/Android camera barcode scanning.
- **@capacitor-community/bluetooth-le**: For Bluetooth Low Energy thermal printing on native mobile apps.
- **@zxing/library**: Web fallback for barcode scanning.
- **MATIAS API v2**: External service for DIAN electronic billing compliance in Colombia.
  - **Auth URL**: `https://auth-v2.matias-api.com` (for `/auth/login` authentication)
  - **API URL**: `https://api-v2.matias-api.com/api/ubl2.1` (for document submission)
  - **Documentation**: https://docs.matias-api.com/docs/intro/
- **Electron**: Framework for building cross-platform desktop applications.
- **Capacitor**: Framework for building native mobile applications from web technologies.
- **Nodemailer**: For sending email notifications.