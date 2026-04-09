# Hexamatics Group — Finance Dashboard

Live multi-entity financial dashboard powered by Zoho Books, built with Next.js 14 + Vercel.
Auto-refreshes every 30 minutes via Vercel Cron. Covers 9 Hexamatics Group entities.

---

## Features

- **Live Zoho Books data** across 9 entities (MY, SG, NP, ID, PH, MM, BD)
- **Auto-refresh every 30 min** via Vercel Cron — no manual action needed
- **4 dashboard views**: Overview · Collections & AR Aging · Entity Detail · Top Customers
- **Board view** (`/board`) — dark-mode simplified view for T1/T2, password-protected
- **MYR consolidation** — all entities normalised to MYR equivalent for group-level reporting
- **One-click manual refresh** — force-refresh from the UI header

---

## Tech Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 14 (App Router) |
| Hosting | Vercel (free tier) |
| Scheduling | Vercel Cron Jobs (every 30 min) |
| Charts | Chart.js + react-chartjs-2 |
| Styling | Tailwind CSS |
| Data source | Zoho Books API v3 (OAuth 2.0) |
| Auth | Zoho refresh_token (server-side, silent) |

---

## Deployment — Step by Step

### Step 1: Register Zoho API credentials

1. Go to **https://api-console.zoho.com**
2. Click **Add Client → Server-based Application**
3. Set:
   - **Client Name**: Hexamatics Dashboard
   - **Homepage URL**: `https://your-app.vercel.app`
   - **Authorized Redirect URIs**: `https://your-app.vercel.app/api/auth/zoho/callback`
4. Copy your **Client ID** and **Client Secret**

### Step 2: Get your Refresh Token (one-time)

1. Deploy to Vercel first (Step 3 below) with dummy token values
2. Visit: `https://your-app.vercel.app/api/auth/zoho/callback`
3. Click **"Connect Zoho Books"** — this opens the Zoho consent screen
4. Authorise all Books organisations
5. You will be redirected back with your **refresh_token** displayed on screen
6. Copy it — you only need to do this once

### Step 3: Deploy to Vercel

```bash
# 1. Push to GitHub
git init
git add .
git commit -m "Initial dashboard"
git remote add origin https://github.com/YOUR_ORG/hexamatics-dashboard.git
git push -u origin main

# 2. Go to https://vercel.com/new
# 3. Import your GitHub repo
# 4. Vercel auto-detects Next.js — click Deploy
```

### Step 4: Set Environment Variables in Vercel

Go to **Vercel Dashboard → Your Project → Settings → Environment Variables** and add:

| Key | Value | Notes |
|---|---|---|
| `ZOHO_CLIENT_ID` | your client ID | From api-console.zoho.com |
| `ZOHO_CLIENT_SECRET` | your client secret | From api-console.zoho.com |
| `ZOHO_REFRESH_TOKEN` | your refresh token | From Step 2 above |
| `ZOHO_DC` | `com` | Data center (com / eu / in / com.au) |
| `DASHBOARD_PASSWORD` | e.g. `hexamatics2026` | Board view password |
| `SESSION_SECRET` | random 32-char string | Run: `openssl rand -base64 32` |
| `CRON_SECRET` | random string | Protects the cron endpoint |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | Your Vercel URL |

After setting variables: **Vercel → Deployments → Redeploy**

### Step 5: Verify the Cron

The cron job (`vercel.json`) runs every 30 minutes automatically.
To verify: **Vercel Dashboard → Your Project → Cron Jobs** tab.

---

## Local Development

```bash
# Install dependencies
npm install

# Copy env file
cp .env.local.example .env.local
# Fill in your credentials

# Run dev server
npm run dev
# Open http://localhost:3000
```

---

## Updating Date Ranges

To change from Jan–Feb 2026 to a different period, update two places:

**`src/app/dashboard/page.tsx`** line:
```ts
const data = await getCachedGroupSummary(2026, [1, 2])
```
Change `[1, 2]` to e.g. `[1, 3]` for Jan–Mar, or `[3]` for March only.

**`src/app/api/zoho/refresh-cache/route.ts`** — same change for the cron.

---

## Adding / Removing Entities

Edit **`src/lib/orgs.ts`** — add or remove entries from the `ORGS` array.
To update FX rates, edit the `fxToMyr` field per org.

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── zoho/
│   │   │   ├── dashboard/route.ts        ← GET  /api/zoho/dashboard
│   │   │   └── refresh-cache/route.ts   ← GET  /api/zoho/refresh-cache (cron)
│   │   └── auth/zoho/callback/route.ts  ← One-time OAuth setup
│   ├── dashboard/page.tsx               ← Main dashboard (server component)
│   ├── board/page.tsx                   ← Board view (password protected)
│   └── layout.tsx
├── components/
│   ├── DashboardClient.tsx              ← Tab-based client dashboard
│   ├── KpiCard.tsx
│   ├── RefreshButton.tsx
│   ├── EntityTable.tsx
│   ├── CollectionsPanel.tsx
│   ├── TopCustomersPanel.tsx
│   └── charts/
│       ├── RevenueBarChart.tsx
│       ├── MonthlyCompareChart.tsx
│       ├── StatusDonutChart.tsx
│       └── ArAgingChart.tsx
├── lib/
│   ├── zoho-auth.ts                     ← Token refresh + fetch wrapper
│   ├── zoho-data.ts                     ← Multi-entity aggregation logic
│   ├── cache.ts                         ← 30-min cache layer
│   ├── orgs.ts                          ← Entity config (single source of truth)
│   └── format.ts                        ← Number formatters
└── types/index.ts                       ← All TypeScript types
```

---

## IPO Due Diligence Notes

For Bursa ACE Market due diligence purposes:
- FX rates are **indicative** — replace `fxToMyr` in `src/lib/orgs.ts` with auditor-agreed rates
- The dashboard shows invoice-date revenue, not accrual — align with your IFRS 15 treatment
- Collection rate figures are point-in-time; AR aging uses `due_date` from Zoho Books
- Export functionality can be added to the entity table if needed for data rooms

---

## Support

For Zoho API limits: https://www.zoho.com/books/api/v3/  
For Vercel Cron: https://vercel.com/docs/cron-jobs  
Project built by Hexamatics Group Finance · Praphulla Subedi, CFE
