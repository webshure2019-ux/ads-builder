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
