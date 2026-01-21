# Management Portal Architecture

## 1. Overview

The Management Portal is a separate web application that provides administrative capabilities for the multi-tenant POS SaaS. It operates in two modes:

- **Internal Admin Portal**: For internal staff (SuperAdmin, SupportAgent, BillingOps)
- **Tenant Portal**: For customer administrators (Owner/Admin, Accountant, Manager)

The portal shares the core database with the POS application but adds administrative tables for RBAC, billing, support, and audit functionality.

---

## 2. Roles & Permissions

### 2.1 Internal Admin Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| **SuperAdmin** | Full system access | All permissions |
| **SupportAgent** | Customer support | View tenants, support tickets, read billing, impersonate (read-only), diagnostics |
| **BillingOps** | Billing operations | Manage plans, subscriptions, invoices, suspend/unsuspend tenants |

### 2.2 Tenant Portal Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| **Owner/Admin** | Full tenant access | All tenant settings, users, locations, registers, billing |
| **Accountant** | Financial access | Electronic billing, reports, invoices (read-only settings) |
| **Manager** | Limited access | View reports, limited settings |

### 2.3 Permission Matrix

```
Permission Categories:
├── tenants.*           (create, read, update, suspend, delete)
├── users.*             (create, read, update, delete, impersonate)
├── billing.*           (plans.*, subscriptions.*, invoices.*, payments.*)
├── support.*           (tickets.*, diagnostics.export)
├── electronic_billing.*(documents.*, retry, re-poll, alerts.*)
├── settings.*          (locations.*, registers.*, receipt_templates.*)
├── audit.*             (read, export)
└── system.*            (feature_flags.*, health.*)
```

---

## 3. Data Model (ERD)

### 3.1 New Tables (Portal-Specific)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RBAC & PERMISSIONS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐     ┌───────────────────┐     ┌──────────────────┐   │
│  │ portal_roles     │     │ portal_permissions│     │ role_permissions │   │
│  ├──────────────────┤     ├───────────────────┤     ├──────────────────┤   │
│  │ id               │     │ id                │     │ role_id          │   │
│  │ name             │────▶│ resource          │◀────│ permission_id    │   │
│  │ type (internal/  │     │ action            │     └──────────────────┘   │
│  │      tenant)     │     │ description       │                             │
│  │ description      │     └───────────────────┘                             │
│  └──────────────────┘                                                        │
│                                                                              │
│  ┌──────────────────┐                                                        │
│  │ user_portal_roles│                                                        │
│  ├──────────────────┤                                                        │
│  │ user_id          │ ← Links to existing users table                       │
│  │ role_id          │                                                        │
│  │ tenant_id        │ ← NULL for internal admin roles                       │
│  │ granted_by       │                                                        │
│  │ granted_at       │                                                        │
│  └──────────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           BILLING & SUBSCRIPTIONS                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐     ┌───────────────────┐     ┌──────────────────┐   │
│  │ subscription_    │     │ subscriptions     │     │ invoices         │   │
│  │ plans            │     ├───────────────────┤     ├──────────────────┤   │
│  ├──────────────────┤     │ id                │     │ id               │   │
│  │ id               │────▶│ tenant_id         │────▶│ subscription_id  │   │
│  │ name             │     │ plan_id           │     │ tenant_id        │   │
│  │ price_monthly    │     │ status            │     │ amount           │   │
│  │ price_yearly     │     │ trial_ends_at     │     │ currency         │   │
│  │ max_locations    │     │ current_period_   │     │ status           │   │
│  │ max_registers    │     │   start/end       │     │ issued_at        │   │
│  │ max_users        │     │ cancelled_at      │     │ due_date         │   │
│  │ features         │     └───────────────────┘     │ paid_at          │   │
│  │ (JSON flags)     │                               │ pdf_url          │   │
│  └──────────────────┘                               └──────────────────┘   │
│                                                                              │
│  ┌──────────────────┐     ┌───────────────────┐                             │
│  │ payments         │     │ payment_attempts  │                             │
│  ├──────────────────┤     ├───────────────────┤                             │
│  │ id               │     │ id                │                             │
│  │ invoice_id       │     │ payment_id        │                             │
│  │ tenant_id        │     │ provider          │                             │
│  │ amount           │     │ provider_id       │                             │
│  │ method           │     │ status            │                             │
│  │ provider_ref     │     │ error_message     │                             │
│  │ status           │     │ created_at        │                             │
│  │ created_at       │     └───────────────────┘                             │
│  └──────────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        ELECTRONIC BILLING (DIAN/Matias)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐     ┌───────────────────────┐                     │
│  │ electronic_documents │     │ document_status_      │                     │
│  ├──────────────────────┤     │ history               │                     │
│  │ id                   │     ├───────────────────────┤                     │
│  │ tenant_id            │     │ id                    │                     │
│  │ order_id             │────▶│ document_id           │                     │
│  │ document_type        │     │ status                │                     │
│  │ (invoice/credit_note)│     │ message               │                     │
│  │ track_id             │     │ created_at            │                     │
│  │ cufe                 │     └───────────────────────┘                     │
│  │ status               │                                                    │
│  │ request_payload      │                                                    │
│  │ response_payload     │                                                    │
│  │ error_message        │                                                    │
│  │ retry_count          │                                                    │
│  │ last_retry_at        │                                                    │
│  │ reviewed             │                                                    │
│  │ reviewed_by          │                                                    │
│  │ pdf_url              │                                                    │
│  │ xml_url              │                                                    │
│  │ created_at           │                                                    │
│  │ updated_at           │                                                    │
│  └──────────────────────┘                                                    │
│                                                                              │
│  ┌──────────────────────┐                                                    │
│  │ billing_provider_    │                                                    │
│  │ config               │                                                    │
│  ├──────────────────────┤                                                    │
│  │ id                   │                                                    │
│  │ tenant_id            │                                                    │
│  │ provider (matias)    │                                                    │
│  │ api_url              │                                                    │
│  │ client_id_encrypted  │ ← Encrypted at rest                               │
│  │ client_secret_       │                                                    │
│  │   encrypted          │                                                    │
│  │ access_token_cached  │                                                    │
│  │ token_expires_at     │                                                    │
│  │ is_enabled           │                                                    │
│  │ last_successful_     │                                                    │
│  │   emission_at        │                                                    │
│  └──────────────────────┘                                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           SUPPORT & AUDIT                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐     ┌───────────────────┐     ┌──────────────────┐   │
│  │ support_tickets  │     │ ticket_comments   │     │ ticket_          │   │
│  ├──────────────────┤     ├───────────────────┤     │ attachments      │   │
│  │ id               │     │ id                │     ├──────────────────┤   │
│  │ tenant_id        │────▶│ ticket_id         │────▶│ id               │   │
│  │ created_by       │     │ user_id           │     │ ticket_id        │   │
│  │ assigned_to      │     │ content           │     │ comment_id       │   │
│  │ subject          │     │ is_internal       │     │ file_name        │   │
│  │ description      │     │ created_at        │     │ file_url         │   │
│  │ status           │     └───────────────────┘     │ file_size        │   │
│  │ priority         │                               │ created_at       │   │
│  │ category         │                               └──────────────────┘   │
│  │ created_at       │                                                        │
│  │ updated_at       │                                                        │
│  │ resolved_at      │                                                        │
│  └──────────────────┘                                                        │
│                                                                              │
│  ┌──────────────────────┐     ┌───────────────────────┐                     │
│  │ audit_logs           │     │ impersonation_        │                     │
│  ├──────────────────────┤     │ sessions              │                     │
│  │ id                   │     ├───────────────────────┤                     │
│  │ tenant_id            │     │ id                    │                     │
│  │ user_id              │     │ admin_user_id         │                     │
│  │ action               │     │ target_tenant_id      │                     │
│  │ resource_type        │     │ target_user_id        │                     │
│  │ resource_id          │     │ mode (read_only/      │                     │
│  │ old_value (JSON)     │     │       write)          │                     │
│  │ new_value (JSON)     │     │ reason                │                     │
│  │ ip_address           │     │ started_at            │                     │
│  │ user_agent           │     │ ended_at              │                     │
│  │ created_at           │     │ actions_taken (JSON)  │                     │
│  └──────────────────────┘     └───────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        LOCATIONS & REGISTERS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  (Extends existing registers table)                                          │
│                                                                              │
│  ┌──────────────────┐     ┌───────────────────┐     ┌──────────────────┐   │
│  │ locations        │     │ warehouses        │     │ devices          │   │
│  ├──────────────────┤     ├───────────────────┤     ├──────────────────┤   │
│  │ id               │     │ id                │     │ id               │   │
│  │ tenant_id        │────▶│ tenant_id         │     │ register_id      │   │
│  │ name             │     │ location_id       │     │ device_type      │   │
│  │ address          │     │ name              │     │ device_id        │   │
│  │ city             │     │ is_default        │     │ last_seen_at     │   │
│  │ country          │     │ created_at        │     │ app_version      │   │
│  │ timezone         │     └───────────────────┘     │ os_version       │   │
│  │ is_active        │                               │ is_active        │   │
│  │ created_at       │                               └──────────────────┘   │
│  └──────────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Modifications to Existing Tables

```sql
-- Add to tenants table:
ALTER TABLE tenants ADD COLUMN status VARCHAR DEFAULT 'active';
  -- Values: 'trial', 'active', 'past_due', 'suspended', 'cancelled'
ALTER TABLE tenants ADD COLUMN suspended_at TIMESTAMP;
ALTER TABLE tenants ADD COLUMN suspended_reason TEXT;
ALTER TABLE tenants ADD COLUMN trial_ends_at TIMESTAMP;

-- Add to users table:
ALTER TABLE users ADD COLUMN is_internal BOOLEAN DEFAULT false;
  -- TRUE for internal admin users, FALSE for tenant users

-- Add to registers table:
ALTER TABLE registers ADD COLUMN location_id UUID REFERENCES locations(id);
ALTER TABLE registers ADD COLUMN last_sync_at TIMESTAMP;
ALTER TABLE registers ADD COLUMN sync_status VARCHAR DEFAULT 'unknown';
```

---

## 4. API Design

### 4.1 API Namespaces

```
/api/internal/*    → Internal Admin Portal (requires internal admin auth)
/api/tenant/*      → Tenant Portal (requires tenant auth + tenant scoping)
/api/auth/*        → Authentication (shared)
```

### 4.2 Internal Admin API Endpoints

```
TENANT MANAGEMENT
─────────────────
GET    /api/internal/tenants                    List all tenants (with filters)
POST   /api/internal/tenants                    Create tenant
GET    /api/internal/tenants/:id                Get tenant details
PATCH  /api/internal/tenants/:id                Update tenant
POST   /api/internal/tenants/:id/suspend        Suspend tenant
POST   /api/internal/tenants/:id/unsuspend      Unsuspend tenant
GET    /api/internal/tenants/:id/health         Get tenant health metrics
GET    /api/internal/tenants/:id/registers      List tenant registers
GET    /api/internal/tenants/:id/users          List tenant users
GET    /api/internal/tenants/:id/documents      List e-billing documents
GET    /api/internal/tenants/:id/audit          Get audit logs

BILLING MANAGEMENT
──────────────────
GET    /api/internal/plans                      List subscription plans
POST   /api/internal/plans                      Create plan
PATCH  /api/internal/plans/:id                  Update plan
GET    /api/internal/subscriptions              List all subscriptions
PATCH  /api/internal/subscriptions/:id          Update subscription
GET    /api/internal/invoices                   List all invoices
POST   /api/internal/invoices/:id/void          Void invoice
POST   /api/internal/invoices/:id/refund        Process refund

ELECTRONIC BILLING (DIAN)
─────────────────────────
GET    /api/internal/documents                  List all e-billing documents
GET    /api/internal/documents/:id              Get document details
POST   /api/internal/documents/:id/retry        Retry emission
POST   /api/internal/documents/:id/re-poll      Re-poll status
POST   /api/internal/documents/:id/review       Mark as reviewed
GET    /api/internal/documents/alerts           Get alerts (high rejection, etc.)
GET    /api/internal/documents/stats            Get emission statistics

SUPPORT
───────
GET    /api/internal/tickets                    List support tickets
POST   /api/internal/tickets                    Create ticket (internal)
GET    /api/internal/tickets/:id                Get ticket details
PATCH  /api/internal/tickets/:id                Update ticket
POST   /api/internal/tickets/:id/comments       Add comment
POST   /api/internal/tickets/:id/assign         Assign ticket
GET    /api/internal/diagnostics/:tenantId      Export diagnostics bundle

IMPERSONATION
─────────────
POST   /api/internal/impersonate                Start impersonation session
POST   /api/internal/impersonate/escalate       Escalate to write mode
DELETE /api/internal/impersonate                End impersonation session

AUDIT
─────
GET    /api/internal/audit                      List audit logs
GET    /api/internal/audit/export               Export audit logs
```

### 4.3 Tenant Portal API Endpoints

```
DASHBOARD
─────────
GET    /api/tenant/dashboard                    Get dashboard stats

SETTINGS
────────
GET    /api/tenant/profile                      Get company profile
PATCH  /api/tenant/profile                      Update company profile
GET    /api/tenant/locations                    List locations
POST   /api/tenant/locations                    Create location
PATCH  /api/tenant/locations/:id                Update location
DELETE /api/tenant/locations/:id                Delete location
GET    /api/tenant/registers                    List registers
POST   /api/tenant/registers                    Create register
PATCH  /api/tenant/registers/:id                Update register
DELETE /api/tenant/registers/:id                Delete register
GET    /api/tenant/receipt-template             Get receipt template
PATCH  /api/tenant/receipt-template             Update receipt template

USERS
─────
GET    /api/tenant/users                        List users
POST   /api/tenant/users                        Create user
PATCH  /api/tenant/users/:id                    Update user
DELETE /api/tenant/users/:id                    Delete user
GET    /api/tenant/roles                        List available roles
PATCH  /api/tenant/users/:id/role               Update user role

ELECTRONIC BILLING
──────────────────
GET    /api/tenant/documents                    List e-billing documents
GET    /api/tenant/documents/:id                Get document details
GET    /api/tenant/documents/:id/pdf            Download PDF
GET    /api/tenant/documents/:id/xml            Download XML

BILLING
───────
GET    /api/tenant/subscription                 Get current subscription
GET    /api/tenant/invoices                     List invoices
GET    /api/tenant/invoices/:id                 Get invoice details
GET    /api/tenant/invoices/:id/pdf             Download invoice PDF

SUPPORT
───────
GET    /api/tenant/tickets                      List tenant tickets
POST   /api/tenant/tickets                      Create ticket
GET    /api/tenant/tickets/:id                  Get ticket details
POST   /api/tenant/tickets/:id/comments         Add comment

IMPORT/EXPORT
─────────────
POST   /api/tenant/import/products              Import products CSV
POST   /api/tenant/import/customers             Import customers CSV
GET    /api/tenant/export/products              Export products CSV
GET    /api/tenant/export/customers             Export customers CSV
```

---

## 5. UI Screens

### 5.1 Internal Admin Portal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SIDEBAR                      │ MAIN CONTENT                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                              │                                              │
│ 🏠 Dashboard                 │ ┌──────────────────────────────────────────┐│
│                              │ │ GLOBAL DASHBOARD                         ││
│ 📊 Tenants                   │ │                                          ││
│   └─ List                    │ │ [Stats Cards]                            ││
│   └─ Health Monitor          │ │ Total Tenants | Active | Suspended       ││
│                              │ │                                          ││
│ 📄 Electronic Billing        │ │ [E-Billing Health]                       ││
│   └─ Documents               │ │ Success Rate | Failures Today | Alerts   ││
│   └─ Alerts                  │ │                                          ││
│   └─ Statistics              │ │ [Top Failing Tenants Table]              ││
│                              │ │                                          ││
│ 💳 Billing                   │ │ [Support Queue Summary]                  ││
│   └─ Plans                   │ └──────────────────────────────────────────┘│
│   └─ Subscriptions           │                                              │
│   └─ Invoices                │                                              │
│                              │                                              │
│ 🎫 Support                   │                                              │
│   └─ Tickets                 │                                              │
│   └─ Queue                   │                                              │
│                              │                                              │
│ 📋 Audit Logs                │                                              │
│                              │                                              │
│ ⚙️ Settings                  │                                              │
└─────────────────────────────────────────────────────────────────────────────┘

TENANT DETAIL PAGE (Tabs):
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Overview] [Billing] [Electronic Billing] [Registers] [Users] [Support]      │
├──────────────────────────────────────────────────────────────────────────────┤
│ Overview Tab:                                                                 │
│ - Company info, status, created date                                         │
│ - Health metrics (last sync, error rates)                                    │
│ - Feature flags toggles                                                       │
│ - Quick actions (suspend, impersonate)                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ Billing Tab:                                                                  │
│ - Current plan, subscription status                                           │
│ - Invoice history                                                             │
│ - Payment history                                                             │
│ - Override controls                                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ Electronic Billing Tab:                                                       │
│ - Document list with filters                                                  │
│ - Success/failure stats                                                       │
│ - Retry/re-poll actions                                                       │
│ - Alert indicators                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Tenant Portal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SIDEBAR                      │ MAIN CONTENT                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                              │                                              │
│ 🏠 Dashboard                 │ ┌──────────────────────────────────────────┐│
│                              │ │ TENANT DASHBOARD                         ││
│ 🏪 Locations                 │ │                                          ││
│                              │ │ [Stats Cards]                            ││
│ 💻 Registers                 │ │ Sales Today | Low Stock | Open Tickets   ││
│                              │ │                                          ││
│ 👥 Users                     │ │ [E-Billing Status]                       ││
│                              │ │ Documents Pending | Failed | Alerts      ││
│ 📄 Electronic Billing        │ │                                          ││
│   └─ Documents               │ │ [Recent Activity]                        ││
│                              │ │                                          ││
│ 💳 Billing                   │ └──────────────────────────────────────────┘│
│   └─ Subscription            │                                              │
│   └─ Invoices                │                                              │
│                              │                                              │
│ 📊 Reports                   │                                              │
│                              │                                              │
│ 🎫 Support                   │                                              │
│                              │                                              │
│ ⚙️ Settings                  │                                              │
│   └─ Company Profile         │                                              │
│   └─ Receipt Template        │                                              │
│   └─ Import/Export           │                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Security & Compliance

### 6.1 Authentication & Authorization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTHENTICATION FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. User Login                                                               │
│     ├─ Check if internal admin (is_internal = true)                         │
│     │   └─ Route to Internal Admin Portal                                   │
│     └─ Check tenant membership                                               │
│         └─ Route to Tenant Portal                                            │
│                                                                              │
│  2. Session includes:                                                        │
│     ├─ user_id                                                               │
│     ├─ tenant_id (NULL for internal admins)                                 │
│     ├─ roles[]                                                               │
│     ├─ permissions[]                                                         │
│     └─ impersonation_context (if active)                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                      AUTHORIZATION MIDDLEWARE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  // For every request:                                                       │
│  1. Verify JWT / Session                                                     │
│  2. Extract user context                                                     │
│  3. Check route permissions                                                  │
│  4. Enforce tenant isolation:                                                │
│     - Internal: can specify tenant_id in query                              │
│     - Tenant: tenant_id auto-injected from session                          │
│  5. Log access to audit trail                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Tenant Isolation

```typescript
// Server-side tenant isolation (MANDATORY)
async function enforceeTenantIsolation(req, res, next) {
  const { tenantId } = req.session;
  
  // Internal admins can access any tenant (with explicit tenant_id param)
  if (req.session.isInternal) {
    req.targetTenantId = req.params.tenantId || req.query.tenantId;
    return next();
  }
  
  // Tenant users can ONLY access their own tenant
  req.targetTenantId = tenantId;
  
  // Verify any resource being accessed belongs to tenant
  // Never trust client-provided tenant_id for tenant users
  next();
}
```

### 6.3 Secret Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SECRET HANDLING                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. API Keys/Secrets (Matias, payment providers):                           │
│     ├─ Encrypted at rest using AES-256                                      │
│     ├─ Encryption key from environment variable                             │
│     ├─ Never returned to UI (only masked values like "****1234")            │
│     └─ Decrypted only at moment of API call                                 │
│                                                                              │
│  2. Token Caching:                                                           │
│     ├─ OAuth tokens cached server-side only                                 │
│     ├─ Expiry tracked, auto-refresh before expiry                           │
│     └─ Never exposed to frontend                                             │
│                                                                              │
│  3. Audit Trail:                                                             │
│     ├─ All secret access logged                                              │
│     ├─ All secret modifications logged (who, when, action)                  │
│     └─ Secrets never logged in plaintext                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.4 Impersonation Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        IMPERSONATION WORKFLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Start Impersonation (SuperAdmin/SupportAgent only):                     │
│     ├─ Requires reason/ticket reference                                     │
│     ├─ Creates impersonation_session record                                 │
│     ├─ Default: READ-ONLY mode                                              │
│     └─ Session token includes impersonation context                         │
│                                                                              │
│  2. During Impersonation:                                                    │
│     ├─ UI shows "Support Mode" banner                                        │
│     ├─ All actions logged with impersonator ID                              │
│     ├─ Write operations blocked (unless escalated)                          │
│     └─ Cannot access secrets                                                 │
│                                                                              │
│  3. Escalation to Write Mode:                                                │
│     ├─ Requires explicit action + reason                                    │
│     ├─ Creates escalation audit entry                                        │
│     ├─ Time-limited (e.g., 30 minutes)                                      │
│     └─ Can be revoked remotely                                               │
│                                                                              │
│  4. End Impersonation:                                                       │
│     ├─ Records session duration                                              │
│     ├─ Logs all actions taken during session                                │
│     └─ Returns to admin portal                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Implementation Plan

### Phase 1: Foundation (Weeks 1-2)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: FOUNDATION & RBAC                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ Database:                                                                    │
│ ├─ [ ] Add portal_roles, portal_permissions, role_permissions tables        │
│ ├─ [ ] Add user_portal_roles table                                          │
│ ├─ [ ] Add is_internal to users table                                       │
│ ├─ [ ] Add tenant status fields                                             │
│ └─ [ ] Seed default roles and permissions                                   │
│                                                                              │
│ Backend:                                                                     │
│ ├─ [ ] Create /api/internal/* and /api/tenant/* route namespaces           │
│ ├─ [ ] Implement RBAC middleware                                            │
│ ├─ [ ] Implement tenant isolation middleware                                │
│ └─ [ ] Add internal admin authentication flow                               │
│                                                                              │
│ Frontend:                                                                    │
│ ├─ [ ] Create portal layout (sidebar, header)                               │
│ ├─ [ ] Implement role-based menu filtering                                  │
│ └─ [ ] Create login with portal detection                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 2: Tenant Management (Weeks 3-4)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: TENANT MANAGEMENT & ONBOARDING                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ Database:                                                                    │
│ ├─ [ ] Add locations, warehouses tables                                     │
│ ├─ [ ] Add devices table                                                    │
│ ├─ [ ] Add location_id to registers                                         │
│ └─ [ ] Add tenant_settings table                                            │
│                                                                              │
│ Internal Admin:                                                              │
│ ├─ [ ] Tenants list page with filters                                       │
│ ├─ [ ] Tenant detail page with tabs                                         │
│ ├─ [ ] Create tenant form                                                   │
│ ├─ [ ] Suspend/unsuspend functionality                                      │
│ └─ [ ] Feature flags management                                             │
│                                                                              │
│ Tenant Portal:                                                               │
│ ├─ [ ] Dashboard with stats                                                 │
│ ├─ [ ] Company profile settings                                             │
│ ├─ [ ] Locations CRUD                                                       │
│ ├─ [ ] Registers CRUD                                                       │
│ ├─ [ ] Users management                                                     │
│ └─ [ ] Receipt template config                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 3: Electronic Billing Monitoring (Weeks 5-6)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: ELECTRONIC BILLING (DIAN/MATIAS)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ Database:                                                                    │
│ ├─ [ ] Create electronic_documents table                                    │
│ ├─ [ ] Create document_status_history table                                 │
│ └─ [ ] Create billing_provider_config table                                 │
│                                                                              │
│ Backend:                                                                     │
│ ├─ [ ] Document listing with filters API                                    │
│ ├─ [ ] Document detail API                                                  │
│ ├─ [ ] Retry emission API                                                   │
│ ├─ [ ] Re-poll status API                                                   │
│ ├─ [ ] PDF/XML download APIs                                                │
│ └─ [ ] Alerts calculation API                                               │
│                                                                              │
│ Frontend (Internal):                                                         │
│ ├─ [ ] Documents list page                                                  │
│ ├─ [ ] Document detail page                                                 │
│ ├─ [ ] Alerts dashboard                                                     │
│ └─ [ ] Statistics page                                                      │
│                                                                              │
│ Frontend (Tenant):                                                           │
│ ├─ [ ] Documents list page                                                  │
│ ├─ [ ] Document detail page (view only)                                     │
│ └─ [ ] Download PDF/XML                                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 4: SaaS Billing (Weeks 7-8)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: SAAS BILLING & SUBSCRIPTIONS                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ Database:                                                                    │
│ ├─ [ ] Create subscription_plans table                                      │
│ ├─ [ ] Create subscriptions table                                           │
│ ├─ [ ] Create invoices table                                                │
│ ├─ [ ] Create payments table                                                │
│ └─ [ ] Create payment_attempts table                                        │
│                                                                              │
│ Backend:                                                                     │
│ ├─ [ ] BillingProvider interface (Stripe-like abstraction)                  │
│ ├─ [ ] Plans CRUD APIs                                                      │
│ ├─ [ ] Subscription lifecycle APIs                                          │
│ ├─ [ ] Invoice generation logic                                             │
│ ├─ [ ] Auto-suspension cron job                                             │
│ └─ [ ] Payment webhook handlers                                             │
│                                                                              │
│ Frontend (Internal):                                                         │
│ ├─ [ ] Plans management page                                                │
│ ├─ [ ] Subscriptions list                                                   │
│ ├─ [ ] Invoice management                                                   │
│ └─ [ ] Override controls                                                    │
│                                                                              │
│ Frontend (Tenant):                                                           │
│ ├─ [ ] Subscription status page                                             │
│ └─ [ ] Invoice history                                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 5: Support & Audit (Weeks 9-10)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: SUPPORT TOOLING & AUDIT                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ Database:                                                                    │
│ ├─ [ ] Create support_tickets table                                         │
│ ├─ [ ] Create ticket_comments table                                         │
│ ├─ [ ] Create ticket_attachments table                                      │
│ ├─ [ ] Create audit_logs table                                              │
│ └─ [ ] Create impersonation_sessions table                                  │
│                                                                              │
│ Backend:                                                                     │
│ ├─ [ ] Ticket CRUD APIs                                                     │
│ ├─ [ ] Comment APIs                                                         │
│ ├─ [ ] Attachment upload/download                                           │
│ ├─ [ ] Impersonation APIs                                                   │
│ ├─ [ ] Diagnostics export API                                               │
│ └─ [ ] Audit logging middleware                                             │
│                                                                              │
│ Frontend (Internal):                                                         │
│ ├─ [ ] Support queue board                                                  │
│ ├─ [ ] Ticket detail page                                                   │
│ ├─ [ ] Impersonation UI                                                     │
│ ├─ [ ] Audit logs viewer                                                    │
│ └─ [ ] Diagnostics export                                                   │
│                                                                              │
│ Frontend (Tenant):                                                           │
│ ├─ [ ] My tickets list                                                      │
│ ├─ [ ] Create ticket form                                                   │
│ └─ [ ] Ticket detail with comments                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tenant data leakage | Critical | Enforce tenant_id on all queries server-side; never trust client |
| Secret exposure | Critical | Encrypt at rest, never return to UI, audit all access |
| Impersonation abuse | High | Require reasons, default read-only, time limits, full audit |
| Billing integration failures | High | Implement retry logic, manual override capabilities |
| E-billing (DIAN) downtime | Medium | Queue retries, status polling, alert thresholds |
| Performance with many tenants | Medium | Pagination, caching, query optimization |
| Complex RBAC bugs | Medium | Comprehensive permission tests, default-deny approach |

---

## 9. Integration with Existing POS

### 9.1 Shared Database Approach

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATABASE STRATEGY                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Shared Schema:                                                              │
│  ├─ tenants, users (extend with portal fields)                              │
│  ├─ products, categories, orders (read by portal)                           │
│  └─ registers (extend with location_id, sync fields)                        │
│                                                                              │
│  Portal-Only Tables:                                                         │
│  ├─ portal_roles, permissions, role_permissions                             │
│  ├─ subscription_plans, subscriptions, invoices, payments                   │
│  ├─ electronic_documents, document_status_history                           │
│  ├─ support_tickets, ticket_comments, ticket_attachments                    │
│  ├─ audit_logs, impersonation_sessions                                      │
│  └─ locations, warehouses, devices                                          │
│                                                                              │
│  POS-Only Tables:                                                            │
│  ├─ orders, order_items, payments (POS transactions)                        │
│  ├─ floors, tables, kitchen_tickets (restaurant)                            │
│  └─ stock_movements (inventory)                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Application Structure Options

**Option A: Same Codebase, Different Entry Points**
```
project/
├── client/                    # Shared frontend code
│   ├── src/
│   │   ├── pos/              # POS pages
│   │   ├── portal/           # Portal pages
│   │   │   ├── internal/     # Internal admin pages
│   │   │   └── tenant/       # Tenant portal pages
│   │   └── shared/           # Shared components
├── server/                    # Shared backend
│   ├── routes/
│   │   ├── pos/              # POS APIs
│   │   ├── internal/         # Internal admin APIs
│   │   └── tenant/           # Tenant APIs
└── shared/                    # Shared schema
```

**Option B: Separate Applications (Recommended for scale)**
```
project/
├── pos-app/                   # POS PWA (existing)
├── portal-app/               # Management Portal (new)
└── shared/
    ├── schema/               # Shared database schema
    └── types/                # Shared TypeScript types
```

---

## 10. Next Steps

1. **Confirm architecture approach** - Same codebase or separate app?
2. **Start Phase 1** - Database migrations for RBAC
3. **Create portal layout** - Sidebar, header, routing
4. **Implement authentication** - Portal detection and routing
5. **Build incrementally** - Follow phases, validate each step
