'use client'
import { useState, useCallback } from 'react'
import type { KeywordRow } from '@/lib/google-ads'

// ─── QS colour helpers ────────────────────────────────────────────────────────
function qsColor(qs: number | null): string {
  if (qs === null)   return 'text-navy/30'
  if (qs <= 3)        return 'text-red-600'
  if (qs <= 6)        return 'text-amber-600'
  return 'text-emerald-600'
}
function qsBg(qs: number | null): string {
  if (qs === null)   return 'bg-cloud/60'
  if (qs <= 3)        return 'bg-red-100'
  if (qs <= 6)        return 'bg-amber-100'
  return 'bg-emerald-100'
}
function qsLabel(qs: number | null): string {
  if (qs === null)   return '—'
  if (qs <= 3)        return 'Poor'
  if (qs <= 6)        return 'Fair'
  return 'Good'
}

// ─── QS bucket badge (Expected CTR / Ad Relevance / Landing Page) ─────────────
const BUCKET_CFG: Record<string, { icon: string; cls: string }> = {
  ABOVE_AVERAGE: { icon: '↑', cls: 'text-emerald-600 bg-emerald-50'  },
  AVERAGE:       { icon: '→', cls: 'text-navy/50    bg-cloud/60'     },
  BELOW_AVERAGE: { icon: '↓', cls: 'text-red-600    bg-red-50'       },
  UNKNOWN:       { icon: '?', cls: 'text-navy/30    bg-cloud/40'     },
}

function BucketBadge({ value }: { value: string }) {
  const cfg = BUCKET_CFG[value] ?? BUCKET_CFG.UNKNOWN
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>
      {cfg.icon}
    </span>
  )
}

// ─── Match type badge ─────────────────────────────────────────────────────────
const MATCH_CFG: Record<string, { label: string; cls: string }> = {
  EXACT:   { label: '[e]',   cls: 'bg-cyan/15 text-cyan-800'   },
  PHRASE:  { label: '"p"',   cls: 'bg-navy/10 text-navy'       },
  BROAD:   { label: 'bm',    cls: 'bg-amber-100 text-amber-800' },
  UNKNOWN: { label: '?',     cls: 'bg-cloud text-navy/40'      },
}

function MatchBadge({ matchType }: { matchType: string }) {
  const cfg = MATCH_CFG[matchType] ?? MATCH_CFG.UNKNOWN
  return (
    <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ─── Recommendation engine ────────────────────────────────────────────────────
function getQsAdvice(row: KeywordRow): string {
  const issues: string[] = []
  if (row.expectedCtr    === 'BELOW_AVERAGE') issues.push('improve ad copy relevance to keyword intent')
  if (row.adRelevance    === 'BELOW_AVERAGE') issues.push('reorganise ad group for tighter keyword–ad alignment')
  if (row.landingPageExp === 'BELOW_AVERAGE') issues.push('update landing page to match keyword intent')
  if (issues.length === 0) return 'Review bid strategy and search volume'
  return issues.join(' · ')
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function isKwEnabled(s: string) { return s === 'ENABLED' || s === '2' }

// ─── Inline pause / enable button ────────────────────────────────────────────
function KwToggleBtn({ kw, clientId, onUpdated }: {
  kw: KeywordRow; clientId: string; onUpdated: (status: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState('')
  const active = isKwEnabled(kw.status)

  async function toggle() {
    const next = active ? 'PAUSED' : 'ENABLED'
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/keyword-status', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, ad_group_id: kw.adGroupId, criterion_id: kw.criterionId, status: next }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      onUpdated(next)
    } catch (e: any) { setErr(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        onClick={toggle}
        disabled={loading}
        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all disabled:opacity-50 whitespace-nowrap ${active ? 'border-amber-300 text-amber-700 hover:bg-amber-50' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}
      >
        {loading ? <span className="inline-block w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : active ? 'Pause' : 'Resume'}
      </button>
      {err && <p className="text-[9px] text-red-500 max-w-[90px] text-right leading-tight">{err}</p>}
    </div>
  )
}

// ─── Keyword row (stateful for inline toggle) ─────────────────────────────────
function KwRow({ kw: initial, clientId, showCampaign }: {
  kw: KeywordRow; clientId: string; showCampaign: boolean
}) {
  const [kw, setKw] = useState(initial)
  const active = isKwEnabled(kw.status)
  const qs     = kw.qualityScore

  return (
    <tr className={`transition-colors hover:bg-mist/50 ${!active ? 'opacity-60' : ''}`}>
      <td className="px-3 py-2.5 max-w-[200px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <MatchBadge matchType={kw.matchType} />
          <span className="text-xs text-navy truncate font-medium" title={kw.text}>{kw.text}</span>
        </div>
      </td>
      {showCampaign && (
        <td className="px-3 py-2.5 text-xs text-navy/60 max-w-[140px]">
          <span className="truncate block" title={kw.campaignName}>{kw.campaignName}</span>
        </td>
      )}
      <td className="px-3 py-2.5 text-xs text-navy/60 max-w-[130px]">
        <span className="truncate block" title={kw.adGroupName}>{kw.adGroupName}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {active ? 'Active' : 'Paused'}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center">
        {qs !== null ? (
          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${qsBg(qs)} ${qsColor(qs)}`}>
            {qs}
          </span>
        ) : (
          <span className="text-navy/25 text-xs">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-center"><BucketBadge value={kw.expectedCtr} /></td>
      <td className="px-3 py-2.5 text-center"><BucketBadge value={kw.adRelevance} /></td>
      <td className="px-3 py-2.5 text-center"><BucketBadge value={kw.landingPageExp} /></td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-navy/70">{kw.impressions.toLocaleString()}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-navy/70">{kw.clicks.toLocaleString()}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-navy/70">{kw.ctr.toFixed(2)}%</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-navy/70">{kw.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-navy/70">{kw.conversions > 0 ? kw.conversions.toFixed(1) : '—'}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-navy/70">{kw.cpa > 0 ? kw.cpa.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
      <td className="px-3 py-2.5 text-right">
        <KwToggleBtn kw={kw} clientId={clientId} onUpdated={s => setKw(prev => ({ ...prev, status: s }))} />
      </td>
    </tr>
  )
}

// ─── Scorecard ────────────────────────────────────────────────────────────────
function Scorecard({ label, value, sub, color = 'text-navy' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="bg-white border border-cloud rounded-2xl px-4 py-3 flex-1 min-w-0">
      <p className="text-[9px] font-heading font-bold uppercase tracking-wider text-teal mb-1">{label}</p>
      <p className={`font-heading font-bold text-xl tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-navy/40 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
type SortCol = 'text' | 'qs' | 'impressions' | 'clicks' | 'ctr' | 'cost' | 'conversions' | 'cpa'
type MatchFilter = '' | 'EXACT' | 'PHRASE' | 'BROAD'
type QsFilter = '' | 'poor' | 'fair' | 'good' | 'nodata'

const PAGE_SIZE = 50

interface Props {
  clientId:   string
  startDate:  string
  endDate:    string
  currency:   string
  campaignId?: string
}

export function KeywordsTab({ clientId, startDate, endDate, currency, campaignId }: Props) {
  const [keywords,    setKeywords]    = useState<KeywordRow[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [fetched,     setFetched]     = useState('')

  const [sortCol,     setSortCol]     = useState<SortCol>('cost')
  const [sortDir,     setSortDir]     = useState<'asc' | 'desc'>('desc')
  const [page,        setPage]        = useState(0)
  const [search,      setSearch]      = useState('')
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('')
  const [qsFilter,    setQsFilter]    = useState<QsFilter>('')
  const [showPaused,  setShowPaused]  = useState(true)
  const [issuesOpen,  setIssuesOpen]  = useState(true)

  const fetchKey = `${clientId}|${startDate}|${endDate}|${campaignId ?? ''}`

  const load = useCallback(async () => {
    if (loading || fetched === fetchKey) return
    setLoading(true); setError('')
    try {
      const qs = new URLSearchParams({
        client_account_id: clientId, start_date: startDate, end_date: endDate,
        ...(campaignId ? { campaign_id: campaignId } : {}),
      })
      const res = await fetch(`/api/keyword-performance?${qs}`)
      const d   = await res.json()
      if (!res.ok) throw new Error(d.error)
      setKeywords(d.keywords ?? [])
      setFetched(fetchKey)
      setPage(0)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [loading, fetched, fetchKey, clientId, startDate, endDate, campaignId])

  const showCampaign = !campaignId

  // ── Metrics ──────────────────────────────────────────────────────────────────
  const active   = keywords.filter(k => isKwEnabled(k.status))
  const withQs   = active.filter(k => k.qualityScore !== null)
  const poor     = active.filter(k => k.qualityScore !== null && k.qualityScore <= 3)
  const fair     = active.filter(k => k.qualityScore !== null && k.qualityScore >= 4 && k.qualityScore <= 6)
  const good     = active.filter(k => k.qualityScore !== null && k.qualityScore >= 7)
  const noData   = active.filter(k => k.qualityScore === null)
  const avgQs    = withQs.length > 0 ? (withQs.reduce((s, k) => s + (k.qualityScore ?? 0), 0) / withQs.length) : null
  const poorCost = poor.reduce((s, k) => s + k.cost, 0)

  // ── Cannibalization detection ──────────────────────────────────────────────
  // Flag same keyword text appearing in 2+ ad groups within the same campaign
  const canniMap = new Map<string, KeywordRow[]>()
  for (const k of keywords.filter(k => isKwEnabled(k.status))) {
    const key = `${k.campaignId}:${k.text.toLowerCase()}`
    const arr  = canniMap.get(key) ?? []
    arr.push(k)
    canniMap.set(key, arr)
  }
  const cannibalized = Array.from(canniMap.values()).filter(arr => arr.length > 1)

  // ── QS distribution bar widths ────────────────────────────────────────────
  const total   = active.length || 1
  const poorPct = Math.round((poor.length / total) * 100)
  const fairPct = Math.round((fair.length / total) * 100)
  const goodPct = Math.round((good.length / total) * 100)

  // ── Filtering & sorting ───────────────────────────────────────────────────
  const filtered = keywords.filter(k => {
    if (!showPaused && !isKwEnabled(k.status)) return false
    if (search      && !k.text.toLowerCase().includes(search.toLowerCase())) return false
    if (matchFilter && k.matchType !== matchFilter) return false
    if (qsFilter === 'poor')   return k.qualityScore !== null && k.qualityScore <= 3
    if (qsFilter === 'fair')   return k.qualityScore !== null && k.qualityScore >= 4 && k.qualityScore <= 6
    if (qsFilter === 'good')   return k.qualityScore !== null && k.qualityScore >= 7
    if (qsFilter === 'nodata') return k.qualityScore === null
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    let av: any, bv: any
    if (sortCol === 'text')        { av = a.text;        bv = b.text }
    else if (sortCol === 'qs')     { av = a.qualityScore ?? -1; bv = b.qualityScore ?? -1 }
    else                           { av = (a as any)[sortCol]; bv = (b as any)[sortCol] }
    if (typeof av === 'string')    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortDir === 'asc' ? av - bv : bv - av
  })

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage  = Math.min(page, pageCount - 1)
  const paged     = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'text' ? 'asc' : 'desc') }
  }

  function SortTh({ col, label, align = 'right' }: { col: SortCol; label: string; align?: 'left' | 'right' | 'center' }) {
    const active = sortCol === col
    return (
      <th className={`px-3 py-2.5 text-${align} whitespace-nowrap`}>
        <button
          onClick={() => toggleSort(col)}
          className={`inline-flex items-center gap-1 text-[10px] font-heading font-bold uppercase tracking-wider transition-colors ${active ? 'text-cyan' : 'text-teal hover:text-navy'}`}
        >
          {active && align !== 'left' && <span className="text-[9px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
          {label}
          {active && align === 'left' && <span className="text-[9px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
        </button>
      </th>
    )
  }

  // ── Not yet loaded ────────────────────────────────────────────────────────
  if (!fetched && !loading && !error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-4xl">🎯</div>
        <p className="text-sm text-navy/60 text-center max-w-xs">
          Analyse keywords by Quality Score, match type, and performance to find quick wins.
        </p>
        <button
          onClick={load}
          className="bg-cyan text-navy font-heading font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-cyan/80 transition-colors"
        >
          🎯 Analyse Keywords
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-teal text-sm">
        <div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
        Loading keyword data…
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 mt-4">
        {error}
        <button onClick={() => { setError(''); setFetched('') }} className="ml-3 underline">Retry</button>
      </div>
    )
  }

  if (fetched && keywords.length === 0) {
    return <div className="text-center py-16 text-teal text-sm">No keywords with activity in this period.</div>
  }

  return (
    <div className="space-y-5">

      {/* ── Scorecards ── */}
      <div className="flex gap-3 flex-wrap">
        <Scorecard label="Active Keywords" value={active.length.toLocaleString()} sub={`${keywords.length} total`} />
        <Scorecard
          label="Avg Quality Score"
          value={avgQs !== null ? avgQs.toFixed(1) : '—'}
          sub={`${withQs.length} keywords scored`}
          color={avgQs !== null ? qsColor(Math.round(avgQs)) : 'text-navy/30'}
        />
        <Scorecard
          label="Low QS Keywords"
          value={poor.length.toLocaleString()}
          sub="Quality Score 1–3"
          color={poor.length > 0 ? 'text-red-600' : 'text-emerald-600'}
        />
        <Scorecard
          label="Spend on Low QS"
          value={`${currency} ${poorCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub="Consider pausing or fixing"
          color={poorCost > 0 ? 'text-red-600' : 'text-emerald-600'}
        />
      </div>

      {/* ── QS Distribution ── */}
      {withQs.length > 0 && (
        <div className="bg-white border border-cloud rounded-2xl px-4 py-3">
          <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-2.5">Quality Score Distribution</p>
          <div className="flex h-5 rounded-full overflow-hidden gap-0.5">
            {poorPct > 0 && <div className="bg-red-400 transition-all duration-500 flex items-center justify-center" style={{ width: `${poorPct}%` }}>
              {poorPct > 8 && <span className="text-[9px] font-bold text-white">{poorPct}%</span>}
            </div>}
            {fairPct > 0 && <div className="bg-amber-400 transition-all duration-500 flex items-center justify-center" style={{ width: `${fairPct}%` }}>
              {fairPct > 8 && <span className="text-[9px] font-bold text-white">{fairPct}%</span>}
            </div>}
            {goodPct > 0 && <div className="bg-emerald-400 transition-all duration-500 flex items-center justify-center" style={{ width: `${goodPct}%` }}>
              {goodPct > 8 && <span className="text-[9px] font-bold text-white">{goodPct}%</span>}
            </div>}
            {noData.length > 0 && <div className="bg-cloud flex-1 flex items-center justify-center">
              <span className="text-[9px] text-navy/30">{Math.round((noData.length / total) * 100)}% n/a</span>
            </div>}
          </div>
          <div className="flex items-center gap-4 mt-2">
            {[
              { label: `Poor (1–3)`,  count: poor.length,   dot: 'bg-red-400'     },
              { label: `Fair (4–6)`,  count: fair.length,   dot: 'bg-amber-400'   },
              { label: `Good (7–10)`, count: good.length,   dot: 'bg-emerald-400' },
              { label: `No data`,     count: noData.length, dot: 'bg-cloud'       },
            ].map(({ label, count, dot }) => count > 0 && (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                <span className="text-[10px] text-navy/60">{label}: <strong className="text-navy">{count}</strong></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Issues Panel ── */}
      {(poor.length > 0 || cannibalized.length > 0) && (
        <div className="border border-amber-200 bg-amber-50 rounded-2xl overflow-hidden">
          <button
            onClick={() => setIssuesOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-100/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">⚠️</span>
              <span className="text-xs font-heading font-bold text-amber-800">
                {poor.length + cannibalized.length} Keyword Issue{(poor.length + cannibalized.length) !== 1 ? 's' : ''} Found
              </span>
              {poor.length > 0 && (
                <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                  {poor.length} Low QS
                </span>
              )}
              {cannibalized.length > 0 && (
                <span className="text-[10px] font-bold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">
                  {cannibalized.length} Cannibalizations
                </span>
              )}
            </div>
            <span className="text-amber-600 text-xs">{issuesOpen ? '▲' : '▼'}</span>
          </button>

          {issuesOpen && (
            <div className="px-4 pb-4 space-y-4 border-t border-amber-200">

              {/* Low QS */}
              {poor.length > 0 && (
                <div>
                  <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-red-700 mt-3 mb-2">
                    Low Quality Score Keywords (QS 1–3)
                  </p>
                  <div className="space-y-1.5">
                    {[...poor].sort((a, b) => b.cost - a.cost).slice(0, 10).map((k, i) => (
                      <div key={i} className="flex items-start gap-3 bg-white border border-red-100 rounded-xl px-3 py-2">
                        <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${qsBg(k.qualityScore)} ${qsColor(k.qualityScore)}`}>
                          {k.qualityScore}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <MatchBadge matchType={k.matchType} />
                            <span className="text-xs font-medium text-navy">{k.text}</span>
                            <span className="text-[10px] text-navy/40">{k.adGroupName}</span>
                          </div>
                          <p className="text-[10px] text-red-700 mt-0.5 leading-snug">
                            💡 {getQsAdvice(k)}
                          </p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className="text-[10px] font-bold text-navy">{currency} {k.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          <p className="text-[9px] text-navy/40">spend</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cannibalization */}
              {cannibalized.length > 0 && (
                <div>
                  <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-amber-700 mt-1 mb-2">
                    Keyword Cannibalization — same term in multiple ad groups
                  </p>
                  <div className="space-y-2">
                    {cannibalized.slice(0, 5).map((group, i) => (
                      <div key={i} className="bg-white border border-amber-200 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <MatchBadge matchType={group[0].matchType} />
                          <span className="text-xs font-bold text-navy">{group[0].text}</span>
                          <span className="text-[10px] text-amber-700">· {group.length} ad groups competing</span>
                        </div>
                        <div className="space-y-0.5">
                          {group.map((k, j) => (
                            <p key={j} className="text-[10px] text-navy/60">
                              {k.adGroupName}
                              <span className="text-navy/30 ml-2">{k.impressions.toLocaleString()} impr · {currency} {k.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </p>
                          ))}
                        </div>
                        <p className="text-[10px] text-amber-700 mt-1.5">💡 Consider consolidating to one ad group or using different match types to control traffic.</p>
                      </div>
                    ))}
                    {cannibalized.length > 5 && (
                      <p className="text-[10px] text-amber-700 px-1">…and {cannibalized.length - 5} more — use the filter below to explore.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="search"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder="Search keywords…"
          className="text-xs border border-cloud rounded-lg px-3 py-1.5 text-navy focus:outline-none focus:border-cyan w-48 bg-white"
        />
        <div className="flex items-center gap-1">
          {(['', 'EXACT', 'PHRASE', 'BROAD'] as MatchFilter[]).map(m => (
            <button
              key={m}
              onClick={() => { setMatchFilter(m); setPage(0) }}
              className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all whitespace-nowrap ${matchFilter === m ? 'bg-cyan text-navy border-cyan' : 'border-cloud text-navy/60 hover:border-cyan/40 hover:text-navy'}`}
            >
              {m || 'All Match'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {([
            { v: '',       l: 'All QS'    },
            { v: 'poor',   l: '🔴 Poor'  },
            { v: 'fair',   l: '🟡 Fair'  },
            { v: 'good',   l: '🟢 Good'  },
            { v: 'nodata', l: '⬜ No Data' },
          ] as { v: QsFilter; l: string }[]).map(({ v, l }) => (
            <button
              key={v}
              onClick={() => { setQsFilter(v); setPage(0) }}
              className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all whitespace-nowrap ${qsFilter === v ? 'bg-cyan text-navy border-cyan' : 'border-cloud text-navy/60 hover:border-cyan/40 hover:text-navy'}`}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowPaused(s => !s); setPage(0) }}
          className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all whitespace-nowrap ${!showPaused ? 'bg-amber-50 text-amber-700 border-amber-300' : 'border-cloud text-navy/60 hover:border-cyan/40 hover:text-navy'}`}
        >
          {showPaused ? '◉ Hide Paused' : '◎ Show Paused'}
        </button>
        <p className="text-[10px] text-navy/40 ml-auto tabular-nums">
          {filtered.length.toLocaleString()} keyword{filtered.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-2xl border border-cloud">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-cloud bg-mist">
              <SortTh col="text" label="Keyword" align="left" />
              {showCampaign && <th className="px-3 py-2.5 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal whitespace-nowrap">Campaign</th>}
              <th className="px-3 py-2.5 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal whitespace-nowrap">Ad Group</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal whitespace-nowrap">Status</th>
              <SortTh col="qs" label="QS" align="center" />
              <th className="px-3 py-2.5 text-center text-[10px] font-heading font-bold uppercase tracking-wider text-teal" title="Expected CTR">Exp CTR</th>
              <th className="px-3 py-2.5 text-center text-[10px] font-heading font-bold uppercase tracking-wider text-teal" title="Ad Relevance">Ad Rel.</th>
              <th className="px-3 py-2.5 text-center text-[10px] font-heading font-bold uppercase tracking-wider text-teal" title="Landing Page Experience">LPE</th>
              <SortTh col="impressions" label="Impr." />
              <SortTh col="clicks" label="Clicks" />
              <SortTh col="ctr" label="CTR" />
              <SortTh col="cost" label={`Cost (${currency})`} />
              <SortTh col="conversions" label="Conv." />
              <SortTh col="cpa" label="CPA" />
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-cloud">
            {paged.length === 0 ? (
              <tr>
                <td colSpan={showCampaign ? 15 : 14} className="py-12 text-center text-teal text-sm">
                  No keywords match the current filters.
                </td>
              </tr>
            ) : paged.map((kw, i) => (
              <KwRow key={`${kw.adGroupId}~${kw.criterionId}-${i}`} kw={kw} clientId={clientId} showCampaign={showCampaign} />
            ))}
          </tbody>
          {/* Totals footer */}
          {sorted.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-cloud/70 bg-mist">
                <td className="px-3 py-2.5 text-[11px] font-heading font-bold text-navy" colSpan={showCampaign ? 8 : 7}>
                  Total · {sorted.length.toLocaleString()} keyword{sorted.length !== 1 ? 's' : ''}
                </td>
                <td className="px-3 py-2.5 text-right text-xs font-bold text-navy tabular-nums">
                  {sorted.reduce((s, k) => s + k.impressions, 0).toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-right text-xs font-bold text-navy tabular-nums">
                  {sorted.reduce((s, k) => s + k.clicks, 0).toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-right text-xs font-bold text-navy tabular-nums">
                  {(() => { const imp = sorted.reduce((s, k) => s + k.impressions, 0); const clk = sorted.reduce((s, k) => s + k.clicks, 0); return imp > 0 ? `${((clk / imp) * 100).toFixed(2)}%` : '—' })()}
                </td>
                <td className="px-3 py-2.5 text-right text-xs font-bold text-navy tabular-nums">
                  {sorted.reduce((s, k) => s + k.cost, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2.5 text-right text-xs font-bold text-navy tabular-nums">
                  {sorted.reduce((s, k) => s + k.conversions, 0).toFixed(1)}
                </td>
                <td className="px-3 py-2.5 text-right text-xs font-bold text-navy tabular-nums">
                  {(() => { const cost = sorted.reduce((s, k) => s + k.cost, 0); const conv = sorted.reduce((s, k) => s + k.conversions, 0); return conv > 0 ? (cost / conv).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—' })()}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Pagination ── */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-navy/40 tabular-nums">
            Page {safePage + 1} of {pageCount} · {sorted.length} keywords
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={safePage === 0}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-cloud text-navy/60 hover:border-cyan/40 hover:text-navy transition-all disabled:opacity-30"
            >
              «
            </button>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-cloud text-navy/60 hover:border-cyan/40 hover:text-navy transition-all disabled:opacity-30"
            >
              ‹ Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-cloud text-navy/60 hover:border-cyan/40 hover:text-navy transition-all disabled:opacity-30"
            >
              Next ›
            </button>
            <button
              onClick={() => setPage(pageCount - 1)}
              disabled={safePage >= pageCount - 1}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-cloud text-navy/60 hover:border-cyan/40 hover:text-navy transition-all disabled:opacity-30"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
