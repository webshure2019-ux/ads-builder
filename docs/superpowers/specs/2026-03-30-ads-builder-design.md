# Ads Builder — Design Spec
**Date:** 2026-03-30
**Status:** Approved
**Project:** Webshure Ads Builder

---

## Context

Webshure is a digital marketing agency that builds Google Ads campaigns for multiple clients. Currently the team manually creates campaigns inside Google Ads — a slow, error-prone process that doesn't enforce best practices or consistency.

The Ads Builder is an internal team tool that accelerates this workflow: a team member fills in a brief (with URL scraping + keyword research), Claude AI generates all ad assets following the latest Google Ads best practices (including Ad Strength optimisation), the team reviews and edits, then publishes directly to the client's Google Ads account via the API. All campaigns are saved to a shared library so drafts and history are accessible to the whole team.

---

## Architecture

### Stack
| Layer | Technology | Notes |
|---|---|---|
| Frontend + Backend | Next.js 14 (App Router) + TypeScript | API routes handle all server-side logic |
| Styling | Tailwind CSS | Webshure brand colours applied globally |
| Database | Supabase (PostgreSQL) | Free tier; campaigns, clients, assets, briefs |
| AI Copy Generation | Claude API (`claude-sonnet-4-6`) | Generates all ad assets from brief + keywords |
| Google Ads | Google Ads API v19 | MCC auth; Keyword Planner + campaign publishing |
| URL Scraping | Cheerio (server-side) | Extracts product info, USPs, tone from landing pages |
| Auth | Next.js middleware + env var password | Single shared password gates the entire app |
| Deployment | Vercel (free tier) | Single Next.js deploy |

### Webshure Brand Colours
```
Primary:    #052E4B  (deep navy)
Accent:     #054991  (dark navy)
Cyan:       #31C0FF  (highlight, CTAs)
Orange:     #FF8A30  (buttons, emphasis)
Teal:       #007EA8  (links, labels)
Light bg:   #D5EEF7  (card borders, inputs)
Background: #F4FAFD
Text:       #2E2E2E
```

### Google Ads Account Setup
- Single Google Ads Manager (MCC) account owned by Webshure
- All client accounts are linked as sub-accounts under the MCC
- The API authenticates once via OAuth2 against the MCC; all client sub-accounts are accessible through it
- No per-client OAuth needed

---

## User Flow — Single Canvas

The entire campaign creation experience lives on one page. Sections expand progressively as the user works through them. A sidebar shows client selector, live progress tracker, and contextual best-practice tips.

```
① Select Client → ② Campaign Type → ③ Brief + URL → ④ Keywords → ⑤ Settings → ⑥ AI Generate → ⑦ Review + Ad Strength → ⑧ Publish
```

### Step-by-step

**① Client selector (sidebar)**
Dropdown of all MCC sub-accounts pulled from the Google Ads API on load. Selecting a client scopes the campaign library and the publish target.

**② Campaign Type**
Six card options: Search, Performance Max, Demand Gen, Display, Shopping, YouTube/Video. Selecting a type controls which fields appear in Settings (step ⑤) and which assets Claude generates (step ⑥).

**③ Brief + URL**
- URL input with a "Scrape" button — Cheerio fetches the landing page server-side, extracts visible text, and pre-fills product, audience, USPs, and tone fields
- Manual fields: Product/Service, Campaign Goal, Target Audience, Key USPs, Tone, Brand Name
- All fields editable regardless of what the scraper found

**④ Keyword Research**
- Seed keyword input → calls Google Ads Keyword Planner API
- Returns keyword suggestions with monthly search volume, competition level, and suggested bid
- Each keyword is tagged with a match type (Exact, Phrase, Broad) — user can toggle match types
- User selects/deselects keywords; selected set is passed to Claude for copy generation
- Best practice: Exact match for high-intent terms; pair Broad match + Smart Bidding for reach

**⑤ Campaign Settings**
Fields adapt per campaign type:

| Setting | Search | PMax | Demand Gen | Display | Shopping | YouTube |
|---|---|---|---|---|---|---|
| Daily budget | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Bidding strategy | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Locations | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Language | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ad schedule | ✓ | — | — | ✓ | ✓ | — |
| Audience signals | — | ✓ | ✓ | ✓ | — | ✓ |
| Merchant Center feed | — | optional | — | — | ✓ | — |
| Channel controls | — | — | ✓ | — | — | ✓ |

**Bidding strategy options** (shown per type):
- Maximize Conversions (recommended for new campaigns < 50 conv/month)
- Target CPA (50+ conversions/month)
- Target ROAS (100+ conversions/month, variable conversion values)
- Maximize Clicks (awareness / new accounts)
- Manual CPC (advanced users only)

**⑥ AI Generate**
Single "Generate Campaign Assets with Claude AI" button. Sends brief, selected keywords, campaign type, and settings to a Next.js API route which calls Claude with a structured prompt. Claude returns all assets as structured JSON.

Assets generated per campaign type:

| Asset | Search | PMax | Demand Gen | Display | Shopping | YouTube |
|---|---|---|---|---|---|---|
| Headlines (×15, 30 chars) | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Long headlines (×5, 90 chars) | — | ✓ | ✓ | — | — | — |
| Descriptions (×4, 90 chars) | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Sitelinks (×4) | ✓ | ✓ | — | — | — | — |
| Callouts (×4) | ✓ | ✓ | — | — | — | — |
| Structured snippets | ✓ | — | — | — | — | — |
| Audience signals | — | ✓ | ✓ | ✓ | — | ✓ |
| Image creative briefs* | — | ✓ | ✓ | ✓ | — | — |
| Shopping product groups | — | — | — | — | ✓ | — |

**⑦ Review + Ad Strength**
- All generated assets are displayed inline and are fully editable
- **Ad Strength meter** — calculated client-side in real time as the user edits:
  - Counts unique headlines (penalises repetition)
  - Checks keyword inclusion across headlines/descriptions
  - Checks character utilisation (closer to limit = better)
  - Flags pinned headlines (too many pins = lower score)
  - Score: Poor → Average → Good → Excellent
  - Inline tips shown below the meter explaining how to improve
- Character count badge on every headline and description — turns red when over limit
- Assets can be regenerated individually ("Regenerate this headline") without redoing everything
- *Image creative briefs = Claude generates text descriptions (size, style, subject, mood) that the team uses to source or design the actual images. The tool does not generate images.

**⑧ Publish**
- "Approve & Publish to Google Ads" button
- Calls Google Ads API v19 to create:
  1. Campaign (with settings)
  2. Ad Group(s)
  3. Ads (RSAs / asset groups per type)
  4. Keywords (Search only)
  5. Extensions/Assets
- Google resource IDs written back to `campaign_assets.google_resource_id` and `campaigns.google_campaign_id`
- Campaign status set to `published` (or `failed` with error message on API error)
- Success state shows a link to view the campaign in Google Ads

---

## Ad Strength — Best Practices Enforced by Claude Prompt

Claude is instructed to follow these rules when generating assets:

- **15 headlines, 4 descriptions** — always fill all slots
- **Uniqueness** — no two headlines can be semantically identical
- **Keyword coverage** — at least 3 headlines must include the primary keyword
- **Character utilisation** — aim for 25–30 chars per headline, 80–90 chars per description
- **CTAs** — at least 2 headlines include a clear call to action
- **Pinning** — Claude does not pin headlines by default (preserves flexibility)
- **Tone consistency** — all assets match the tone specified in the brief
- **No excessive punctuation or ALL CAPS** — Google's editorial policies enforced

---

## Google Ads Best Practices (2025–2026) Built Into the Tool

The following current best practices are encoded in Claude's prompts, the Settings UI defaults, and the sidebar tips panel:

**Search:**
- RSAs replace all other text ad formats — tool only generates RSAs
- Smart Bidding default: Maximize Conversions; tooltip explains when to upgrade to Target CPA/ROAS
- Broad match + Smart Bidding pairing surfaced as recommended
- 2–3 ads per ad group (tool creates 1 RSA per generation; team can add more)

**Performance Max (2026):**
- Minimum 30 conversions/month warning shown if account is new
- Asset groups advised: at least 1 per product/service category
- Audience signals required: customer match list or website visitors recommended
- Search themes: Claude generates up to 25 keyword themes per asset group
- Learning period warning: "Avoid making major changes for 2–6 weeks after launch"

**Demand Gen (2026):**
- Mixed media: tool prompts for both image and video assets (20% more conversions)
- New Customer Acquisition goal surfaced as an option
- Channel controls: YouTube, Discover, Gmail, Display shown as toggleable placements
- Creator partnership note surfaced in best practices panel

**Shopping:**
- Merchant Center feed connection required — tool shows setup instructions if not linked
- Performance Max recommended over Standard Shopping for most accounts

**YouTube / Video:**
- Video Action Campaigns deprecated — tool creates Demand Gen with video by default
- Connected TV placement available as opt-in toggle

---

## Data Model (Supabase / PostgreSQL)

### `clients`
```sql
id               uuid PRIMARY KEY
name             text NOT NULL
google_account_id text NOT NULL   -- MCC sub-account customer ID
industry         text
created_at       timestamptz DEFAULT now()
```

### `campaigns`
```sql
id                  uuid PRIMARY KEY
client_id           uuid REFERENCES clients(id)
name                text NOT NULL
type                text NOT NULL  -- search|pmax|demand_gen|display|shopping|video
status              text NOT NULL  -- draft|review|approved|published|failed
settings            jsonb          -- budget, bidding, locations, language, schedule, etc.
google_campaign_id  text           -- set after successful publish
created_at          timestamptz DEFAULT now()
published_at        timestamptz
```

### `briefs`
```sql
id               uuid PRIMARY KEY
campaign_id      uuid REFERENCES campaigns(id)
url              text
scraped_content  text
product          text
audience         text
usps             text[]
tone             text
goal             text             -- lead_gen|sales|awareness
keywords         jsonb            -- [{text, match_type, volume, competition, selected}]
created_at       timestamptz DEFAULT now()
```

### `campaign_assets`
```sql
id                  uuid PRIMARY KEY
campaign_id         uuid REFERENCES campaigns(id)
asset_type          text NOT NULL   -- headline|description|keyword|sitelink|callout|structured_snippet|image_brief|video_brief|audience_signal|product_group
content             text
metadata            jsonb           -- {pin_position, char_count, match_type, bid, url, ...}
ad_strength_score   text            -- poor|average|good|excellent (per-asset)
is_approved         boolean DEFAULT false
google_resource_id  text            -- set after publish
created_at          timestamptz DEFAULT now()
```

---

## Project Structure

```
ads-builder/
├── app/
│   ├── page.tsx                  # Campaign canvas (main UI)
│   ├── campaigns/page.tsx        # Campaign library (list of drafts + published)
│   ├── layout.tsx                # Global layout + Webshure nav
│   └── api/
│       ├── scrape/route.ts       # URL scraper endpoint
│       ├── keywords/route.ts     # Keyword Planner endpoint
│       ├── generate/route.ts     # Claude AI generation endpoint
│       ├── publish/route.ts      # Google Ads API publish endpoint
│       └── clients/route.ts      # Fetch MCC sub-accounts
├── components/
│   ├── CampaignCanvas.tsx        # Main single-canvas component
│   ├── sections/
│   │   ├── CampaignTypeSelector.tsx
│   │   ├── BriefForm.tsx
│   │   ├── KeywordResearch.tsx
│   │   ├── CampaignSettings.tsx
│   │   ├── GenerateButton.tsx
│   │   └── ReviewAssets.tsx
│   ├── sidebar/
│   │   ├── ClientSelector.tsx
│   │   ├── ProgressTracker.tsx
│   │   └── BestPracticesPanel.tsx
│   └── ui/
│       ├── AdStrengthMeter.tsx
│       ├── CharacterCounter.tsx
│       └── KeywordChip.tsx
├── middleware.ts                  # Password auth gate (checks TOOL_PASSWORD cookie)
├── lib/
│   ├── claude.ts                 # Claude API client + prompt builder
│   ├── google-ads.ts             # Google Ads API client (auth + methods)
│   ├── scraper.ts                # Cheerio-based URL scraper
│   ├── ad-strength.ts            # Client-side Ad Strength scoring logic
│   └── supabase.ts               # Supabase client
├── types/
│   └── index.ts                  # Shared TypeScript types
└── docs/
    └── superpowers/specs/
        └── 2026-03-30-ads-builder-design.md
```

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/clients` | GET | Fetch all MCC sub-accounts from Google Ads API |
| `/api/scrape` | POST | Scrape landing page URL, return extracted fields |
| `/api/keywords` | POST | Call Keyword Planner with seed keywords, return suggestions |
| `/api/generate` | POST | Send brief + keywords to Claude, return structured assets |
| `/api/publish` | POST | Create campaign in Google Ads via API, return resource IDs |

---

## Environment Variables

```env
# App Auth (single shared password)
TOOL_PASSWORD=

# Claude API
ANTHROPIC_API_KEY=

# Google Ads API
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_MCC_CUSTOMER_ID=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Verification

### End-to-end test flow
1. Run `npm run dev` — app redirects to `/login`; enter `TOOL_PASSWORD` → access granted
2. Client list loads from Google Ads API (or mock data in dev)
3. Select "Search" campaign type — brief form appears
4. Enter a URL → click Scrape → fields auto-populate
5. Enter seed keywords → click Research → keyword suggestions appear with volume
6. Fill campaign settings → click Generate → Claude returns assets within ~10s
7. Ad Strength meter shows "Excellent" with all 15 headlines + 4 descriptions
8. Edit a headline → character counter updates in real time
9. Click Publish → campaign appears in Google Ads UI under the selected client account
10. Campaign status in Supabase updates to `published` with `google_campaign_id` set

### Key things to verify per campaign type
- Search: RSA with 15 headlines, 4 descriptions, sitelinks, callouts published correctly
- Performance Max: asset group with headlines, descriptions, image prompts, audience signals
- Demand Gen: mixed image + video assets, channel controls respected
- Shopping: Merchant Center feed linked, product groups created
