# Assets Tab Design

**Date:** 2026-05-08
**Feature:** Campaign drill-down Assets tab — view, manage, and measure all ad extensions/assets attached to a campaign or account

---

## Goal

Add a 🔗 Assets tab to the campaign drill-down that gives full visibility and control over every asset (ad extension) attached to a campaign. Users can see performance metrics for each asset, add new ones, edit existing ones, and remove them — all without leaving the app. Covers all 8 standard asset types plus full PMax asset group management. Available for every campaign type including Performance Max.

---

## Architecture

Five files touched:

| Action | File | Responsibility |
|---|---|---|
| Modify | `lib/google-ads.ts` | Asset interfaces + `getAssets`, `getPMaxAssets`, `createAndAttachAsset`, `updateAsset`, `detachAsset`, `createAndAttachPMaxAsset`, `detachPMaxAsset` |
| Create | `lib/error-utils.ts` | Extract shared `errorMessage()` helper (currently inline in `location-targets/route.ts`) — import from here in all new routes + backfill in existing routes |
| Create | `app/api/assets/route.ts` | GET, POST, PATCH, DELETE for standard campaign/account assets |
| Create | `app/api/assets/pmax/route.ts` | GET, POST, DELETE for PMax asset group assets |
| Create | `components/dashboard/AssetsTab.tsx` | Assets tab — sub-tab bar + per-type panels with full CRUD |
| Modify | `components/dashboard/CampaignDrillDown.tsx` | Register `'assets'` tab — no `hidden` condition (all campaign types) |

---

## Data Layer

### Interfaces (`lib/google-ads.ts`)

```typescript
export type AssetType =
  | 'SITELINK' | 'CALLOUT' | 'CALL' | 'STRUCTURED_SNIPPET'
  | 'IMAGE' | 'PROMOTION' | 'PRICE' | 'LEAD_FORM'

export type AssetLevel = 'ACCOUNT' | 'CAMPAIGN'

export interface AssetRow {
  assetId:    string
  assetType:  AssetType
  level:      AssetLevel
  status:     string            // 'ENABLED' | 'PAUSED'
  // Only one of these is populated per row
  sitelink?:          { linkText: string; description1: string; description2: string; finalUrls: string[] }
  callout?:           { text: string }
  call?:              { phoneNumber: string; countryCode: string }
  structuredSnippet?: { header: string; values: string[] }
  image?:             { url: string; mimeType: string }
  promotion?:         { target: string; percentOff: number; promotionCode: string; startDate: string; endDate: string; finalUrls: string[] }
  price?:             { type: string; qualifier: string; items: PriceItem[] }
  leadForm?:          { headline: string; businessName: string; privacyPolicyUrl: string }
  // Performance (zero for account-level rows — metrics not available at customer_asset level)
  clicks:      number
  impressions: number
  cost:        number
  ctr:         number
}

export interface PriceItem {
  header:        string
  description:   string
  priceValue:    number
  priceCurrency: string
  unit:          string
  finalUrls:     string[]
}

export interface PMaxAssetRow {
  assetId:          string
  assetGroupId:     string   // needed by the UI to POST new assets to the correct group
  fieldType:        string   // 'HEADLINE' | 'LONG_HEADLINE' | 'DESCRIPTION' | 'BUSINESS_NAME' | 'MARKETING_IMAGE' | 'SQUARE_MARKETING_IMAGE' | 'LOGO' | 'LANDSCAPE_LOGO' | 'YOUTUBE_VIDEO' | 'CALL_TO_ACTION_SELECTION'
  performanceLabel: string   // 'BEST' | 'GOOD' | 'LOW' | 'PENDING' | 'UNSPECIFIED'
  status:           string
  text?:     string          // headlines, descriptions, business name
  imageUrl?: string          // images, logos
  videoId?:  string          // YouTube video ID
}
```

### Fetching Standard Assets — Two-Query Pattern

Follows the codebase's established two-query pattern.

**Query 1a — campaign-level asset structure** (`FROM campaign_asset`, no date range):
```gaql
SELECT
  asset.id,
  asset.type,
  asset.final_urls,
  asset.sitelink_asset.link_text,
  asset.sitelink_asset.description1,
  asset.sitelink_asset.description2,
  asset.callout_asset.callout_text,
  asset.call_asset.phone_number,
  asset.call_asset.country_code,
  asset.structured_snippet_asset.header,
  asset.structured_snippet_asset.values,
  asset.image_asset.full_size.url,
  asset.image_asset.mime_type,
  asset.promotion_asset.promotion_target,
  asset.promotion_asset.percent_off,
  asset.promotion_asset.promotion_code,
  asset.promotion_asset.start_date,
  asset.promotion_asset.end_date,
  asset.price_asset.type,
  asset.price_asset.price_qualifier,
  asset.lead_form_asset.headline,
  asset.lead_form_asset.business_name,
  asset.lead_form_asset.privacy_policy_url,
  campaign_asset.field_type,
  campaign_asset.status
FROM campaign_asset
WHERE campaign.id = ${campaignId}
  AND campaign_asset.status != 'REMOVED'
```

**Query 1b — account-level asset structure** (`FROM customer_asset`, no date range):
Same `asset.*` fields but `FROM customer_asset` with `customer_asset.field_type` and `customer_asset.status`. Run against the client customer (not MCC). Returns assets attached at account level.

**Query 2 — performance metrics** (`FROM campaign_asset`, scoped to date range):
```gaql
SELECT
  asset.id,
  metrics.clicks,
  metrics.impressions,
  metrics.cost_micros,
  metrics.ctr
FROM campaign_asset
WHERE campaign.id = ${campaignId}
  AND segments.date BETWEEN '${startDate}' AND '${endDate}'
```

Results joined by `asset.id`. Account-level rows (from Query 1b) get zero metrics.

### Fetching PMax Assets — Single Query

`performance_label` is a field on `asset_group_asset`, not a metric, so no date range needed:

```gaql
SELECT
  asset.id,
  asset.type,
  asset.text_asset.text,
  asset.image_asset.full_size.url,
  asset.youtube_video_asset.youtube_video_id,
  asset_group_asset.field_type,
  asset_group_asset.performance_label,
  asset_group_asset.status
FROM asset_group_asset
WHERE asset_group.campaign = 'customers/${cleanedClientId}/campaigns/${campaignId}'
  AND asset_group_asset.status != 'REMOVED'
```

### Mutations

Google Ads assets are always two-step: create the asset resource, then create the link.

**Create + attach (campaign level):**
```typescript
const [assetResult] = await customer.assets.create([{ type, ...typeFields }])
const assetResourceName = assetResult.results[0].resource_name
await customer.campaignAssets.create([{
  campaign: `customers/${cleanedClientId}/campaigns/${campaignId}`,
  asset: assetResourceName,
  field_type: fieldType,
}])
```

**Create + attach (account level):**
Same first step, second step uses `customer.customerAssets.create([{ asset, field_type }])`.

**Update:**
```typescript
await customer.assets.update([{
  resource_name: `customers/${cleanedClientId}/assets/${assetId}`,
  ...updatedTypeFields,
}])
```
Updating the asset itself propagates to all links automatically.

**Detach (unlinks from campaign, does not delete the asset):**
```typescript
await customer.campaignAssets.remove([
  `customers/${cleanedClientId}/campaignAssets/${campaignId}~${assetId}~${fieldType}`
])
```
For account-level: `customer.customerAssets.remove([...])`.

**PMax add:**
```typescript
await customer.assetGroupAssets.create([{
  asset_group: `customers/${cleanedClientId}/assetGroups/${assetGroupId}`,
  asset: assetResourceName,
  field_type: fieldType,
}])
```

**PMax remove:**
```typescript
await customer.assetGroupAssets.remove([resourceName])
```

Note: PMax assets are immutable once created — to change content, remove and re-add.

### Exported Functions

```typescript
getAssets(clientAccountId, campaignId, startDate, endDate): Promise<AssetRow[]>
getPMaxAssets(clientAccountId, campaignId): Promise<PMaxAssetRow[]>
createAndAttachAsset(clientAccountId, campaignId, level, assetType, fields): Promise<{ assetId: string }>
updateAsset(clientAccountId, assetId, assetType, fields): Promise<void>
detachAsset(clientAccountId, campaignId, assetId, fieldType, level): Promise<void>
createAndAttachPMaxAsset(clientAccountId, assetGroupId, fieldType, fields): Promise<{ assetId: string }>
detachPMaxAsset(clientAccountId, assetGroupId, assetId, fieldType): Promise<void>
```

---

## API Routes

### `app/api/assets/route.ts` — Standard Campaigns

**GET `/api/assets`**
Query params: `client_account_id`, `campaign_id`, `start_date`, `end_date`
Returns: `{ rows: AssetRow[] }`

**POST `/api/assets`**
Body: `{ client_account_id, campaign_id, level: 'ACCOUNT'|'CAMPAIGN', asset_type, fields }`
Returns: `{ ok: true, assetId: string }`

**PATCH `/api/assets`**
Body: `{ client_account_id, asset_id, asset_type, fields }`
Returns: `{ ok: true }`

**DELETE `/api/assets`**
Body: `{ client_account_id, campaign_id, asset_id, field_type, level }`
Returns: `{ ok: true }`

### `app/api/assets/pmax/route.ts` — PMax Asset Groups

**GET `/api/assets/pmax`**
Query params: `client_account_id`, `campaign_id`
Returns: `{ rows: PMaxAssetRow[] }`

**POST `/api/assets/pmax`**
Body: `{ client_account_id, asset_group_id, field_type, fields }`
Returns: `{ ok: true, assetId: string }`

**DELETE `/api/assets/pmax`**
Body: `{ client_account_id, asset_group_id, asset_id, field_type }`
Returns: `{ ok: true }`

### Validation

All routes use `requireAuth` and the `errorMessage()` helper from `location-targets/route.ts`.

Per-field validation:
- `client_account_id` — strip dashes, 8–12 digits
- `campaign_id`, `asset_id`, `asset_group_id` — numeric string (`/^\d+$/`)
- `level` — must be `'ACCOUNT'` or `'CAMPAIGN'`
- `asset_type` — must be one of the 8 valid `AssetType` values
- `field_type` — non-empty string

Per-asset-type field validation (enforced in route, not just UI):
- Sitelinks: `fields.linkText` non-empty, `fields.finalUrls` array with at least one URL
- Callouts: `fields.text` non-empty, max 25 characters
- Call: `fields.phoneNumber` non-empty, `fields.countryCode` exactly 2 uppercase letters
- Structured Snippets: `fields.header` non-empty, `fields.values` array with at least 3 items
- Images: `fields.url` non-empty
- Promotions: `fields.target` non-empty, at least one of `fields.percentOff` or `fields.moneyAmountOff`, `fields.finalUrls` non-empty
- Prices: `fields.items` array with at least 3 items, each with `header`, `description`, `priceValue`, `unit`, `finalUrls`
- Lead Forms: `fields.headline`, `fields.businessName`, `fields.privacyPolicyUrl` all non-empty

---

## UI Component — `AssetsTab.tsx`

### Props

```typescript
interface Props {
  clientId:     string
  campaignId:   string
  campaignType: string   // 'PERFORMANCE_MAX' | 'SEARCH' | 'DISPLAY' | etc.
  startDate:    string
  endDate:      string
  currency:     string
}
```

### Data Loading

Single fetch on mount. Key: `${campaignId}-${startDate}-${endDate}`. Uses `useRef('')` guard (not `useState`) — same pattern as `LocationsTab` and `HeatmapTab`.

- Standard campaigns → `GET /api/assets`
- PMax → `GET /api/assets/pmax`

All sub-tabs read from the same `rows` array, filtered by `assetType` (or `fieldType` for PMax). No per-sub-tab refetch.

### Sub-Tab Bar

**Standard campaigns:**
```
Sitelinks | Callouts | Call | Structured Snippets | Images | Promotions | Prices | Lead Forms
```

**PMax campaigns:**
```
Headlines | Descriptions | Images | Logos | Videos | Business Name
```

Switching sub-tabs is instant (client-side filter, no network call).

### Per-Type Table Columns

| Sub-tab | Columns |
|---|---|
| Sitelinks | Link Text \| Desc 1 \| Desc 2 \| Final URL \| Level \| Status \| Clicks \| Impr \| CTR \| Cost \| Edit \| Remove |
| Callouts | Text \| Level \| Status \| Clicks \| Impr \| CTR \| Cost \| Edit \| Remove |
| Call | Phone \| Country \| Level \| Status \| Clicks \| Impr \| CTR \| Cost \| Remove |
| Structured Snippets | Header \| Values \| Level \| Status \| Clicks \| Impr \| CTR \| Cost \| Edit \| Remove |
| Images | Preview \| MIME Type \| Level \| Status \| Clicks \| Impr \| CTR \| Cost \| Remove |
| Promotions | Target \| Discount \| Code \| Dates \| Level \| Status \| Clicks \| Impr \| CTR \| Cost \| Edit \| Remove |
| Prices | Type \| Qualifier \| Items \| Level \| Status \| Clicks \| Impr \| CTR \| Cost \| Edit \| Remove |
| Lead Forms | Headline \| Business \| Level \| Status \| Clicks \| Impr \| CTR \| Cost \| Remove |

**Level badge:** `Account` (blue pill) or `Campaign` (teal pill). Account-level rows show `—` for all metrics (not available at customer_asset level).

**Status badge:** `Enabled` (teal) or `Paused` (muted).

### Add Form

Collapsible panel above each table, toggled by `+ Add [Type]` button. Pre-validates before submit. Fields per type:

- **Sitelinks:** Link Text (req), Description 1, Description 2, Final URL (req), Level (Account/Campaign)
- **Callouts:** Text (req, max 25 chars with live counter), Level
- **Call:** Phone Number (req), Country Code (req, 2-letter), Level
- **Structured Snippets:** Header (dropdown — Amenities, Brands, Courses, Degree Programs, Destinations, Featured Hotels, Insurance Coverage, Models, Neighbourhoods, Service Catalog, Shows, Styles, Types), Values (chips input, up to 10, min 3), Level
- **Images:** Image URL (req), Level
- **Promotions:** Promotion Target (req), Percent Off or Money Amount Off (one req), Promo Code, Start Date, End Date, Final URL (req), Level
- **Prices:** Price Type (dropdown), Price Qualifier (dropdown), 3–8 Price Items (each: header, description, price value, currency, unit, Final URL), Level
- **Lead Forms:** Headline (req), Description (req), Business Name (req), CTA Type (dropdown), Privacy Policy URL (req)

On submit → `POST /api/assets` → optimistically prepend row to table → clear form. On error → keep form open, show red message below.

### Inline Edit

Types that support editing (sitelinks, callouts, structured snippets, promotions, prices): clicking ✏️ expands an inline edit form below the row, pre-populated with current values. Save → `PATCH /api/assets` → optimistic update in place. Cancel → restore original. On error → revert + red message inline.

Call, image, and lead form assets do not support editing (remove + re-add to change).

### Remove

Trash icon → `DELETE /api/assets` → optimistic removal from table → 3-second undo toast. If undo clicked, re-adds the row. After 3 seconds, removal is final. On error → row reappears + red message.

### PMax Sub-Tabs

Simpler layout — no Level column (all at asset-group level), no metrics (performance_label instead):

- **Performance label dot:** 🟢 BEST / 🔵 GOOD / 🔴 LOW / ⚪ PENDING — matches `RSACopyTab` pattern
- **Columns:** Content (text or image preview or video ID) \| Field Type \| Performance \| Status \| Remove
- **No edit** — PMax assets are immutable. Remove + re-add to change content.
- **Add form** per field type: text input for headlines/descriptions/business name, URL input for images/logos, YouTube video ID for videos

### States

- **Loading:** spinner, matches `HeatmapTab` pattern
- **Error:** red pill + Retry button
- **Empty per sub-tab:** e.g. "No sitelinks attached — click + Add Sitelink to get started."

---

## CampaignDrillDown Wiring

Four small changes to `CampaignDrillDown.tsx`:

1. Import `AssetsTab` from `@/components/dashboard/AssetsTab`
2. Extend `DrillTab` union: add `'assets'`
3. Add tab entry — no `hidden` condition (all campaign types including PMax):
   `{ id: 'assets' as DrillTab, label: '🔗 Assets' }`
4. Add render branch: `activeTab === 'assets'` → `<AssetsTab clientId={...} campaignId={...} campaignType={campaign.type} startDate={...} endDate={...} currency={...} />`

Note: `campaign.type` must be passed down through `CampaignDrillDown` props or read from the existing campaign object already in scope.

---

## Error Handling

- All API route catch blocks use the `errorMessage()` helper from `lib/error-utils.ts` — handles gRPC status objects that are not `instanceof Error`. First implementation task extracts this helper from its current inline location in `location-targets/route.ts` into the shared util, then imports it everywhere.
- All catch blocks log the raw `err` object (not the extracted string) for full Vercel log visibility
- Duplicate asset (already attached): surface as 409 with clear message — check error message for "already exists" or "duplicate"
- Asset group not found (PMax): 404 response with clear message
- Form-level validation prevents invalid submissions before they reach the API (char limits, required fields, minimum array lengths)

---

## Testing

- `__tests__/api/assets.test.ts` — GET (missing params, valid response), POST (missing fields, invalid asset type, valid per type), PATCH (invalid asset id, valid), DELETE (valid)
- `__tests__/api/assets-pmax.test.ts` — GET (missing params, valid), POST (missing fields, valid), DELETE (valid)
- Unit tests for per-type field validation functions (pure functions, no API calls needed)
