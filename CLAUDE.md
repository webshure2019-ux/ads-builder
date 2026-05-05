# Ads Builder — Developer Reference

> **Audience:** Developers and AI agents working on this codebase. This file is the canonical source of truth for how the app works. Keep it updated whenever features are added or changed.

---

## Table of Contents

1. [What This App Does](#1-what-this-app-does)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Environment Variables](#4-environment-variables)
5. [Authentication](#5-authentication)
6. [How to Run](#6-how-to-run)
7. [Pages & Routing](#7-pages--routing)
8. [API Routes](#8-api-routes)
9. [Google Ads API Layer (`lib/google-ads.ts`)](#9-google-ads-api-layer)
10. [Dashboard Components](#10-dashboard-components)
11. [Campaign Drill-Down Tabs](#11-campaign-drill-down-tabs)
12. [Data Flow Patterns](#12-data-flow-patterns)
13. [Key Architectural Decisions](#13-key-architectural-decisions)
14. [Feature Walkthroughs](#14-feature-walkthroughs)
15. [Known Limitations & Gotchas](#15-known-limitations--gotchas)
16. [Testing](#16-testing)

---

## 1. What This App Does

**Ads Builder** is an internal Google Ads management tool for agencies managing multiple client accounts under a single MCC (Manager Customer Center). It provides:

- A **Client Dashboard** — per-account analytics, budgets, campaigns, anomaly alerts, impression share analysis, device performance, landing page health, change history, and PDF client reports.
- A **Campaign Builder** (`/campaigns`) — AI-assisted campaign creation with keyword suggestions, RSA ad copy generation via Claude AI, and direct campaign publishing to Google Ads.
- An **MCC Overview** (`/mcc`) — cross-account leaderboard with aggregate spend, CTR, ROAS, and budget utilisation.
- **Campaign management** — pause/enable campaigns, adjust budgets inline, clone campaigns, save templates.
- **Keyword management** — add, pause, enable, remove keywords; add negative keywords; view search terms and convert them to keywords.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Charts | Recharts 3 |
| Google Ads | `google-ads-api` v23 (GAQL) |
| AI / Copy | `@anthropic-ai/sdk` (Claude) |
| Database | Supabase (Postgres) via `@supabase/supabase-js` |
| Scraping | `cheerio` (landing page scraper) |
| Auth | HMAC-SHA-256 session cookie (no third-party auth) |
| Testing | Jest + Testing Library |
| Deployment | Vercel |

---

## 3. Project Structure

```
Ads Builder/
├── app/
│   ├── layout.tsx                  # Root layout — fonts, global CSS
│   ├── page.tsx                    # Home → redirects to /dashboard (main entry)
│   ├── login/page.tsx              # Password login page
│   ├── campaigns/page.tsx          # Campaign builder page
│   ├── mcc/page.tsx                # MCC overview page
│   └── api/                        # All Next.js API routes (see §8)
│
├── components/
│   ├── Nav.tsx                     # Top navigation bar (links: Dashboard, Campaigns, MCC)
│   └── dashboard/
│       ├── ClientDashboard.tsx     # Main dashboard shell — date range, client selector, stats
│       ├── CampaignsTable.tsx      # Sortable campaigns list with inline drill-down
│       ├── CampaignDrillDown.tsx   # Per-campaign tabs (ad groups, ads, keywords, etc.)
│       ├── BudgetPacingSection.tsx # Daily budget pacing progress bars
│       ├── ImpressionShareSection.tsx  # IS breakdown — won/rank-lost/budget-lost
│       ├── DevicePerformanceSection.tsx # Device cards with bid adjustment suggestions
│       ├── LandingPageSection.tsx  # Landing page health — speed, mobile, CVR flags
│       ├── AnomalyAlertsSection.tsx # Automated anomaly detection alerts
│       ├── ChangeHistorySection.tsx # Campaign change log from Google Ads
│       ├── ClientReportSection.tsx  # One-click PDF client report
│       ├── AccountHealthScore.tsx  # Composite health score widget
│       ├── HeatmapTab.tsx          # Hourly/day-of-week performance heatmap
│       ├── KeywordsTab.tsx         # Keyword management tab
│       ├── NegativeKeywordsTab.tsx # Negative keyword management tab
│       ├── SearchTermsTab.tsx      # Search terms report + add as keyword
│       ├── RSACopyTab.tsx          # RSA headline/description asset performance
│       ├── ABTestingTab.tsx        # Statistical A/B test between ads
│       ├── MCCDashboard.tsx        # Cross-account overview component
│       └── CampaignCloneModal.tsx  # Clone modal + templates panel
│
├── lib/
│   ├── google-ads.ts              # All Google Ads API calls (GAQL queries)
│   ├── auth.ts                    # HMAC session token + requireAuth helper
│   └── supabase.ts                # Supabase client initialisation
│
├── types/
│   └── index.ts                   # Shared TypeScript types (Keyword, CampaignSettingsData, etc.)
│
├── public/                        # Static assets
├── tailwind.config.ts             # Custom colours: navy, teal, cloud, mist, cyan
├── tsconfig.json
└── CLAUDE.md                      # ← You are here
```

---

## 4. Environment Variables

All secrets live in `.env.local` (never committed). Required variables:

```bash
# Authentication
TOOL_PASSWORD=<your-login-password>
SESSION_SECRET=<random-secret-for-HMAC-signing>

# Google Ads API (OAuth2 — service account style)
GOOGLE_ADS_CLIENT_ID=<OAuth2 client ID>
GOOGLE_ADS_CLIENT_SECRET=<OAuth2 client secret>
GOOGLE_ADS_REFRESH_TOKEN=<long-lived refresh token>
GOOGLE_ADS_DEVELOPER_TOKEN=<Google Ads developer token>
GOOGLE_ADS_MCC_CUSTOMER_ID=<MCC account ID, e.g. 123-456-7890>

# Anthropic Claude (AI copy generation)
ANTHROPIC_API_KEY=<Anthropic API key>

# Supabase (optional — used for campaign data persistence)
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service role key>
```

### Vercel Deployment
Set all of the above in Vercel → Project Settings → Environment Variables. `SESSION_SECRET` must be set there too — it is not in the repo.

---

## 5. Authentication

**Single-password HMAC session cookie** — no user accounts.

### How it works
1. User visits `/login`, enters `TOOL_PASSWORD`.
2. `/api/auth` verifies the password, computes `HMAC-SHA-256(TOOL_PASSWORD, SESSION_SECRET)`, and sets the `ads-auth` cookie with that derived token (HttpOnly, SameSite=Lax, 30-day expiry).
3. Every API route calls `await requireAuth(request)` from `lib/auth.ts`. If the cookie is missing or invalid → 401.
4. The raw password is **never** stored in the cookie — only the HMAC-derived token.

### Middleware
`middleware.ts` checks the `ads-auth` cookie and redirects unauthenticated users to `/login` for all non-API routes.

---

## 6. How to Run

```bash
# Install dependencies
npm install

# Development server (hot reload)
npm run dev          # → http://localhost:3000

# Production build
npm run build
npm run start

# Type checking
npx tsc --noEmit

# Tests
npm test
```

### First-time setup
1. Copy `.env.local.example` to `.env.local` and fill in all values.
2. Ensure your Google Ads OAuth2 refresh token has access to the MCC.
3. `npm run dev` → navigate to `http://localhost:3000` → login with `TOOL_PASSWORD`.

---

## 7. Pages & Routing

| Route | Page | Description |
|---|---|---|
| `/` | `app/page.tsx` | Redirects to dashboard (main entry point) |
| `/login` | `app/login/page.tsx` | Password login form |
| `/campaigns` | `app/campaigns/page.tsx` | AI-assisted campaign builder |
| `/mcc` | `app/mcc/page.tsx` | MCC cross-account overview |
| `/dashboard` | Embedded in `/` via `ClientDashboard` | Main analytics dashboard |

All pages use `export const dynamic = 'force-dynamic'` to prevent static caching of auth-gated content.

---

## 8. API Routes

All routes require the `ads-auth` cookie (via `requireAuth`). All return JSON.

### Stats & Reporting

| Route | Method | Description |
|---|---|---|
| `GET /api/stats` | GET | Account-level metrics (spend, clicks, impressions, CTR, CPC, conv, ROAS) for a date range. Returns `DailyMetrics[]` + aggregate `AccountStats`. |
| `GET /api/campaign-stats` | GET | Per-campaign metrics for a date range. Returns `CampaignMetrics[]`. |
| `GET /api/campaigns` | GET | All campaigns (current state — status, budget, type). No date range needed. |
| `GET /api/conversion-breakdown` | GET | Conversion actions breakdown for the account. |
| `GET /api/hourly-performance` | GET | Impressions/clicks/conversions by hour-of-day and day-of-week. |
| `GET /api/device-performance` | GET | Metrics segmented by device (DESKTOP, MOBILE, TABLET). |
| `GET /api/landing-page-performance` | GET | Per-URL metrics from `landing_page_view` resource. |
| `GET /api/mcc-summary` | GET | Fans out to all MCC child accounts via `Promise.allSettled`. Returns per-account summary array. |

### Campaign Management

| Route | Method | Description |
|---|---|---|
| `POST /api/campaign-status` | POST | Enable or pause a campaign. Body: `{ client_account_id, campaign_id, action: 'ENABLED' \| 'PAUSED' }` |
| `POST /api/campaign-budget` | POST | Update campaign daily budget. Body: `{ client_account_id, campaign_id, daily_budget_micros }` |
| `POST /api/clone-campaign` | POST | Clone a campaign as PAUSED with a new name. Body: `{ client_account_id, campaign_id, new_name }`. Returns `{ newCampaignId }`. |

### Ad Groups & Ads

| Route | Method | Description |
|---|---|---|
| `GET /api/ad-groups` | GET | Ad groups for a campaign. |
| `POST /api/ad-group-status` | POST | Enable or pause an ad group. |
| `GET /api/ads` | GET | Ads for a campaign or ad group (includes RSA asset details). |
| `POST /api/ad-status` | POST | Enable or pause an ad. |
| `GET /api/asset-groups` | GET | Asset groups for a PMax campaign. |
| `GET /api/ad-assets` | GET | RSA headline/description asset performance for a specific ad. |

### Keywords & Search Terms

| Route | Method | Description |
|---|---|---|
| `GET /api/keywords` | GET | Keywords for a campaign with QS, match type, bid, metrics. |
| `POST /api/keyword-status` | POST | Enable or pause a keyword. |
| `GET /api/search-terms` | GET | Search terms report for a campaign. |
| `GET /api/negative-keywords` | GET | Campaign-level negative keywords. |

### Change History

| Route | Method | Description |
|---|---|---|
| `GET /api/change-history` | GET | Change events for a campaign (last 30 days max, Google Ads limitation). |

### Campaign Builder (AI-Assisted)

| Route | Method | Description |
|---|---|---|
| `POST /api/generate` | POST | Claude AI generates RSA headlines/descriptions + ad copy from campaign settings. |
| `POST /api/publish` | POST | Publishes a complete campaign (Search or PMax) to Google Ads. |
| `POST /api/scrape` | POST | Scrapes a landing page URL and returns extracted copy for AI input. |
| `GET /api/clients` | GET | Lists all MCC child accounts (id + name). |

### Auth

| Route | Method | Description |
|---|---|---|
| `POST /api/auth` | POST | Validates password, sets `ads-auth` cookie. |

---

## 9. Google Ads API Layer

**File:** `lib/google-ads.ts`

All Google Ads queries go through this file. Uses the `google-ads-api` v23 npm package with GAQL (Google Ads Query Language).

### Client Factories

```typescript
makeClient()            // Creates GoogleAdsApi instance from env vars
getMccCustomer()        // Returns MCC-level Customer (for listMccClients, keyword ideas)
getClientCustomer(id)   // Returns child-account Customer (for all client queries)
```

### Input Validation

All functions validate inputs before querying:
- `cleanId(id)` — strips dashes, ensures 8–12 digits
- `validateDate(date, label)` — enforces `YYYY-MM-DD` format
- `validateCampaignId(id)` — ensures numeric string

### Exported Functions

| Function | Description |
|---|---|
| `listMccClients()` | Lists all enabled child accounts under the MCC |
| `getKeywordSuggestions(seeds)` | Keyword Planner ideas from seed keywords |
| `publishSearchCampaign(settings)` | Creates a full Search campaign with ad group, ads, keywords |
| `publishPMaxCampaign(settings)` | Creates a Performance Max campaign with asset group |
| `getClientStats(id, start, end)` | Account-level daily metrics + aggregate totals |
| `getClientCampaigns(id, start, end)` | Per-campaign metrics including IS, rank-lost IS, budget-lost IS |
| `getConversionBreakdown(id, start, end)` | Conversion actions with values |
| `getAdGroups(id, campaignId, start, end)` | Ad group metrics |
| `getAds(id, campaignId, start, end)` | Ad-level metrics including RSA asset details and conversions |
| `getAdAssetPerformance(id, adId)` | Per-asset performance for a specific RSA ad |
| `updateRSA(id, adId, adGroupId, headlines, descs)` | Updates RSA headlines/descriptions |
| `getAssetGroups(id, campaignId)` | PMax asset groups |
| `getSearchTerms(id, campaignId, start, end)` | Search terms report |
| `getKeywords(id, campaignId, start, end)` | Keywords with QS, bids, metrics |
| `setKeywordStatus(id, keywordId, adGroupId, status)` | Enable/pause keyword |
| `getCampaignNegatives(id, campaignId)` | Campaign-level negative keywords |
| `addCampaignNegative(id, campaignId, text, matchType)` | Add a negative keyword |
| `removeCampaignNegative(id, criterionId)` | Remove a negative keyword |
| `getDevicePerformance(id, start, end)` | Metrics segmented by device type |
| `getLandingPagePerformance(id, start, end)` | Landing page metrics (speed, mobile, CVR) |
| `getHourlyPerformance(id, campaignId, start, end)` | Hour-of-day / day-of-week heatmap data |
| `getChangeHistory(id, campaignId, start, end)` | Campaign change events (max 30-day window) |
| `setCampaignBudget(id, campaignId, microAmount)` | Update campaign daily budget |
| `setAdGroupStatus(id, adGroupId, status)` | Enable/pause ad group |
| `setAdStatus(id, adId, adGroupId, status)` | Enable/pause ad |
| `setCampaignStatus(id, campaignId, action)` | Enable/pause campaign |
| `cloneCampaign(id, campaignId, newName)` | Clone campaign as PAUSED — creates new budget + campaign |

### GAQL Two-Query Pattern

**Critical rule:** Google Ads API forbids mixing segmented metrics (e.g. `segments.device`) with current-state fields (e.g. `campaign.status`) in the same query. The codebase handles this by:

1. **Query 1 (current state):** Fetches `campaign.status`, `campaign.budget.amount_micros`, etc. — no date range, no segments.
2. **Query 2 (metrics):** Fetches `metrics.*` with `segments.date` or `segments.device` — scoped to the date range.

Results are joined by `campaign_id` in a `Map`. See `getClientCampaigns()` for the canonical example.

---

## 10. Dashboard Components

### `ClientDashboard.tsx` — Main Shell

The top-level dashboard component. Manages:
- **Client selector** — dropdown populated from `/api/clients`
- **Date range presets** — Last 7 / 14 / 28 / 90 days, this month, last month, custom
- **Compare mode** — toggles fetching the previous equivalent period for delta comparisons
- **Stats fetch** — `fetchStats()` calls `/api/stats` (current + optionally previous period) + `/api/campaign-stats` in parallel using `Promise.all`
- **State:** `stats`, `compareStats`, `prevStats`, `campaigns`, `loading`, `error`

#### `prevStats` vs `compareStats`
- `compareStats` — previous period data shown in the UI as comparison deltas (only when compare mode is ON)
- `prevStats` — always fetched in the background for anomaly detection (even when compare mode is OFF)

#### `fetchStats` bug fix (important)
When `doCompare=true`, `cRes` IS the same resolved `Response` as `prevFetch`. The body is read once (`await cRes.json()`) and the result is shared for both `setCompareStats` and `setPrevStats`. **Never** call `.json()` twice on the same Response — the body stream is consumed on first read.

### `CampaignsTable.tsx` — Campaigns List

Sortable table of all campaigns. Features:
- Sort by any metric column
- Inline column picker (show/hide metrics)
- Per-row toggle: pause/enable campaign
- Per-row budget editing (inline input, saves on Enter/blur)
- Per-row clone button (📋) → opens `CampaignCloneModal`
- "Templates" button → opens `CampaignTemplatesPanel`
- Click campaign row → expands `CampaignDrillDown` inline below

**Column count:** Campaign + Status + Daily Budget + `visibleCols.length` (dynamic) + Actions + Clone = `visibleCols.length + 5` fixed columns. The drill-down `<td colSpan>` must use `visibleCols.length + 5`.

### `BudgetPacingSection.tsx`

Progress bars showing how much of each campaign's monthly budget has been spent based on day-of-month pacing. Flags over-pacing (>110%) and under-pacing (<80%) campaigns.

### `ImpressionShareSection.tsx`

Collapsible section. Shows per-campaign impression share breakdown:
- **Won IS** — impressions where ad actually showed
- **Rank-Lost IS** — lost due to low Ad Rank
- **Budget-Lost IS** — lost due to budget constraints

Stacked bar chart. Attention alerts for campaigns with >40% lost IS. Sortable table.

### `DevicePerformanceSection.tsx`

Three device cards: Desktop, Mobile, Tablet. Each shows clicks, conversions, conv. rate vs account average. Suggests bid adjustment direction (increase/decrease) based on relative conv. rate.

### `LandingPageSection.tsx`

Fetches from `/api/landing-page-performance`. Per-URL table with flags:
- 🐢 Speed score < 50
- 📱 Mobile-friendly % < 70%
- 💸 CVR below account average
- ⚠️ Zero conversions with meaningful traffic
- 📄 Avg page views close to 1 (possible bounce issue)

### `AnomalyAlertsSection.tsx`

Runs entirely client-side using `useMemo` over `stats.daily` and `prevStats`. Four detection types:

1. **Period-over-period spike** — compares current vs previous period totals with configurable % thresholds
2. **Z-score intra-period spike** — computes z-score of last 3 days against the rest of the period; flags if |z| > 2
3. **Dark campaigns** — campaigns with status=ENABLED but zero impressions in last 7 days
4. **Budget overspend** — campaigns spending >150% of daily budget on any given day

Alerts are dismissible (stored in `Set` state via `Array.from()` pattern — see §15).

### `ChangeHistorySection.tsx`

Lazy-loads on first expand. Fetches from `/api/change-history` (max 30-day window). Groups events by date. Features:
- Type filter (budget, status, bid, targeting, etc.)
- Text search across event descriptions
- Expandable event rows showing old → new values
- `formatDateTime()` helper converts Google Ads datetime string to locale format

### `ClientReportSection.tsx`

Collapsed by default. On expand, renders a print-ready `ReportContent` panel with:
- Executive summary (date range, top-line KPIs, % changes vs previous period)
- Top 5 campaigns by spend table
- `generateInsights()` — auto-generates 3–5 text insights based on the data
- "Download PDF" button triggers `window.print()` with `@media print` CSS hiding the rest of the page

### `AccountHealthScore.tsx`

Composite 0–100 score computed from: CTR, conv. rate, impression share, quality score distribution, budget utilisation. Displayed as a circular gauge with colour-coded rating (Excellent / Good / Fair / Poor).

---

## 11. Campaign Drill-Down Tabs

`CampaignDrillDown.tsx` renders inline below a campaign row in the table. Available tabs depend on campaign type:

| Tab | Key | Available For | Description |
|---|---|---|---|
| Ad Groups | `groups` | All | Ad group metrics, enable/pause toggle |
| Keywords | `keywords` | Search, Display | Keyword list with QS, bids, match types |
| Negatives | `negatives` | Search, Display | Campaign-level negative keywords |
| Heatmap | `heatmap` | All | Hour-of-day / day-of-week performance grid |
| Devices | `devices` | All | `DevicePerformanceSection` scoped to campaign |
| RSA Copy | `rsa_copy` | Search only | Asset performance, copy suggestions |
| A/B Test | `ab_test` | Search only | Two-proportion z-test between ads |
| Changes | `changes` | All | `ChangeHistorySection` scoped to campaign |
| Search Terms | `search_terms` | Search only | Search terms report |

### `RSACopyTab.tsx`
- Lists all RSA ads in the campaign
- Per-ad `AssetPanel` lazy-loads `/api/ad-assets` on first expand
- Shows headline/description coverage bars (vs max 15/4)
- Asset performance dots: BEST (green) / GOOD (blue) / LOW (red) / PENDING
- `buildSuggestions()` checks for: DKI usage, duplicate assets, overly short copy, low-performing assets

### `ABTestingTab.tsx`
- Groups ads by `ad_group_id`
- Two-proportion z-test (`zTest()`) compares CTR and CVR between ads
- Shows confidence bars (0–100%) and winner/loser labels
- Recommendations: "Pause underperformer" if confidence > 95%

### `HeatmapTab.tsx`
- Fetches from `/api/hourly-performance`
- 7×24 grid (days × hours) coloured by impression intensity
- Click cell to see clicks + conv for that slot

### `SearchTermsTab.tsx`
- Fetches from `/api/search-terms`
- Shows search query, match type, clicks, conversions, cost
- "Add as keyword" button with match type selector

---

## 12. Data Flow Patterns

### Lazy Fetch with `useRef` guard

Used in `ChangeHistorySection`, `RSACopyTab`, `HeatmapTab`, and others to prevent double-fetching when a section is first expanded:

```typescript
const fetched = useRef('')    // key = campaignId+dateRange

useEffect(() => {
  const key = `${campaignId}-${start}-${end}`
  if (fetched.current === key) return
  fetched.current = key
  // ... fetch
}, [campaignId, start, end, isOpen])
```

### MCC Fan-Out with `Promise.allSettled`

`/api/mcc-summary` fetches stats for all client accounts in parallel. Uses `Promise.allSettled` so one failed account doesn't block the rest — failed accounts are skipped with a console warning.

### Response Body Single-Consumption

A `fetch()` Response body can only be read **once**. When reusing a Response across multiple state setters (e.g. `prevFetch` for both `compareStats` and `prevStats`), read `.json()` once and share the parsed object:

```typescript
if (cRes) {
  const prevData = await cRes.json()   // read once
  setCompareStats(prevData)            // share
  setPrevStats(prevData)               // share
}
```

### Set State with `Array.from()`

TypeScript `downlevelIteration` doesn't support spread on `Set` with some configs. Always use `Array.from()`:

```typescript
// ❌ Fails: new Set([...prev, id])
// ✅ Works:
setDismissed(prev => {
  const next = Array.from(prev)
  next.push(id)
  return new Set(next)
})
```

---

## 13. Key Architectural Decisions

### Why no state management library?
The app uses React `useState`/`useCallback`/`useMemo` only. State is co-located in `ClientDashboard` (parent) and passed down as props. No Redux/Zustand needed at current scale.

### Why HMAC cookie auth?
Single-tenant internal tool — one password, no user roles needed. HMAC ensures the cookie can't be forged even if someone knows the password derivation algorithm (they'd also need `SESSION_SECRET`).

### Why `force-dynamic`?
All pages are auth-gated. Next.js App Router would otherwise statically render them at build time, bypassing cookie checks. `force-dynamic` ensures every request runs server-side.

### Why `localStorage` for campaign templates?
Templates are a convenience feature tied to the browser session, not business-critical data. No server round-trip needed. Limited to 20 templates (oldest auto-pruned).

### Why `window.print()` for PDF reports?
Avoids a PDF generation library dependency. The `@media print` CSS hides all UI chrome, leaving only the `ReportContent` panel. Works across browsers. Users can "Save as PDF" from the print dialog.

---

## 14. Feature Walkthroughs

### Creating a Campaign (Campaign Builder)

1. Go to `/campaigns`
2. Select client account
3. Fill in: campaign name, budget, target location, language, keywords
4. Optionally paste landing page URL → "Scrape" extracts copy
5. Click "Generate" → Claude AI generates RSA headlines + descriptions
6. Review and edit generated copy
7. Click "Publish" → campaign goes live (ENABLED status)

### Cloning a Campaign

1. In Campaigns table, click the 📋 icon on any row
2. Edit the new campaign name in the modal
3. Click "Clone Campaign" → new campaign created as **PAUSED**
4. OR click "Save Template" to store the campaign config in localStorage without creating a new campaign
5. View/delete saved templates via the "💾 Templates" button in the table toolbar

### Running A/B Tests

1. Expand any Search campaign → click "A/B Test" tab
2. The tab groups ads by ad group
3. Statistical significance is computed via two-proportion z-test on CTR and CVR
4. Once confidence exceeds 95%, a recommendation appears to pause the underperformer

### Generating a Client Report

1. Select client + date range
2. Enable "Compare" toggle to include period-over-period data
3. Scroll to "Client Report" section → click "Generate Report Preview"
4. Review the auto-generated executive summary and insights
5. Click "Download PDF" → browser print dialog → "Save as PDF"

---

## 15. Known Limitations & Gotchas

### Google Ads API Limitations
- **Change history:** Max 30-day window per query (`change_event` resource restriction).
- **GAQL segmentation:** Cannot mix `segments.*` fields with current-state entity fields in one query. Use the two-query pattern (see §9).
- **Landing page data:** `landing_page_view` data can be delayed 24–48 hours.
- **PMax:** Keywords, RSA Copy, and A/B Test tabs are hidden for PMax campaigns — PMax doesn't expose individual ad/keyword data.

### Frontend Gotchas
- **Response body consumed once:** Never call `.json()` on the same Response object twice. Store the parsed result.
- **Set spread:** TypeScript config doesn't support `[...Set]`. Use `Array.from(set)`.
- **`colSpan` in CampaignsTable:** Drill-down row must use `visibleCols.length + 5` (Campaign + Status + Budget + Actions + Clone = 5 fixed columns + dynamic metric columns).
- **Double-fetch prevention:** All lazily-loaded sections use the `useRef` key guard to prevent re-fetching on re-render.

### Deployment
- All env vars must be set in Vercel — `.env.local` is never deployed.
- `SESSION_SECRET` must match between deployments (changing it invalidates all existing cookies).

---

## 16. Testing

```bash
npm test                   # Run all tests
npm test -- --watch        # Watch mode
npm test -- --coverage     # Coverage report
```

Test files live alongside source files or in `__tests__/` directories. Uses Jest with `jest-environment-jsdom` for React component tests and `@testing-library/react` for rendering.

Current test coverage is focused on utility functions in `lib/google-ads.ts` (validators, data transformers) and select component snapshots.

---

*Last updated: May 2026. Update this file whenever you add a new route, component, or change a core pattern.*
