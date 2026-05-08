# What's New Page Design

**Date:** 2026-05-08
**Feature:** Changelog tab in the main navigation — shows recent features and bug fixes, lets users submit feature requests that persist to Supabase

---

## Goal

Add a 📋 What's New link to the main navigation that opens a dedicated page. The page has two purposes: (1) show a hardcoded bullet-point changelog so users know what has changed since they last used the app, and (2) let users submit feature requests that are saved to Supabase and visible on the same page.

---

## Architecture

Three files touched:

| Action | File | Responsibility |
|---|---|---|
| Modify | `components/Nav.tsx` | Add "📋 What's New" link |
| Create | `app/changelog/page.tsx` | Hardcoded changelog + feature request form + request list |
| Create | `app/api/feature-requests/route.ts` | GET (list all requests) + POST (submit new request) |

---

## Database

Supabase table: `feature_requests`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | primary key, default gen_random_uuid() |
| `title` | text | not null |
| `description` | text | nullable |
| `submitted_at` | timestamptz | default now() |

No RLS needed — the service role key is used server-side (same pattern as all other Supabase usage in this codebase). The table is only accessible through the authenticated API routes.

---

## API Routes

### `GET /api/feature-requests`
Returns all feature requests ordered by `submitted_at DESC`.
Response: `{ requests: FeatureRequest[] }`

### `POST /api/feature-requests`
Body: `{ title: string, description?: string }`
Validation: `title` required and non-empty (400 if missing).
Response: `{ ok: true, request: FeatureRequest }`

Both routes: require `ads-auth` cookie via `requireAuth`. Standard 400/500 error shape.

### `FeatureRequest` type
```typescript
interface FeatureRequest {
  id: string
  title: string
  description: string | null
  submitted_at: string   // ISO 8601
}
```

---

## Page — `app/changelog/page.tsx`

Client component (`'use client'`). Uses `force-dynamic` export.

### Layout (top to bottom)

**① Page heading**
"📋 What's New" — matches the nav label. Subheading: "Recent updates to Ads Builder."

**② Changelog — hardcoded**

Two sections, each a bullet list (newest first):

**🚀 Recent Features**
- 📍 Locations tab — view, edit, and optimise location targets per campaign
- 🏆 Auction Insights tab — competitor overlap analysis per campaign
- 🤖 AI Analyst — ask Claude questions about your account data
- ⚡ AI Recommendations — ranked optimisation suggestions with one-click apply
- 📋 Campaign clone & templates — duplicate campaigns and save reusable templates
- 🔍 Search terms inline actions — exclude or add as keyword without leaving the tab
- ➖ Negative keyword management — add and remove campaign-level negatives
- 🌐 MCC click-through — click any account in the MCC overview to open its dashboard
- 📊 A/B Test tab — statistical significance testing between ads

**🐛 Bug Fixes**
- Fixed keyword seed limit error (capped at 20 items as required by Google Ads API)
- Fixed campaign drill-down rendering bug (bare-else catch-all was activating on unknown tabs)
- Fixed double-fetch in section tabs (useRef guard now consistent across all lazy-load sections)
- Fixed Supabase auto-pause (re-enabled project; set up keep-alive recommendation)
- Enabled Row Level Security on Supabase tables (clients, campaigns)

**③ Feature Requests form**

Fields:
- **Title** — text input, required, placeholder "What would you like to see?"
- **Description** — textarea, optional, placeholder "Any extra detail (optional)"
- **Submit** button — "Submit Request"

On submit: POST `/api/feature-requests` → optimistically prepend new request to list → clear form. Error: show red message below form.

**④ Feature Requests list**

Loaded on mount via GET `/api/feature-requests`. Newest first. Each item shows:
- Title (bold)
- Description (if present, muted text below)
- Date submitted (formatted as "8 May 2026")

Loading state: spinner. Empty state: "No requests yet — be the first to suggest something!" Error state: red message.

---

## Nav Wiring

Add link after "MCC Overview":
```
{ href: '/changelog', label: '📋 What\'s New' }
```

Active state: same pattern as other nav links (highlight when `pathname === '/changelog'`).

---

## Error Handling

- `POST /api/feature-requests`: 400 if `title` is missing or empty string. 500 with message on Supabase error.
- `GET /api/feature-requests`: 500 with message on Supabase error.
- Page-level: fetch errors shown as visible red message, never silent.

---

## Testing

- `__tests__/api/feature-requests.test.ts` — missing title (400), valid POST returns request object, GET returns array
