# 📱 Expense Tracker Client (Frontend SPA & PWA)

The frontend client is an offline-first, standalone Angular 16 application utilizing reactive Signals, a custom SCSS design system, hand-crafted SVG data visualizations, and Progressive Web App (PWA) architecture.

---

## ⚡ Architecture Highlights

- **Framework**: Angular 16 Standalone Components (Zero `NgModule` boilerplate).
- **Reactivity Model**: Fine-grained reactive Angular Signals (`signal`, `computed`, `effect`).
- **Styling**: Vanilla SCSS Design System with CSS Custom Properties, glassmorphism, responsive navigation dock, and light/dark theme switching.
- **Charts**: Zero third-party chart dependencies. Trend polylines, category distribution bars, and donut charts are built from pure mathematical SVG coordinate calculations.
- **Offline Resilience**:
  - Service Worker (`@angular/service-worker`) shell caching.
  - `OfflineQueueService` queues mutations locally in `localStorage` (`et.offlineQueue`) with client-generated UUIDs.
  - Automatic background synchronization via `POST /api/sync/batch` when internet connectivity restores.
- **Keep-Alive Engine**:
  - `KeepAliveService` sends lightweight 10-minute heartbeat pings to prevent free-tier backend sleep.
  - Fires an instant pre-warm request when the user unlocks their device (`window.focus` / `visibilitychange`).
- **Onboarding Tour**:
  - 7-step interactive coach-mark tour with progress indicators, smooth auto-scrolling, mobile bottom-sheet docking, and keyboard controls.

---

## 🛠️ Local Development

```powershell
# Install client dependencies
npm install

# Start local development server with proxy configuration
npm start
# App available at http://localhost:4200 (proxies /api/* to http://localhost:3001)
```

---

## 🧪 Unit Testing & Building

```powershell
# Run client unit test suite (Karma / Headless Chrome)
npm test

# Build production bundle
npm run build
# Outputs tree-shaken, gzipped production assets to dist/client
```

---

## 🌐 Production Deployment (Vercel)

The client is configured for zero-configuration deployment on **Vercel**:
- Configuration file: [`vercel.json`](file:///c:/Users/Ravi%20Daliparthy/Desktop/expense%20tracker/client/vercel.json)
- Automatic SPA routing rewrites to `/index.html`.
- Edge reverse proxy routing `/api/(.*)` to the production Render backend (`https://expense-tracker-ai6g.onrender.com/api/$1`), completely eliminating browser CORS friction.
