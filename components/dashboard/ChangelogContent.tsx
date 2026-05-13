'use client'

import { useState, useEffect } from 'react'
import type { FeatureRequest } from '@/app/api/feature-requests/route'

// ── Hardcoded changelog data ──────────────────────────────────────────────────
// IMPORTANT: Add a new entry at the TOP of FEATURES or FIXES after every
// feature ship or bug fix. Include the date ("8 May 2026") and time if known
// ("~14:30 SAST"). Newest first always.

const FEATURES: { emoji: string; text: string; date: string }[] = [
  { emoji: '✍️', text: 'RSA Ad Strength — account-wide distribution of Excellent/Good/Average/Poor RSA ads with per-campaign breakdown', date: '13 May 2026' },
  { emoji: '📈', text: 'Top Movers — biggest week-over-week changes in spend or conversions per campaign; instant answer to "what changed?"', date: '13 May 2026' },
  { emoji: '📊', text: 'Quality Score Tracker — take QS snapshots stored in Supabase; track distribution trends over time per client', date: '13 May 2026' },
  { emoji: '🌍', text: 'Geo Performance tab — per-campaign geographic breakdown by city/region/country with sortable metrics and CPA', date: '13 May 2026' },
  { emoji: '🗑', text: 'Wasted Spend — consolidated view of zero-conversion keywords, low QS keywords (≤4), and wasted search terms', date: '13 May 2026' },
  { emoji: '💡', text: 'Bid Strategy tab — view and switch bid strategies (Target CPA/ROAS, Maximize Conv/Value, Manual CPC) per campaign', date: '13 May 2026' },
  { emoji: '💰', text: 'Shared Budgets section — view all account-level shared budget pools with campaigns, edit daily amounts inline', date: '12 May 2026' },
  { emoji: '👥', text: 'Audiences tab — per-campaign audience targets with inline bid modifier editing (Observation vs Targeting mode)', date: '12 May 2026' },
  { emoji: '📅', text: 'Ad Schedule tab — view and manage ad scheduling bid adjustments by day and time slot; add/remove/edit entries', date: '12 May 2026' },
  { emoji: '✏️', text: 'Campaign name editing — rename campaigns inline from the campaigns table (hover ✏️ icon next to campaign name)', date: '12 May 2026' },
  { emoji: '☑️', text: 'Bulk actions — select multiple campaigns or keywords with checkboxes; bulk Enable/Pause with a single click', date: '12 May 2026' },
  { emoji: '⬇️', text: 'CSV export for keywords and search terms — export any filtered/sorted view with all metrics to a CSV file', date: '12 May 2026' },
  { emoji: '💾', text: 'Date range persistence — selected date range preset is saved to localStorage and restored on next visit', date: '12 May 2026' },
  { emoji: '💲', text: 'Keyword bid editing — click any keyword bid to edit the Max CPC inline; "auto" shown for ad-group-default bids', date: '12 May 2026' },
  { emoji: '🔗', text: 'Assets tab — view, add, edit, and remove all ad extensions per campaign; full PMax asset group management with performance labels', date: '11 May 2026' },
  { emoji: '📍', text: 'Locations tab — view, edit, and optimise location targets per campaign',           date: '8 May 2026' },
  { emoji: '📋', text: "What's New page — changelog + feature request form",                               date: '8 May 2026' },
  { emoji: '🏆', text: 'Auction Insights tab — competitor overlap analysis per campaign',                  date: '7 May 2026' },
  { emoji: '🤖', text: 'AI Analyst — ask Claude questions about your account data',                        date: '7 May 2026' },
  { emoji: '⚡', text: 'AI Recommendations — ranked optimisation suggestions with one-click apply',        date: '7 May 2026' },
  { emoji: '📋', text: 'Campaign clone & templates — duplicate campaigns and save reusable templates',     date: '6 May 2026' },
  { emoji: '🔍', text: 'Search terms inline actions — exclude or add as keyword without leaving the tab', date: '6 May 2026' },
  { emoji: '➖', text: 'Negative keyword management — add and remove campaign-level negatives',            date: '6 May 2026' },
  { emoji: '🌐', text: 'MCC click-through — click any account in the MCC overview to open its dashboard', date: '5 May 2026' },
  { emoji: '📊', text: 'A/B Test tab — statistical significance testing between ads',                      date: '5 May 2026' },
]

const FIXES: { text: string; date: string }[] = [
  { text: '⚠️ CRITICAL — Fixed keyword & negative match types: EXACT and BROAD were swapped throughout the codebase, so keywords added via this app were saved to Google Ads with the wrong match type (and read back with a matching wrong label, hiding the bug). Newly added keywords will now have the correct match type. We recommend auditing existing keywords/negatives in Google Ads directly to verify their match types are what you intended.', date: '13 May 2026' },
  { text: '⚠️ CRITICAL — Fixed Device Performance: DESKTOP and TABLET were swapped in the device-code mapping. Numeric API responses (e.g. for non-Search campaigns) were displaying Desktop traffic as Tablet and vice versa. Existing scoped performance reads should be re-loaded to see correct numbers.', date: '13 May 2026' },
  { text: '⚠️ Fixed Bid Strategy numeric codes: the API code → strategy name map had nearly every value wrong (e.g. 9 was labelled MAXIMIZE_CONVERSIONS, but 9 is actually TARGET_SPEND / Maximize Clicks). Campaigns may now display a different bid strategy label than before — this is the actual strategy in Google Ads, not a change.', date: '13 May 2026' },
  { text: 'Fixed RSA Health Section — ad-strength numeric codes (e.g. 7 = EXCELLENT) were not being normalised to string names, so the per-ad badges were stuck on UNSPECIFIED in some accounts', date: '13 May 2026' },
  { text: 'Fixed A/B Test tab — data did not refresh when switching client/campaign/date range (boolean `useRef(false)` guard stuck after first fetch); also fixed hardcoded "$" currency symbol on per-ad cost', date: '13 May 2026' },
  { text: 'Fixed RSA Copy tab — same stale-data issue (boolean fetched guard) prevented refresh on client/campaign/date change', date: '13 May 2026' },
  { text: 'Fixed Search Terms tab — was incorrectly shown for Performance Max campaigns (which don\'t expose traditional search terms); now hidden for PMax alongside Keywords, RSA Copy, and A/B Test tabs', date: '13 May 2026' },
  { text: 'Fixed Top Movers — previous-period data now auto-refreshes when the date range changes while the section is open (was stuck showing stale data)', date: '13 May 2026' },
  { text: 'Fixed RSA Health Section — client-switch re-fetch was firing during React render instead of in a useEffect, causing double-fetches and stale data in Strict Mode', date: '13 May 2026' },
  { text: 'Fixed Wasted Spend Section — data now auto-refreshes when switching clients or changing the date range while the section is open', date: '13 May 2026' },
  { text: 'Fixed Quality Score Tracker — snapshot history now reloads when switching clients while the section is open', date: '13 May 2026' },
  { text: 'Fixed Bid Strategy tab — numeric API strategy codes (e.g. "9") now correctly map to their string name so the correct strategy button is highlighted in the edit panel', date: '13 May 2026' },
  { text: 'Fixed Assets tab GAQL error — campaign.id must appear in SELECT when used in WHERE; added to both the structure and metrics queries', date: '11 May 2026' },
  { text: 'Improved expired-token error — when the Google Ads refresh token expires the app now shows a clear message with exact Vercel steps instead of a generic failure', date: '11 May 2026' },
  { text: 'Fixed Auction Insights tab — api field auction_insight.domain was removed in Google Ads API v23; now correctly reads from segments.auction_insight_domain', date: '8 May 2026, ~15:00 SAST' },
  { text: 'Fixed Locations tab error — gRPC errors from Google Ads now surface real details instead of a generic fallback message; location_view query failures (e.g. PMax) no longer crash the tab', date: '8 May 2026, ~14:30 SAST' },
  { text: 'Fixed keyword seed limit error (capped at 20 items as required by Google Ads API)',           date: '7 May 2026' },
  { text: 'Fixed campaign drill-down rendering bug (bare-else catch-all was activating on unknown tabs)', date: '7 May 2026' },
  { text: 'Fixed double-fetch in lazy-loaded section tabs (useRef guard now consistent across tabs)',     date: '6 May 2026' },
  { text: 'Re-enabled Supabase project; enabled Row Level Security on clients and campaigns tables',     date: '6 May 2026' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChangelogContent() {
  const [requests,      setRequests]      = useState<FeatureRequest[]>([])
  const [loadingReqs,   setLoadingReqs]   = useState(true)
  const [fetchError,    setFetchError]    = useState('')
  const [title,         setTitle]         = useState('')
  const [description,   setDescription]  = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [submitError,   setSubmitError]   = useState('')
  const [justSubmitted, setJustSubmitted] = useState(false)

  useEffect(() => {
    fetch('/api/feature-requests')
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Failed to load')
        setRequests(d.requests ?? [])
      })
      .catch(e => setFetchError(e instanceof Error ? e.message : String(e)))
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
          title:       title.trim(),
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
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : String(err))
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
              <span className="flex-1">{f.text}</span>
              <span className="flex-shrink-0 text-[10px] text-[var(--text-2)] mt-0.5 whitespace-nowrap">{f.date}</span>
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
            <li key={fix.text} className="flex items-start gap-2 text-sm text-[var(--text-1)]">
              <span className="mt-0.5 flex-shrink-0 text-[var(--text-2)]">•</span>
              <span className="flex-1">{fix.text}</span>
              <span className="flex-shrink-0 text-[10px] text-[var(--text-2)] mt-0.5 whitespace-nowrap">{fix.date}</span>
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
