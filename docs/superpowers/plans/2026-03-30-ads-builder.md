# Webshure Ads Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an internal agency tool that generates Google Ads campaign assets with Claude AI, performs keyword research via Keyword Planner, and publishes directly to Google Ads via the API.

**Architecture:** Single Next.js 14 App Router project. API routes handle all server-side integrations. Supabase stores clients, campaigns, briefs, and assets. Password middleware with a single env var gates the entire app.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Supabase (`@supabase/supabase-js`), Claude API (`@anthropic-ai/sdk`), Google Ads API (`google-ads-api`), Cheerio, Jest

---

## File Map

```
ads-builder/
├── app/
│   ├── page.tsx                        # Campaign canvas (main UI)
│   ├── layout.tsx                      # Root layout + fonts
│   ├── globals.css                     # Tailwind + Webshure CSS vars
│   ├── login/page.tsx                  # Password login page
│   ├── campaigns/page.tsx              # Campaign library
│   └── api/
│       ├── auth/route.ts               # POST: set auth cookie
│       ├── clients/route.ts            # GET: MCC sub-accounts
│       ├── scrape/route.ts             # POST: URL scraper
│       ├── keywords/route.ts           # POST: Keyword Planner
│       ├── generate/route.ts           # POST: Claude generation
│       └── publish/route.ts            # POST: Google Ads publish
├── components/
│   ├── CampaignCanvas.tsx              # Main canvas orchestrator (state owner)
│   ├── sections/
│   │   ├── CampaignTypeSelector.tsx
│   │   ├── BriefForm.tsx
│   │   ├── KeywordResearch.tsx
│   │   ├── CampaignSettings.tsx
│   │   └── ReviewAssets.tsx
│   ├── sidebar/
│   │   ├── ClientSelector.tsx
│   │   ├── ProgressTracker.tsx
│   │   └── BestPracticesPanel.tsx
│   └── ui/
│       ├── AdStrengthMeter.tsx
│       ├── CharacterCounter.tsx
│       └── KeywordChip.tsx
├── lib/
│   ├── claude.ts                       # Claude API client + prompt builders
│   ├── google-ads.ts                   # Google Ads API client
│   ├── scraper.ts                      # Cheerio URL scraper
│   ├── ad-strength.ts                  # Ad Strength scoring logic
│   └── supabase.ts                     # Supabase client (server + browser)
├── types/index.ts                      # All shared TypeScript types
├── middleware.ts                       # Password auth gate
└── __tests__/
    ├── lib/ad-strength.test.ts
    ├── lib/scraper.test.ts
    ├── lib/claude.test.ts
    └── api/generate.test.ts
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `jest.config.ts`, `.env.local`

- [ ] **Step 1: Scaffold Next.js project**

```bash
npx create-next-app@14 ads-builder \
  --typescript --tailwind --app \
  --no-src-dir --import-alias "@/*" \
  --no-eslint
cd ads-builder
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @anthropic-ai/sdk @supabase/supabase-js google-ads-api cheerio
npm install --save-dev jest @types/jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom ts-jest
```

- [ ] **Step 3: Configure Jest**

Create `jest.config.ts`:
```typescript
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
}

export default createJestConfig(config)
```

- [ ] **Step 4: Create `.env.local`**

```env
TOOL_PASSWORD=webshure2026

ANTHROPIC_API_KEY=

GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_MCC_CUSTOMER_ID=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 5: Verify dev server starts**

```bash
npm run dev
```
Expected: server running at `http://localhost:3000`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with dependencies"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `types/index.ts`

- [ ] **Step 1: Create types**

```typescript
// types/index.ts
export type CampaignType = 'search' | 'pmax' | 'demand_gen' | 'display' | 'shopping' | 'video'
export type CampaignStatus = 'draft' | 'review' | 'approved' | 'published' | 'failed'
export type AssetType =
  | 'headline' | 'long_headline' | 'description' | 'keyword'
  | 'sitelink' | 'callout' | 'structured_snippet'
  | 'image_brief' | 'video_brief' | 'audience_signal'
  | 'search_theme' | 'product_group'
export type MatchType = 'exact' | 'phrase' | 'broad'
export type BiddingStrategy =
  | 'maximize_conversions' | 'target_cpa' | 'target_roas'
  | 'maximize_clicks' | 'manual_cpc'
export type GoalType = 'lead_gen' | 'sales' | 'awareness'
export type ToneType = 'professional' | 'friendly' | 'urgent' | 'authoritative' | 'conversational'
export type AdStrength = 'poor' | 'average' | 'good' | 'excellent'

export interface Client {
  id: string
  name: string
  google_account_id: string
  industry?: string
  created_at: string
}

export interface CampaignSettingsData {
  budget_daily: number
  bidding_strategy: BiddingStrategy
  target_cpa?: number
  target_roas?: number
  locations: string[]
  language: string
  schedule?: string
  audience_signals?: string[]
  merchant_center_id?: string
  channel_controls?: {
    youtube: boolean
    discover: boolean
    gmail: boolean
    display: boolean
  }
}

export interface Campaign {
  id: string
  client_id: string
  name: string
  type: CampaignType
  status: CampaignStatus
  settings: CampaignSettingsData
  google_campaign_id?: string
  created_at: string
  published_at?: string
}

export interface Keyword {
  text: string
  match_type: MatchType
  volume?: number
  competition?: string
  suggested_bid?: number
  selected: boolean
}

export interface Brief {
  id?: string
  campaign_id?: string
  url?: string
  scraped_content?: string
  product: string
  audience: string
  usps: string[]
  tone: ToneType
  goal: GoalType
  brand_name: string
  keywords: Keyword[]
}

export interface Sitelink {
  text: string
  url: string
  description1: string
  description2: string
}

export interface StructuredSnippet {
  header: string
  values: string[]
}

export interface GeneratedAssets {
  headlines: string[]
  long_headlines?: string[]
  descriptions: string[]
  sitelinks?: Sitelink[]
  callouts?: string[]
  structured_snippets?: StructuredSnippet[]
  image_briefs?: string[]
  video_briefs?: string[]
  audience_signals?: string[]
  search_themes?: string[]
  product_groups?: string[]
}

export interface ScrapedContent {
  product: string
  audience: string
  usps: string[]
  tone: ToneType
  raw_text: string
}

export interface KeywordSuggestion {
  text: string
  volume: number
  competition: string
  suggested_bid: number
}

export interface AdStrengthResult {
  score: AdStrength
  numeric: number
  tips: string[]
}

export interface CanvasState {
  client_id: string | null
  campaign_type: CampaignType | null
  brief: Partial<Brief>
  settings: Partial<CampaignSettingsData>
  assets: GeneratedAssets | null
  campaign_id: string | null
  is_generating: boolean
  is_publishing: boolean
  error: string | null
}
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: Supabase Schema + Client

**Files:**
- Create: `lib/supabase.ts`
- Create: `supabase/migrations/001_initial.sql`

- [ ] **Step 1: Create Supabase project**

Go to https://supabase.com → New project. Copy the project URL and anon key into `.env.local`.

- [ ] **Step 2: Create migration SQL**

Create `supabase/migrations/001_initial.sql` and run it in the Supabase SQL editor:

```sql
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  google_account_id text not null,
  industry text,
  created_at timestamptz default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  type text not null check (type in ('search','pmax','demand_gen','display','shopping','video')),
  status text not null default 'draft' check (status in ('draft','review','approved','published','failed')),
  settings jsonb not null default '{}',
  google_campaign_id text,
  created_at timestamptz default now(),
  published_at timestamptz
);

create table briefs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  url text,
  scraped_content text,
  product text,
  audience text,
  usps text[] default '{}',
  tone text,
  goal text,
  brand_name text,
  keywords jsonb not null default '[]',
  created_at timestamptz default now()
);

create table campaign_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  asset_type text not null,
  content text,
  metadata jsonb default '{}',
  ad_strength_score text,
  is_approved boolean default false,
  google_resource_id text,
  created_at timestamptz default now()
);
```

- [ ] **Step 3: Create Supabase client**

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

// Server-side client (uses service role — never expose to browser)
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Browser-safe client (uses anon key)
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/supabase.ts supabase/
git commit -m "feat: add Supabase schema and client"
```

---

## Task 4: Password Auth Middleware + Login Page

**Files:**
- Create: `middleware.ts`
- Create: `app/login/page.tsx`
- Create: `app/api/auth/route.ts`

- [ ] **Step 1: Write failing test**

Create `__tests__/middleware.test.ts`:
```typescript
import { NextRequest } from 'next/server'

// We test the auth logic directly rather than the middleware export
// since Next.js middleware runs in the Edge runtime
function isAuthenticated(cookies: Record<string, string>): boolean {
  return cookies['ads-auth'] === process.env.TOOL_PASSWORD
}

describe('auth check', () => {
  beforeEach(() => {
    process.env.TOOL_PASSWORD = 'testpass'
  })

  it('returns false when cookie is missing', () => {
    expect(isAuthenticated({})).toBe(false)
  })

  it('returns false when cookie value is wrong', () => {
    expect(isAuthenticated({ 'ads-auth': 'wrong' })).toBe(false)
  })

  it('returns true when cookie matches TOOL_PASSWORD', () => {
    expect(isAuthenticated({ 'ads-auth': 'testpass' })).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx jest __tests__/middleware.test.ts
```
Expected: FAIL — `isAuthenticated is not defined`

- [ ] **Step 3: Create middleware**

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow login page and auth API through
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const cookie = request.cookies.get('ads-auth')?.value
  if (cookie !== process.env.TOOL_PASSWORD) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 4: Create auth API route**

```typescript
// app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { password } = await request.json()

  if (password !== process.env.TOOL_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set('ads-auth', password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
  return response
}
```

- [ ] **Step 5: Create login page**

```typescript
// app/login/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setLoading(false)
    if (res.ok) {
      router.push('/')
    } else {
      setError('Incorrect password')
    }
  }

  return (
    <div className="min-h-screen bg-[#F4FAFD] flex items-center justify-center">
      <div className="bg-white border border-[#D5EEF7] rounded-2xl p-10 w-full max-w-sm shadow-sm">
        <div className="text-center mb-8">
          <span className="text-[#052E4B] font-black text-2xl font-['Montserrat',Arial,sans-serif]">
            web<span className="text-[#31C0FF]">shure</span>
          </span>
          <p className="text-[#007EA8] text-sm mt-1">Ads Builder</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border border-[#D5EEF7] rounded-lg px-4 py-3 text-[#052E4B] bg-[#F4FAFD] focus:outline-none focus:border-[#31C0FF]"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#052E4B] text-white rounded-full py-3 font-bold font-['Montserrat',Arial,sans-serif] hover:bg-[#054991] transition-colors disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run test — expect PASS**

```bash
npx jest __tests__/middleware.test.ts
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add middleware.ts app/login/ app/api/auth/ __tests__/middleware.test.ts
git commit -m "feat: add password auth middleware and login page"
```

---

## Task 5: Tailwind Config + Global Layout

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Configure Tailwind with Webshure colours**

Replace `tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy:    { DEFAULT: '#052E4B', dark: '#054991' },
        cyan:    { DEFAULT: '#31C0FF' },
        orange:  { DEFAULT: '#FF8A30' },
        teal:    { DEFAULT: '#007EA8' },
        cloud:   { DEFAULT: '#D5EEF7' },
        mist:    { DEFAULT: '#F4FAFD' },
      },
      fontFamily: {
        heading: ['Montserrat', 'Arial', 'sans-serif'],
        body:    ['Roboto', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
```

- [ ] **Step 2: Update globals.css**

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&family=Roboto:wght@400;500&display=swap');

body {
  background-color: #F4FAFD;
  color: #052E4B;
  font-family: 'Roboto', Arial, sans-serif;
}
```

- [ ] **Step 3: Update root layout**

```typescript
// app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Webshure Ads Builder',
  description: 'Google Ads campaign builder',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts app/globals.css app/layout.tsx
git commit -m "feat: configure Webshure brand theme in Tailwind"
```

---

## Task 6: URL Scraper

**Files:**
- Create: `lib/scraper.ts`
- Create: `__tests__/lib/scraper.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/lib/scraper.test.ts
import { extractContent, inferTone } from '@/lib/scraper'

describe('inferTone', () => {
  it('returns urgent for urgency language', () => {
    expect(inferTone('limited time offer, act now!')).toBe('urgent')
  })

  it('returns professional for professional language', () => {
    expect(inferTone('trusted enterprise solution for professionals')).toBe('professional')
  })

  it('defaults to professional', () => {
    expect(inferTone('we sell products')).toBe('professional')
  })
})

describe('extractContent', () => {
  it('strips HTML and returns text content', () => {
    const html = '<html><body><h1>PPC Management</h1><p>We help businesses grow.</p><ul><li>No contracts</li><li>Certified Google Partner</li></ul></body></html>'
    const result = extractContent(html, 'https://example.com')
    expect(result.product).toContain('PPC Management')
    expect(result.usps).toContain('No contracts')
    expect(result.usps).toContain('Certified Google Partner')
    expect(result.raw_text).toContain('We help businesses grow')
  })

  it('uses meta description when available', () => {
    const html = '<html><head><meta name="description" content="Expert PPC for SMBs"></head><body><h1>PPC Agency</h1></body></html>'
    const result = extractContent(html, 'https://example.com')
    expect(result.audience).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx jest __tests__/lib/scraper.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/scraper'`

- [ ] **Step 3: Implement scraper**

```typescript
// lib/scraper.ts
import * as cheerio from 'cheerio'
import { ScrapedContent, ToneType } from '@/types'

export function inferTone(text: string): ToneType {
  const lower = text.toLowerCase()
  if (lower.includes('limited time') || lower.includes('act now') || lower.includes('hurry')) return 'urgent'
  if (lower.includes('enterprise') || lower.includes('trusted') || lower.includes('professional')) return 'professional'
  if (lower.includes('easy') || lower.includes('simple') || lower.includes('friendly')) return 'friendly'
  if (lower.includes('expert') || lower.includes('certified') || lower.includes('authority')) return 'authoritative'
  return 'professional'
}

export function extractContent(html: string, url: string): ScrapedContent {
  const $ = cheerio.load(html)

  $('script, style, nav, footer, noscript, iframe').remove()

  const title = $('title').text().split(/[|\-–]/)[0].trim()
  const metaDescription = $('meta[name="description"]').attr('content') || ''
  const headings = $('h1, h2, h3').map((_, el) => $(el).text().trim()).get().filter(Boolean)
  const paragraphs = $('p').map((_, el) => $(el).text().trim()).get()
    .filter(t => t.length > 30)
    .slice(0, 8)
  const listItems = $('li').map((_, el) => $(el).text().trim()).get()
    .filter(t => t.length > 5 && t.length < 120)
    .slice(0, 8)

  const raw_text = [...headings, ...paragraphs].join('\n').slice(0, 3000)

  const audience = inferAudience(raw_text + ' ' + metaDescription)

  return {
    product: title || headings[0] || 'Product/Service',
    audience,
    usps: listItems.slice(0, 6),
    tone: inferTone(raw_text),
    raw_text,
  }
}

function inferAudience(text: string): string {
  const lower = text.toLowerCase()
  if (lower.includes('small business') || lower.includes(' smb')) return 'Small to medium businesses'
  if (lower.includes('enterprise') || lower.includes('corporate')) return 'Enterprise businesses'
  if (lower.includes('homeowner') || lower.includes('residential')) return 'Homeowners'
  if (lower.includes('ecommerce') || lower.includes('online store')) return 'eCommerce businesses'
  return 'Businesses looking for professional services'
}

export async function scrapeUrl(url: string): Promise<ScrapedContent> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebshureAdsBot/1.0)' },
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  const html = await response.text()
  return extractContent(html, url)
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx jest __tests__/lib/scraper.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/scraper.ts __tests__/lib/scraper.test.ts
git commit -m "feat: add URL scraper with cheerio"
```

---

## Task 7: Ad Strength Scoring

**Files:**
- Create: `lib/ad-strength.ts`
- Create: `__tests__/lib/ad-strength.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/lib/ad-strength.test.ts
import { calculateAdStrength } from '@/lib/ad-strength'

const STRONG_HEADLINES = [
  'Expert PPC Management', 'Certified Google Partner', 'No Lock-In Contracts',
  'Grow Your Business Online', 'Google Ads That Convert', 'Transparent Reporting',
  'Free Campaign Audit', 'PPC Management Services', 'Maximise Your ROI Today',
  'Get More Qualified Leads', 'South Africa PPC Experts', 'Start Your Campaign Now',
  'Proven Results Guaranteed', 'Data-Driven PPC Strategy', 'Call Us For Free Quote',
]
const STRONG_DESCRIPTIONS = [
  'Webshure is a certified Google Partner offering expert PPC management with transparent reporting and no lock-in contracts.',
  'Stop wasting ad spend. Our Google Ads specialists build campaigns that drive qualified leads and measurable ROI.',
  'We manage Google Ads campaigns for businesses across South Africa. Get a free audit and start seeing results today.',
  'From Search to Performance Max, we handle every aspect of your Google Ads. No contracts. Just results.',
]

describe('calculateAdStrength', () => {
  it('returns excellent for full 15 headlines + 4 descriptions', () => {
    const result = calculateAdStrength(STRONG_HEADLINES, STRONG_DESCRIPTIONS, 'ppc management')
    expect(result.score).toBe('excellent')
    expect(result.numeric).toBeGreaterThanOrEqual(85)
  })

  it('returns poor for empty headlines', () => {
    const result = calculateAdStrength([], [], undefined)
    expect(result.score).toBe('poor')
  })

  it('returns average for 5 headlines + 2 descriptions', () => {
    const result = calculateAdStrength(STRONG_HEADLINES.slice(0, 5), STRONG_DESCRIPTIONS.slice(0, 2), undefined)
    expect(result.score).toBe('average')
  })

  it('includes a tip when keyword is missing from headlines', () => {
    const result = calculateAdStrength(
      ['Best Agency', 'Call Us Today', 'Get Results Now', 'No Contracts', 'Free Audit',
       'Grow Online', 'Expert Team', 'Proven Results', 'South Africa', 'Start Today',
       'Transparent', 'ROI Focused', 'Data Driven', 'We Deliver', 'Contact Us'],
      STRONG_DESCRIPTIONS,
      'google ads management'
    )
    expect(result.tips.some(t => t.includes('google ads management'))).toBe(true)
  })

  it('provides a positive tip when score is excellent', () => {
    const result = calculateAdStrength(STRONG_HEADLINES, STRONG_DESCRIPTIONS, 'ppc management')
    expect(result.tips.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx jest __tests__/lib/ad-strength.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/ad-strength'`

- [ ] **Step 3: Implement ad strength scorer**

```typescript
// lib/ad-strength.ts
import { AdStrength, AdStrengthResult, GeneratedAssets } from '@/types'

export function calculateAdStrength(
  headlines: string[],
  descriptions: string[],
  primaryKeyword: string | undefined
): AdStrengthResult {
  const tips: string[] = []
  let score = 0

  // 1. Headline count — 30 points
  const hCount = headlines.filter(h => h.trim().length > 0).length
  if (hCount >= 15) score += 30
  else if (hCount >= 10) score += 20
  else if (hCount >= 5) score += 10
  if (hCount < 15) tips.push(`Add more headlines — you have ${hCount}/15.`)

  // 2. Description count — 20 points
  const dCount = descriptions.filter(d => d.trim().length > 0).length
  if (dCount >= 4) score += 20
  else if (dCount >= 2) score += 10
  if (dCount < 4) tips.push(`Add more descriptions — you have ${dCount}/4.`)

  // 3. Headline uniqueness — 20 points
  const unique = new Set(headlines.map(h => h.toLowerCase().trim()))
  const ratio = unique.size / Math.max(hCount, 1)
  if (ratio >= 0.9) score += 20
  else if (ratio >= 0.7) score += 10
  else tips.push('Several headlines are too similar. Make each headline unique.')

  // 4. Character utilisation — 15 points
  const avgLen = hCount > 0
    ? headlines.reduce((s, h) => s + h.length, 0) / hCount
    : 0
  if (avgLen >= 24) score += 15
  else if (avgLen >= 15) score += 8
  else tips.push('Headlines are too short. Aim for 24–30 characters each.')

  // 5. Keyword inclusion — 15 points
  if (primaryKeyword) {
    const kw = primaryKeyword.toLowerCase()
    const withKw = headlines.filter(h => h.toLowerCase().includes(kw)).length
    if (withKw >= 3) score += 15
    else if (withKw >= 1) score += 8
    else tips.push(`Include the keyword "${primaryKeyword}" in at least 3 headlines.`)
  } else {
    score += 15
  }

  const grade: AdStrength =
    score >= 85 ? 'excellent' :
    score >= 65 ? 'good' :
    score >= 40 ? 'average' : 'poor'

  if (tips.length === 0) tips.push('Excellent! Your ad assets are well-optimised.')

  return { score: grade, numeric: score, tips }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx jest __tests__/lib/ad-strength.test.ts
```
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/ad-strength.ts __tests__/lib/ad-strength.test.ts
git commit -m "feat: add Ad Strength scoring logic"
```

---

## Task 8: Claude Integration

**Files:**
- Create: `lib/claude.ts`
- Create: `__tests__/lib/claude.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/lib/claude.test.ts
import { buildPrompt, parseAssetsResponse } from '@/lib/claude'
import type { Brief } from '@/types'

const mockBrief: Brief = {
  product: 'PPC Management',
  audience: 'Small businesses',
  usps: ['Certified Google Partner', 'No contracts', 'Transparent reporting'],
  tone: 'professional',
  goal: 'lead_gen',
  brand_name: 'Webshure',
  keywords: [
    { text: 'ppc management', match_type: 'exact', selected: true },
    { text: 'google ads agency', match_type: 'phrase', selected: true },
    { text: 'paid search', match_type: 'broad', selected: false },
  ],
}

describe('buildPrompt', () => {
  it('includes brand name in prompt', () => {
    const prompt = buildPrompt(mockBrief, 'search')
    expect(prompt).toContain('Webshure')
  })

  it('includes selected keywords only', () => {
    const prompt = buildPrompt(mockBrief, 'search')
    expect(prompt).toContain('ppc management')
    expect(prompt).toContain('google ads agency')
    expect(prompt).not.toContain('paid search (broad)')
  })

  it('requests 15 headlines for search campaigns', () => {
    const prompt = buildPrompt(mockBrief, 'search')
    expect(prompt).toContain('15')
  })

  it('requests search_themes for pmax campaigns', () => {
    const prompt = buildPrompt(mockBrief, 'pmax')
    expect(prompt).toContain('search_themes')
  })
})

describe('parseAssetsResponse', () => {
  it('parses valid JSON response', () => {
    const json = JSON.stringify({
      headlines: ['Headline One', 'Headline Two'],
      descriptions: ['Description one here with more text to fill the space out nicely.'],
    })
    const result = parseAssetsResponse(json)
    expect(result.headlines).toHaveLength(2)
    expect(result.descriptions).toHaveLength(1)
  })

  it('throws on invalid JSON', () => {
    expect(() => parseAssetsResponse('not json')).toThrow()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx jest __tests__/lib/claude.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement Claude client**

```typescript
// lib/claude.ts
import Anthropic from '@anthropic-ai/sdk'
import { Brief, CampaignType, GeneratedAssets } from '@/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export function buildPrompt(brief: Brief, campaignType: CampaignType): string {
  const selectedKeywords = brief.keywords
    .filter(k => k.selected)
    .map(k => `${k.text} (${k.match_type})`)
    .join(', ')

  return `You are an expert Google Ads copywriter. Generate campaign assets for a ${campaignType.toUpperCase()} campaign.

BRAND: ${brief.brand_name}
PRODUCT/SERVICE: ${brief.product}
TARGET AUDIENCE: ${brief.audience}
KEY USPs: ${brief.usps.join(', ')}
TONE: ${brief.tone}
CAMPAIGN GOAL: ${brief.goal}
SELECTED KEYWORDS: ${selectedKeywords}

REQUIREMENTS:
${getAssetRequirements(campaignType)}

RULES:
- Headlines: HARD LIMIT 30 characters each — count carefully
- Descriptions: HARD LIMIT 90 characters each — count carefully
- Every headline must be semantically unique
- At least 3 headlines must include the primary keyword
- At least 2 headlines must contain a clear call to action
- No pinning suggestions (do not include pin_position)
- Match the specified tone throughout all copy
- No ALL CAPS words, no excessive punctuation (Google policy)

Return ONLY valid JSON (no markdown fences, no explanation):
${getJsonSchema(campaignType)}`
}

function getAssetRequirements(type: CampaignType): string {
  const reqs: Record<CampaignType, string> = {
    search: `- 15 unique headlines (max 30 chars each)
- 4 descriptions (max 90 chars each)
- 4 sitelinks: {text, url, description1, description2}
- 4 callout extensions (max 25 chars each)
- 3 structured snippets: {header, values: [3 items]}`,
    pmax: `- 5 short headlines (max 30 chars)
- 5 long headlines (max 90 chars)
- 5 descriptions (max 90 chars)
- 4 sitelinks: {text, url, description1, description2}
- 4 callout extensions
- 25 search_themes (keyword phrases that guide the algorithm)
- 3 image_briefs (describe: dimensions, subject, style, mood)
- 3 audience_signals (describe audience characteristics)`,
    demand_gen: `- 5 headlines (max 30 chars)
- 5 long_headlines (max 90 chars)
- 5 descriptions (max 90 chars)
- 3 image_briefs (describe: dimensions, subject, style, mood)
- 2 video_briefs (describe: length, opening hook, key message, CTA)
- 3 audience_signals`,
    display: `- 5 headlines (max 30 chars)
- 5 descriptions (max 90 chars)
- 3 image_briefs (describe: dimensions, subject, style, mood)`,
    shopping: `- 3 product_groups (product category names for feed segmentation)
- 3 headlines (promotional text, max 60 chars)
- 3 descriptions (promotional copy, max 90 chars)`,
    video: `- 5 headlines (max 30 chars)
- 5 descriptions (max 90 chars)
- 3 video_briefs (describe: length, opening hook, key message, CTA)
- 3 audience_signals`,
  }
  return reqs[type]
}

function getJsonSchema(type: CampaignType): string {
  const schemas: Record<CampaignType, string> = {
    search: `{"headlines":[],"descriptions":[],"sitelinks":[{"text":"","url":"","description1":"","description2":""}],"callouts":[],"structured_snippets":[{"header":"","values":[]}]}`,
    pmax: `{"headlines":[],"long_headlines":[],"descriptions":[],"sitelinks":[{"text":"","url":"","description1":"","description2":""}],"callouts":[],"search_themes":[],"image_briefs":[],"audience_signals":[]}`,
    demand_gen: `{"headlines":[],"long_headlines":[],"descriptions":[],"image_briefs":[],"video_briefs":[],"audience_signals":[]}`,
    display: `{"headlines":[],"descriptions":[],"image_briefs":[]}`,
    shopping: `{"product_groups":[],"headlines":[],"descriptions":[]}`,
    video: `{"headlines":[],"descriptions":[],"video_briefs":[],"audience_signals":[]}`,
  }
  return schemas[type]
}

export function parseAssetsResponse(text: string): GeneratedAssets {
  try {
    return JSON.parse(text) as GeneratedAssets
  } catch {
    throw new Error(`Claude returned invalid JSON: ${text.slice(0, 300)}`)
  }
}

export async function generateAssets(
  brief: Brief,
  campaignType: CampaignType
): Promise<GeneratedAssets> {
  const prompt = buildPrompt(brief, campaignType)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return parseAssetsResponse(text)
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx jest __tests__/lib/claude.test.ts
```
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/claude.ts __tests__/lib/claude.test.ts
git commit -m "feat: add Claude integration with per-type prompt builders"
```

---

## Task 9: Google Ads API Client

**Files:**
- Create: `lib/google-ads.ts`

- [ ] **Step 1: Implement Google Ads client**

```typescript
// lib/google-ads.ts
import { GoogleAdsApi } from 'google-ads-api'
import { Keyword, CampaignSettingsData, GeneratedAssets, KeywordSuggestion } from '@/types'

function makeClient() {
  return new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  })
}

function cleanId(id: string) {
  return id.replace(/-/g, '')
}

function getMccCustomer() {
  return makeClient().Customer({
    customer_id: cleanId(process.env.GOOGLE_ADS_MCC_CUSTOMER_ID!),
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    login_customer_id: cleanId(process.env.GOOGLE_ADS_MCC_CUSTOMER_ID!),
  })
}

function getClientCustomer(clientAccountId: string) {
  return makeClient().Customer({
    customer_id: cleanId(clientAccountId),
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    login_customer_id: cleanId(process.env.GOOGLE_ADS_MCC_CUSTOMER_ID!),
  })
}

export async function listMccClients(): Promise<{ id: string; name: string }[]> {
  const customer = getMccCustomer()
  const results = await customer.query(`
    SELECT
      customer_client.id,
      customer_client.descriptive_name,
      customer_client.status
    FROM customer_client
    WHERE customer_client.level <= 1
      AND customer_client.status = 'ENABLED'
      AND customer_client.id != ${cleanId(process.env.GOOGLE_ADS_MCC_CUSTOMER_ID!)}
  `)
  return results.map((r: any) => ({
    id: String(r.customer_client.id),
    name: r.customer_client.descriptive_name || `Account ${r.customer_client.id}`,
  }))
}

export async function getKeywordSuggestions(
  seedKeywords: string[]
): Promise<KeywordSuggestion[]> {
  const customer = getMccCustomer()
  const ideas = await customer.keywordPlanIdeas.generateKeywordIdeas({
    customer_id: cleanId(process.env.GOOGLE_ADS_MCC_CUSTOMER_ID!),
    language: 'languageConstants/1000',
    geo_target_constants: ['geoTargetConstants/2710'],
    include_adult_keywords: false,
    keyword_seed: { keywords: seedKeywords },
  })

  return (ideas || []).slice(0, 50).map((idea: any) => ({
    text: idea.text,
    volume: idea.keyword_idea_metrics?.avg_monthly_searches || 0,
    competition: idea.keyword_idea_metrics?.competition || 'UNSPECIFIED',
    suggested_bid: idea.keyword_idea_metrics?.average_cpc_micros
      ? idea.keyword_idea_metrics.average_cpc_micros / 1_000_000
      : 0,
  }))
}

// Match type enum values for Google Ads API
const MATCH_TYPE = { exact: 4, phrase: 3, broad: 5 }

// Bidding strategy builder
function buildBiddingStrategy(settings: CampaignSettingsData) {
  switch (settings.bidding_strategy) {
    case 'maximize_conversions':
      return { maximize_conversions: {} }
    case 'target_cpa':
      return { target_cpa: { target_cpa_micros: (settings.target_cpa || 0) * 1_000_000 } }
    case 'target_roas':
      return { target_roas: { target_roas: settings.target_roas || 1 } }
    case 'maximize_clicks':
      return { maximize_clicks: {} }
    default:
      return { maximize_conversions: {} }
  }
}

export async function publishSearchCampaign(
  clientAccountId: string,
  name: string,
  settings: CampaignSettingsData,
  assets: GeneratedAssets,
  keywords: Keyword[]
): Promise<string> {
  const customer = getClientCustomer(clientAccountId)

  const [budget] = await customer.campaignBudgets.create([{
    name: `${name} Budget`,
    amount_micros: settings.budget_daily * 1_000_000,
    delivery_method: 2, // STANDARD
  }])

  const [campaign] = await customer.campaigns.create([{
    name,
    advertising_channel_type: 2, // SEARCH
    status: 3, // PAUSED
    campaign_budget: budget.resource_name,
    ...buildBiddingStrategy(settings),
  }])

  const [adGroup] = await customer.adGroups.create([{
    name: `${name} Ad Group 1`,
    campaign: campaign.resource_name,
    status: 2, // ENABLED
    type: 2, // SEARCH_STANDARD
  }])

  await customer.ads.create([{
    ad_group: adGroup.resource_name,
    status: 2,
    ad: {
      responsive_search_ad: {
        headlines: assets.headlines!.map(text => ({ text })),
        descriptions: assets.descriptions.map(text => ({ text })),
      },
    },
  }])

  // Sitelinks
  if (assets.sitelinks?.length) {
    await customer.campaignAssets.create(
      assets.sitelinks.map(sl => ({
        campaign: campaign.resource_name,
        asset: {
          sitelink_asset: {
            link_text: sl.text,
            final_urls: [sl.url],
            description1: sl.description1,
            description2: sl.description2,
          },
        },
        field_type: 6, // SITELINK
      }))
    )
  }

  // Keywords
  const selectedKws = keywords.filter(k => k.selected)
  if (selectedKws.length > 0) {
    await customer.adGroupCriteria.create(
      selectedKws.map(kw => ({
        ad_group: adGroup.resource_name,
        keyword: {
          text: kw.text,
          match_type: MATCH_TYPE[kw.match_type],
        },
        status: 2,
      }))
    )
  }

  return campaign.resource_name.split('/').pop() || ''
}

export async function publishPMaxCampaign(
  clientAccountId: string,
  name: string,
  settings: CampaignSettingsData,
  assets: GeneratedAssets
): Promise<string> {
  const customer = getClientCustomer(clientAccountId)

  const [budget] = await customer.campaignBudgets.create([{
    name: `${name} Budget`,
    amount_micros: settings.budget_daily * 1_000_000,
    delivery_method: 2,
  }])

  const [campaign] = await customer.campaigns.create([{
    name,
    advertising_channel_type: 9, // PERFORMANCE_MAX
    status: 3, // PAUSED
    campaign_budget: budget.resource_name,
    ...buildBiddingStrategy(settings),
  }])

  // Asset group
  await customer.assetGroups.create([{
    name: `${name} Asset Group 1`,
    campaign: campaign.resource_name,
    status: 2,
    headlines: assets.headlines!.map(text => ({ text })),
    long_headlines: (assets.long_headlines || []).map(text => ({ text })),
    descriptions: assets.descriptions.map(text => ({ text })),
    final_urls: [settings.audience_signals?.[0] || 'https://example.com'],
  }])

  return campaign.resource_name.split('/').pop() || ''
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/google-ads.ts
git commit -m "feat: add Google Ads API client for listing clients, keyword suggestions, and campaign publishing"
```

---

## Task 10: API Routes

**Files:**
- Create: `app/api/clients/route.ts`
- Create: `app/api/scrape/route.ts`
- Create: `app/api/keywords/route.ts`
- Create: `app/api/generate/route.ts`
- Create: `app/api/publish/route.ts`
- Create: `__tests__/api/generate.test.ts`

- [ ] **Step 1: Write failing test for generate route**

```typescript
// __tests__/api/generate.test.ts
import { POST } from '@/app/api/generate/route'
import { NextRequest } from 'next/server'

// Mock Claude so tests don't hit the real API
jest.mock('@/lib/claude', () => ({
  generateAssets: jest.fn().mockResolvedValue({
    headlines: Array(15).fill('Test Headline Here'),
    descriptions: Array(4).fill('This is a test description for the campaign ad copy.'),
    sitelinks: [],
    callouts: [],
  }),
}))

describe('POST /api/generate', () => {
  it('returns 400 when brief is missing', async () => {
    const req = new NextRequest('http://localhost/api/generate', {
      method: 'POST',
      body: JSON.stringify({ campaign_type: 'search' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns generated assets for valid input', async () => {
    const req = new NextRequest('http://localhost/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        campaign_type: 'search',
        brief: {
          product: 'PPC Management',
          audience: 'Small businesses',
          usps: ['No contracts'],
          tone: 'professional',
          goal: 'lead_gen',
          brand_name: 'Webshure',
          keywords: [{ text: 'ppc', match_type: 'exact', selected: true }],
        },
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.assets.headlines).toHaveLength(15)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx jest __tests__/api/generate.test.ts
```
Expected: FAIL — route not found

- [ ] **Step 3: Create all API routes**

```typescript
// app/api/clients/route.ts
import { NextResponse } from 'next/server'
import { listMccClients } from '@/lib/google-ads'

export async function GET() {
  try {
    const clients = await listMccClients()
    return NextResponse.json({ clients })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
```

```typescript
// app/api/scrape/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { scrapeUrl } from '@/lib/scraper'

export async function POST(request: NextRequest) {
  const { url } = await request.json()
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  try {
    const content = await scrapeUrl(url)
    return NextResponse.json({ content })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
```

```typescript
// app/api/keywords/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getKeywordSuggestions } from '@/lib/google-ads'

export async function POST(request: NextRequest) {
  const { seed_keywords } = await request.json()
  if (!seed_keywords?.length) {
    return NextResponse.json({ error: 'seed_keywords array is required' }, { status: 400 })
  }

  try {
    const suggestions = await getKeywordSuggestions(seed_keywords)
    return NextResponse.json({ suggestions })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
```

```typescript
// app/api/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { generateAssets } from '@/lib/claude'
import type { Brief, CampaignType } from '@/types'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { brief, campaign_type }: { brief: Brief; campaign_type: CampaignType } = body

  if (!brief || !campaign_type) {
    return NextResponse.json({ error: 'brief and campaign_type are required' }, { status: 400 })
  }

  try {
    const assets = await generateAssets(brief, campaign_type)
    return NextResponse.json({ assets })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
```

```typescript
// app/api/publish/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { publishSearchCampaign, publishPMaxCampaign } from '@/lib/google-ads'
import { createServerClient } from '@/lib/supabase'
import type { CampaignType, CampaignSettingsData, GeneratedAssets, Keyword } from '@/types'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    campaign_id,
    client_account_id,
    campaign_name,
    campaign_type,
    settings,
    assets,
    keywords,
  }: {
    campaign_id: string
    client_account_id: string
    campaign_name: string
    campaign_type: CampaignType
    settings: CampaignSettingsData
    assets: GeneratedAssets
    keywords: Keyword[]
  } = body

  if (!campaign_id || !client_account_id || !campaign_type || !assets) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    let googleCampaignId: string

    if (campaign_type === 'search') {
      googleCampaignId = await publishSearchCampaign(
        client_account_id, campaign_name, settings, assets, keywords
      )
    } else if (campaign_type === 'pmax') {
      googleCampaignId = await publishPMaxCampaign(
        client_account_id, campaign_name, settings, assets
      )
    } else {
      return NextResponse.json(
        { error: `Publishing ${campaign_type} campaigns not yet implemented` },
        { status: 501 }
      )
    }

    await supabase
      .from('campaigns')
      .update({
        status: 'published',
        google_campaign_id: googleCampaignId,
        published_at: new Date().toISOString(),
      })
      .eq('id', campaign_id)

    return NextResponse.json({ google_campaign_id: googleCampaignId })
  } catch (error) {
    await supabase
      .from('campaigns')
      .update({ status: 'failed' })
      .eq('id', campaign_id)

    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run generate test — expect PASS**

```bash
npx jest __tests__/api/generate.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/ __tests__/api/
git commit -m "feat: add all API routes (clients, scrape, keywords, generate, publish)"
```

---

## Task 11: UI Primitives

**Files:**
- Create: `components/ui/CharacterCounter.tsx`
- Create: `components/ui/KeywordChip.tsx`
- Create: `components/ui/AdStrengthMeter.tsx`

- [ ] **Step 1: CharacterCounter**

```typescript
// components/ui/CharacterCounter.tsx
interface Props { current: number; max: number }

export function CharacterCounter({ current, max }: Props) {
  const over = current > max
  const close = current >= max * 0.9
  return (
    <span className={`text-xs font-mono tabular-nums ${over ? 'text-red-500 font-bold' : close ? 'text-orange' : 'text-teal'}`}>
      {current}/{max}
    </span>
  )
}
```

- [ ] **Step 2: KeywordChip**

```typescript
// components/ui/KeywordChip.tsx
import { Keyword, MatchType } from '@/types'

interface Props {
  keyword: Keyword
  onToggleSelect: (text: string) => void
  onToggleMatchType: (text: string, matchType: MatchType) => void
}

const MATCH_STYLES: Record<MatchType, string> = {
  exact: 'bg-[#e0f7fa] border-teal text-teal',
  phrase: 'bg-[#fff3e0] border-orange text-orange',
  broad: 'bg-cloud border-navy/30 text-navy',
}

const NEXT_MATCH: Record<MatchType, MatchType> = {
  exact: 'phrase', phrase: 'broad', broad: 'exact',
}

export function KeywordChip({ keyword, onToggleSelect, onToggleMatchType }: Props) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs cursor-pointer select-none transition-opacity ${MATCH_STYLES[keyword.match_type]} ${keyword.selected ? 'opacity-100' : 'opacity-40'}`}
      onClick={() => onToggleSelect(keyword.text)}
    >
      <span className="font-semibold">{keyword.text}</span>
      {keyword.volume && (
        <span className="opacity-60">{keyword.volume.toLocaleString()}/mo</span>
      )}
      <button
        className="ml-1 font-bold opacity-70 hover:opacity-100 text-[10px] uppercase"
        onClick={e => { e.stopPropagation(); onToggleMatchType(keyword.text, NEXT_MATCH[keyword.match_type]) }}
        title="Toggle match type"
      >
        {keyword.match_type === 'exact' ? '[e]' : keyword.match_type === 'phrase' ? '"p"' : 'b'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: AdStrengthMeter**

```typescript
// components/ui/AdStrengthMeter.tsx
import { AdStrengthResult } from '@/types'

interface Props { result: AdStrengthResult }

const GRADE_COLOR: Record<string, string> = {
  poor: '#ef4444',
  average: '#f59e0b',
  good: '#31C0FF',
  excellent: '#10b981',
}

const GRADE_SEGMENTS = ['poor', 'average', 'good', 'excellent']

export function AdStrengthMeter({ result }: Props) {
  const color = GRADE_COLOR[result.score]
  const filledCount = GRADE_SEGMENTS.indexOf(result.score) + 1

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-heading font-bold uppercase tracking-wider text-teal">Ad Strength</span>
        <span className="font-heading font-bold text-sm capitalize" style={{ color }}>{result.score}</span>
      </div>
      <div className="flex gap-1">
        {GRADE_SEGMENTS.map((grade, i) => (
          <div
            key={grade}
            className="h-2 flex-1 rounded-sm"
            style={{ background: i < filledCount ? GRADE_COLOR[grade] : '#D5EEF7' }}
          />
        ))}
      </div>
      <ul className="space-y-1">
        {result.tips.map((tip, i) => (
          <li key={i} className="text-xs text-teal flex gap-1.5">
            <span>→</span><span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add components/ui/
git commit -m "feat: add CharacterCounter, KeywordChip, AdStrengthMeter UI primitives"
```

---

## Task 12: Sidebar Components

**Files:**
- Create: `components/sidebar/ClientSelector.tsx`
- Create: `components/sidebar/ProgressTracker.tsx`
- Create: `components/sidebar/BestPracticesPanel.tsx`

- [ ] **Step 1: ClientSelector**

```typescript
// components/sidebar/ClientSelector.tsx
'use client'
import { useEffect, useState } from 'react'

interface GoogleClient { id: string; name: string }
interface Props { selectedId: string | null; onSelect: (id: string) => void }

export function ClientSelector({ selectedId, onSelect }: Props) {
  const [clients, setClients] = useState<GoogleClient[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then(d => { setClients(d.clients || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="bg-white border border-cloud rounded-2xl p-4">
      <h3 className="font-heading font-bold text-sm text-navy mb-3">Client Account</h3>
      {loading ? (
        <p className="text-xs text-teal">Loading accounts...</p>
      ) : (
        <div className="space-y-1.5">
          {clients.map(c => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                selectedId === c.id
                  ? 'bg-cloud border border-cyan font-semibold text-navy'
                  : 'border border-cloud text-navy hover:bg-mist'
              }`}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedId === c.id ? 'bg-cyan' : 'bg-cloud'}`} />
              {c.name}
            </button>
          ))}
          {clients.length === 0 && (
            <p className="text-xs text-teal">No client accounts found under this MCC.</p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: ProgressTracker**

```typescript
// components/sidebar/ProgressTracker.tsx
import { CampaignType } from '@/types'

const STEPS = [
  'Campaign Type',
  'Brief & Landing Page',
  'Keyword Research',
  'Campaign Settings',
  'AI Generation',
  'Review & Ad Strength',
  'Publish',
]

interface Props { currentStep: number }

export function ProgressTracker({ currentStep }: Props) {
  return (
    <div className="bg-white border border-cloud rounded-2xl p-4">
      <h3 className="font-heading font-bold text-sm text-navy mb-3">Campaign Progress</h3>
      <div className="space-y-0.5">
        {STEPS.map((step, i) => {
          const done = i < currentStep
          const active = i === currentStep
          return (
            <div key={step} className={`flex items-center gap-2 py-1.5 text-sm border-b border-mist last:border-0 ${done ? 'text-emerald-600' : active ? 'text-orange font-semibold' : 'text-teal'}`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${done ? 'bg-emerald-500' : active ? 'bg-orange' : 'bg-cloud'}`} />
              {step}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: BestPracticesPanel**

```typescript
// components/sidebar/BestPracticesPanel.tsx
import { CampaignType } from '@/types'

const TIPS: Record<CampaignType, { title: string; tip: string }[]> = {
  search: [
    { title: 'Ad Strength', tip: 'Aim for "Excellent" — use all 15 headlines & 4 descriptions with varied messaging.' },
    { title: 'Smart Bidding', tip: 'Use Maximize Conversions until 50+ conv/month, then switch to Target CPA.' },
    { title: 'Keywords', tip: 'Pair Broad Match + Smart Bidding for 20% more conversions. Keep Exact Match for high-value terms.' },
    { title: 'RSAs', tip: 'Create 2–3 ads per ad group, each with a different messaging angle.' },
  ],
  pmax: [
    { title: 'Learning Period', tip: 'Avoid major changes for 2–6 weeks after launch. The algorithm needs time to optimise.' },
    { title: 'Audience Signals', tip: 'Add customer match lists or website visitors to shorten the learning curve.' },
    { title: 'Assets', tip: 'Replace Low-rated assets after 4–6 weeks. Never replace all assets at once.' },
    { title: 'Conversions', tip: 'PMax needs 30+ conversions/month to optimise effectively. Check your account history.' },
  ],
  demand_gen: [
    { title: 'Mixed Media', tip: 'Include both image and video assets — advertisers see 20% more conversions vs video-only.' },
    { title: 'New Customers', tip: 'Enable New Customer Acquisition goal to reach users who have never converted with you.' },
    { title: 'Channel Controls', tip: 'Use channel controls to choose placements: YouTube, Discover, Gmail, Display.' },
    { title: 'Audience', tip: '68% of Demand Gen conversions come from users who had not seen your Search ads. It reaches new audiences.' },
  ],
  display: [
    { title: 'Audiences', tip: 'Target in-market audiences and custom intent segments for best results.' },
    { title: 'Assets', tip: 'Upload multiple image sizes — Google will serve the best-performing combination.' },
    { title: 'Remarketing', tip: 'Add your website visitor lists to reach warm audiences at lower CPCs.' },
  ],
  shopping: [
    { title: 'Feed Quality', tip: 'Optimise product titles and descriptions in Merchant Center first — feed quality drives performance.' },
    { title: 'PMax vs Standard', tip: 'Performance Max is recommended over Standard Shopping for most accounts in 2026.' },
    { title: 'Product Groups', tip: 'Segment by category, brand, or custom labels to control bids per product group.' },
  ],
  video: [
    { title: 'Video Action', tip: 'Video Action Campaigns are now Demand Gen. Use Demand Gen for conversion-focused video campaigns.' },
    { title: 'Opening Hook', tip: 'Capture attention in the first 5 seconds — that is the skip threshold for in-stream ads.' },
    { title: 'Connected TV', tip: 'Include CTV placements — campaigns with TV screens drive 7% additional conversions on average.' },
  ],
}

interface Props { campaignType: CampaignType | null }

export function BestPracticesPanel({ campaignType }: Props) {
  const tips = campaignType ? TIPS[campaignType] : []

  return (
    <div className="bg-white border border-cloud rounded-2xl p-4">
      <h3 className="font-heading font-bold text-sm text-navy mb-3">
        💡 Best Practices{campaignType ? ` · ${campaignType === 'pmax' ? 'Performance Max' : campaignType.replace('_', ' ')}` : ''}
      </h3>
      {tips.length === 0 ? (
        <p className="text-xs text-teal">Select a campaign type to see best practices.</p>
      ) : (
        <div className="space-y-2">
          {tips.map(({ title, tip }) => (
            <div key={title} className="bg-mist border-l-2 border-cyan rounded-r-lg px-3 py-2 text-xs text-navy leading-snug">
              <span className="font-semibold text-teal">{title}: </span>{tip}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add components/sidebar/
git commit -m "feat: add ClientSelector, ProgressTracker, BestPracticesPanel sidebar components"
```

---

## Task 13: Campaign Canvas Sections — Part 1

**Files:**
- Create: `components/sections/CampaignTypeSelector.tsx`
- Create: `components/sections/BriefForm.tsx`

- [ ] **Step 1: CampaignTypeSelector**

```typescript
// components/sections/CampaignTypeSelector.tsx
import { CampaignType } from '@/types'

const TYPES: { id: CampaignType; icon: string; label: string }[] = [
  { id: 'search',     icon: '🔍', label: 'Search' },
  { id: 'pmax',       icon: '⚡', label: 'Perf. Max' },
  { id: 'demand_gen', icon: '🎯', label: 'Demand Gen' },
  { id: 'display',    icon: '🖼️', label: 'Display' },
  { id: 'shopping',   icon: '🛒', label: 'Shopping' },
  { id: 'video',      icon: '▶️', label: 'YouTube' },
]

interface Props {
  selected: CampaignType | null
  onSelect: (type: CampaignType) => void
}

export function CampaignTypeSelector({ selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {TYPES.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={`rounded-xl border-2 py-3 px-2 text-center transition-all ${
            selected === t.id
              ? 'border-navy bg-navy text-white'
              : 'border-cloud bg-white text-navy hover:border-navy/40'
          }`}
        >
          <div className="text-2xl mb-1">{t.icon}</div>
          <div className={`text-xs font-heading font-bold ${selected === t.id ? 'text-cyan' : 'text-navy'}`}>
            {t.label}
          </div>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: BriefForm**

```typescript
// components/sections/BriefForm.tsx
'use client'
import { useState } from 'react'
import { Brief, ToneType, GoalType } from '@/types'

interface Props {
  brief: Partial<Brief>
  onChange: (updates: Partial<Brief>) => void
}

const TONES: ToneType[] = ['professional', 'friendly', 'urgent', 'authoritative', 'conversational']
const GOALS: { value: GoalType; label: string }[] = [
  { value: 'lead_gen', label: 'Lead Generation' },
  { value: 'sales', label: 'Sales / eCommerce' },
  { value: 'awareness', label: 'Brand Awareness' },
]

export function BriefForm({ brief, onChange }: Props) {
  const [scraping, setScraping] = useState(false)
  const [scrapeError, setScrapeError] = useState('')

  async function handleScrape() {
    if (!brief.url) return
    setScraping(true)
    setScrapeError('')
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: brief.url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onChange({
        product: data.content.product,
        audience: data.content.audience,
        usps: data.content.usps,
        tone: data.content.tone,
        scraped_content: data.content.raw_text,
      })
    } catch (err) {
      setScrapeError(String(err))
    } finally {
      setScraping(false)
    }
  }

  const input = 'w-full bg-mist border border-cloud rounded-lg px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-cyan'
  const label = 'block text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-1'

  return (
    <div className="space-y-4">
      <div>
        <label className={label}>Landing Page URL</label>
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="https://www.example.com/services/ppc"
            value={brief.url || ''}
            onChange={e => onChange({ url: e.target.value })}
            className={`${input} flex-1`}
          />
          <button
            onClick={handleScrape}
            disabled={scraping || !brief.url}
            className="bg-cyan text-navy font-heading font-bold text-xs px-4 rounded-full hover:bg-cyan/80 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {scraping ? 'Scraping...' : '🔍 Scrape'}
          </button>
        </div>
        {scrapeError && <p className="text-red-500 text-xs mt-1">{scrapeError}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Product / Service</label>
          <input className={input} value={brief.product || ''} onChange={e => onChange({ product: e.target.value })} placeholder="e.g. PPC Management Services" />
        </div>
        <div>
          <label className={label}>Brand Name</label>
          <input className={input} value={brief.brand_name || ''} onChange={e => onChange({ brand_name: e.target.value })} placeholder="e.g. Webshure" />
        </div>
      </div>

      <div>
        <label className={label}>Target Audience</label>
        <input className={input} value={brief.audience || ''} onChange={e => onChange({ audience: e.target.value })} placeholder="e.g. Small-to-medium businesses looking to grow online" />
      </div>

      <div>
        <label className={label}>Key USPs (one per line)</label>
        <textarea
          rows={3}
          className={input}
          value={(brief.usps || []).join('\n')}
          onChange={e => onChange({ usps: e.target.value.split('\n').filter(Boolean) })}
          placeholder={'Certified Google Partner\nNo lock-in contracts\nTransparent reporting'}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Campaign Goal</label>
          <select className={input} value={brief.goal || ''} onChange={e => onChange({ goal: e.target.value as GoalType })}>
            <option value="">Select goal...</option>
            {GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Tone</label>
          <select className={input} value={brief.tone || ''} onChange={e => onChange({ tone: e.target.value as ToneType })}>
            <option value="">Select tone...</option>
            {TONES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/sections/CampaignTypeSelector.tsx components/sections/BriefForm.tsx
git commit -m "feat: add CampaignTypeSelector and BriefForm canvas sections"
```

---

## Task 14: Campaign Canvas Sections — Part 2

**Files:**
- Create: `components/sections/KeywordResearch.tsx`
- Create: `components/sections/CampaignSettings.tsx`

- [ ] **Step 1: KeywordResearch**

```typescript
// components/sections/KeywordResearch.tsx
'use client'
import { useState } from 'react'
import { Keyword, MatchType } from '@/types'
import { KeywordChip } from '@/components/ui/KeywordChip'

interface Props {
  keywords: Keyword[]
  onChange: (keywords: Keyword[]) => void
}

export function KeywordResearch({ keywords, onChange }: Props) {
  const [seeds, setSeeds] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleResearch() {
    const seedList = seeds.split(',').map(s => s.trim()).filter(Boolean)
    if (!seedList.length) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed_keywords: seedList }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const newKeywords: Keyword[] = data.suggestions.map((s: any) => ({
        text: s.text,
        match_type: 'exact' as MatchType,
        volume: s.volume,
        competition: s.competition,
        suggested_bid: s.suggested_bid,
        selected: true,
      }))
      onChange([...keywords, ...newKeywords.filter(n => !keywords.find(k => k.text === n.text))])
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  function toggleSelect(text: string) {
    onChange(keywords.map(k => k.text === text ? { ...k, selected: !k.selected } : k))
  }

  function toggleMatchType(text: string, matchType: MatchType) {
    onChange(keywords.map(k => k.text === text ? { ...k, match_type: matchType } : k))
  }

  const input = 'w-full bg-mist border border-cloud rounded-lg px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-cyan'
  const label = 'block text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-1'

  return (
    <div className="space-y-4">
      <div>
        <label className={label}>Seed Keywords (comma separated)</label>
        <div className="flex gap-2">
          <input
            className={`${input} flex-1`}
            placeholder="ppc management, google ads agency, paid search"
            value={seeds}
            onChange={e => setSeeds(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleResearch()}
          />
          <button
            onClick={handleResearch}
            disabled={loading || !seeds.trim()}
            className="bg-orange text-white font-heading font-bold text-xs px-4 rounded-full hover:bg-orange/80 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {loading ? 'Searching...' : '📈 Research'}
          </button>
        </div>
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      </div>

      {keywords.length > 0 && (
        <div>
          <label className={label}>
            Keywords — click to select/deselect · click match type badge to toggle
          </label>
          <div className="flex flex-wrap gap-2 mt-2">
            {keywords.map(kw => (
              <KeywordChip
                key={kw.text}
                keyword={kw}
                onToggleSelect={toggleSelect}
                onToggleMatchType={toggleMatchType}
              />
            ))}
          </div>
          <p className="text-xs text-teal mt-2">
            {keywords.filter(k => k.selected).length} of {keywords.length} selected
            · <span className="text-[#007EA8]">[e]</span> exact &nbsp;
            · <span className="text-orange">"p"</span> phrase &nbsp;
            · <span>b</span> broad
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: CampaignSettings**

```typescript
// components/sections/CampaignSettings.tsx
import { CampaignType, CampaignSettingsData, BiddingStrategy } from '@/types'

interface Props {
  campaignType: CampaignType
  settings: Partial<CampaignSettingsData>
  onChange: (updates: Partial<CampaignSettingsData>) => void
}

const BIDDING_OPTIONS: { value: BiddingStrategy; label: string; threshold: string }[] = [
  { value: 'maximize_conversions', label: 'Maximize Conversions', threshold: 'Recommended for new campaigns' },
  { value: 'target_cpa', label: 'Target CPA', threshold: 'Requires 50+ conv/month' },
  { value: 'target_roas', label: 'Target ROAS', threshold: 'Requires 100+ conv/month' },
  { value: 'maximize_clicks', label: 'Maximize Clicks', threshold: 'For awareness / new accounts' },
  { value: 'manual_cpc', label: 'Manual CPC', threshold: 'Advanced users only' },
]

const SCHEDULE_OPTIONS = [
  { value: 'all', label: 'All days, all hours (recommended)' },
  { value: 'business', label: 'Business hours (Mon–Fri 8am–6pm)' },
  { value: 'custom', label: 'Custom schedule' },
]

export function CampaignSettings({ campaignType, settings, onChange }: Props) {
  const input = 'w-full bg-mist border border-cloud rounded-lg px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-cyan'
  const label = 'block text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-1'
  const showAudienceSignals = ['pmax', 'demand_gen', 'display', 'video'].includes(campaignType)
  const showChannelControls = ['demand_gen', 'video'].includes(campaignType)
  const showMerchantCenter = ['shopping', 'pmax'].includes(campaignType)
  const showSchedule = ['search', 'display', 'shopping'].includes(campaignType)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Daily Budget (ZAR)</label>
          <input
            type="number"
            className={input}
            placeholder="500"
            value={settings.budget_daily || ''}
            onChange={e => onChange({ budget_daily: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={label}>Bidding Strategy</label>
          <select
            className={input}
            value={settings.bidding_strategy || 'maximize_conversions'}
            onChange={e => onChange({ bidding_strategy: e.target.value as BiddingStrategy })}
          >
            {BIDDING_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label} — {opt.threshold}</option>
            ))}
          </select>
        </div>
      </div>

      {settings.bidding_strategy === 'target_cpa' && (
        <div>
          <label className={label}>Target CPA (ZAR)</label>
          <input type="number" className={input} placeholder="200" value={settings.target_cpa || ''} onChange={e => onChange({ target_cpa: Number(e.target.value) })} />
        </div>
      )}

      {settings.bidding_strategy === 'target_roas' && (
        <div>
          <label className={label}>Target ROAS (e.g. 4 = 400%)</label>
          <input type="number" className={input} placeholder="4" value={settings.target_roas || ''} onChange={e => onChange({ target_roas: Number(e.target.value) })} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Locations</label>
          <input className={input} placeholder="South Africa" value={(settings.locations || []).join(', ')} onChange={e => onChange({ locations: e.target.value.split(',').map(s => s.trim()) })} />
        </div>
        <div>
          <label className={label}>Language</label>
          <input className={input} placeholder="English" value={settings.language || ''} onChange={e => onChange({ language: e.target.value })} />
        </div>
      </div>

      {showSchedule && (
        <div>
          <label className={label}>Ad Schedule</label>
          <select className={input} value={settings.schedule || 'all'} onChange={e => onChange({ schedule: e.target.value })}>
            {SCHEDULE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      )}

      {showMerchantCenter && (
        <div>
          <label className={label}>Merchant Center ID (optional)</label>
          <input className={input} placeholder="123456789" value={settings.merchant_center_id || ''} onChange={e => onChange({ merchant_center_id: e.target.value })} />
        </div>
      )}

      {showChannelControls && (
        <div>
          <label className={label}>Channel Controls</label>
          <div className="flex gap-3 flex-wrap mt-1">
            {(['youtube', 'discover', 'gmail', 'display'] as const).map(ch => (
              <label key={ch} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.channel_controls?.[ch] ?? true}
                  onChange={e => onChange({
                    channel_controls: { youtube: true, discover: true, gmail: true, display: true, ...settings.channel_controls, [ch]: e.target.checked }
                  })}
                  className="accent-cyan"
                />
                <span className="capitalize text-navy">{ch}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/sections/KeywordResearch.tsx components/sections/CampaignSettings.tsx
git commit -m "feat: add KeywordResearch and CampaignSettings canvas sections"
```

---

## Task 15: ReviewAssets Component

**Files:**
- Create: `components/sections/ReviewAssets.tsx`

- [ ] **Step 1: Implement ReviewAssets**

```typescript
// components/sections/ReviewAssets.tsx
'use client'
import { GeneratedAssets, Brief, CampaignType, Keyword } from '@/types'
import { calculateAdStrength } from '@/lib/ad-strength'
import { AdStrengthMeter } from '@/components/ui/AdStrengthMeter'
import { CharacterCounter } from '@/components/ui/CharacterCounter'

interface Props {
  assets: GeneratedAssets
  brief: Partial<Brief>
  campaignType: CampaignType
  onChange: (assets: GeneratedAssets) => void
  onPublish: () => void
  isPublishing: boolean
  publishError: string | null
}

export function ReviewAssets({ assets, brief, campaignType, onChange, onPublish, isPublishing, publishError }: Props) {
  const primaryKeyword = brief.keywords?.find(k => k.selected)?.text
  const strengthResult = calculateAdStrength(
    assets.headlines || [],
    assets.descriptions || [],
    primaryKeyword
  )

  function updateHeadline(index: number, value: string) {
    const updated = [...(assets.headlines || [])]
    updated[index] = value
    onChange({ ...assets, headlines: updated })
  }

  function updateDescription(index: number, value: string) {
    const updated = [...(assets.descriptions || [])]
    updated[index] = value
    onChange({ ...assets, descriptions: updated })
  }

  const assetInput = 'w-full bg-mist border border-cloud rounded-lg px-3 py-2 text-sm text-navy focus:outline-none focus:border-cyan font-mono'
  const sectionLabel = 'text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-2'

  return (
    <div className="space-y-6">

      <AdStrengthMeter result={strengthResult} />

      {/* Headlines */}
      <div>
        <div className={sectionLabel}>Headlines ({(assets.headlines || []).length}/15 · max 30 chars)</div>
        <div className="space-y-2">
          {(assets.headlines || []).map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={assetInput}
                maxLength={30}
                value={h}
                onChange={e => updateHeadline(i, e.target.value)}
              />
              <CharacterCounter current={h.length} max={30} />
            </div>
          ))}
        </div>
      </div>

      {/* Long headlines (PMax, Demand Gen) */}
      {assets.long_headlines && assets.long_headlines.length > 0 && (
        <div>
          <div className={sectionLabel}>Long Headlines ({assets.long_headlines.length} · max 90 chars)</div>
          <div className="space-y-2">
            {assets.long_headlines.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={assetInput}
                  maxLength={90}
                  value={h}
                  onChange={e => {
                    const updated = [...assets.long_headlines!]
                    updated[i] = e.target.value
                    onChange({ ...assets, long_headlines: updated })
                  }}
                />
                <CharacterCounter current={h.length} max={90} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Descriptions */}
      <div>
        <div className={sectionLabel}>Descriptions ({(assets.descriptions || []).length}/4 · max 90 chars)</div>
        <div className="space-y-2">
          {(assets.descriptions || []).map((d, i) => (
            <div key={i} className="flex items-start gap-2">
              <textarea
                className={`${assetInput} resize-none`}
                rows={2}
                maxLength={90}
                value={d}
                onChange={e => updateDescription(i, e.target.value)}
              />
              <CharacterCounter current={d.length} max={90} />
            </div>
          ))}
        </div>
      </div>

      {/* Sitelinks */}
      {assets.sitelinks && assets.sitelinks.length > 0 && (
        <div>
          <div className={sectionLabel}>Sitelinks</div>
          <div className="space-y-3">
            {assets.sitelinks.map((sl, i) => (
              <div key={i} className="bg-mist border border-cloud rounded-xl p-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-[10px] text-teal uppercase font-bold">Text</span>
                  <p className="text-navy font-medium">{sl.text}</p>
                </div>
                <div>
                  <span className="text-[10px] text-teal uppercase font-bold">URL</span>
                  <p className="text-teal text-xs truncate">{sl.url}</p>
                </div>
                <div className="col-span-2 text-xs text-navy/70">{sl.description1} · {sl.description2}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Callouts */}
      {assets.callouts && assets.callouts.length > 0 && (
        <div>
          <div className={sectionLabel}>Callouts</div>
          <div className="flex flex-wrap gap-2">
            {assets.callouts.map((c, i) => (
              <span key={i} className="bg-cloud text-navy text-xs rounded-full px-3 py-1 font-medium">{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* Image/Video briefs */}
      {assets.image_briefs && assets.image_briefs.length > 0 && (
        <div>
          <div className={sectionLabel}>Image Creative Briefs (hand off to design team)</div>
          <div className="space-y-2">
            {assets.image_briefs.map((brief, i) => (
              <div key={i} className="bg-mist border border-cloud rounded-lg px-3 py-2 text-sm text-navy">{brief}</div>
            ))}
          </div>
        </div>
      )}

      {/* Publish button */}
      <div className="pt-2">
        {publishError && (
          <p className="text-red-500 text-sm mb-3">Publish failed: {publishError}</p>
        )}
        <button
          onClick={onPublish}
          disabled={isPublishing}
          className="w-full bg-gradient-to-r from-orange to-[#e07020] text-white font-heading font-bold py-4 rounded-full text-base hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPublishing ? '⏳ Publishing to Google Ads...' : '🚀 Approve & Publish to Google Ads'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/sections/ReviewAssets.tsx
git commit -m "feat: add ReviewAssets component with Ad Strength meter and editable assets"
```

---

## Task 16: CampaignCanvas + Main Page

**Files:**
- Create: `components/CampaignCanvas.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create CampaignCanvas**

```typescript
// components/CampaignCanvas.tsx
'use client'
import { useState } from 'react'
import { CanvasState, CampaignType, Brief, CampaignSettingsData, GeneratedAssets } from '@/types'
import { CampaignTypeSelector } from './sections/CampaignTypeSelector'
import { BriefForm } from './sections/BriefForm'
import { KeywordResearch } from './sections/KeywordResearch'
import { CampaignSettings } from './sections/CampaignSettings'
import { ReviewAssets } from './sections/ReviewAssets'
import { ClientSelector } from './sidebar/ClientSelector'
import { ProgressTracker } from './sidebar/ProgressTracker'
import { BestPracticesPanel } from './sidebar/BestPracticesPanel'

const INITIAL_STATE: CanvasState = {
  client_id: null,
  campaign_type: null,
  brief: { keywords: [] },
  settings: { bidding_strategy: 'maximize_conversions', locations: ['South Africa'], language: 'English' },
  assets: null,
  campaign_id: null,
  is_generating: false,
  is_publishing: false,
  error: null,
}

function SectionCard({ num, title, status, children, defaultOpen = false }: {
  num: number; title: string; status: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white border border-cloud rounded-2xl overflow-hidden mb-4">
      <button
        className="w-full flex items-center gap-3 px-5 py-4 bg-mist border-b border-cloud text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="w-7 h-7 rounded-full bg-navy text-white flex items-center justify-center text-xs font-heading font-bold flex-shrink-0">{num}</div>
        <span className="font-heading font-bold text-navy flex-1">{title}</span>
        <span className="text-xs text-teal">{status}</span>
        <span className="text-teal text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-5 py-5">{children}</div>}
    </div>
  )
}

export function CampaignCanvas() {
  const [state, setState] = useState<CanvasState>(INITIAL_STATE)

  function update(patch: Partial<CanvasState>) {
    setState(prev => ({ ...prev, ...patch }))
  }

  function getStep(): number {
    if (!state.campaign_type) return 0
    if (!state.brief.product) return 1
    if (!state.brief.keywords?.some(k => k.selected)) return 2
    if (!state.settings.budget_daily) return 3
    if (!state.assets) return 4
    return 5
  }

  async function handleGenerate() {
    if (!state.campaign_type || !state.brief.product) return
    update({ is_generating: true, error: null })
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_type: state.campaign_type, brief: state.brief }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      update({ assets: data.assets, is_generating: false })
    } catch (err) {
      update({ error: String(err), is_generating: false })
    }
  }

  async function handlePublish() {
    if (!state.assets || !state.client_id || !state.campaign_type) return
    update({ is_publishing: true, error: null })

    // Save campaign to Supabase first if not saved
    let campaignId = state.campaign_id
    if (!campaignId) {
      const saveRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: state.client_id,
          name: `${state.brief.brand_name} — ${state.campaign_type} — ${new Date().toLocaleDateString()}`,
          type: state.campaign_type,
          settings: state.settings,
          brief: state.brief,
        }),
      })
      const saveData = await saveRes.json()
      campaignId = saveData.id
      update({ campaign_id: campaignId })
    }

    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          client_account_id: state.client_id,
          campaign_name: `${state.brief.brand_name} — ${state.campaign_type}`,
          campaign_type: state.campaign_type,
          settings: state.settings,
          assets: state.assets,
          keywords: state.brief.keywords || [],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      update({ is_publishing: false })
      alert(`Campaign published! Google Ads ID: ${data.google_campaign_id}`)
    } catch (err) {
      update({ error: String(err), is_publishing: false })
    }
  }

  const currentStep = getStep()

  return (
    <div className="grid grid-cols-[1fr_300px] gap-5 max-w-7xl mx-auto px-5 py-5">
      {/* Main canvas */}
      <div>
        <SectionCard num={1} title="Campaign Type" status={state.campaign_type || 'Not selected'} defaultOpen>
          <CampaignTypeSelector
            selected={state.campaign_type}
            onSelect={type => update({ campaign_type: type, assets: null })}
          />
        </SectionCard>

        <SectionCard num={2} title="Brief & Landing Page" status={state.brief.product ? 'Complete' : 'In progress'}>
          <BriefForm
            brief={state.brief}
            onChange={updates => update({ brief: { ...state.brief, ...updates } })}
          />
        </SectionCard>

        <SectionCard num={3} title="Keyword Research" status={`${state.brief.keywords?.filter(k => k.selected).length || 0} keywords selected`}>
          <KeywordResearch
            keywords={state.brief.keywords || []}
            onChange={keywords => update({ brief: { ...state.brief, keywords } })}
          />
        </SectionCard>

        {state.campaign_type && (
          <SectionCard num={4} title="Campaign Settings" status={state.settings.budget_daily ? `R${state.settings.budget_daily}/day` : 'Not set'}>
            <CampaignSettings
              campaignType={state.campaign_type}
              settings={state.settings}
              onChange={updates => update({ settings: { ...state.settings, ...updates } })}
            />
          </SectionCard>
        )}

        <SectionCard num={5} title="AI Copy Generation" status={state.assets ? 'Generated' : 'Ready to generate'}>
          {state.assets ? (
            <p className="text-sm text-emerald-600 font-medium">✓ Assets generated — review below</p>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={state.is_generating || !state.brief.product || !state.campaign_type}
              className="w-full bg-gradient-to-r from-navy to-[#054991] text-white font-heading font-bold py-4 rounded-full text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {state.is_generating ? '⏳ Generating with Claude AI...' : '🤖 Generate Campaign Assets with Claude AI'}
            </button>
          )}
          {state.error && <p className="text-red-500 text-sm mt-2">{state.error}</p>}
        </SectionCard>

        {state.assets && state.campaign_type && (
          <SectionCard num={6} title="Review & Ad Strength" status="Review required" defaultOpen>
            <ReviewAssets
              assets={state.assets}
              brief={state.brief}
              campaignType={state.campaign_type}
              onChange={assets => update({ assets })}
              onPublish={handlePublish}
              isPublishing={state.is_publishing}
              publishError={state.error}
            />
          </SectionCard>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <ClientSelector
          selectedId={state.client_id}
          onSelect={id => update({ client_id: id })}
        />
        <ProgressTracker currentStep={currentStep} />
        <BestPracticesPanel campaignType={state.campaign_type} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update main page + add campaigns save route**

```typescript
// app/page.tsx
import { CampaignCanvas } from '@/components/CampaignCanvas'

export default function Home() {
  return (
    <main>
      {/* Top bar */}
      <nav className="bg-navy px-5 py-3 flex items-center justify-between">
        <span className="font-heading font-black text-lg text-cyan">
          web<span className="text-white">shure</span>
          <span className="text-white/40 font-normal text-sm ml-2">/ Ads Builder</span>
        </span>
        <div className="flex gap-3">
          <a href="/campaigns" className="text-white/70 text-sm hover:text-white transition-colors">📁 Campaigns</a>
        </div>
      </nav>
      <CampaignCanvas />
    </main>
  )
}
```

```typescript
// app/api/campaigns/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { client_id, name, type, settings, brief } = body

  const supabase = createServerClient()

  const { data: campaign, error: campError } = await supabase
    .from('campaigns')
    .insert({ client_id, name, type, status: 'draft', settings })
    .select()
    .single()

  if (campError) return NextResponse.json({ error: campError.message }, { status: 500 })

  await supabase.from('briefs').insert({
    campaign_id: campaign.id,
    url: brief.url,
    scraped_content: brief.scraped_content,
    product: brief.product,
    audience: brief.audience,
    usps: brief.usps,
    tone: brief.tone,
    goal: brief.goal,
    brand_name: brief.brand_name,
    keywords: brief.keywords,
  })

  return NextResponse.json({ id: campaign.id })
}

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaigns: data })
}
```

- [ ] **Step 3: Commit**

```bash
git add components/CampaignCanvas.tsx app/page.tsx app/api/campaigns/
git commit -m "feat: add CampaignCanvas orchestrator and main page"
```

---

## Task 17: Campaign Library Page

**Files:**
- Create: `app/campaigns/page.tsx`

- [ ] **Step 1: Create campaign library**

```typescript
// app/campaigns/page.tsx
import Link from 'next/link'

async function getCampaigns() {
  // Server component — fetch directly from Supabase
  const { createServerClient } = await import('@/lib/supabase')
  const supabase = createServerClient()
  const { data } = await supabase
    .from('campaigns')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })
  return data || []
}

const STATUS_STYLES: Record<string, string> = {
  draft:     'bg-cloud text-navy',
  review:    'bg-[#fff3e0] text-orange',
  approved:  'bg-[#d1fae5] text-emerald-700',
  published: 'bg-navy text-cyan',
  failed:    'bg-red-50 text-red-600',
}

const TYPE_ICONS: Record<string, string> = {
  search: '🔍', pmax: '⚡', demand_gen: '🎯',
  display: '🖼️', shopping: '🛒', video: '▶️',
}

export default async function CampaignsPage() {
  const campaigns = await getCampaigns()

  return (
    <main>
      <nav className="bg-navy px-5 py-3 flex items-center justify-between">
        <span className="font-heading font-black text-lg text-cyan">
          web<span className="text-white">shure</span>
          <span className="text-white/40 font-normal text-sm ml-2">/ Campaigns</span>
        </span>
        <Link href="/" className="bg-orange text-white font-heading font-bold text-sm px-4 py-2 rounded-full hover:bg-orange/80 transition-colors">
          + New Campaign
        </Link>
      </nav>

      <div className="max-w-5xl mx-auto px-5 py-8">
        <h1 className="font-heading font-bold text-2xl text-navy mb-6">Campaign Library</h1>

        {campaigns.length === 0 ? (
          <div className="bg-white border border-cloud rounded-2xl p-12 text-center">
            <p className="text-teal text-sm mb-4">No campaigns yet.</p>
            <Link href="/" className="bg-navy text-white font-heading font-bold text-sm px-6 py-3 rounded-full hover:bg-[#054991] transition-colors">
              Build Your First Campaign
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c: any) => (
              <div key={c.id} className="bg-white border border-cloud rounded-2xl px-5 py-4 flex items-center gap-4">
                <span className="text-2xl">{TYPE_ICONS[c.type] || '📊'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-bold text-navy truncate">{c.name}</p>
                  <p className="text-xs text-teal">{(c.clients as any)?.name} · {new Date(c.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs font-heading font-bold px-3 py-1 rounded-full capitalize ${STATUS_STYLES[c.status] || 'bg-cloud text-navy'}`}>
                  {c.status}
                </span>
                {c.google_campaign_id && (
                  <span className="text-xs text-teal font-mono">ID: {c.google_campaign_id}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/campaigns/
git commit -m "feat: add campaign library page"
```

---

## Task 18: Run All Tests + Deploy

- [ ] **Step 1: Run full test suite**

```bash
npx jest --passWithNoTests
```
Expected: All tests pass (middleware, scraper, ad-strength, claude, generate route)

- [ ] **Step 2: Build for production**

```bash
npm run build
```
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 3: Add `.gitignore` entries**

Ensure `.gitignore` contains:
```
.env.local
.superpowers/
```

- [ ] **Step 4: Deploy to Vercel**

```bash
npx vercel --prod
```
Set all env vars from `.env.local` in the Vercel dashboard under Project Settings → Environment Variables.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Webshure Ads Builder v1"
```

---

## Verification Checklist

- [ ] Visit `/login` — password prompt appears, wrong password shows error, correct password redirects to `/`
- [ ] Client accounts load in sidebar from Google Ads MCC
- [ ] Select "Search" campaign type → Brief form expands
- [ ] Enter a URL → click Scrape → fields auto-populate
- [ ] Enter seed keywords → click Research → keyword chips appear with volume
- [ ] Fill settings → click Generate → Claude returns assets within ~15s
- [ ] Ad Strength meter shows score with tips
- [ ] Edit a headline → character counter updates; turning red at >30 chars
- [ ] Click Publish → campaign appears in Google Ads under the selected account (status: Paused)
- [ ] Campaign saved to Supabase with `status: published` and `google_campaign_id` set
- [ ] `/campaigns` shows the campaign in the library
- [ ] Test a Performance Max campaign end-to-end
