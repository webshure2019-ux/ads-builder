'use client'
import { useState, useEffect, useRef } from 'react'
import type { LandingPageRow } from '@/lib/google-ads'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function curr(n: number, c: string) { return `${c} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
function pct(n: number)   { return `${n.toFixed(2)}%` }
function shortUrl(url: string, max = 50): string {
  try {
    const u = new URL(url)
    const path = u.pathname + u.search
    return path.length > max ? path.slice(0, max) + '…' : path
  } catch {
    return url.length > max ? url.slice(0, max) + '…' : url
  }
}

function speedColor(score: number | null): string {
  if (score === null) return 'text-navy/30'
  if (score >= 8) return 'text-emerald-600'
  if (score >= 5) return 'text-amber-600'
  return 'text-red-600'
}

function speedLabel(score: number | null): string {
  if (score === null) return '—'
  if (score >= 8) return 'Fast'
  if (score >= 5) return 'Medium'
  return 'Slow'
}

function convRateColor(rate: number, avg: number): string {
  if (avg === 0) return 'text-navy/60'
  const ratio = rate / avg
  if (ratio >= 1.25) return 'text-emerald-600'
  if (ratio >= 0.75) return 'text-navy/70'
  return 'text-red-600'
}

// ─── Issue flags per URL ──────────────────────────────────────────────────────
interface Issue { label: string; color: string }
function getIssues(row: LandingPageRow, avgConvRate: number, avgSpeedScore: number | null): Issue[] {
  const issues: Issue[] = []
  if (row.speedScore !== null && row.speedScore < 5)
    issues.push({ label: '🐌 Slow page speed', color: 'text-red-600' })
  if (row.mobileFriendlyPct !== null && row.mobileFriendlyPct < 70)
    issues.push({ label: '📱 Poor mobile experience', color: 'text-red-600' })
  if (row.convRate < avgConvRate * 0.5 && row.clicks >= 50 && avgConvRate > 0)
    issues.push({ label: '↘ Low conversion rate', color: 'text-amber-600' })
  if (row.cost > 0 && row.conversions === 0 && row.clicks >= 100)
    issues.push({ label: '💸 Spend with zero conversions', color: 'text-red-600' })
  if (row.avgPageViews !== null && row.avgPageViews < 1.2)
    issues.push({ label: '🚪 High single-page sessions', color: 'text-amber-600' })
  return issues
}

// ─── Score bar ────────────────────────────────────────────────────────────────
function ScoreBar({ value, max = 10, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="h-1.5 bg-cloud rounded-full overflow-hidden w-full">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  clientAccountId: string
  startDate:       string
  endDate:         string
  campaignId?:     string
  currency:        string
}

type SortKey = 'cost' | 'clicks' | 'convRate' | 'cpa' | 'speed'

export function LandingPageSection({ clientAccountId, startDate, endDate, campaignId, currency }: Props) {
  const [rows,     setRows]     = useState<LandingPageRow[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [sortKey,  setSortKey]  = useState<SortKey>('cost')
  const [filter,   setFilter]   = useState('')
  const fetched = useRef('')

  useEffect(() => {
    const key = `${clientAccountId}|${startDate}|${endDate}|${campaignId ?? ''}`
    if (fetched.current === key) return
    fetched.current = key

    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      client_account_id: clientAccountId,
      start_date:        startDate,
      end_date:          endDate,
      ...(campaignId ? { campaign_id: campaignId } : {}),
    })
    fetch(`/api/landing-page-performance?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setRows(d.rows ?? [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [clientAccountId, startDate, endDate, campaignId])

  if (loading) return (
    <div className="border border-cloud rounded-3xl p-6 bg-white animate-pulse">
      <div className="h-4 w-56 bg-cloud rounded mb-4" />
      <div className="space-y-2">
        {[1,2,3].map(i => <div key={i} className="h-10 bg-cloud rounded-xl" />)}
      </div>
    </div>
  )

  if (error) return (
    <div className="border border-red-200 rounded-3xl p-5 bg-red-50 text-sm text-red-700">
      Landing page data unavailable: {error}
    </div>
  )

  if (rows.length === 0) return null

  // Aggregates
  const totalClicks  = rows.reduce((s, r) => s + r.clicks, 0)
  const totalConv    = rows.reduce((s, r) => s + r.conversions, 0)
  const avgConvRate  = totalClicks > 0 ? (totalConv / totalClicks) * 100 : 0
  const speedRows    = rows.filter(r => r.speedScore !== null)
  const avgSpeed     = speedRows.length > 0
    ? speedRows.reduce((s, r) => s + (r.speedScore ?? 0), 0) / speedRows.length
    : null

  // Issues count
  const issueCount = rows.reduce((s, r) => s + getIssues(r, avgConvRate, avgSpeed).length, 0)

  // Filtered + sorted
  const filtered = rows.filter(r =>
    !filter || r.url.toLowerCase().includes(filter.toLowerCase())
  )
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'cost')     return b.cost - a.cost
    if (sortKey === 'clicks')   return b.clicks - a.clicks
    if (sortKey === 'convRate') return b.convRate - a.convRate
    if (sortKey === 'cpa')      return (b.cpa || 0) - (a.cpa || 0)
    if (sortKey === 'speed')    return (b.speedScore ?? -1) - (a.speedScore ?? -1)
    return 0
  })

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    return (
      <button
        onClick={() => setSortKey(k)}
        className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
          sortKey === k
            ? 'bg-teal text-white'
            : 'bg-cloud text-navy/50 hover:bg-cloud/70'
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="border border-cloud rounded-3xl overflow-hidden bg-white">
      {/* ── Header (always visible, collapsible) ── */}
      <button
        onClick={() => setExpanded(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-black/5 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex-shrink-0 flex flex-col items-center justify-center ring-4 ring-teal/30 bg-white">
            <span className="text-xl">🛬</span>
          </div>
          <div>
            <p className="font-heading font-bold text-navy text-sm">Landing Page Performance</p>
            <p className="text-[10px] text-navy/50 mt-0.5">
              {rows.length} URL{rows.length !== 1 ? 's' : ''} ·{' '}
              Avg CVR {pct(avgConvRate)}
              {avgSpeed !== null ? ` · Speed ${avgSpeed.toFixed(1)}/10` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {issueCount > 0 && (
            <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {issueCount} issue{issueCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-navy/40">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* ── Expanded ── */}
      {expanded && (
        <div className="border-t border-cloud/60">

          {/* Summary strip */}
          <div className="px-6 pt-5 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="border border-cloud rounded-2xl px-4 py-3 text-center">
              <p className="text-[9px] text-navy/40 uppercase tracking-wide mb-0.5">URLs</p>
              <p className="font-heading font-bold text-navy text-lg">{rows.length}</p>
            </div>
            <div className="border border-cloud rounded-2xl px-4 py-3 text-center">
              <p className="text-[9px] text-navy/40 uppercase tracking-wide mb-0.5">Avg Conv Rate</p>
              <p className={`font-heading font-bold text-lg ${avgConvRate >= 3 ? 'text-emerald-600' : avgConvRate >= 1 ? 'text-amber-600' : 'text-red-600'}`}>
                {pct(avgConvRate)}
              </p>
            </div>
            <div className="border border-cloud rounded-2xl px-4 py-3 text-center">
              <p className="text-[9px] text-navy/40 uppercase tracking-wide mb-0.5">Avg Speed</p>
              <p className={`font-heading font-bold text-lg ${speedColor(avgSpeed)}`}>
                {avgSpeed !== null ? `${avgSpeed.toFixed(1)}/10` : '—'}
              </p>
            </div>
            <div className="border border-cloud rounded-2xl px-4 py-3 text-center">
              <p className="text-[9px] text-navy/40 uppercase tracking-wide mb-0.5">Issues Found</p>
              <p className={`font-heading font-bold text-lg ${issueCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {issueCount}
              </p>
            </div>
          </div>

          {/* Filter + sort controls */}
          <div className="px-6 pb-3 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy/30 text-xs pointer-events-none">🔍</span>
              <input
                type="text"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter by URL…"
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-cloud rounded-xl bg-white text-navy placeholder-navy/30 focus:outline-none focus:border-cyan transition-colors"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-navy/40">Sort:</span>
              <SortBtn k="cost"     label="Spend" />
              <SortBtn k="clicks"   label="Clicks" />
              <SortBtn k="convRate" label="CVR" />
              <SortBtn k="cpa"      label="CPA" />
              <SortBtn k="speed"    label="Speed" />
            </div>
          </div>

          {/* URL cards */}
          <div className="px-6 pb-5 space-y-3">
            {sorted.map((row, i) => {
              const issues   = getIssues(row, avgConvRate, avgSpeed)
              const hasIssue = issues.length > 0
              return (
                <div
                  key={i}
                  className={`border rounded-2xl p-4 space-y-3 ${
                    hasIssue ? 'border-amber-200 bg-amber-50/40' : 'border-cloud bg-white'
                  }`}
                >
                  {/* URL + issues */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={row.url}
                        className="text-xs font-medium text-teal hover:underline truncate block"
                      >
                        {shortUrl(row.url, 60)}
                      </a>
                    </div>
                    {hasIssue && (
                      <span className="flex-shrink-0 text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
                        {issues.length} issue{issues.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs">
                    <div>
                      <p className="text-navy/40 text-[9px] uppercase tracking-wide">Spend</p>
                      <p className="font-bold text-navy">{curr(row.cost, currency)}</p>
                    </div>
                    <div>
                      <p className="text-navy/40 text-[9px] uppercase tracking-wide">Clicks</p>
                      <p className="font-bold text-navy">{row.clicks.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-navy/40 text-[9px] uppercase tracking-wide">CTR</p>
                      <p className="font-bold text-navy">{pct(row.ctr)}</p>
                    </div>
                    <div>
                      <p className="text-navy/40 text-[9px] uppercase tracking-wide">Conv Rate</p>
                      <p className={`font-bold ${convRateColor(row.convRate, avgConvRate)}`}>
                        {pct(row.convRate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-navy/40 text-[9px] uppercase tracking-wide">Conversions</p>
                      <p className="font-bold text-navy">{row.conversions.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-navy/40 text-[9px] uppercase tracking-wide">CPA</p>
                      <p className="font-bold text-navy">{row.cpa > 0 ? curr(row.cpa, currency) : '—'}</p>
                    </div>
                  </div>

                  {/* Speed + mobile signals */}
                  {(row.speedScore !== null || row.mobileFriendlyPct !== null || row.avgPageViews !== null) && (
                    <div className="grid grid-cols-3 gap-3 pt-2 border-t border-cloud/60">
                      {row.speedScore !== null && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-[9px] text-navy/40 uppercase tracking-wide">Speed</p>
                            <p className={`text-[10px] font-bold ${speedColor(row.speedScore)}`}>
                              {row.speedScore.toFixed(1)}/10 · {speedLabel(row.speedScore)}
                            </p>
                          </div>
                          <ScoreBar
                            value={row.speedScore}
                            max={10}
                            color={row.speedScore >= 8 ? 'bg-emerald-400' : row.speedScore >= 5 ? 'bg-amber-400' : 'bg-red-400'}
                          />
                        </div>
                      )}
                      {row.mobileFriendlyPct !== null && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-[9px] text-navy/40 uppercase tracking-wide">Mobile-Friendly</p>
                            <p className={`text-[10px] font-bold ${row.mobileFriendlyPct >= 80 ? 'text-emerald-600' : row.mobileFriendlyPct >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                              {row.mobileFriendlyPct.toFixed(0)}%
                            </p>
                          </div>
                          <ScoreBar
                            value={row.mobileFriendlyPct}
                            max={100}
                            color={row.mobileFriendlyPct >= 80 ? 'bg-emerald-400' : row.mobileFriendlyPct >= 60 ? 'bg-amber-400' : 'bg-red-400'}
                          />
                        </div>
                      )}
                      {row.avgPageViews !== null && (
                        <div>
                          <p className="text-[9px] text-navy/40 uppercase tracking-wide">Avg Page Views</p>
                          <p className={`text-[10px] font-bold ${row.avgPageViews >= 2 ? 'text-emerald-600' : row.avgPageViews >= 1.3 ? 'text-navy/70' : 'text-amber-600'}`}>
                            {row.avgPageViews.toFixed(1)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Issues list */}
                  {issues.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-amber-200">
                      {issues.map((issue, j) => (
                        <p key={j} className={`text-[10px] font-medium ${issue.color}`}>
                          {issue.label}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {sorted.length === 0 && filter && (
              <p className="text-center text-xs text-navy/40 py-6">No URLs match "{filter}"</p>
            )}
          </div>

          {/* Note */}
          <div className="px-6 pb-5">
            <p className="text-[10px] text-navy/30 border-t border-cloud pt-3">
              Speed score (1–10) and mobile-friendly % are sourced from Google Ads landing_page_view.
              Page speed thresholds: ≥8 Fast, 5–7 Medium, &lt;5 Slow. Conversion rate benchmarked against account average ({pct(avgConvRate)}).
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
