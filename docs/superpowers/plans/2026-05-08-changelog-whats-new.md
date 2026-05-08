# What's New Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 📋 What's New nav link and page that shows a hardcoded changelog and a Supabase-backed feature request form/list.

**Architecture:** Three tasks: (1) API route with Supabase GET/POST, (2) client-side ChangelogContent component + thin server page wrapper, (3) Nav wiring. Follows the codebase's existing server-page-shell + client-component pattern (same as MCC page + MCCDashboard).

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase (`@supabase/supabase-js`), Jest

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `app/api/feature-requests/route.ts` | GET (list) + POST (submit) — Supabase |
| Create | `__tests__/api/feature-requests.test.ts` | Input validation + happy path tests |
| Create | `components/dashboard/ChangelogContent.tsx` | 'use client' — changelog + form + list |
| Create | `app/changelog/page.tsx` | Server shell — Nav + ChangelogContent |
| Modify | `components/Nav.tsx` | Add "📋 What's New" link |

---

## Task 1: API Route + Tests

**Files:**
- Create: `app/api/feature-requests/route.ts`
- Create: `__tests__/api/feature-requests.test.ts`

**Prerequisite — create Supabase table.** Before writing code, run this SQL in the Supabase dashboard → SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS public.feature_requests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text        NOT NULL,
  description   text,
  submitted_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;
```

---

- [ ] **Step 1: Write the failing tests**

Create `__tests__/api/feature-requests.test.ts`:

```typescript
import { GET, POST } from '@/app/api/feature-requests/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn().mockResolvedValue(null),
}))

// Shared result that each test can override
let mockResult: { data: unknown; error: unknown } = { data: [], error: null }

jest.mock('@/lib/supabase', () => ({
  createServerClient: jest.fn(() => ({
    from: () => ({
      select: () => ({
        order: () => Promise.resolve(mockResult),
      }),
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve(mockResult),
        }),
      }),
    }),
  })),
}))

function makeGET() {
  return new NextRequest(new URL('http://localhost/api/feature-requests'))
}

function makePOST(body: object) {
  return new NextRequest(new URL('http://localhost/api/feature-requests'), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('GET /api/feature-requests', () => {
  it('returns 200 with requests array', async () => {
    mockResult = { data: [], error: null }
    const res = await GET(makeGET())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.requests)).toBe(true)
  })

  it('returns 500 when Supabase returns an error', async () => {
    mockResult = { data: null, error: { message: 'DB error' } }
    const res = await GET(makeGET())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})

describe('POST /api/feature-requests', () => {
  it('returns 400 when title is missing', async () => {
    const res = await POST(makePOST({ description: 'no title here' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when title is empty string', async () => {
    const res = await POST(makePOST({ title: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with ok and request on valid submission', async () => {
    const newRequest = {
      id: 'uuid-1',
      title: 'Dark mode',
      description: null,
      submitted_at: '2026-05-08T00:00:00Z',
    }
    mockResult = { data: newRequest, error: null }
    const res = await POST(makePOST({ title: 'Dark mode' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.request).toHaveProperty('title', 'Dark mode')
  })

  it('returns 500 when Supabase insert fails', async () => {
    mockResult = { data: null, error: { message: 'insert failed' } }
    const res = await POST(makePOST({ title: 'Dark mode' }))
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/miguelslabbert/Documents/Claude Course - Ads Builder/Ads Builder"
npx jest __tests__/api/feature-requests.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/app/api/feature-requests/route'`

- [ ] **Step 3: Create the API route**

Create `app/api/feature-requests/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'

export interface FeatureRequest {
  id:           string
  title:        string
  description:  string | null
  submitted_at: string
}

export async function GET(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('feature_requests')
      .select('id, title, description, submitted_at')
      .order('submitted_at', { ascending: false })

    if (error) throw new Error(error.message)
    return NextResponse.json({ requests: data as FeatureRequest[] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  let body: { title?: string; description?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const title = (body.title ?? '').trim()
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('feature_requests')
      .insert({ title, description: body.description?.trim() || null })
      .select('id, title, description, submitted_at')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, request: data as FeatureRequest })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/api/feature-requests.test.ts --no-coverage
```

Expected: PASS — 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add app/api/feature-requests/route.ts __tests__/api/feature-requests.test.ts
git commit -m "feat: add feature-requests API route (GET + POST)"
```

---

## Task 2: ChangelogContent Component + Page

**Files:**
- Create: `components/dashboard/ChangelogContent.tsx`
- Create: `app/changelog/page.tsx`

- [ ] **Step 1: Create the client component**

Create `components/dashboard/ChangelogContent.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import type { FeatureRequest } from '@/app/api/feature-requests/route'

// ── Hardcoded changelog data ──────────────────────────────────────────────────

const FEATURES: { emoji: string; text: string }[] = [
  { emoji: '📍', text: 'Locations tab — view, edit, and optimise location targets per campaign' },
  { emoji: '🏆', text: 'Auction Insights tab — competitor overlap analysis per campaign' },
  { emoji: '🤖', text: 'AI Analyst — ask Claude questions about your account data' },
  { emoji: '⚡', text: 'AI Recommendations — ranked optimisation suggestions with one-click apply' },
  { emoji: '📋', text: 'Campaign clone & templates — duplicate campaigns and save reusable templates' },
  { emoji: '🔍', text: 'Search terms inline actions — exclude or add as keyword without leaving the tab' },
  { emoji: '➖', text: 'Negative keyword management — add and remove campaign-level negatives' },
  { emoji: '🌐', text: 'MCC click-through — click any account in the MCC overview to open its dashboard' },
  { emoji: '📊', text: 'A/B Test tab — statistical significance testing between ads' },
]

const FIXES: string[] = [
  'Fixed keyword seed limit error (capped at 20 items as required by Google Ads API)',
  'Fixed campaign drill-down rendering bug (bare-else was activating on unknown tabs)',
  'Fixed double-fetch in lazy-loaded section tabs (useRef guard now consistent)',
  'Re-enabled Supabase project and enabled Row Level Security on clients and campaigns tables',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChangelogContent() {
  const [requests,       setRequests]       = useState<FeatureRequest[]>([])
  const [loadingReqs,    setLoadingReqs]    = useState(true)
  const [fetchError,     setFetchError]     = useState('')
  const [title,          setTitle]          = useState('')
  const [description,    setDescription]    = useState('')
  const [submitting,     setSubmitting]     = useState(false)
  const [submitError,    setSubmitError]    = useState('')
  const [justSubmitted,  setJustSubmitted]  = useState(false)

  useEffect(() => {
    fetch('/api/feature-requests')
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Failed to load')
        setRequests(d.requests ?? [])
      })
      .catch(e => setFetchError(String(e)))
      .finally(() => setLoadingReqs(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/feature-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to submit')
      setRequests(prev => [d.request, ...prev])
      setTitle('')
      setDescription('')
      setJustSubmitted(true)
      setTimeout(() => setJustSubmitted(false), 3000)
    } catch (err) {
      setSubmitError(String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-2xl">

      {/* Page heading */}
      <h1 className="text-2xl font-heading font-bold text-[var(--text-1)] mb-1">
        📋 What&apos;s New
      </h1>
      <p className="text-sm text-[var(--text-2)] mb-8">Recent updates to Ads Builder.</p>

      {/* Recent Features */}
      <section className="mb-8">
        <h2 className="text-[10px] font-heading font-bold uppercase tracking-wider text-[var(--text-2)] mb-3">
          🚀 Recent Features
        </h2>
        <ul className="space-y-2">
          {FEATURES.map(f => (
            <li key={f.text} className="flex items-start gap-2 text-sm text-[var(--text-1)]">
              <span className="mt-0.5 flex-shrink-0">{f.emoji}</span>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Bug Fixes */}
      <section className="mb-10">
        <h2 className="text-[10px] font-heading font-bold uppercase tracking-wider text-[var(--text-2)] mb-3">
          🐛 Bug Fixes
        </h2>
        <ul className="space-y-2">
          {FIXES.map(fix => (
            <li key={fix} className="flex items-start gap-2 text-sm text-[var(--text-1)]">
              <span className="mt-0.5 flex-shrink-0 text-[var(--text-2)]">•</span>
              <span>{fix}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Feature Request Form */}
      <section className="border-t border-[var(--border-lo)] pt-8 mb-8">
        <h2 className="text-[10px] font-heading font-bold uppercase tracking-wider text-[var(--text-2)] mb-1">
          💡 Request a Feature
        </h2>
        <p className="text-xs text-[var(--text-2)] mb-4">Got an idea? We&apos;d love to hear it.</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="What would you like to see?"
            required
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-lo)] bg-[var(--surface-lo)] text-[var(--text-1)] placeholder:text-[var(--text-2)] focus:outline-none focus:ring-2 focus:ring-cyan/30"
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Any extra detail (optional)"
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-lo)] bg-[var(--surface-lo)] text-[var(--text-1)] placeholder:text-[var(--text-2)] focus:outline-none focus:ring-2 focus:ring-cyan/30 resize-none"
          />
          {submitError && (
            <p className="text-xs text-red-500">{submitError}</p>
          )}
          {justSubmitted && (
            <p className="text-xs text-teal">✓ Request submitted — thank you!</p>
          )}
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-cyan text-navy disabled:opacity-50 hover:bg-cyan/90 transition-colors"
          >
            {submitting ? 'Submitting…' : 'Submit Request'}
          </button>
        </form>
      </section>

      {/* Feature Requests List */}
      <section>
        <h2 className="text-[10px] font-heading font-bold uppercase tracking-wider text-[var(--text-2)] mb-3">
          📬 All Requests
        </h2>

        {loadingReqs ? (
          <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-2)]">
            <div className="w-4 h-4 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
            Loading…
          </div>
        ) : fetchError ? (
          <p className="text-xs text-red-500">{fetchError}</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-[var(--text-2)]">
            No requests yet — be the first to suggest something!
          </p>
        ) : (
          <ul className="space-y-3">
            {requests.map(r => (
              <li
                key={r.id}
                className="rounded-xl border border-[var(--border-lo)] bg-[var(--surface-lo)] px-4 py-3"
              >
                <p className="text-sm font-medium text-[var(--text-1)]">{r.title}</p>
                {r.description && (
                  <p className="text-xs text-[var(--text-2)] mt-1">{r.description}</p>
                )}
                <p className="text-[10px] text-[var(--text-2)] mt-2">{formatDate(r.submitted_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Create the page shell**

Create `app/changelog/page.tsx`:

```tsx
import { Nav } from '@/components/Nav'
import { ChangelogContent } from '@/components/dashboard/ChangelogContent'

export const dynamic = 'force-dynamic'

export default function ChangelogPage() {
  return (
    <main className="min-h-screen">
      <Nav page="changelog" />
      <div className="w-full px-6 py-8">
        <ChangelogContent />
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/miguelslabbert/Documents/Claude Course - Ads Builder/Ads Builder"
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/changelog/page.tsx components/dashboard/ChangelogContent.tsx
git commit -m "feat: add changelog page with hardcoded features/fixes and feature request form"
```

---

## Task 3: Nav Wiring

**Files:**
- Modify: `components/Nav.tsx`

The current `Nav.tsx` has this structure (read the file before editing to confirm line numbers):

```tsx
interface NavProps {
  page?: 'builder' | 'campaigns' | 'clients' | 'mcc'
  ...
}
...
<Link href="/"         className={linkClass(page === 'builder')}>Builder</Link>
<Link href="/clients"  className={linkClass(page === 'clients')}>Clients</Link>
<Link href="/campaigns"className={linkClass(page === 'campaigns')}>Campaigns</Link>
<Link href="/mcc"      className={linkClass(page === 'mcc')}>MCC</Link>
```

- [ ] **Step 1: Update NavProps type**

In `components/Nav.tsx`, change:

```tsx
// BEFORE
  page?: 'builder' | 'campaigns' | 'clients' | 'mcc'

// AFTER
  page?: 'builder' | 'campaigns' | 'clients' | 'mcc' | 'changelog'
```

- [ ] **Step 2: Add the nav link**

In `components/Nav.tsx`, after the MCC link:

```tsx
// BEFORE
          <Link href="/mcc"      className={linkClass(page === 'mcc')}>MCC</Link>

// AFTER
          <Link href="/mcc"      className={linkClass(page === 'mcc')}>MCC</Link>
          <Link href="/changelog"className={linkClass(page === 'changelog')}>📋 What&apos;s New</Link>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/miguelslabbert/Documents/Claude Course - Ads Builder/Ads Builder"
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all existing tests still pass plus the 4 new feature-requests tests

- [ ] **Step 5: Commit**

```bash
git add components/Nav.tsx
git commit -m "feat: add What's New nav link to changelog page"
```

---

## Self-Review

**Spec coverage:**
- ✅ Nav tab "📋 What's New" → Task 3
- ✅ Hardcoded changelog bullet points (features + fixes) → Task 2 `FEATURES` + `FIXES` arrays
- ✅ Feature request form (title + description) → Task 2 `handleSubmit`
- ✅ Requests saved to Supabase → Task 1 POST route
- ✅ Requests visible on same page (admin can see them) → Task 2 requests list
- ✅ Tests for API validation and happy paths → Task 1

**Placeholder scan:** No TBD, TODO, or incomplete sections found.

**Type consistency:** `FeatureRequest` interface defined once in `app/api/feature-requests/route.ts`, imported into `ChangelogContent.tsx` — consistent across all tasks.
