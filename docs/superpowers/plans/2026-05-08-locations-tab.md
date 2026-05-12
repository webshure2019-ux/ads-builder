# Locations Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 📍 Locations tab to the campaign drill-down that shows all location targets with full performance metrics, allows inline bid modifier editing, adding locations by name search, removing targets, and shows rule-based optimisation suggestions.

**Architecture:** Five files: data functions appended to `lib/google-ads.ts`, a multi-method API route at `/api/location-targets`, a single-method search route at `/api/geo-target-search`, a `LocationsTab` component, and four small changes to `CampaignDrillDown.tsx`. Follows every existing codebase pattern: two-query GAQL join, `useRef('')` lazy fetch, `URLSearchParams` for fetch URLs, same spinner/error/retry as `HeatmapTab`.

**Tech Stack:** google-ads-api v23 (GAQL `FROM campaign_criterion`, `FROM location_view`, `FROM geo_target_constant`), Next.js 14 App Router, TypeScript, Tailwind CSS (navy/teal/cloud/mist/cyan palette).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `lib/google-ads.ts` | `LocationTargetRow` + `GeoTargetResult` interfaces, 5 new functions |
| Create | `app/api/geo-target-search/route.ts` | GET — search locations by name |
| Create | `__tests__/api/geo-target-search.test.ts` | Route validation tests |
| Create | `app/api/location-targets/route.ts` | GET / POST / DELETE / PATCH |
| Create | `__tests__/api/location-targets.test.ts` | Route validation tests |
| Create | `components/dashboard/LocationsTab.tsx` | Full tab component |
| Modify | `components/dashboard/CampaignDrillDown.tsx` | Register tab + render branch |

---

## Task 1: Data layer — 5 functions + 2 interfaces in `lib/google-ads.ts`

**Files:**
- Modify: `lib/google-ads.ts` (append after the `getAuctionInsights` block at the end of the file)

### Context
All functions in `lib/google-ads.ts` follow this pattern: validate inputs → `await getClientCustomer(clientAccountId)` → GAQL query → map results. The file uses `getMccCustomer()` (no client account needed) for global resources like geo target constants. The `(customer.campaignCriteria as any)` cast is required — the library types don't expose all methods. See `addCampaignNegative` (line ~1868) and `removeCampaignNegative` (line ~1879) for the exact mutation pattern. `CAMPAIGN_ID_RE` is already defined at line 622 as `/^\d+$/`.

- [ ] **Step 1: Append interfaces and all 5 functions to `lib/google-ads.ts`**

Find the very end of the file (after `getAuctionInsights`) and append:

```typescript
// ─── Location Targeting ───────────────────────────────────────────────────────
export interface LocationTargetRow {
  criterionId:   string   // campaign_criterion.criterion_id
  geoTargetId:   string   // numeric ID extracted from geo_target_constant resource name
  name:          string   // e.g. "Cape Town"
  canonicalName: string   // e.g. "Cape Town, Western Cape, South Africa"
  targetType:    string   // "City" | "Province" | "Country" | "Region" etc.
  countryCode:   string   // "ZA" | "US" etc.
  negative:      boolean  // true = excluded location
  bidModifier:   number   // 1.0 = no adj, 1.2 = +20%, 0.8 = -20%
  clicks:        number
  impressions:   number
  cost:          number   // in account currency units (not micros)
  conversions:   number
  convRate:      number   // 0-100 %
  cpa:           number   // cost / conversions; 0 if no conversions
  roas:          number   // conversions_value / cost; 0 if no cost
}

export interface GeoTargetResult {
  id:            string
  name:          string
  canonicalName: string
  countryCode:   string
  targetType:    string
}

export async function getLocationTargets(
  clientAccountId: string,
  campaignId: string,
  startDate: string,
  endDate: string,
): Promise<LocationTargetRow[]> {
  validateDate(startDate, 'start_date')
  validateDate(endDate, 'end_date')
  validateCampaignId(campaignId)
  if (startDate > endDate) throw new Error('start_date must be before end_date')

  const customer = await getClientCustomer(clientAccountId)

  // Query 1 — current-state targets (no date range, no segments)
  const criteriaRows = await customer.query(`
    SELECT
      campaign_criterion.criterion_id,
      campaign_criterion.location.geo_target_constant,
      campaign_criterion.bid_modifier,
      campaign_criterion.negative,
      campaign_criterion.status
    FROM campaign_criterion
    WHERE campaign.id = ${campaignId}
      AND campaign_criterion.type = 'LOCATION'
      AND campaign_criterion.status != 'REMOVED'
  `) as any[]

  if (criteriaRows.length === 0) return []

  // Query 2 — performance metrics (scoped to date range)
  const perfRows = await customer.query(`
    SELECT
      location_view.targeting_location,
      metrics.clicks,
      metrics.impressions,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM location_view
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
  `) as any[]

  // Build performance lookup: geo_target_constant resource name → metrics
  const perfMap = new Map<string, any>()
  for (const r of perfRows) {
    const loc = String(r.location_view?.targeting_location ?? '')
    if (loc) perfMap.set(loc, r.metrics)
  }

  // Query 3 — geo target names (global resource, use MCC customer)
  const resourceNames = criteriaRows
    .map(r => String(r.campaign_criterion?.location?.geo_target_constant ?? ''))
    .filter(Boolean)
  const uniqueNames = Array.from(new Set(resourceNames))
  const inClause = uniqueNames.map(n => `'${n}'`).join(', ')

  const geoRows = await getMccCustomer().query(`
    SELECT
      geo_target_constant.id,
      geo_target_constant.name,
      geo_target_constant.canonical_name,
      geo_target_constant.country_code,
      geo_target_constant.target_type
    FROM geo_target_constant
    WHERE geo_target_constant.resource_name IN (${inClause})
  `) as any[]

  const geoMap = new Map<string, any>()
  for (const r of geoRows) {
    const key = `geoTargetConstants/${r.geo_target_constant?.id}`
    geoMap.set(key, r.geo_target_constant)
  }

  return criteriaRows.map(r => {
    const geoKey     = String(r.campaign_criterion?.location?.geo_target_constant ?? '')
    const geo        = geoMap.get(geoKey)
    const perf       = perfMap.get(geoKey)
    const clicks      = Number(perf?.clicks             ?? 0)
    const impressions = Number(perf?.impressions         ?? 0)
    const cost        = Number(perf?.cost_micros         ?? 0) / 1_000_000
    const conversions = Number(perf?.conversions         ?? 0)
    const convValue   = Number(perf?.conversions_value   ?? 0)
    const geoId       = geoKey.replace('geoTargetConstants/', '')
    return {
      criterionId:   String(r.campaign_criterion?.criterion_id ?? ''),
      geoTargetId:   geoId,
      name:          String(geo?.name          ?? geoId),
      canonicalName: String(geo?.canonical_name ?? geo?.name ?? geoId),
      targetType:    String(geo?.target_type    ?? ''),
      countryCode:   String(geo?.country_code   ?? ''),
      negative:      Boolean(r.campaign_criterion?.negative),
      bidModifier:   Number(r.campaign_criterion?.bid_modifier ?? 1.0),
      clicks,
      impressions,
      cost,
      conversions,
      convRate:  clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : 0,
      cpa:       conversions > 0 ? Math.round((cost / conversions) * 100) / 100 : 0,
      roas:      cost > 0 ? Math.round((convValue / cost) * 100) / 100 : 0,
    }
  })
}

export async function searchGeoTargets(query: string): Promise<GeoTargetResult[]> {
  const q = query.trim()
  if (!q) return []

  // Numeric ID — return placeholder so user can add by ID directly
  if (/^\d+$/.test(q)) {
    return [{
      id: q, name: `Location ID ${q}`, canonicalName: `Location ID ${q}`,
      countryCode: '', targetType: 'Unknown',
    }]
  }

  // Escape regex special characters before inserting into GAQL
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const rows = await getMccCustomer().query(`
    SELECT
      geo_target_constant.id,
      geo_target_constant.name,
      geo_target_constant.canonical_name,
      geo_target_constant.country_code,
      geo_target_constant.target_type
    FROM geo_target_constant
    WHERE geo_target_constant.name REGEXP_MATCH '(?i).*${escaped}.*'
      AND geo_target_constant.status = 'ENABLED'
    LIMIT 10
  `) as any[]

  return rows.map(r => ({
    id:            String(r.geo_target_constant?.id            ?? ''),
    name:          String(r.geo_target_constant?.name          ?? ''),
    canonicalName: String(r.geo_target_constant?.canonical_name ?? r.geo_target_constant?.name ?? ''),
    countryCode:   String(r.geo_target_constant?.country_code  ?? ''),
    targetType:    String(r.geo_target_constant?.target_type   ?? ''),
  }))
}

export async function addLocationTarget(
  clientAccountId: string,
  campaignId: string,
  geoTargetId: string,
  negative = false,
): Promise<{ criterionId: string }> {
  validateCampaignId(campaignId)
  if (!/^\d+$/.test(geoTargetId)) throw new Error('Invalid geo_target_id')
  const cleanedClientId = cleanId(clientAccountId)
  const customer = await getClientCustomer(cleanedClientId)
  const resp = await (customer.campaignCriteria as any).create([{
    campaign: `customers/${cleanedClientId}/campaigns/${campaignId}`,
    location: { geo_target_constant: `geoTargetConstants/${geoTargetId}` },
    negative,
  }]) as any
  const resource: string = resp?.results?.[0]?.resource_name ?? ''
  const criterionId = resource.split('~')[1] ?? ''
  return { criterionId }
}

export async function removeLocationTarget(
  clientAccountId: string,
  campaignId: string,
  criterionId: string,
): Promise<void> {
  validateCampaignId(campaignId)
  if (!CAMPAIGN_ID_RE.test(criterionId)) throw new Error('Invalid criterion ID')
  const cleanedClientId = cleanId(clientAccountId)
  const customer = await getClientCustomer(cleanedClientId)
  await (customer.campaignCriteria as any).remove([
    `customers/${cleanedClientId}/campaignCriteria/${campaignId}~${criterionId}`,
  ])
}

export async function updateLocationBidModifier(
  clientAccountId: string,
  campaignId: string,
  criterionId: string,
  bidModifier: number,
): Promise<void> {
  validateCampaignId(campaignId)
  if (!CAMPAIGN_ID_RE.test(criterionId)) throw new Error('Invalid criterion ID')
  if (bidModifier < 0.1 || bidModifier > 10) throw new Error('bid_modifier must be between 0.1 and 10')
  const cleanedClientId = cleanId(clientAccountId)
  const customer = await getClientCustomer(cleanedClientId)
  await (customer.campaignCriteria as any).update([{
    resource_name: `customers/${cleanedClientId}/campaignCriteria/${campaignId}~${criterionId}`,
    bid_modifier:  bidModifier,
  }])
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "Ads Builder" && npx tsc --noEmit
```
Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
git add lib/google-ads.ts
git commit -m "feat: add location targeting functions to google-ads lib"
```

---

## Task 2: Geo-target search route + tests

**Files:**
- Create: `app/api/geo-target-search/route.ts`
- Create: `__tests__/api/geo-target-search.test.ts`

### Context
Follow `app/api/auction-insights/route.ts` for style. The only parameter is `q` (search string, minimum 2 characters). No date range or campaign ID needed. The `searchGeoTargets` function is in `@/lib/google-ads`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/api/geo-target-search.test.ts`:

```typescript
import { GET } from '@/app/api/geo-target-search/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/google-ads', () => ({
  searchGeoTargets: jest.fn().mockResolvedValue([]),
}))

function makeReq(params: Record<string, string>) {
  const url = new URL('http://localhost/api/geo-target-search')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url)
}

describe('GET /api/geo-target-search', () => {
  it('returns 400 for missing q', async () => {
    const res = await GET(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 for q shorter than 2 chars', async () => {
    const res = await GET(makeReq({ q: 'a' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with results array on valid q', async () => {
    const res = await GET(makeReq({ q: 'Cape Town' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('results')
    expect(Array.isArray(body.results)).toBe(true)
  })

  it('returns 500 when searchGeoTargets throws', async () => {
    const { searchGeoTargets } = require('@/lib/google-ads')
    searchGeoTargets.mockRejectedValueOnce(new Error('GAQL error'))
    const res = await GET(makeReq({ q: 'Cape Town' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- --testPathPattern="geo-target-search" --no-coverage
```
Expected: FAIL — `Cannot find module '@/app/api/geo-target-search/route'`

- [ ] **Step 3: Create the route**

Create `app/api/geo-target-search/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { searchGeoTargets } from '@/lib/google-ads'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  if (q.length < 2)
    return NextResponse.json({ error: 'q must be at least 2 characters' }, { status: 400 })

  try {
    const results = await searchGeoTargets(q)
    return NextResponse.json({ results })
  } catch (err: any) {
    console.error('[geo-target-search]', err?.message ?? err)
    return NextResponse.json({ error: err?.message ?? 'Failed to search locations' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests — expect 4 PASS**

```bash
npm test -- --testPathPattern="geo-target-search" --no-coverage
```
Expected: 4 tests PASS.

- [ ] **Step 5: Run full suite — no regressions**

```bash
npm test
```
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/geo-target-search/route.ts __tests__/api/geo-target-search.test.ts
git commit -m "feat: add /api/geo-target-search route with tests"
```

---

## Task 3: Location-targets multi-method route + tests

**Files:**
- Create: `app/api/location-targets/route.ts`
- Create: `__tests__/api/location-targets.test.ts`

### Context
This route exports four handlers: `GET`, `POST`, `DELETE`, `PATCH`. Each validates its own inputs from either `searchParams` (GET) or `request.json()` (POST/DELETE/PATCH). The 409 status is returned when the Google Ads error message contains "already" (duplicate location).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/api/location-targets.test.ts`:

```typescript
import { GET, POST, DELETE, PATCH } from '@/app/api/location-targets/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/google-ads', () => ({
  getLocationTargets:        jest.fn().mockResolvedValue([]),
  addLocationTarget:         jest.fn().mockResolvedValue({ criterionId: '999' }),
  removeLocationTarget:      jest.fn().mockResolvedValue(undefined),
  updateLocationBidModifier: jest.fn().mockResolvedValue(undefined),
}))

function makeGetReq(params: Record<string, string>) {
  const url = new URL('http://localhost/api/location-targets')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url)
}

function makeBodyReq(method: string, body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/location-targets', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const VALID_GET = {
  client_account_id: '1234567890',
  campaign_id: '9876543',
  start_date: '2026-01-01',
  end_date: '2026-01-31',
}

const VALID_POST = {
  client_account_id: '1234567890',
  campaign_id: '9876543',
  geo_target_id: '1007801',
}

const VALID_DELETE = {
  client_account_id: '1234567890',
  campaign_id: '9876543',
  criterion_id: '111222',
}

const VALID_PATCH = {
  client_account_id: '1234567890',
  campaign_id: '9876543',
  criterion_id: '111222',
  bid_modifier: 1.2,
}

describe('GET /api/location-targets', () => {
  it('returns 400 for missing client_account_id', async () => {
    const { campaign_id, start_date, end_date } = VALID_GET
    const res = await GET(makeGetReq({ campaign_id, start_date, end_date }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid client_account_id', async () => {
    const res = await GET(makeGetReq({ ...VALID_GET, client_account_id: 'bad' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid start_date', async () => {
    const res = await GET(makeGetReq({ ...VALID_GET, start_date: '01-01-2026' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for start_date >= end_date', async () => {
    const res = await GET(makeGetReq({ ...VALID_GET, start_date: '2026-02-01', end_date: '2026-01-01' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing campaign_id', async () => {
    const { client_account_id, start_date, end_date } = VALID_GET
    const res = await GET(makeGetReq({ client_account_id, start_date, end_date }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with rows array on valid input', async () => {
    const res = await GET(makeGetReq(VALID_GET))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('rows')
    expect(Array.isArray(body.rows)).toBe(true)
  })
})

describe('POST /api/location-targets', () => {
  it('returns 400 for missing client_account_id', async () => {
    const { campaign_id, geo_target_id } = VALID_POST
    const res = await POST(makeBodyReq('POST', { campaign_id, geo_target_id }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing geo_target_id', async () => {
    const res = await POST(makeBodyReq('POST', { client_account_id: '1234567890', campaign_id: '9876543' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with ok and criterionId on valid input', async () => {
    const res = await POST(makeBodyReq('POST', VALID_POST))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body).toHaveProperty('criterionId')
  })
})

describe('DELETE /api/location-targets', () => {
  it('returns 400 for missing criterion_id', async () => {
    const res = await DELETE(makeBodyReq('DELETE', { client_account_id: '1234567890', campaign_id: '9876543' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with ok on valid input', async () => {
    const res = await DELETE(makeBodyReq('DELETE', VALID_DELETE))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})

describe('PATCH /api/location-targets', () => {
  it('returns 400 for bid_modifier out of range', async () => {
    const res = await PATCH(makeBodyReq('PATCH', { ...VALID_PATCH, bid_modifier: 0.05 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-numeric bid_modifier', async () => {
    const res = await PATCH(makeBodyReq('PATCH', { ...VALID_PATCH, bid_modifier: 'high' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with ok on valid input', async () => {
    const res = await PATCH(makeBodyReq('PATCH', VALID_PATCH))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- --testPathPattern="location-targets" --no-coverage
```
Expected: FAIL — `Cannot find module '@/app/api/location-targets/route'`

- [ ] **Step 3: Create the route**

Create `app/api/location-targets/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  getLocationTargets,
  addLocationTarget,
  removeLocationTarget,
  updateLocationBidModifier,
} from '@/lib/google-ads'

const DATE_RE       = /^\d{4}-\d{2}-\d{2}$/
const ACCOUNT_ID_RE = /^\d{8,12}$/
const CAMPAIGN_RE   = /^\d+$/

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const { searchParams } = new URL(request.url)
  const clientId   = (searchParams.get('client_account_id') ?? '').replace(/-/g, '')
  const campaignId = searchParams.get('campaign_id') ?? ''
  const startDate  = searchParams.get('start_date')  ?? ''
  const endDate    = searchParams.get('end_date')    ?? ''

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate))
    return NextResponse.json({ error: 'Invalid date — expected YYYY-MM-DD' }, { status: 400 })
  if (startDate >= endDate)
    return NextResponse.json({ error: 'start_date must be before end_date' }, { status: 400 })
  if (!CAMPAIGN_RE.test(campaignId))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })

  try {
    const rows = await getLocationTargets(clientId, campaignId, startDate, endDate)
    return NextResponse.json({ rows })
  } catch (err: any) {
    console.error('[location-targets GET]', err?.message ?? err)
    return NextResponse.json({ error: err?.message ?? 'Failed to load location targets' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { client_account_id, campaign_id, geo_target_id, negative = false } = body
  const clientId = String(client_account_id ?? '').replace(/-/g, '')

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!CAMPAIGN_RE.test(String(campaign_id ?? '')))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
  if (!CAMPAIGN_RE.test(String(geo_target_id ?? '')))
    return NextResponse.json({ error: 'Invalid geo_target_id' }, { status: 400 })

  try {
    const result = await addLocationTarget(clientId, String(campaign_id), String(geo_target_id), Boolean(negative))
    return NextResponse.json({ ok: true, criterionId: result.criterionId })
  } catch (err: any) {
    const status = String(err?.message ?? '').toLowerCase().includes('already') ? 409 : 500
    console.error('[location-targets POST]', err?.message ?? err)
    return NextResponse.json({ error: err?.message ?? 'Failed to add location' }, { status })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { client_account_id, campaign_id, criterion_id } = body
  const clientId = String(client_account_id ?? '').replace(/-/g, '')

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!CAMPAIGN_RE.test(String(campaign_id ?? '')))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
  if (!CAMPAIGN_RE.test(String(criterion_id ?? '')))
    return NextResponse.json({ error: 'Invalid criterion_id' }, { status: 400 })

  try {
    await removeLocationTarget(clientId, String(campaign_id), String(criterion_id))
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[location-targets DELETE]', err?.message ?? err)
    return NextResponse.json({ error: err?.message ?? 'Failed to remove location' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { client_account_id, campaign_id, criterion_id, bid_modifier } = body
  const clientId = String(client_account_id ?? '').replace(/-/g, '')
  const bm = Number(bid_modifier)

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!CAMPAIGN_RE.test(String(campaign_id ?? '')))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
  if (!CAMPAIGN_RE.test(String(criterion_id ?? '')))
    return NextResponse.json({ error: 'Invalid criterion_id' }, { status: 400 })
  if (isNaN(bm) || bm < 0.1 || bm > 10)
    return NextResponse.json({ error: 'bid_modifier must be between 0.1 and 10' }, { status: 400 })

  try {
    await updateLocationBidModifier(clientId, String(campaign_id), String(criterion_id), bm)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[location-targets PATCH]', err?.message ?? err)
    return NextResponse.json({ error: err?.message ?? 'Failed to update bid modifier' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests — expect all PASS**

```bash
npm test -- --testPathPattern="location-targets" --no-coverage
```
Expected: all tests PASS.

- [ ] **Step 5: Run full suite — no regressions**

```bash
npm test
```
Expected: all tests PASS.

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add app/api/location-targets/route.ts __tests__/api/location-targets.test.ts
git commit -m "feat: add /api/location-targets route with tests"
```

---

## Task 4: `LocationsTab` component

**Files:**
- Create: `components/dashboard/LocationsTab.tsx`

### Context
Follows `HeatmapTab.tsx` for loading/error/retry patterns. Follows `SearchTermsTab.tsx` for the recommendations panel pattern. Key patterns:
- `'use client'` directive required
- `useRef('')` lazy fetch guard (key = `${campaignId}-${startDate}-${endDate}`) — NOT `useState` for the key
- `URLSearchParams` for building fetch URLs
- Loading: `<div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" />`
- Error: `<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600">` + Retry button
- Custom Tailwind colours: `navy`, `teal`, `cloud`, `mist`, `cyan`
- All mutation functions (`SortBtn`-like sub-components) must be at module level, not inside the render function
- `Array.from(prev)` pattern for Set state updates (not spread)

Bid modifier display: `bidModifier === 1.0` → `'—'`; else `${bidModifier > 1 ? '+' : ''}${Math.round((bidModifier - 1) * 100)}%`.
Bid modifier input: user types `+20` or `20` → stored as `1.2`; `-20` → `0.8`.

- [ ] **Step 1: Create `components/dashboard/LocationsTab.tsx`**

```typescript
'use client'
import { useState, useEffect, useRef } from 'react'
import type { LocationTargetRow, GeoTargetResult } from '@/lib/google-ads'

// ─── Optimisation rules (pure, exported for testing) ─────────────────────────
export interface LocationSuggestion {
  criterionId: string
  name:        string
  type:        'exclude' | 'increase_bid' | 'reduce_bid' | 'remove'
  message:     string
  action:      { bidModifier?: number; remove?: boolean }
}

export function buildLocationSuggestions(rows: LocationTargetRow[]): LocationSuggestion[] {
  const included = rows.filter(r => !r.negative)
  if (included.length === 0) return []

  const totalCost = included.reduce((s, r) => s + r.cost, 0)
  const totalConv = included.reduce((s, r) => s + r.conversions, 0)
  const totalClicks = included.reduce((s, r) => s + r.clicks, 0)
  const avgCPA      = totalConv > 0 ? totalCost / totalConv : 0
  const avgConvRate = totalClicks > 0 ? (totalConv / totalClicks) * 100 : 0

  const suggestions: LocationSuggestion[] = []

  for (const row of included) {
    if (avgCPA > 0 && row.cost > 2 * avgCPA && row.conversions === 0 && row.clicks >= 20) {
      suggestions.push({
        criterionId: row.criterionId, name: row.name, type: 'exclude',
        message: `${row.clicks} clicks, 0 conversions — cost exceeds 2× avg CPA`,
        action: { remove: true },
      })
    } else if (avgConvRate > 0 && row.convRate >= 1.5 * avgConvRate && row.conversions >= 5) {
      suggestions.push({
        criterionId: row.criterionId, name: row.name, type: 'increase_bid',
        message: `${row.convRate.toFixed(1)}% conv rate vs ${avgConvRate.toFixed(1)}% avg — strong performer`,
        action: { bidModifier: Math.min(parseFloat((row.bidModifier * 1.2).toFixed(2)), 10) },
      })
    } else if (avgCPA > 0 && row.cpa >= 2 * avgCPA && row.conversions > 0) {
      suggestions.push({
        criterionId: row.criterionId, name: row.name, type: 'reduce_bid',
        message: `CPA of ${row.cpa.toFixed(2)} is 2× account average — high cost per conversion`,
        action: { bidModifier: Math.max(parseFloat((row.bidModifier * 0.8).toFixed(2)), 0.1) },
      })
    } else if (row.impressions === 0) {
      suggestions.push({
        criterionId: row.criterionId, name: row.name, type: 'remove',
        message: `No impressions in this period`,
        action: { remove: true },
      })
    }
  }
  return suggestions
}

// ─── Bid modifier helpers ─────────────────────────────────────────────────────
function fmtBidMod(bm: number): string {
  if (bm === 1.0) return '—'
  const pct = Math.round((bm - 1) * 100)
  return pct > 0 ? `+${pct}%` : `${pct}%`
}

function parseBidModInput(s: string): number | null {
  const cleaned = s.trim().replace('%', '')
  const num = parseFloat(cleaned)
  if (isNaN(num)) return null
  const ratio = 1 + num / 100
  if (ratio < 0.1 || ratio > 10) return null
  return parseFloat(ratio.toFixed(4))
}

// ─── Module-level sub-components ─────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-block text-[9px] font-heading font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cloud text-navy/60">
      {type || '—'}
    </span>
  )
}

function SuggestionIcon({ type }: { type: LocationSuggestion['type'] }) {
  if (type === 'increase_bid') return <span className="text-emerald-600">⬆</span>
  if (type === 'reduce_bid')   return <span className="text-amber-500">⬇</span>
  return <span className="text-red-500">✕</span>
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  clientId:   string
  campaignId: string
  startDate:  string
  endDate:    string
  currency:   string
}

export function LocationsTab({ clientId, campaignId, startDate, endDate, currency }: Props) {
  const [rows,        setRows]        = useState<LocationTargetRow[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const fetched = useRef('')

  // Search state
  const [searchQ,     setSearchQ]     = useState('')
  const [searchRes,   setSearchRes]   = useState<GeoTargetResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showDropdown, setShowDropdown]  = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Inline bid modifier editing
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editingVal,  setEditingVal]  = useState('')

  // Suggestions
  const [dismissed,   setDismissed]   = useState<Set<string>>(new Set())
  const [applied,     setApplied]     = useState<Set<string>>(new Set())

  // Mutation error
  const [mutErr,      setMutErr]      = useState('')

  function doFetch() {
    const key = `${campaignId}-${startDate}-${endDate}`
    fetched.current = key
    setLoading(true); setError('')
    const qs = new URLSearchParams({ client_account_id: clientId, campaign_id: campaignId, start_date: startDate, end_date: endDate })
    fetch(`/api/location-targets?${qs}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Failed to load')
        setRows(d.rows ?? [])
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const key = `${campaignId}-${startDate}-${endDate}`
    if (fetched.current === key) return
    doFetch()
  }, [clientId, campaignId, startDate, endDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  function handleSearchChange(q: string) {
    setSearchQ(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (q.trim().length < 2) { setSearchRes([]); setShowDropdown(false); return }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/geo-target-search?${new URLSearchParams({ q })}`)
        const d = await res.json()
        setSearchRes(d.results ?? [])
        setShowDropdown(true)
      } catch { setSearchRes([]) }
      finally { setSearchLoading(false) }
    }, 300)
  }

  async function handleAddLocation(geo: GeoTargetResult) {
    setShowDropdown(false); setSearchQ('')
    setMutErr('')
    try {
      const res = await fetch('/api/location-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, campaign_id: campaignId, geo_target_id: geo.id }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to add')
      // Optimistic: append new row
      setRows(prev => [...prev, {
        criterionId: d.criterionId, geoTargetId: geo.id,
        name: geo.name, canonicalName: geo.canonicalName,
        targetType: geo.targetType, countryCode: geo.countryCode,
        negative: false, bidModifier: 1.0,
        clicks: 0, impressions: 0, cost: 0, conversions: 0, convRate: 0, cpa: 0, roas: 0,
      }])
    } catch (e: any) {
      setMutErr(String(e?.message ?? e))
    }
  }

  async function handleRemove(criterionId: string) {
    setMutErr('')
    setRows(prev => prev.filter(r => r.criterionId !== criterionId))
    try {
      const res = await fetch('/api/location-targets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, campaign_id: campaignId, criterion_id: criterionId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to remove')
    } catch (e: any) {
      setMutErr(String(e?.message ?? e))
      doFetch() // re-fetch to restore
    }
  }

  async function handleBidModifierSave(criterionId: string) {
    const bm = parseBidModInput(editingVal)
    setEditingId(null); setEditingVal('')
    if (bm === null) return
    setMutErr('')
    setRows(prev => prev.map(r => r.criterionId === criterionId ? { ...r, bidModifier: bm } : r))
    try {
      const res = await fetch('/api/location-targets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, campaign_id: campaignId, criterion_id: criterionId, bid_modifier: bm }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to update')
    } catch (e: any) {
      setMutErr(String(e?.message ?? e))
      doFetch()
    }
  }

  async function handleApplySuggestion(s: LocationSuggestion) {
    setMutErr('')
    const next = new Set(Array.from(applied))
    next.add(s.criterionId)
    setApplied(next)
    try {
      if (s.action.remove) {
        await handleRemove(s.criterionId)
      } else if (s.action.bidModifier !== undefined) {
        const res = await fetch('/api/location-targets', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_account_id: clientId, campaign_id: campaignId, criterion_id: s.criterionId, bid_modifier: s.action.bidModifier }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? 'Failed to apply')
        setRows(prev => prev.map(r => r.criterionId === s.criterionId ? { ...r, bidModifier: s.action.bidModifier! } : r))
      }
    } catch (e: any) {
      setMutErr(String(e?.message ?? e))
      const reverted = new Set(Array.from(applied))
      reverted.delete(s.criterionId)
      setApplied(reverted)
    }
  }

  function curr(n: number) { return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-teal text-sm">
        <div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
        Loading location targets…
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 mt-4">
        {error}
        <button onClick={() => { setError(''); fetched.current = ''; doFetch() }} className="ml-3 underline">Retry</button>
      </div>
    )
  }

  const suggestions = buildLocationSuggestions(rows).filter(s => !dismissed.has(s.criterionId) && !applied.has(s.criterionId))

  return (
    <div className="space-y-5">

      {/* ① Add location search */}
      <div className="relative">
        <div className="flex items-center gap-2 bg-mist/40 border border-cloud rounded-xl px-3 py-2">
          <span className="text-navy/40 text-sm">📍</span>
          <input
            type="text"
            value={searchQ}
            onChange={e => handleSearchChange(e.target.value)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder="Search cities, regions, countries…"
            className="flex-1 bg-transparent text-xs text-navy placeholder-navy/30 outline-none"
          />
          {searchLoading && <div className="w-3 h-3 border border-cyan border-t-transparent rounded-full animate-spin" />}
        </div>
        {showDropdown && searchRes.length > 0 && (
          <div className="absolute z-20 top-full mt-1 w-full bg-white border border-cloud rounded-xl shadow-lg overflow-hidden">
            {searchRes.map(geo => (
              <button
                key={geo.id}
                onMouseDown={() => handleAddLocation(geo)}
                className="w-full text-left px-4 py-2.5 hover:bg-mist/50 transition-colors border-b border-cloud/50 last:border-0"
              >
                <span className="text-xs font-medium text-navy">{geo.canonicalName}</span>
                <span className="ml-2 text-[9px] font-heading font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cloud text-navy/50">{geo.targetType}</span>
                <span className="ml-1 text-[9px] text-navy/30">{geo.countryCode}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mutation error */}
      {mutErr && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {mutErr}
          <button onClick={() => setMutErr('')} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* ② Location targets table */}
      {rows.length === 0 ? (
        <div className="text-center py-16 text-navy/40">
          <p className="text-2xl mb-2">🌍</p>
          <p className="text-sm">No location targets — this campaign targets all locations.</p>
          <p className="text-xs mt-1 text-navy/30">Use the search above to add specific location targets.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-cloud">
                {['Location', 'Type', 'Status', 'Bid Adj', 'Clicks', 'Cost', 'Conv', 'Conv Rate', 'CPA', 'ROAS', ''].map(h => (
                  <th key={h} className="py-2 px-2 text-left font-heading font-bold text-[10px] uppercase tracking-wider text-navy/50 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.criterionId} className={`border-b border-cloud/50 ${i % 2 === 0 ? 'bg-white' : 'bg-mist/20'} ${row.negative ? 'opacity-60' : ''}`}>
                  <td className="py-2.5 px-2 max-w-[200px]">
                    <span className={`text-navy text-xs ${row.negative ? 'line-through' : ''}`}>
                      {row.negative && <span className="mr-1">🚫</span>}
                      {row.canonicalName || row.name}
                    </span>
                  </td>
                  <td className="py-2.5 px-2"><TypeBadge type={row.targetType} /></td>
                  <td className="py-2.5 px-2">
                    <span className={`text-[10px] font-bold ${row.negative ? 'text-red-500' : 'text-teal'}`}>
                      {row.negative ? 'Excluded' : 'Included'}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    {row.negative ? (
                      <span className="text-navy/30 text-xs">—</span>
                    ) : editingId === row.criterionId ? (
                      <input
                        autoFocus
                        value={editingVal}
                        onChange={e => setEditingVal(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleBidModifierSave(row.criterionId)
                          if (e.key === 'Escape') { setEditingId(null); setEditingVal('') }
                        }}
                        onBlur={() => handleBidModifierSave(row.criterionId)}
                        placeholder="+20 or -10"
                        className="w-20 text-xs border border-cyan rounded px-1.5 py-0.5 outline-none text-navy"
                      />
                    ) : (
                      <button
                        onClick={() => { setEditingId(row.criterionId); setEditingVal(fmtBidMod(row.bidModifier).replace('%', '').replace('—', '')) }}
                        className="text-xs text-navy hover:text-cyan transition-colors font-mono"
                        title="Click to edit bid modifier"
                      >
                        {fmtBidMod(row.bidModifier)} ✎
                      </button>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right text-navy/70">{row.clicks.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-right text-navy/70">{curr(row.cost)}</td>
                  <td className="py-2.5 px-2 text-right text-navy/70">{row.conversions.toFixed(1)}</td>
                  <td className="py-2.5 px-2 text-right text-navy/70">{row.convRate.toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-right text-navy/70">{row.conversions > 0 ? curr(row.cpa) : '—'}</td>
                  <td className="py-2.5 px-2 text-right text-navy/70">{row.roas > 0 ? `${row.roas.toFixed(2)}×` : '—'}</td>
                  <td className="py-2.5 px-2">
                    <button
                      onClick={() => handleRemove(row.criterionId)}
                      className="text-navy/30 hover:text-red-500 transition-colors text-base leading-none"
                      title="Remove location target"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ③ Optimisation suggestions */}
      {suggestions.length > 0 && (
        <div>
          <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-navy/40 mb-2">
            💡 Location Optimisation Suggestions
          </p>
          <div className="space-y-2">
            {suggestions.map(s => (
              <div key={s.criterionId} className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <span className="text-base mt-0.5"><SuggestionIcon type={s.type} /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-navy">{s.name}</p>
                  <p className="text-xs text-navy/60 mt-0.5">{s.message}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleApplySuggestion(s)}
                    className="text-[10px] font-heading font-bold bg-navy text-white px-2.5 py-1 rounded-lg hover:bg-navy/80 transition-colors"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => {
                      const next = new Set(Array.from(dismissed))
                      next.add(s.criterionId)
                      setDismissed(next)
                    }}
                    className="text-[10px] font-heading font-bold text-navy/50 hover:text-navy transition-colors px-1"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/LocationsTab.tsx
git commit -m "feat: add LocationsTab component"
```

---

## Task 5: Wire the tab into `CampaignDrillDown`

**Files:**
- Modify: `components/dashboard/CampaignDrillDown.tsx`

### Context
Four small changes. The current `DrillTab` type is on line 1184. The tab array starts around line 1266. The render switch ends around line 1370–1383 with the pattern `} : activeTab === 'auction' ? (...) : null`. The `null` terminal must be preserved — add `locations` as a new ternary before `null`.

- [ ] **Step 1: Add import**

Find:
```typescript
import { AuctionInsightsTab }      from '@/components/dashboard/AuctionInsightsTab'
```
Add immediately after:
```typescript
import { LocationsTab }            from '@/components/dashboard/LocationsTab'
```

- [ ] **Step 2: Extend `DrillTab` type**

Find:
```typescript
type DrillTab = 'groups' | 'keywords' | 'negatives' | 'heatmap' | 'devices' | 'rsa_copy' | 'ab_test' | 'changes' | 'search_terms' | 'auction'
```
Replace with:
```typescript
type DrillTab = 'groups' | 'keywords' | 'negatives' | 'heatmap' | 'devices' | 'rsa_copy' | 'ab_test' | 'changes' | 'search_terms' | 'auction' | 'locations'
```

- [ ] **Step 3: Add tab button**

Find:
```typescript
          { id: 'auction'      as DrillTab, label: '🏆 Auction', hidden: !isSearch },
```
Add immediately after:
```typescript
          { id: 'locations'    as DrillTab, label: '📍 Locations' },
```

- [ ] **Step 4: Add render branch**

Find:
```typescript
        ) : activeTab === 'auction' ? (
          <AuctionInsightsTab
            clientId={clientId}
            campaignId={campaignId}
            startDate={startDate}
            endDate={endDate}
          />
        ) : null
```
Replace with:
```typescript
        ) : activeTab === 'auction' ? (
          <AuctionInsightsTab
            clientId={clientId}
            campaignId={campaignId}
            startDate={startDate}
            endDate={endDate}
          />
        ) : activeTab === 'locations' ? (
          <LocationsTab
            clientId={clientId}
            campaignId={campaignId}
            startDate={startDate}
            endDate={endDate}
            currency={currency}
          />
        ) : null
```

- [ ] **Step 5: TypeScript check + full test suite**

```bash
npx tsc --noEmit && npm test
```
Expected: zero TS errors, all tests PASS.

- [ ] **Step 6: Commit and push**

```bash
git add components/dashboard/CampaignDrillDown.tsx
git commit -m "feat: add Locations tab to campaign drill-down"
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ View all location targets with full performance (clicks, cost, conv, conv rate, CPA, ROAS)
- ✅ Add by name search (debounced, dropdown, 2-char minimum)
- ✅ Add by numeric ID (power-user fallback)
- ✅ Remove existing targets (optimistic with re-fetch on error)
- ✅ Inline bid modifier editing (click → input → Enter/blur → PATCH)
- ✅ Bid modifier disabled for excluded locations
- ✅ 4 optimisation rule types: wasteful, high-performer, high-CPA, no-activity
- ✅ Apply / Dismiss per suggestion
- ✅ Available for ALL campaign types including PMax (no `hidden` condition)
- ✅ Loading / error / empty states
- ✅ Tests for both API routes

**Placeholder scan:** None found.

**Type consistency:**
- `LocationTargetRow` defined in Task 1, used in Tasks 3, 4 ✅
- `GeoTargetResult` defined in Task 1, used in Tasks 2, 4 ✅
- `getLocationTargets` defined Task 1, imported in Task 3 ✅
- `searchGeoTargets` defined Task 1, imported in Task 2 ✅
- `LocationsTab` named export in Task 4, imported in Task 5 ✅
- `buildLocationSuggestions` exported from Task 4 (testable if needed) ✅
- All bid modifier values: stored as ratio (1.2), displayed as percentage (+20%) ✅
