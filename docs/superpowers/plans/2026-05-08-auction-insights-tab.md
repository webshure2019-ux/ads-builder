# Auction Insights Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Auction" drill-down tab to Search campaigns that shows competitor impression share and overlap metrics from the Google Ads Auction Insights report.

**Architecture:** Four files: a typed Google Ads function + interface in `lib/google-ads.ts`, a standard GET API route at `/api/auction-insights`, a self-contained `AuctionInsightsTab` component, and a small addition to `CampaignDrillDown` to wire the tab in. Follows every existing pattern in the codebase (lazy fetch with `useRef` guard, same route validation shape, same tab registration pattern).

**Tech Stack:** google-ads-api v23 (GAQL `FROM auction_insight`), Next.js 14 App Router, TypeScript, Tailwind CSS (navy/teal/cloud/mist/cyan palette).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `lib/google-ads.ts` | `AuctionInsightRow` interface + `getAuctionInsights()` function |
| Create | `app/api/auction-insights/route.ts` | Validated GET handler |
| Create | `components/dashboard/AuctionInsightsTab.tsx` | Lazy-fetching competitor table component |
| Create | `__tests__/api/auction-insights.test.ts` | Route input-validation tests |
| Modify | `components/dashboard/CampaignDrillDown.tsx` | Register tab + render branch |

---

## Task 1: Data layer — `getAuctionInsights` + `AuctionInsightRow`

**Files:**
- Modify: `lib/google-ads.ts` (append near the end, after `addAdGroupKeyword`)

### Context
`lib/google-ads.ts` exports typed interfaces alongside each function.  
All functions: validate inputs with `validateDate` / `validateCampaignId`, call `await getClientCustomer(clientAccountId)`, query GAQL, map results.

The Google Ads `auction_insight` resource returns one row per competitor (and optionally one row where `auction_insight.domain === ''` representing the account itself). All metrics are 0–1 ratios; multiply by 100 for percentages.

- [ ] **Step 1: Append the interface and function to `lib/google-ads.ts`**

Find the end of the file (after `addAdGroupKeyword`) and append:

```typescript
// ─── Auction Insights ─────────────────────────────────────────────────────────
export interface AuctionInsightRow {
  domain:            string   // competitor display domain; '' = this account
  impressionShare:   number   // 0–100 %
  overlapRate:       number   // 0–100 %
  positionAboveRate: number   // 0–100 %
  topOfPageRate:     number   // 0–100 %
  absTopOfPageRate:  number   // 0–100 %
  outRankingShare:   number   // 0–100 %
}

export async function getAuctionInsights(
  clientAccountId: string,
  campaignId:       string,
  startDate:        string,
  endDate:          string,
): Promise<AuctionInsightRow[]> {
  validateDate(startDate, 'start_date')
  validateDate(endDate,   'end_date')
  if (startDate > endDate) throw new Error('start_date must be before end_date')
  validateCampaignId(campaignId)

  const customer = await getClientCustomer(clientAccountId)

  const results = await customer.query(`
    SELECT
      auction_insight.domain,
      metrics.auction_insight_search_impression_share,
      metrics.auction_insight_search_overlap_rate,
      metrics.auction_insight_search_position_above_rate,
      metrics.auction_insight_search_top_impression_percentage,
      metrics.auction_insight_search_absolute_top_impression_percentage,
      metrics.auction_insight_search_outranking_share
    FROM auction_insight
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.id = ${campaignId}
    ORDER BY metrics.auction_insight_search_impression_share DESC
    LIMIT 25
  `) as any[]

  return results.map(r => ({
    domain:            String(r.auction_insight?.domain ?? ''),
    impressionShare:   Math.round((r.metrics?.auction_insight_search_impression_share   ?? 0) * 1000) / 10,
    overlapRate:       Math.round((r.metrics?.auction_insight_search_overlap_rate        ?? 0) * 1000) / 10,
    positionAboveRate: Math.round((r.metrics?.auction_insight_search_position_above_rate ?? 0) * 1000) / 10,
    topOfPageRate:     Math.round((r.metrics?.auction_insight_search_top_impression_percentage            ?? 0) * 1000) / 10,
    absTopOfPageRate:  Math.round((r.metrics?.auction_insight_search_absolute_top_impression_percentage   ?? 0) * 1000) / 10,
    outRankingShare:   Math.round((r.metrics?.auction_insight_search_outranking_share    ?? 0) * 1000) / 10,
  }))
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
git commit -m "feat: add getAuctionInsights to google-ads lib"
```

---

## Task 2: API route — `/api/auction-insights`

**Files:**
- Create: `app/api/auction-insights/route.ts`
- Create: `__tests__/api/auction-insights.test.ts`

### Context
Follow `app/api/hourly-performance/route.ts` exactly:
- Import `requireAuth` from `@/lib/auth`
- Extract `client_account_id`, `campaign_id`, `start_date`, `end_date` from `searchParams`
- Validate with inline regexes (`ACCOUNT_ID_RE`, `DATE_RE`, `CAMPAIGN_RE`)
- `campaign_id` is **required** here (unlike hourly-performance where it's optional)
- On success return `NextResponse.json({ rows })`
- On error: `console.error` + `NextResponse.json({ error: ... }, { status: 500 })`

Follow `__tests__/api/generate.test.ts` for the test structure (mock `requireAuth` to return `null` for auth pass, mock the Google Ads function).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/api/auction-insights.test.ts`:

```typescript
import { GET } from '@/app/api/auction-insights/route'
import { NextRequest } from 'next/server'

// Mock auth to always pass
jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn().mockResolvedValue(null),
}))

// Mock the Google Ads function
jest.mock('@/lib/google-ads', () => ({
  getAuctionInsights: jest.fn().mockResolvedValue([]),
}))

function makeReq(params: Record<string, string>) {
  const url = new URL('http://localhost/api/auction-insights')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url)
}

const VALID = {
  client_account_id: '1234567890',
  campaign_id:       '9876543',
  start_date:        '2026-01-01',
  end_date:          '2026-01-31',
}

describe('GET /api/auction-insights', () => {
  it('returns 400 for missing client_account_id', async () => {
    const { campaign_id, start_date, end_date } = VALID
    const res = await GET(makeReq({ campaign_id, start_date, end_date }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid client_account_id', async () => {
    const res = await GET(makeReq({ ...VALID, client_account_id: 'bad' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing campaign_id', async () => {
    const { client_account_id, start_date, end_date } = VALID
    const res = await GET(makeReq({ client_account_id, start_date, end_date }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid campaign_id', async () => {
    const res = await GET(makeReq({ ...VALID, campaign_id: 'not-a-number' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid start_date', async () => {
    const res = await GET(makeReq({ ...VALID, start_date: '01-01-2026' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for start_date >= end_date', async () => {
    const res = await GET(makeReq({ ...VALID, start_date: '2026-02-01', end_date: '2026-01-01' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with rows array on valid input', async () => {
    const res = await GET(makeReq(VALID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('rows')
    expect(Array.isArray(body.rows)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (route doesn't exist yet)**

```bash
npm test -- --testPathPattern="auction-insights" --no-coverage
```
Expected: FAIL — `Cannot find module '@/app/api/auction-insights/route'`

- [ ] **Step 3: Create the route**

Create `app/api/auction-insights/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getAuctionInsights } from '@/lib/google-ads'

const ACCOUNT_ID_RE = /^\d{8,12}$/
const DATE_RE       = /^\d{4}-\d{2}-\d{2}$/
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
  if (!CAMPAIGN_RE.test(campaignId))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate))
    return NextResponse.json({ error: 'Invalid date — expected YYYY-MM-DD' }, { status: 400 })
  if (startDate >= endDate)
    return NextResponse.json({ error: 'start_date must be before end_date' }, { status: 400 })

  try {
    const rows = await getAuctionInsights(clientId, campaignId, startDate, endDate)
    return NextResponse.json({ rows })
  } catch (err: any) {
    console.error('[auction-insights]', err?.message ?? err)
    return NextResponse.json({ error: err.message ?? 'Failed to load auction insights' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- --testPathPattern="auction-insights" --no-coverage
```
Expected: 7 tests PASS.

- [ ] **Step 5: Run full suite — expect no regressions**

```bash
npm test
```
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/auction-insights/route.ts __tests__/api/auction-insights.test.ts
git commit -m "feat: add /api/auction-insights route with tests"
```

---

## Task 3: Component — `AuctionInsightsTab`

**Files:**
- Create: `components/dashboard/AuctionInsightsTab.tsx`

### Context
Follows the `HeatmapTab` + `SearchTermsTab` pattern:
- `'use client'` directive
- Import `AuctionInsightRow` type from `@/lib/google-ads`
- Props: `clientId`, `campaignId`, `startDate`, `endDate` (no `currency` needed — all metrics are percentages)
- Lazy fetch using `useRef('')` guard (key = `${campaignId}-${startDate}-${endDate}`), same pattern as other tabs
- Five UI states: loading, error, empty (no data), no-search-campaign notice, and the main table
- Sort state: default sort by `impressionShare` descending

**Table columns:**
| Column | Field | Format |
|--------|-------|--------|
| Competitor | `domain` | Bold "You" for empty domain |
| Impr. Share | `impressionShare` | `"42.1%"` |
| Overlap Rate | `overlapRate` | `"38.5%"` or `"—"` for You row |
| Position Above | `positionAboveRate` | `"21.3%"` or `"—"` for You row |
| Top of Page | `topOfPageRate` | `"68.0%"` |
| Abs. Top | `absTopOfPageRate` | `"15.2%"` |
| Outranking | `outRankingShare` | `"55.0%"` or `"—"` for You row |

The "You" row (domain === '') gets a teal highlight row; competitors get alternating white/mist rows. A small bar under `impressionShare` (width = `impressionShare%`) gives a quick visual.

- [ ] **Step 1: Create `components/dashboard/AuctionInsightsTab.tsx`**

```typescript
'use client'
import { useState, useEffect, useRef } from 'react'
import type { AuctionInsightRow } from '@/lib/google-ads'

type SortKey = keyof Omit<AuctionInsightRow, 'domain'>

interface Props {
  clientId:   string
  campaignId: string
  startDate:  string
  endDate:    string
}

function pct(n: number) { return `${n.toFixed(1)}%` }

export function AuctionInsightsTab({ clientId, campaignId, startDate, endDate }: Props) {
  const [rows,    setRows]    = useState<AuctionInsightRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('impressionShare')
  const [sortAsc, setSortAsc] = useState(false)
  const fetched = useRef('')

  useEffect(() => {
    const key = `${campaignId}-${startDate}-${endDate}`
    if (fetched.current === key) return
    fetched.current = key
    setLoading(true); setError('')
    fetch(
      `/api/auction-insights?client_account_id=${clientId}&campaign_id=${campaignId}&start_date=${startDate}&end_date=${endDate}`
    )
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Failed to load')
        setRows(d.rows ?? [])
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [clientId, campaignId, startDate, endDate])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  function SortBtn({ col }: { col: SortKey }) {
    const active = sortKey === col
    return (
      <button
        onClick={() => toggleSort(col)}
        className={`flex items-center gap-0.5 font-heading font-bold text-[10px] uppercase tracking-wider transition-colors ${
          active ? 'text-cyan' : 'text-navy/50 hover:text-navy'
        }`}
      >
        {col === 'impressionShare'   ? 'Impr. Share'
         : col === 'overlapRate'     ? 'Overlap'
         : col === 'positionAboveRate' ? 'Pos Above'
         : col === 'topOfPageRate'   ? 'Top of Page'
         : col === 'absTopOfPageRate' ? 'Abs. Top'
         : 'Outranking'}
        <span className="ml-0.5">{active ? (sortAsc ? '↑' : '↓') : '↕'}</span>
      </button>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-navy/40 text-sm">
        Loading auction insights…
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
        {error}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-navy/40">
        <p className="text-2xl mb-2">🔍</p>
        <p className="text-sm">No auction insights data for this period.</p>
        <p className="text-xs mt-1 text-navy/30">
          Data is only available for Search campaigns with sufficient impression volume.
        </p>
      </div>
    )
  }

  // Sort: "You" row always pinned to top; competitors sorted by chosen column
  const youRow = rows.find(r => r.domain === '')
  const competitors = rows
    .filter(r => r.domain !== '')
    .sort((a, b) => {
      const diff = a[sortKey] - b[sortKey]
      return sortAsc ? diff : -diff
    })
  const sorted = youRow ? [youRow, ...competitors] : competitors

  return (
    <div>
      <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-navy/40 mb-3">
        Auction Insights — competitor overlap for this campaign
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-cloud">
              <th className="text-left py-2 pr-4 font-heading font-bold text-[10px] uppercase tracking-wider text-navy/50 w-48">
                Competitor
              </th>
              <th className="py-2 px-3 text-right"><SortBtn col="impressionShare" /></th>
              <th className="py-2 px-3 text-right"><SortBtn col="overlapRate" /></th>
              <th className="py-2 px-3 text-right"><SortBtn col="positionAboveRate" /></th>
              <th className="py-2 px-3 text-right"><SortBtn col="topOfPageRate" /></th>
              <th className="py-2 px-3 text-right"><SortBtn col="absTopOfPageRate" /></th>
              <th className="py-2 px-3 text-right"><SortBtn col="outRankingShare" /></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const isYou = row.domain === ''
              return (
                <tr
                  key={row.domain || 'you'}
                  className={`border-b border-cloud/50 ${
                    isYou ? 'bg-cyan/5' : i % 2 === 0 ? 'bg-white' : 'bg-mist/30'
                  }`}
                >
                  <td className="py-2.5 pr-4">
                    {isYou ? (
                      <span className="font-bold text-cyan">You (this account)</span>
                    ) : (
                      <span className="text-navy">{row.domain}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className={isYou ? 'font-bold text-cyan' : 'text-navy'}>
                        {pct(row.impressionShare)}
                      </span>
                      <div className="w-16 h-1 bg-cloud rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isYou ? 'bg-cyan' : 'bg-navy/30'}`}
                          style={{ width: `${Math.min(row.impressionShare, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right text-navy/70">
                    {isYou ? '—' : pct(row.overlapRate)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-navy/70">
                    {isYou ? '—' : pct(row.positionAboveRate)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-navy/70">
                    {pct(row.topOfPageRate)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-navy/70">
                    {pct(row.absTopOfPageRate)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-navy/70">
                    {isYou ? '—' : pct(row.outRankingShare)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-navy/30 mt-3">
        <strong>Overlap:</strong> how often a competitor's ad showed alongside yours ·
        <strong> Pos Above:</strong> how often they ranked above you ·
        <strong> Outranking:</strong> how often you ranked above them
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/AuctionInsightsTab.tsx
git commit -m "feat: add AuctionInsightsTab component"
```

---

## Task 4: Wire the tab into `CampaignDrillDown`

**Files:**
- Modify: `components/dashboard/CampaignDrillDown.tsx`

### Context
Four small changes to this file:
1. Add import for `AuctionInsightsTab`
2. Extend `DrillTab` union type with `'auction'`
3. Add `isSearch` constant (Search = channelType `'SEARCH'` or numeric `'2'`)
4. Add tab button (hidden if `!isSearch`) + render branch in the content switch

The `DrillTab` type is on line 1183. The tab bar array is around line 1263. The content switch is around line 1290.

- [ ] **Step 1: Add the import**

Find this block at the top of `CampaignDrillDown.tsx`:
```typescript
import { ABTestingTab }            from '@/components/dashboard/ABTestingTab'
```

Add the new import immediately after it:
```typescript
import { AuctionInsightsTab }      from '@/components/dashboard/AuctionInsightsTab'
```

- [ ] **Step 2: Extend the `DrillTab` type**

Find:
```typescript
type DrillTab = 'groups' | 'keywords' | 'negatives' | 'heatmap' | 'devices' | 'rsa_copy' | 'ab_test' | 'changes' | 'search_terms'
```

Replace with:
```typescript
type DrillTab = 'groups' | 'keywords' | 'negatives' | 'heatmap' | 'devices' | 'rsa_copy' | 'ab_test' | 'changes' | 'search_terms' | 'auction'
```

- [ ] **Step 3: Add `isSearch` constant**

Find:
```typescript
  const isPMax = channelType === 'PERFORMANCE_MAX' || channelType === '10'
```

Add immediately after:
```typescript
  const isSearch = channelType === 'SEARCH' || channelType === '2'
```

- [ ] **Step 4: Add the tab button**

Find the tab array entry for `search_terms`:
```typescript
          { id: 'search_terms' as DrillTab, label: '🔍 Search Terms' },
```

Add the Auction tab immediately after it:
```typescript
          { id: 'auction'      as DrillTab, label: '🏆 Auction',     hidden: !isSearch },
```

- [ ] **Step 5: Add the render branch**

Find this closing block at the end of the content switch:
```typescript
        ) : (
          <SearchTermsTab
            clientId={clientId}
            startDate={startDate}
            endDate={endDate}
            currency={currency}
            campaignId={campaignId}
          />
        )}
```

Replace with:
```typescript
        ) : activeTab === 'search_terms' ? (
          <SearchTermsTab
            clientId={clientId}
            startDate={startDate}
            endDate={endDate}
            currency={currency}
            campaignId={campaignId}
          />
        ) : (
          <AuctionInsightsTab
            clientId={clientId}
            campaignId={campaignId}
            startDate={startDate}
            endDate={endDate}
          />
        )}
```

- [ ] **Step 6: Type-check and run full test suite**

```bash
npx tsc --noEmit && npm test
```
Expected: zero TS errors, all tests PASS.

- [ ] **Step 7: Commit and push**

```bash
git add components/dashboard/CampaignDrillDown.tsx
git commit -m "feat: add Auction Insights tab to Search campaign drill-down"
git push origin main
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Auction tab on Search campaigns only (hidden via `!isSearch`)
- ✅ All 6 metrics shown: Impression Share, Overlap Rate, Position Above Rate, Top of Page %, Abs Top %, Outranking Share
- ✅ "You" row highlighted and pinned to top
- ✅ Sortable columns
- ✅ Loading / error / empty states
- ✅ Lazy fetch with `useRef` guard (consistent with rest of codebase)
- ✅ Follows existing route validation pattern exactly

**Placeholder scan:** None found.

**Type consistency:**
- `AuctionInsightRow` defined in Task 1, imported in Task 3 via `@/lib/google-ads` ✅
- `getAuctionInsights` defined in Task 1, imported in Task 2 ✅
- `AuctionInsightsTab` exported named export in Task 3, imported in Task 4 ✅
- `DrillTab` union extended in Task 4 Step 2 before use in Step 4 ✅
