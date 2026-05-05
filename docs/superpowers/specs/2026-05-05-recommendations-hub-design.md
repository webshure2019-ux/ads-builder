# Optimisation Recommendations Hub — Design Spec

**Date:** 2026-05-05
**Status:** Approved for implementation

---

## Overview

A new section in the client dashboard where Claude analyses live Google Ads account data and surfaces a prioritised, ranked list of specific optimisation actions. Each recommendation includes the reasoning with real numbers. The account manager reviews them one at a time and either applies the change (via an in-app button) or dismisses it. Advisory-only actions — those the app cannot yet execute — are shown with a "Manual in Google Ads" tag rather than an Apply button.

---

## User Flow

1. Account manager opens a client account and selects a date range
2. Scrolls to the **Optimisation Recommendations** section (positioned above Client Report, below Change History)
3. Clicks **"⚡ Generate Recommendations"**
4. Loading state: Claude fetches live data via tool-use loop, returns structured JSON
5. Recommendations appear ranked by priority (1–10, highest first)
6. Account manager reads each card — reasoning is visible by default
7. Clicks **Apply** to execute the change in Google Ads immediately, or **Dismiss** to remove the card
8. Applied/dismissed cards collapse into a "2 applied / dismissed" summary row at the bottom
9. Clicking **↺ Refresh** re-runs the analysis and replaces the current list

---

## Architecture

### New API Route: `POST /api/recommendations`

Uses the same Claude tool-use loop as `/api/ai-analyse` but with a different system prompt focused on producing structured JSON output.

**Request body:**
```typescript
{
  client_account_id: string
  start_date:        string   // YYYY-MM-DD
  end_date:          string   // YYYY-MM-DD
}
```

**Response:**
```typescript
{
  recommendations: Recommendation[]
  iterations:      number
}
```

**Claude tools available** (same as `/api/ai-analyse`):
- `get_campaign_stats` — spend, clicks, impressions, CTR, conversions, IS, lost IS per campaign
- `get_account_stats` — daily time-series totals
- `get_search_terms` — per-query spend and conversion data for a given campaign
- `get_keywords` — QS, match type, bids, performance per keyword
- `get_device_performance` — CVR, CPA, spend split by device

**System prompt constraints:**
- Return only a JSON array — no prose before or after
- Maximum 10 recommendations per run
- Minimum priority score of 4 — suppress low-signal noise
- Every reasoning field must include at least one real number from the data
- Set `applicable: false` for any action requiring a Google Ads UI step

**JSON extraction:** Parse the response by finding the first `[` and last `]` in the final text block. If parsing fails, return an error state with a Retry button.

---

## Recommendation Schema

```typescript
interface Recommendation {
  id:          string           // uuid — used as React key and for apply/dismiss tracking
  category:    'keyword' | 'budget' | 'ad_copy' | 'negative' | 'bidding' | 'structure'
  priority:    number           // 1–10, Claude-assigned; 10 = highest estimated impact
  title:       string           // Specific, actionable — e.g. "Pause 'cheap widgets' — $280 spent, 0 conversions"
  reasoning:   string           // 1–2 sentences with real numbers justifying the action
  impact:      string           // Short estimate — "Est. saves ~$280/mo" or "Could lift CTR ~0.8pp"
  action_type: ActionType       // See dispatch table below
  action_data: Record<string, string | number>  // Parameters the apply route needs
  applicable:  boolean          // true = Apply button shown; false = Manual tag shown
  status:      'pending' | 'applied' | 'dismissed'  // Managed in frontend state
}

type ActionType =
  | 'pause_keyword'
  | 'update_budget'
  | 'add_negative'
  | 'update_rsa'
  | 'pause_campaign'
  | 'manual'           // Advisory — no apply route
```

---

## Apply Routing

### New API Route: `POST /api/apply-recommendation`

Single route that dispatches to the appropriate Google Ads function based on `action_type`.

**Request body:**
```typescript
{
  action_type:  ActionType
  action_data:  Record<string, string | number>
  client_account_id: string
}
```

**Dispatch table:**

| `action_type`    | Google Ads function      | Status          |
|------------------|--------------------------|-----------------|
| `pause_keyword`  | `setKeywordStatus()`     | ✅ exists        |
| `update_budget`  | `setCampaignBudget()`    | ✅ exists        |
| `add_negative`   | `addCampaignNegative()`  | ✅ exists        |
| `pause_campaign` | `setCampaignStatus()`    | ✅ exists        |

> `update_rsa` is NOT in the V1 dispatch table. `updateRSA()` exists in `lib/google-ads.ts` but requires `adId`, `adGroupId`, and specific headline/description arrays — data Claude cannot populate without a `get_ad_assets` tool. Planned for V1.5: add `get_ads` to the recommendations tool set and wire up the apply route.

**On success:** Returns `{ ok: true }`. Frontend optimistically flips `status` to `'applied'` and collapses the card into the Done list.

**On failure:** Returns `{ ok: false, error: string }`. Card stays in place with an inline error message. No state mutation.

---

## New Component: `RecommendationsSection.tsx`

Location: `components/dashboard/RecommendationsSection.tsx`

**Props:**
```typescript
interface Props {
  clientAccountId: string
  startDate:       string
  endDate:         string
  currency:        string
}
```

**Internal state:**
```typescript
recommendations: Recommendation[]   // Full list from API
filter:          string             // 'all' | category string
loading:         boolean
error:           string | null
iterations:      number             // Tool calls Claude made — shown in header
```

**Key behaviours:**
- Recommendations sorted by `priority` descending on load; sort order maintained as items are dismissed
- Filter chips computed dynamically from categories present in the current result set
- Apply/Dismiss mutate local state only — no re-fetch required
- "Done" count shown as a clickable summary row; collapsed by default
- Refresh re-runs the API call and replaces the full list (Done list also cleared)
- Section collapses to header-only when no recommendations are pending (all applied/dismissed)

**Dashboard placement:** Between `ChangeHistorySection` and `ClientReportSection`.

---

## V1 Scope

### Claude can recommend AND the app can apply:
- Pause underperforming keywords (`pause_keyword`)
- Add campaign-level negative keywords (`add_negative`)
- Update campaign daily budgets (`update_budget`)
- Pause campaigns (`pause_campaign`)

### Claude recommends, shown as advisory (Manual tag) — V1:
- RSA headline/description updates (`update_rsa`) — requires `get_ad_assets` tool, planned V1.5
- Device bid adjustments
- Keyword CPC bid changes
- Ad scheduling / dayparting
- Match type changes
- Audience bid adjustments

Advisory items are fully surfaced in V1 — they include reasoning and an impact estimate, but the Apply button is replaced with a "Manual in Google Ads" tag. They graduate to applicable as Google Ads API functions are added in future iterations.

---

## UI States

| State | Description |
|---|---|
| **Empty** | "⚡ Generate Recommendations" button, brief description of what Claude will analyse |
| **Loading** | Spinner with "Claude is analysing your account…" — typical wait 10–20s |
| **Populated** | Ranked card list with filter chips and Done collapse |
| **Error** | Inline error with Retry button |
| **All done** | "All recommendations reviewed" — show Refresh button |

---

## Files to Create / Modify

| File | Change |
|---|---|
| `app/api/recommendations/route.ts` | New — Claude tool-use loop returning structured JSON |
| `app/api/apply-recommendation/route.ts` | New — dispatches apply actions by type |
| `components/dashboard/RecommendationsSection.tsx` | New — full UI component |
| `components/dashboard/ClientDashboard.tsx` | Add import + render `<RecommendationsSection>` between ChangeHistory and ClientReport |
| `CLAUDE.md` | Document new routes and component |

---

## Out of Scope (V1)

- Scheduling recommendations to run automatically on a cron
- Email/Slack digest of recommendations
- Recommendation history / audit log
- Multi-account bulk application from MCC view
- User-defined priority weighting

These are natural follow-ons once the core loop is validated.
