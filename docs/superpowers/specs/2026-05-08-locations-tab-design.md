# Locations Tab Design

**Date:** 2026-05-08
**Feature:** Campaign drill-down Locations tab — view, edit, and optimise location targeting

---

## Goal

Add a 📍 Locations tab to the campaign drill-down that shows all location targets for a campaign with full performance metrics, allows inline bid modifier editing, adding new location targets by name search, removing existing targets, and displays rule-based optimisation suggestions.

---

## Architecture

Five files touched:

| Action | File | Responsibility |
|---|---|---|
| Modify | `lib/google-ads.ts` | `LocationTargetRow` interface + `getLocationTargets`, `searchGeoTargets`, `addLocationTarget`, `removeLocationTarget`, `updateLocationBidModifier` |
| Create | `app/api/location-targets/route.ts` | GET (fetch), POST (add), DELETE (remove), PATCH (update bid modifier) |
| Create | `app/api/geo-target-search/route.ts` | GET — search geo target constants by name |
| Create | `components/dashboard/LocationsTab.tsx` | Tab component |
| Modify | `components/dashboard/CampaignDrillDown.tsx` | Register `'locations'` tab — no `hidden` condition (all campaign types including PMax) |

---

## Data Layer

### Interface

```typescript
export interface LocationTargetRow {
  criterionId:   string    // campaign_criterion.criterion_id
  geoTargetId:   string    // numeric ID from geo_target_constant resource name
  name:          string    // e.g. "Cape Town"
  canonicalName: string    // e.g. "Cape Town, Western Cape, South Africa"
  targetType:    string    // "City" | "Province" | "Country" | "Region" etc.
  countryCode:   string    // "ZA" | "US" etc.
  negative:      boolean   // true = excluded location
  bidModifier:   number    // 1.0 = no adj, 1.2 = +20%, 0.8 = -20%
  // Performance (null when no data for the period)
  clicks:        number
  impressions:   number
  cost:          number    // in account currency units (not micros)
  conversions:   number
  convRate:      number    // 0-100 %
  cpa:           number    // cost / conversions, 0 if no conversions
  roas:          number    // conversions_value / cost, 0 if no cost
}
```

### Two-Query Fetch Pattern

Follows the codebase's established two-query pattern (cannot mix current-state fields with metrics in one GAQL query).

**Query 1 — current state** (`FROM campaign_criterion`, no date range):
```gaql
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
```

**Query 2 — performance metrics** (`FROM location_view`, scoped to date range):
```gaql
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
```

**Geo target name lookup** — after Query 1, collect all unique geo target constant resource names and resolve names/types/countries via:
```gaql
SELECT
  geo_target_constant.id,
  geo_target_constant.name,
  geo_target_constant.canonical_name,
  geo_target_constant.country_code,
  geo_target_constant.target_type
FROM geo_target_constant
WHERE geo_target_constant.resource_name IN (${resourceNames})
```

Results joined by `geo_target_constant` resource name into a single `LocationTargetRow[]`.

### Location Search

Used for the "Add location" search input. Queries the MCC customer (not the client account) since geo_target_constant is a global resource:

```gaql
SELECT
  geo_target_constant.id,
  geo_target_constant.name,
  geo_target_constant.canonical_name,
  geo_target_constant.country_code,
  geo_target_constant.target_type
FROM geo_target_constant
WHERE geo_target_constant.name REGEXP_MATCH '(?i).*${escapedQuery}.*'
  AND geo_target_constant.status = 'ENABLED'
LIMIT 10
```

If the user types a purely numeric string, skip the GAQL search and return a single result with that ID (power-user fallback for entering IDs directly).

### Mutations

**Add location target:**
```typescript
await customer.campaignCriteria.create([{
  campaign: `customers/${cleanedClientId}/campaigns/${campaignId}`,
  type: enums.CriterionType.LOCATION,
  location: { geo_target_constant: `geoTargetConstants/${geoTargetId}` },
  negative: false,
}])
```
Returns `{ criterionId }` for optimistic UI update.

**Remove location target:**
```typescript
await customer.campaignCriteria.remove([
  `customers/${cleanedClientId}/campaignCriteria/${campaignId}~${criterionId}`
])
```

**Update bid modifier:**
```typescript
await customer.campaignCriteria.update([{
  resource_name: `customers/${cleanedClientId}/campaignCriteria/${campaignId}~${criterionId}`,
  bid_modifier: newBidModifier,  // e.g. 1.2 for +20%
}])
```

---

## API Routes

### `GET /api/location-targets`
Query params: `client_account_id`, `campaign_id`, `start_date`, `end_date`
Returns: `{ rows: LocationTargetRow[] }`

### `POST /api/location-targets`
Body: `{ client_account_id, campaign_id, geo_target_id, negative? }`
Returns: `{ ok, criterionId }`

### `DELETE /api/location-targets`
Body: `{ client_account_id, campaign_id, criterion_id }`
Returns: `{ ok }`

### `PATCH /api/location-targets`
Body: `{ client_account_id, campaign_id, criterion_id, bid_modifier }`
Returns: `{ ok }`

### `GET /api/geo-target-search`
Query params: `q` (search string, min 2 chars)
Returns: `{ results: GeoTargetResult[] }` where each result has `{ id, name, canonicalName, countryCode, targetType }`

All routes: require `ads-auth` cookie via `requireAuth`. Standard 400/500 error shape.

---

## UI Component — `LocationsTab`

### Props
```typescript
interface Props {
  clientId:   string
  campaignId: string
  startDate:  string
  endDate:    string
  currency:   string
}
```

### Layout (top to bottom)

**① Add Location search bar**
- Text input: placeholder "Search cities, regions, countries…"
- Debounced 300ms → GET `/api/geo-target-search?q=...`
- Dropdown of up to 10 results: shows `canonicalName` + `targetType` badge + country code
- Click a result → POST `/api/location-targets` → optimistically append row to table
- Minimum 2 characters before search fires
- If input is numeric → skip debounce, show "Add by ID" option directly

**② Location targets table**

Columns: Location | Type | Status | Bid Adj | Clicks | Cost | Conv | Conv Rate | CPA | ROAS | Remove

- **Location**: `canonicalName` (full path). Excluded rows shown in muted style with a `🚫` badge.
- **Type**: pill badge — City / Province / Country / Region etc.
- **Status**: Included (teal) / Excluded (red/muted)
- **Bid Adj**: displays as `+20%`, `−20%`, `—` for no adjustment (1.0). Click → inline input accepting `+20` or `-20` format → Enter/blur saves → PATCH `/api/location-targets`. Disabled for excluded locations (bid modifier irrelevant).
- **Remove**: trash icon → DELETE `/api/location-targets` → optimistic removal from table with undo toast (3s).
- Lazy fetch with `useRef('')` guard. Key: `${campaignId}-${startDate}-${endDate}`.
- Loading state: spinner (matches `HeatmapTab` pattern).
- Error state: red pill + Retry button.
- Empty state: "No location targets — this campaign targets all locations."

**③ Optimisation suggestions panel**
Collapsible section below the table. Rule-based, computed client-side from the fetched rows:

| Rule | Condition | Suggestion |
|---|---|---|
| Wasteful spend | `cost > 2 × avgCPA` AND `conversions === 0` AND `clicks >= 20` | "Exclude or reduce bid for [Location]" |
| High performer | `convRate >= 1.5 × avgConvRate` AND `conversions >= 5` | "Increase bid modifier for [Location]" |
| No activity | `impressions === 0` over period | "No impressions — consider removing [Location]" |
| High CPA | `cpa >= 2 × avgCPA` AND `conversions > 0` | "Reduce bid modifier for [Location]" |

Each suggestion card: location name, issue, recommended action, **Apply** button (fires the relevant PATCH/DELETE) + **Dismiss** button. Applied/dismissed cards move to a collapsed "Done" list at bottom. No suggestions panel rendered if zero suggestions.

---

## CampaignDrillDown Wiring

Four small changes to `CampaignDrillDown.tsx`:
1. Import `LocationsTab` from `@/components/dashboard/LocationsTab`
2. Extend `DrillTab` union: add `'locations'`
3. Add tab entry — no `hidden` condition (available for all campaign types including PMax):
   `{ id: 'locations' as DrillTab, label: '📍 Locations' }`
4. Add render branch: `activeTab === 'locations'` → `<LocationsTab clientId={...} campaignId={...} startDate={...} endDate={...} currency={...} />`

---

## Error Handling

- `getLocationTargets`: if performance query returns no rows for a location, metrics default to 0 (not null) — avoids division-by-zero in CPA/ROAS calculations.
- `searchGeoTargets`: regex special characters in the search query are escaped before inserting into GAQL.
- `addLocationTarget`: if Google Ads returns a duplicate-criterion error (location already targeted), surface as a 409 with message "Location already targeted."
- All mutations: optimistic UI update on success, revert on error with visible error message.

---

## Testing

- `__tests__/api/location-targets.test.ts` — input validation (missing/invalid params), 200 happy path for GET/POST/DELETE/PATCH
- `__tests__/api/geo-target-search.test.ts` — missing `q`, `q` too short (< 2 chars), valid search returns results array
- Optimisation rule logic tested via pure functions (no API calls needed)
