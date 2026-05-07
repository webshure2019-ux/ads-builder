'use client'
import { useState } from 'react'
import type { Recommendation, RecCategory } from '@/types'

// ── Category display config ────────────────────────────────────────────────────
const CAT_META: Record<RecCategory, { label: string; cls: string }> = {
  keyword:   { label: 'Keyword',   cls: 'bg-blue-50 text-blue-600' },
  budget:    { label: 'Budget',    cls: 'bg-emerald-50 text-emerald-600' },
  ad_copy:   { label: 'Ad Copy',   cls: 'bg-purple-50 text-purple-600' },
  negative:  { label: 'Negative',  cls: 'bg-red-50 text-red-600' },
  bidding:   { label: 'Bidding',   cls: 'bg-amber-50 text-amber-600' },
  structure: { label: 'Structure', cls: 'bg-sky-50 text-sky-600' },
}

function priorityCls(p: number): string {
  if (p >= 8) return 'bg-red-50 text-red-600'
  if (p >= 5) return 'bg-amber-50 text-amber-600'
  return 'bg-emerald-50 text-emerald-600'
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface Props {
  clientAccountId: string
  startDate:       string
  endDate:         string
  currency:        string
}

function RecCard({
  rec,
  onApply,
  onDismiss,
  applying,
  applyError,
}: {
  rec:        Recommendation
  onApply:    (rec: Recommendation) => void
  onDismiss:  (id: string) => void
  applying:   boolean
  applyError: string | null
}) {
  const cat = CAT_META[rec.category] ?? { label: rec.category, cls: 'bg-cloud text-navy/50' }

  return (
    <div className="border border-cloud rounded-2xl p-4 bg-white hover:border-cyan/30 transition-all">
      {/* Top row: priority + title + actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {/* Priority badge */}
          <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold mt-0.5 ${priorityCls(rec.priority)}`}>
            {rec.priority}
          </div>

          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-navy leading-snug">{rec.title}</p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cat.cls}`}>
                {cat.label}
              </span>
              <span className="text-[9px] text-navy/40 bg-cloud px-2 py-0.5 rounded-full">
                {rec.impact}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onDismiss(rec.id)}
            className="text-[10px] font-medium px-2.5 py-1.5 rounded-lg bg-cloud text-navy/50 hover:bg-cloud/70 transition-colors"
          >
            Dismiss
          </button>
          {rec.applicable ? (
            <button
              onClick={() => onApply(rec)}
              disabled={applying}
              aria-label={applying ? 'Applying…' : 'Apply recommendation'}
              className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-teal text-white hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {applying ? '…' : '✓ Apply'}
            </button>
          ) : (
            <span className="text-[9px] font-medium px-2.5 py-1.5 rounded-lg bg-mist text-navy/35 border border-dashed border-cloud whitespace-nowrap">
              Manual in Google Ads
            </span>
          )}
        </div>
      </div>

      {/* Reasoning */}
      <p className="text-[11px] text-navy/55 leading-relaxed mt-3 pt-3 border-t border-cloud">
        {rec.reasoning}
      </p>

      {/* Inline apply error */}
      {applyError && (
        <p className="text-[10px] text-red-600 mt-2 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
          Failed: {applyError}
        </p>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function RecommendationsSection({ clientAccountId, startDate, endDate, currency: _currency }: Props) {
  const [recs,        setRecs]        = useState<Recommendation[]>([])
  const [filter,      setFilter]      = useState('all')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [iterations,  setIterations]  = useState(0)
  const [applying,    setApplying]    = useState<string | null>(null)
  const [applyErrors, setApplyErrors] = useState<Record<string, string>>({})
  const [showDone,    setShowDone]    = useState(false)

  const pending    = recs.filter(r => r.status === 'pending')
  const done       = recs.filter(r => r.status !== 'pending')
  const categories = Array.from(new Set(pending.map(r => r.category)))
  const filtered   = filter === 'all' ? pending : pending.filter(r => r.category === filter)

  async function generate() {
    setLoading(true)
    setError(null)
    setRecs([])
    setFilter('all')
    setApplyErrors({})
    setShowDone(false)

    try {
      const res = await fetch('/api/recommendations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          client_account_id: clientAccountId,
          start_date:        startDate,
          end_date:          endDate,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setRecs(data.recommendations ?? [])
      setIterations(data.iterations ?? 0)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleApply(rec: Recommendation) {
    setApplying(rec.id)
    setApplyErrors(prev => { const n = { ...prev }; delete n[rec.id]; return n })

    try {
      const res = await fetch('/api/apply-recommendation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action_type:       rec.action_type,
          action_data:       rec.action_data,
          client_account_id: clientAccountId,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Apply failed')
      setRecs(prev => prev.map(r => r.id === rec.id ? { ...r, status: 'applied' as const } : r))
    } catch (e: any) {
      setApplyErrors(prev => ({ ...prev, [rec.id]: e.message }))
    } finally {
      setApplying(null)
    }
  }

  function handleDismiss(id: string) {
    setRecs(prev => prev.map(r => r.id === id ? { ...r, status: 'dismissed' as const } : r))
  }

  // ── Section wrapper ──────────────────────────────────────────────────────────
  return (
    <div className="border border-cloud rounded-3xl overflow-hidden bg-white">

      {/* Header */}
      <div className="px-6 py-4 border-b border-cloud flex items-center justify-between">
        <div>
          <p className="font-heading font-bold text-navy text-sm">
            ⚡ Optimisation Recommendations
            {!loading && recs.length > 0 && (
              <span className="ml-2 text-[10px] font-bold bg-cyan text-white px-2 py-0.5 rounded-full">
                {pending.length}
              </span>
            )}
          </p>
          <p className="text-[10px] text-navy/50 mt-0.5">
            {recs.length > 0
              ? `Ranked by estimated impact · ${iterations} data call${iterations !== 1 ? 's' : ''}`
              : 'Claude analyses campaigns, keywords, search terms & devices'}
          </p>
        </div>
        {recs.length > 0 && !loading ? (
          <button
            onClick={generate}
            className="text-[11px] font-medium px-3 py-1.5 rounded-xl bg-cloud text-navy/60 hover:bg-cloud/70 transition-colors"
          >
            ↺ Refresh
          </button>
        ) : (
          !loading && (
            <button
              onClick={generate}
              className="bg-teal text-white font-heading font-bold text-xs px-4 py-2 rounded-xl hover:opacity-90 transition-all"
            >
              ⚡ Generate Recommendations
            </button>
          )
        )}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="px-6 py-12 flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-teal border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-teal">Claude is analysing your account…</p>
          <p className="text-[11px] text-navy/40">Fetching live data across campaigns, keywords & devices</p>
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div className="px-6 py-6">
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3">
            <span className="text-red-400 flex-shrink-0 mt-0.5">⚠</span>
            <div>
              <p className="text-sm font-medium text-red-700 mb-0.5">Analysis failed</p>
              <p className="text-[11px] text-red-500">{error}</p>
              <button
                onClick={generate}
                className="mt-3 text-[11px] font-bold text-red-600 hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Empty state (initial) ── */}
      {!loading && !error && recs.length === 0 && (
        <div className="px-6 py-12 text-center">
          <p className="text-2xl mb-2">🎯</p>
          <p className="text-sm font-medium text-navy mb-1">Ready to analyse</p>
          <p className="text-[11px] text-navy/40">
            Surface the highest-impact actions across all categories
          </p>
        </div>
      )}

      {/* ── All done ── */}
      {!loading && !error && recs.length > 0 && pending.length === 0 && (
        <div className="px-6 py-8 text-center">
          <p className="text-xl mb-2">✅</p>
          <p className="text-sm font-medium text-navy mb-1">All recommendations reviewed</p>
          <button
            onClick={generate}
            className="mt-3 text-[11px] font-bold text-teal hover:underline"
          >
            ↺ Run a fresh analysis
          </button>
        </div>
      )}

      {/* ── Populated state ── */}
      {!loading && !error && pending.length > 0 && (
        <div>
          {/* Filter chips */}
          <div className="px-6 py-3 border-b border-cloud flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-navy/40 font-semibold uppercase tracking-wider mr-1">Filter</span>
            <button
              onClick={() => setFilter('all')}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                filter === 'all'
                  ? 'bg-navy text-cyan border-navy'
                  : 'border-cloud text-navy/50 hover:bg-cloud/70'
              }`}
            >
              All ({pending.length})
            </button>
            {categories.map(cat => {
              const meta  = CAT_META[cat] ?? { label: cat, cls: '' }
              const count = pending.filter(r => r.category === cat).length
              return (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    filter === cat
                      ? 'bg-navy text-cyan border-navy'
                      : 'border-cloud text-navy/50 hover:bg-cloud/70'
                  }`}
                >
                  {meta.label} ({count})
                </button>
              )
            })}
          </div>

          {/* Cards */}
          <div className="px-6 py-4 space-y-3">
            {filtered.map(rec => (
              <RecCard
                key={rec.id}
                rec={rec}
                onApply={handleApply}
                onDismiss={handleDismiss}
                applying={applying === rec.id}
                applyError={applyErrors[rec.id] ?? null}
              />
            ))}
          </div>

          {/* Done collapse */}
          {done.length > 0 && (
            <div className="px-6 pb-4 border-t border-cloud pt-3">
              <button
                onClick={() => setShowDone(v => !v)}
                className="text-[10px] font-semibold uppercase tracking-wider text-navy/35 hover:text-navy/60 transition-colors flex items-center gap-1"
              >
                {showDone ? '▾' : '▸'} {done.length} applied / dismissed
              </button>
              {showDone && (
                <div className="mt-3 space-y-2 opacity-50">
                  {done.map(rec => (
                    <div key={rec.id} className="border border-dashed border-cloud rounded-xl px-4 py-2 flex items-center justify-between gap-3">
                      <p className="text-[11px] text-navy/50 truncate">{rec.title}</p>
                      <span className="text-[9px] font-bold uppercase tracking-wider flex-shrink-0 text-navy/30">
                        {rec.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
