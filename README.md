<div align="center">

# ⚡ Expense Tracker & Financial Analytics

[![Live Application](https://img.shields.io/badge/🚀%20LIVE%20APPLICATION-ONLINE-22C55E?style=for-the-badge&logo=vercel&logoColor=white)](https://expense-tracker-ochre-eight-80.vercel.app/)
[![Backend API](https://img.shields.io/badge/⚡%20RENDER%20API-ONLINE-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://expense-tracker-ai6g.onrender.com/api/health)
[![Cloud Database](https://img.shields.io/badge/☁️%20TURSO%20CLOUD%20DB-AWS%20OHIO-4FF8D2?style=for-the-badge&logo=sqlite&logoColor=black)](https://turso.tech)
[![PWA Ready](https://img.shields.io/badge/PWA-INSTALLABLE-3178C6?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Offline First](https://img.shields.io/badge/OFFLINE-ENABLED-22C55E?style=for-the-badge&logo=pwa&logoColor=white)](#-offline-first-architecture--zero-data-loss)
[![Frontend](https://img.shields.io/badge/FRONTEND-ANGULAR%2016%20SIGNALS-DD0031?style=for-the-badge&logo=angular&logoColor=white)](https://angular.io/)
[![Backend](https://img.shields.io/badge/BACKEND-NODE.JS%20%26%20EXPRESS-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/LICENSE-MIT-007ACC?style=for-the-badge)](LICENSE)

<br />

**An enterprise-grade, offline-first personal financial management platform built with Angular (Signals), Node.js/Express, a Hybrid In-Memory/Disk SQLite Cache, and Turso Cloud Database (libSQL). Features integer-cent financial accuracy, 10-year rolling calendar analytics, 7-step interactive guided onboarding, and automated cloud synchronization across all devices.**

<br />

### 🌐 [👉 Click Here to Open Live Application](https://expense-tracker-ochre-eight-80.vercel.app/)

**Production Frontend (Vercel):** [https://expense-tracker-ochre-eight-80.vercel.app/](https://expense-tracker-ochre-eight-80.vercel.app/)  
**Production API (Render):** [https://expense-tracker-ai6g.onrender.com](https://expense-tracker-ai6g.onrender.com)  
**Cloud Database (Turso):** `aws-us-east-2` (Ohio)  
**Demo Account:** `demo@expense.test` / `demo1234`

<br />

[🚀 Live App](https://expense-tracker-ochre-eight-80.vercel.app/) • [🏛️ Architecture & System Flow](#️-architecture--system-flow) • [☁️ Hybrid Cloud Persistence](#️-hybrid-cloud-persistence-turso--sqlite) • [📊 Free-Tier & Concurrency](#-free-tier-limits-scalability--concurrency) • [📱 Mobile & PWA](#-mobile-app--pwa-installation) • [✨ Guided Tour](#-interactive-guided-tour) • [⚡ Quickstart](#-quickstart--local-development) • [📡 API Reference](#-api-endpoint-reference)

</div>

---

## 🏛️ Architecture & System Flow

The system employs a **Decoupled 4-Tier Hybrid Cloud Architecture** engineered for **$0/month hosting** with production reliability, sub-millisecond local read speeds, and persistent cloud storage.

```
┌────────────────────────────────────────────────────────────────────────┐
│               📱 CLIENT TIER (PWA & Desktop Browsers)                  │
│   Angular 16 Standalone · Reactive Signals · Zero-Dep SVG Charts        │
│   LocalStorage Queue (et.offlineQueue) · KeepAliveService Heartbeat    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS (API & Static Assets)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               ⚡ EDGE GATEWAY TIER (Vercel Global CDN)                 │
│   Global Anycast Edge Delivery · Automatic SPA Deep Routing Rewrites   │
│   Zero-CORS Reverse Proxy: /api/* ➔ Render Backend                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ TLS Reverse Proxied HTTP
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│           🖥️ APPLICATION & COMPUTE TIER (Render Web Service)            │
│   Node.js & Express REST API (Ohio - US East)                          │
│   Helmet Security · JWT Auth · Zod Schema Validation · Audit Logs      │
│   Local In-Process SQLite Cache (better-sqlite3 WAL Mode - 0ms reads)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Sub-2ms Internal VPC Network (Ohio)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│           ☁️ CLOUD PERSISTENCE TIER (Turso Cloud Database)              │
│   Distributed libSQL Cloud Database (AWS us-east-2 Ohio)               │
│   Permanent Storage · Immune to Container Restarts / Sleep Cycles     │
│   Real-Time Bidirectional Sync · Multi-User Isolation                  │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 📐 Detailed Mermaid System Flow

```mermaid
flowchart TD
    subgraph CLIENT["📱 Client Tier (PWA & Desktop Browser)"]
        direction TB
        UI["Angular UI Shell<br/>(Signals, SCSS Glassmorphism, Zero-Dep SVG)"]
        SW["Service Worker<br/>(ngsw-worker.js — Shell Caching)"]
        LS[("Device LocalStorage<br/>• JWT Auth Token<br/>• et.offlineQueue<br/>• User Preferences")]
        OQS["OfflineQueueService<br/>(UUID Generation & Auto-Flush)"]
        KAS["KeepAliveService<br/>(10m Heartbeat + Phone Unlock Pre-Warm)"]

        UI <--> SW
        UI <--> LS
        UI <--> OQS
        UI --> KAS
    end

    subgraph EDGE["⚡ Edge Gateway Tier (Vercel Global CDN)"]
        direction TB
        V_CDN["Vercel Global Anycast Edge CDN<br/>https://expense-tracker-ochre-eight-80.vercel.app/"]
        V_PROXY["Vercel Reverse-Proxy Rewrite<br/>/api/(.*) ➔ Render Backend"]
        V_CDN --> V_PROXY
    end

    subgraph SERVER["🖥️ Compute & Business Logic Tier (Render Web Service)"]
        direction TB
        API["Express 4 REST Application<br/>https://expense-tracker-ai6g.onrender.com"]
        MW["Security Middleware<br/>• Helmet Headers<br/>• JWT Bearer Auth<br/>• Rate Limiting"]
        ZOD["Zod Schema Guardrails<br/>(Strict Type Validation)"]

        subgraph ENGINES["Service Modules"]
            AUTH["Auth Engine (bcrypt + JWT)"]
            EXP["Expense Engine (Integer Cents)"]
            BUD["Budget Engine (Burn Rates & Tiers)"]
            ANA["Analytics Engine (10-Yr Rolling Horizons)"]
            EXP_STR["Export Pipelines (Streaming CSV & PDFKit)"]
        end

        LOCAL_SQLITE[("Local SQLite Cache<br/>better-sqlite3 WAL Mode<br/>0ms Read Latency")]

        API --> MW --> ZOD --> ENGINES
        ENGINES <-->|Instant Synchronous Reads/Writes| LOCAL_SQLITE
    end

    subgraph CLOUD_DB["☁️ Cloud Database Tier (Turso libSQL)"]
        direction TB
        TURSO[("Turso Cloud Database<br/>AWS us-east-2 (Ohio)<br/>• Permanent Persistence<br/>• 100% Free Tier (9 GB / 1B Reads)<br/>• Survives Render Container Restarts")]
    end

    %% Network Connections
    SW -.->|1. Fetch Cached Assets| V_CDN
    UI -->|2. REST Requests & Mutations| V_PROXY
    OQS -->|3. Offline Batch Sync /api/sync/batch| V_PROXY
    KAS -->|4. Keep-Alive Ping /api/health| V_PROXY
    V_PROXY -->|TLS Forwarding| API

    %% Backend to Turso Sync Connections
    LOCAL_SQLITE -.->|On Server Startup: Pull Latest State| TURSO
    ENGINES -.->|On Write Mutations: Async Push in Background| TURSO
```

---

## ☁️ Hybrid Cloud Persistence: Turso + SQLite

### The Free-Tier Ephemeral Challenge
On free cloud platforms (like Render), containers sleep after 15 minutes of inactivity and disk changes reset upon restarting or redeploying code. Traditional file-based SQLite databases lose new user registrations and updates when the container restarts.

### The Hybrid Solution
Our application resolves this with an **Embedded Hybrid Cloud Architecture**:

1. **Ultra-Fast Local Reads (0ms Latency)**:
   All queries (`GET /api/expenses`, `GET /api/analytics/summary`, `GET /api/budgets`) execute locally against `better-sqlite3` in Write-Ahead Logging (WAL) mode. Dashboards render instantaneously without waiting for network round-trips.

2. **Automated Cold-Start Hydration**:
   Whenever Render spins up, wakes from sleep, or redeploys, `syncFromTursoToLocal(db)` executes inside `server/src/db.js`:
   - Connects to Turso Cloud (`libsql://expense-tracker-ravidaliparthy.aws-us-east-2.turso.io`).
   - Pulls all `users`, `categories`, `expenses`, and `budgets`.
   - Populates the local SQLite database in batch transactions (`< 10ms` total execution).

3. **Non-Blocking Background Cloud Push**:
   Whenever a mutation occurs (`POST /api/expenses`, `POST /api/auth/register`, `PUT /api/budgets`), the API writes immediately to local SQLite and returns HTTP `200/201` to the client. Simultaneously, `pushToTurso()` executes asynchronously in the background.

4. **Zero Geographic Lag**:
   - Render Web Service: Hosted in **AWS US East (Ohio)**.
   - Turso Cloud Database: Hosted in **AWS US East (Ohio) (`aws-us-east-2`)**.
   - Network latency between Render and Turso is **`< 2 ms`**, guaranteeing near-instantaneous background sync.

5. **Graceful Network Degradation**:
   If the cloud network ever blips, local SQLite continues serving traffic without crashing the server.

---

## 📊 Free-Tier Limits, Scalability & Concurrency

This application is engineered from the ground up to operate indefinitely within **100% free hosting tiers** while handling real-world personal and multi-user loads:

| Tier Layer | Provider | Free Allowance | Application Usage & Capacity |
|---|---|---|---|
| **Frontend CDN** | **Vercel** | • 100 GB Bandwidth/mo<br/>• Unlimited Edge Caching | • App bundle is ~310 KB (~86 KB gzipped)<br/>• Supports **~300,000+ page visits / month** at $0 cost. |
| **Backend Compute** | **Render** | • 750 free instance hours/mo<br/>• 512 MB RAM / 0.1 vCPU<br/>• Spins down after 15m idle | • 750 hours runs 1 instance **24/7 all month**.<br/>• Memory footprint is only ~65 MB.<br/>• Cold boot is mitigated by `KeepAliveService` + instant Turso hydration. |
| **Cloud Database** | **Turso** | • **9 GB Storage**<br/>• **1 Billion Row Reads/mo**<br/>• **25 Million Row Writes/mo**<br/>• 500 Databases | • 1 million expenses require only ~120 MB.<br/>• 9 GB can store **tens of millions of transactions**.<br/>• Millions of transactions per user without ever hitting limits. |

### Concurrency & Capacity Analysis:
* **Concurrent Users**: Because reads are served from local memory and static assets are served by Vercel CDN, Render only handles lightweight JSON API calls. On 512 MB RAM / 0.1 vCPU, the server comfortably handles **15–30 requests per second (RPS)** and **50–100 simultaneous concurrent users**.
* **Table Limits**: With indexed columns (`user_id`, `occurred_at_utc`, `deleted_at`), SQLite effortlessly searches **500,000+ rows in `< 5ms`**.

---

## 🌐 Offline-First Architecture & Zero Data Loss

### Does the application require an active internet connection?
**NO. Once loaded, the app does not require internet for regular logging and dashboard usage.**

```mermaid
sequenceDiagram
    autonumber
    actor User as 👤 User (Mobile / Desktop)
    participant UI as 📱 Angular Application
    participant LS as 💾 LocalStorage (et.offlineQueue)
    participant SW as ⚙️ Service Worker
    participant API as 🖥️ Backend API (/api/sync/batch)
    participant TURSO as ☁️ Turso Cloud DB

    Note over User, UI: Device is Offline (Airplane Mode / No Signal)
    User->>UI: Logs new expense ($45.50 for Groceries)
    UI->>UI: Generates unique client_uuid (v4)
    UI->>LS: Enqueues mutation into et.offlineQueue
    UI->>UI: Updates local view optimistically (Header: "⟳ 1 pending")
    UI-->>User: Immediate UI confirmation (Zero lag, no spinner)

    Note over User, UI: Connectivity Restores (window 'online' event fires)
    SW->>UI: Emits window "online" event
    UI->>LS: Reads pending mutations from et.offlineQueue
    UI->>API: POST /api/sync/batch with mutation array
    activate API
    API->>API: Validates JWT token & Zod schemas
    API->>API: Executes batch transaction (Idempotent UUID check)
    API-->>UI: HTTP 200 OK: { results: [{ clientUuid, status: 'created' }] }
    deactivate API

    API--)TURSO: Background pushToTurso() persists to cloud
    UI->>LS: Purges successfully synced items from queue
    UI->>UI: Refreshes Dashboard KPIs & displays "● Online"
    UI-->>User: Visual sync confirmation badge
```

* **Idempotency Guarantee**: If a phone drops connection halfway through a sync and retries, the server checks `client_uuid` and prevents duplicate transactions.
* **Persistent Session**: Authentication tokens and user metadata are stored securely in `localStorage`, so app restarts in airplane mode remain fully authenticated.

---

## 📱 Mobile App & PWA Installation

The application is a full **Progressive Web App (PWA)** that installs directly to your home screen with native full-screen execution, zero address bar, custom app icons, and offline shell caching.

### 📲 Android (Chrome / Edge / Brave / Samsung Internet)
1. Open [https://expense-tracker-ochre-eight-80.vercel.app/](https://expense-tracker-ochre-eight-80.vercel.app/) in your browser.
2. Tap the **📲 Install** button in the top navigation bar (or select **"Install App"** / **"Add to Home screen"** from the browser's menu `⋮`).
3. Tap **Install** — the app icon appears on your home screen and launcher.

### 🍏 iOS (iPhone & iPad Safari)
1. Open [https://expense-tracker-ochre-eight-80.vercel.app/](https://expense-tracker-ochre-eight-80.vercel.app/) in **Safari**.
2. Tap the **Share** button (the square with an arrow pointing up `⎋`) at the bottom of the screen.
3. Scroll down and tap **"Add to Home Screen"** (`⊞`).
4. Tap **Add** in the top-right corner.
5. Tap the new **ExpenseTracker** app icon on your home screen to launch in full-screen standalone mode.

---

## ⚡ Zero Cold-Start Lag (Keep-Alive Heartbeat)

Render free tier instances spin down after 15 minutes of inactivity. To ensure your app is always hot and responsive:
1. **Automated 10-Minute Heartbeat**: While the web app is open in any tab, `KeepAliveService` sends a lightweight `/api/health` ping every 10 minutes, resetting Render's timer so **the server never spins down during use**.
2. **Instant Pre-Warm on Phone Unlock**: When you unlock your phone or switch back to the app (`visibilitychange` / `window.focus`), a background pre-warming request is fired immediately, ensuring the API is awake before you tap any buttons.

---

## ✨ Interactive Guided Tour

Tap the **✨ Tour** button in the header at any time to launch a 7-step interactive walkthrough:
1. **✨ 1 · Log Expenses & Income**: Add transactions with categories, dates, and notes.
2. **📅 2 · Date Filters & Chart Views**: 1-click presets ("Today", "This week", "This month") and grouping.
3. **📊 3 · Deep Spending Breakdown**: Inspect spending by Day of Week, Week, Month, or Year.
4. **↕️ 4 · Sorting & Quick Edits**: Ascending/descending sorting by Date and Amount.
5. **📋 5 · Full Transactions Hub**: Search receipts, filter by range, and paginate.
6. **◑ 6 · Smart Budget Guardrails**: Color-coded gauges with 80%, 90%, and 100% threshold warnings.
7. **⤓ 7 · Instant PDF & CSV Reports**: Download spreadsheets and PDF reports anytime.

*Mobile Optimized: On smartphones, the tour docks as an ergonomic bottom sheet, smoothly auto-scrolling with 60fps tracking and keyboard navigation support (`ArrowRight`, `ArrowLeft`, `Enter`, `Escape`).*

---

## 🚀 Key Features

* **Progressive Web App (PWA)**: Installable, full-screen standalone mobile experience with high-resolution app icons.
* **Hybrid Cloud Persistence**: In-memory/disk SQLite for 0ms reads + Turso Cloud (libSQL) for permanent multi-device sync.
* **Offline-First Resilience**: Log expenses offline; automatic background batch synchronization with idempotent UUIDs.
* **Dynamic 10-Year Rolling Horizon**: Auto-updating rolling calendar horizon dynamically recalculating from system clock.
* **High-Precision Financial Engine**: All monetary calculations execute with integer cents (`amount_cents`) to eliminate IEEE-754 floating-point inaccuracies.
* **Zero-Dependency SVG Charts**: Hand-rolled responsive SVG trend polylines, category distribution bars, and donut charts.
* **Budget Threshold Alerts**: Real-time multi-tier threshold indicators (`safe` < 80%, `warning` 80-99%, `exceeded` ≥ 100%) with daily burn rate projection.
* **Streaming Export Pipelines**: Server-side streamed CSV via `fast-csv` and executive multi-page PDF summaries via `pdfkit`.
* **Zero Inactivity Lag**: Automated keep-alive pinging prevents cloud instance sleep.

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose & Capabilities |
|---|---|---|
| **Frontend Framework** | **Angular 16.2 (Standalone)** | Standalone components, reactive Signals (`computed`, `signal`, `effect`), lazy routes, functional HTTP interceptors |
| **PWA & Offline** | **@angular/service-worker** | Static shell caching, Web App Manifest, offline queue manager |
| **UI Styling** | **Vanilla SCSS Design System** | Pure CSS/SCSS (Zero bloated UI frameworks), light/dark mode, glassmorphism, iOS safe area insets |
| **Charts** | **Hand-Rolled SVG Mathematics** | Zero third-party chart dependencies; responsive mathematical SVG coordinate projections |
| **Backend API** | **Node.js 18+ & Express 4** | Modular architecture (auth, categories, expenses, budgets, analytics, export, sync) |
| **Local Database** | **better-sqlite3** | Synchronous WAL-mode SQLite cache for sub-millisecond local reads |
| **Cloud Database** | **Turso libSQL (`@libsql/client`)** | Distributed cloud database hosted in AWS US East (Ohio); permanent multi-device persistence |
| **Validation** | **Zod** | Strict schema validation with human-readable error messages |
| **Security** | **Helmet, bcryptjs, JWT, Rate Limit** | Hardened HTTP headers, bcrypt password hashing, 7-day signed JWT tokens, rate limiting |
| **Exports** | **fast-csv & pdfkit** | Constant-memory streaming CSV and multi-page formatted executive PDF generation |

---

## ⚡ Quickstart & Local Development

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 2. Setup & Execution

```powershell
# ── Terminal 1: Backend (Port 3001) ─────────────────────────────
cd "expense tracker\server"
npm install
npm run db:init            # Applies schema (idempotent, safe to rerun)
npm run db:seed            # Seeds demo user + system categories
npm start                  # ✔ Expense Tracker API listening on http://localhost:3001

# ── Terminal 2: Frontend (Port 4200) ────────────────────────────
cd "expense tracker\client"
npm install
npm start                  # ✔ Compiled successfully → open http://localhost:4200
```

*Demo Login:* `demo@expense.test` / `demo1234`

### 3. Environment Variables (`server/.env`)

```ini
PORT=3001
NODE_ENV=development
JWT_SECRET=super_secret_production_key_32chars_min
JWT_EXPIRES=7d
CORS_ORIGIN=http://localhost:4200
DB_PATH=../db/expense-tracker.db
TURSO_DATABASE_URL=libsql://expense-tracker-ravidaliparthy.aws-us-east-2.turso.io
TURSO_AUTH_TOKEN=your_turso_auth_token_here
```

---

## 📡 API Endpoint Reference

Base URL: `http://localhost:3001/api` (Local) or `https://expense-tracker-ai6g.onrender.com/api` (Production).

All endpoints except `POST /auth/register`, `POST /auth/login`, and `GET /health` require the header:  
`Authorization: Bearer <token>`

### 1. System Health
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Heartbeat endpoint returning `{ ok: true, db: "sqlite", ts: 1791... }` |

### 2. Authentication (`/api/auth`)
| Method | Endpoint | Payload | Response |
|---|---|---|---|
| `POST` | `/auth/register` | `{ email, password>=8, displayName, timezone, baseCurrency }` | `201 { token, user }` (Auto-seeds system categories) |
| `POST` | `/auth/login` | `{ email, password }` | `200 { token, user }` |
| `GET` | `/auth/me` | — | `200 { user }` |
| `POST` | `/auth/onboarding/complete` | — | `200 { ok: true }` (Sets `is_first_login = 0`) |

### 3. Categories (`/api/categories`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/categories` | Returns categories (omits archived/deleted by default) |
| `POST` | `/categories` | `{ name, colorHex, icon }` — Creates a custom category |
| `PATCH` | `/categories/:id` | `{ name?, colorHex?, icon?, isArchived? }` — Updates category |
| `DELETE` | `/categories/:id` | **Soft-deletes** category (Sets `deleted_at`, never damages past transactions) |

### 4. Expenses (`/api/expenses`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/expenses` | Query filters: `from`, `to`, `categoryIds`, `minAmount`, `maxAmount`, `q`, `page`, `pageSize`, `sort` |
| `POST` | `/expenses` | `{ clientUuid?, amountCents, kind, occurredAt, categoryId?, merchant?, notes? }` |
| `PATCH` | `/expenses/:id` | Updates expense with optimistic concurrency locking (`baseVersion`) |
| `DELETE` | `/expenses/:id` | **Soft-deletes** expense |
| `POST` | `/expenses/restore/:id` | Restores a soft-deleted expense |

### 5. Budgets (`/api/budgets`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/budgets` | `?period=monthly&year=2026&month=10` — Lists budgets with joined category labels |
| `PUT` | `/budgets` | `{ categoryId?, period, periodYear, periodMonth, amountCents, warnPct, critPct, overPct }` — Upserts budget |
| `DELETE` | `/budgets/:id` | Removes configured budget |

### 6. Analytics (`/api/analytics`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/analytics/summary` | Returns total spend, total income, net savings, average transaction, top categories |
| `GET` | `/analytics/trends` | `?groupBy=day|week|month|year` — Returns bucketed time-series data for polylines |
| `GET` | `/analytics/budget-status` | Returns calculated status tiers (`ok`, `warning`, `critical`, `exceeded`) and daily burn rates |

### 7. Export (`/api/export`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/export/csv` | Streams CSV export attachment strictly scoped to the active filters |
| `GET` | `/export/pdf` | Generates a binary executive multi-page PDF summary with KPI cards & budget bars |

### 8. Batch Synchronization (`/api/sync`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/sync/batch` | `{ deviceId?, mutations: [ { clientUuid, op: 'create'|'update'|'delete', payload } ] }` (Max 500 items, atomic transaction) |

---

## 🗄️ Database Schema & Relational Model

File: [`db/schema.sql`](file:///c:/Users/Ravi%20Daliparthy/Desktop/expense%20tracker/db/schema.sql). SQLite & libSQL compatible.

```
users 1───* categories 1───* expenses *───1 categories (ON DELETE SET NULL)
  │                              │
  └───* budgets (category_id NULL = GLOBAL budget)
  └───* audit_log
```

| Table | Primary Columns | Purpose & Design Constraints |
|---|---|---|
| `users` | `id`, `email`, `password_hash`, `timezone`, `base_currency`, `is_first_login`, `deleted_at` | Primary account record. Timezone drives timezone-safe `local_date` derivation. |
| `categories` | `id`, `user_id`, `name`, `color_hex`, `icon`, `is_system`, `is_archived`, `deleted_at` | User and system departments. Soft-deleted with partial uniqueness index. |
| `expenses` | `id`, `user_id`, `category_id`, `category_name_snapshot`, `category_color_snapshot`, `amount_cents`, `currency`, `kind`, `occurred_at_utc`, `local_date`, `tz_offset_minutes`, `merchant`, `notes`, `client_uuid`, `sync_version`, `deleted_at` | Core ledger. Integer cents, dual UTC/local date storage, snapshot resilience, idempotency UUIDs. |
| `budgets` | `id`, `user_id`, `category_id`, `period`, `period_year`, `period_month`, `amount_cents`, `warn_pct`, `crit_pct`, `over_pct` | Spending caps. Supports both global and per-category limits with custom warning tiers. |
| `audit_log` | `id`, `user_id`, `entity_type`, `entity_id`, `action`, `payload`, `created_at` | Immutable audit trail tracking every insert, update, soft-delete, and restore. |

---

## 🌐 Production Deployment Guide

### Step 1: Deploy Backend to Render
1. Create a new **Web Service** on [Render.com](https://render.com) connected to your GitHub repository.
2. Settings:
   - **Root Directory**: `server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
3. Environment Variables:
   - `NODE_ENV`: `production`
   - `JWT_SECRET`: *(32+ character random string)*
   - `CORS_ORIGIN`: `*`
   - `TURSO_DATABASE_URL`: `libsql://expense-tracker-ravidaliparthy.aws-us-east-2.turso.io`
   - `TURSO_AUTH_TOKEN`: *(Your Turso JWT auth token)*

### Step 2: Deploy Frontend to Vercel
1. Create a new Project on [Vercel.com](https://vercel.com) importing the repository.
2. Settings:
   - **Framework Preset**: `Angular`
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist/client`
3. The repository includes [`client/vercel.json`](file:///c:/Users/Ravi%20Daliparthy/Desktop/expense%20tracker/client/vercel.json) pre-configured to proxy `/api/*` requests to Render with zero CORS issues.

---

## 🧪 Verification & Automated Test Suites

All components are rigorously tested with automated test suites:

| Suite | Command | Passing Tests | Validated Features |
|---|---|---|---|
| **Client Unit Tests** | `npm test` in `client` | ✅ **13 of 13 PASS** | AuthService, FilterService, OfflineQueueService, BudgetStatus tier math |
| **Server Integration Tests** | `npm test` in `server` | ✅ **21 of 21 PASS** | Auth, Categories, Expenses, Budgets, Analytics, Export, Sync, Rate limiting |
| **Production Build** | `npm run build` in `client` | ✅ **0 ERRORS** | Tree-shaken, gzipped production bundle (~86 kB initial transfer) |
| **Turso Cloud Persistence** | Live libSQL verification | ✅ **VERIFIED** | Cloud schema applied, multi-user records hydrated, instant background push |

---

## 📂 Project File Map

```
expense-tracker/
├── README.md                     ← Master documentation, architecture, API reference, deployment guides
├── .gitignore                    ← Comprehensive gitignore (excludes node_modules, dist, .db binaries, logs)
├── db/
│   ├── schema.sql                ← Master database schema (tables, triggers, foreign keys, indexes)
│   └── seed-data.json            ← Offline seed fallback data
├── server/
│   ├── package.json              ← Server dependencies (@libsql/client, better-sqlite3, express, zod, etc.)
│   ├── test.js                   ← 21 comprehensive API integration tests
│   └── src/
│       ├── index.js              ← Express bootstrap, Helmet, CORS, rate limiting, error handler
│       ├── db.js                 ← SQLite WAL connection + startup syncFromTursoToLocal()
│       ├── seed.js               ← Demo user & category seeder
│       ├── lib/
│       │   ├── turso.js          ← Turso Cloud client, syncFromTursoToLocal(), background pushToTurso()
│       │   ├── time.js           ← Timezone derivation, localDateInTz, monthRange, yearRange
│       │   ├── money.js          ← Integer cents math (toCents, fromCents, formatCents)
│       │   └── validate.js       ← Zod validation schemas
│       ├── middleware/auth.js    ← JWT sign & verify with requireAuth guard
│       ├── services/budgetStatus.js ← Server-side budget tier calculations
│       └── routes/               ← auth, categories, expenses, budgets, analytics, export, sync
└── client/
    ├── package.json · angular.json · proxy.conf.json · tsconfig*
    ├── vercel.json               ← Vercel deployment configuration (SPA routing & API rewrites)
    └── src/
        ├── main.ts               ← Standalone application bootstrapper
        ├── styles.scss           ← Vanilla SCSS design system (light/dark mode, glassmorphism)
        └── app/
            ├── app.component.ts  ← Shell (topbar, navigation dock, dark mode toggle, tour trigger)
            ├── app.routes.ts     ← Lazy standalone routes with auth guards
            ├── core/             ← Models, api, auth, filter, offline queue, keep-alive services
            └── features/
                ├── auth/login.page.ts
                ├── dashboard/    ← page, filter-bar (10-yr calendar, horizontal categories), table, form
                ├── transactions/transactions.page.ts ← Dedicated transaction manager with sort/search
                ├── onboarding/onboarding-overlay.component.ts ← 7-step interactive coach mark tour
                ├── categories/categories.page.ts    ← Custom categories with emoji picker & color swatches
                └── budgets/budgets.page.ts          ← Monthly/yearly budgets with interactive gauges
```

---

## 📄 License

This project is licensed under the **MIT License**. Free for personal and commercial use.
