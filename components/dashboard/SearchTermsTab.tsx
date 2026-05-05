'use client'
import { useState, useEffect, useMemo } from 'react'
import type { SearchTermRow } from '@/lib/google-ads'

// ─── Recommendation types ──────────────────────────────────────────────────────
type RecPriority = 'critical' | 'high' | 'medium' | 'opportunity'
type RecAction   = 'exclude' | 'review' | 'promote'

interface Rec {
  key:          string
  term:         string
  campaignName: string
  adGroupName:  string
  priority:     RecPriority
  action:       RecAction
  headline:     string
  detail:       string
  impact:       number   // $ wasted (exclude/review) or $ efficiency gain (promote)
}

interface Avgs {
  cpa:              number
  ctr:              number   // 0–100 %
  totalSpend:       number
  totalConversions: number
}

// ─── Recommendation engine ─────────────────────────────────────────────────────
function computeAvgs(terms: SearchTermRow[]): Avgs {
  const active = terms.filter(t => t.status !== 'EXCLUDED')
  const cost   = active.reduce((s, t) => s + t.cost, 0)
  const conv   = active.reduce((s, t) => s + t.conversions, 0)
  const clicks = active.reduce((s, t) => s + t.clicks, 0)
  const impr   = active.reduce((s, t) => s + t.impressions, 0)
  return {
    cpa:              conv   > 0 ? cost / conv           : 0,
    ctr:              impr   > 0 ? (clicks / impr) * 100 : 0,
    totalSpend:       cost,
    totalConversions: conv,
  }
}

function buildRecs(terms: SearchTermRow[], avgs: Avgs): Rec[] {
  const recs: Rec[] = []
  const seen = new Set<string>()

  for (const t of terms) {
    if (t.status === 'EXCLUDED') continue
    const base = `${t.campaignId}__${t.adGroupId}__${t.term}`

    // ── Rule 1: Zero conversions with significant spend ───────────────────────
    if (t.conversions === 0 && t.cost > 0) {
      const threshold = avgs.cpa > 0 ? avgs.cpa : 50
      const factor    = t.cost / threshold

      if (factor >= 1.5 || t.cost >= 20) {
        let priority: RecPriority
        let headline: string
        if      (factor >= 4) { priority = 'critical'; headline = `${factor.toFixed(1)}× target CPA spent — zero conversions` }
        else if (factor >= 2) { priority = 'high';     headline = `${factor.toFixed(1)}× target CPA with no return` }
        else                  { priority = 'medium';   headline = `Zero conversions — potential wasted spend` }

        const k = base + '_waste'
        if (!seen.has(k)) {
          seen.add(k)
          recs.push({
            key: k, term: t.term, campaignName: t.campaignName, adGroupName: t.adGroupName,
            priority, action: 'exclude', headline,
            detail: `Spent: ${t.cost.toFixed(2)} · ${t.impressions.toLocaleString()} impr · ${t.clicks} clicks · CTR ${t.ctr.toFixed(2)}%`,
            impact: t.cost,
          })
        }
      }
    }

    // ── Rule 2: High CPA (2× account average) ─────────────────────────────────
    if (avgs.cpa > 0 && t.conversions > 0 && t.cpa > avgs.cpa * 2) {
      const factor = t.cpa / avgs.cpa
      const excess = t.cost - (t.conversions * avgs.cpa)
      const k = base + '_hcpa'
      if (!seen.has(k)) {
        seen.add(k)
        recs.push({
          key: k, term: t.term, campaignName: t.campaignName, adGroupName: t.adGroupName,
          priority: factor >= 4 ? 'high' : 'medium', action: 'review',
          headline: `CPA is ${factor.toFixed(1)}× account average`,
          detail: `Term CPA: ${t.cpa.toFixed(2)} · Avg CPA: ${avgs.cpa.toFixed(2)} · Excess spend: ${excess.toFixed(2)} · ${t.conversions.toFixed(1)} conv`,
          impact: excess,
        })
      }
    }

    // ── Rule 3: Very low CTR — likely irrelevant ───────────────────────────────
    if (avgs.ctr > 0 && t.impressions >= 300 && t.ctr < avgs.ctr * 0.3 && t.conversions === 0 && t.cost > 2) {
      const k = base + '_lctr'
      if (!seen.has(k)) {
        seen.add(k)
        recs.push({
          key: k, term: t.term, campaignName: t.campaignName, adGroupName: t.adGroupName,
          priority: 'medium', action: 'exclude',
          headline: `Very low CTR — likely an irrelevant query`,
          detail: `CTR: ${t.ctr.toFixed(2)}% vs account avg ${avgs.ctr.toFixed(2)}% · ${t.impressions.toLocaleString()} impressions · 0 conversions`,
          impact: t.cost,
        })
      }
    }

    // ── Rule 4: High performer not yet added as exact keyword ──────────────────
    if (avgs.cpa > 0 && t.conversions >= 2 && t.cpa > 0 && t.cpa < avgs.cpa * 0.6 && t.status === 'NONE') {
      const gain = t.conversions * (avgs.cpa - t.cpa)
      const k = base + '_opp'
      if (!seen.has(k)) {
        seen.add(k)
        recs.push({
          key: k, term: t.term, campaignName: t.campaignName, adGroupName: t.adGroupName,
          priority: 'opportunity', action: 'promote',
          headline: `Strong performer — add as exact match keyword`,
          detail: `CPA: ${t.cpa.toFixed(2)} (${Math.round((1 - t.cpa / avgs.cpa) * 100)}% below avg ${avgs.cpa.toFixed(2)}) · ${t.conversions.toFixed(1)} conv · not yet a saved keyword`,
          impact: gain,
        })
      }
    }
  }

  const ORDER: Record<RecPriority, number> = { critical: 0, high: 1, medium: 2, opportunity: 3 }
  return recs.sort((a, b) => {
    const pd = ORDER[a.priority] - ORDER[b.priority]
    return pd !== 0 ? pd : b.impact - a.impact
  })
}

// ─── Visual config ─────────────────────────────────────────────────────────────
const REC_CFG: Record<RecPriority, {
  icon: string; dot: string; text: string; bg: string; border: string; badge: string; rowBg: string
}> = {
  critical:    { icon: '🔴', dot: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     badge: 'bg-red-100 text-red-700',         rowBg: 'bg-red-50/50'     },
  high:        { icon: '🟠', dot: 'bg-orange-500',  text: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-200',  badge: 'bg-orange-100 text-orange-700',   rowBg: 'bg-orange-50/50'  },
  medium:      { icon: '🟡', dot: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   badge: 'bg-amber-100 text-amber-700',     rowBg: 'bg-amber-50/30'   },
  opportunity: { icon: '🟢', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', rowBg: 'bg-emerald-50/40' },
}

const ACTION_LABEL: Record<RecAction, string> = {
  exclude: '⊖ Exclude',
  review:  '◎ Review',
  promote: '⊕ Promote',
}

const STATUS_CFG: Record<string, { label: string; bg: string; text: string }> = {
  NONE:          { label: 'Unmatched', bg: 'bg-navy/5',      text: 'text-navy/50'     },
  ADDED:         { label: 'Keyword',   bg: 'bg-emerald-100', text: 'text-emerald-700' },
  EXCLUDED:      { label: 'Negative',  bg: 'bg-red-100',     text: 'text-red-700'     },
  ADDED_EXCLUDED:{ label: 'Conflict',  bg: 'bg-amber-100',   text: 'text-amber-700'   },
}

type SortKey = 'impressions' | 'clicks' | 'ctr' | 'cost' | 'conversions' | 'cpa'
const PAGE_SIZE = 50

type MatchType = 'EXACT' | 'PHRASE' | 'BROAD'
type ActionResult = { type: 'exclude' | 'add'; ok: boolean; msg: string }

// ─── Sub-components ────────────────────────────────────────────────────────────
function SumCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <div className="bg-white border border-cloud rounded-2xl px-4 py-3.5">
      <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-1">{label}</p>
      <p className={`font-heading font-black text-xl tabular-nums ${accent ?? 'text-navy'}`}>{value}</p>
      {sub && <p className="text-[10px] text-navy/40 mt-0.5">{sub}</p>}
    </div>
  )
}

function RecCard({ rec, currency, clientId, onExclude, onAdd }: {
  rec:      Rec
  currency: string
  clientId: string
  onExclude: (term: string, campaignId: string, adGroupId: string, matchType: MatchType) => Promise<void>
  onAdd:     (term: string, campaignId: string, adGroupId: string, matchType: MatchType) => Promise<void>
}) {
  const cfg = REC_CFG[rec.priority]
  const [doing, setDoing]   = useState<'exclude' | 'add' | null>(null)
  const [done,  setDone]    = useState<string | null>(null)
  const [err,   setErr]     = useState<string | null>(null)
  const [mt,    setMt]      = useState<MatchType>('EXACT')

  // Extract campaignId + adGroupId from rec.key: "campaignId__adGroupId__term_suffix"
  const parts      = rec.key.split('__')
  const campaignId = parts[0] ?? ''
  const adGroupId  = parts[1] ?? ''

  async function act(type: 'exclude' | 'add') {
    setDoing(type); setErr(null)
    try {
      if (type === 'exclude') await onExclude(rec.term, campaignId, adGroupId, mt)
      else                    await onAdd(rec.term, campaignId, adGroupId, mt)
      setDone(type === 'exclude' ? `Excluded as ${mt.toLowerCase()}` : `Added as ${mt.toLowerCase()} keyword`)
    } catch (e: any) { setErr(e.message) }
    finally { setDoing(null) }
  }

  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border ${cfg.bg} ${cfg.border}`}>
      <span className="text-base flex-shrink-0 mt-0.5">{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
          <p className={`text-xs font-bold ${cfg.text}`}>{rec.headline}</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.badge}`}>
            {ACTION_LABEL[rec.action]}
          </span>
        </div>
        <p className="text-xs font-mono font-semibold text-navy/80 mb-0.5 truncate" title={rec.term}>"{rec.term}"</p>
        <p className="text-[10px] text-navy/50">{rec.campaignName} › {rec.adGroupName}</p>
        <p className="text-[10px] text-navy/40 mt-1 leading-relaxed">{rec.detail}</p>
        {rec.impact > 0 && (
          <p className={`text-[11px] font-bold mt-1.5 ${rec.action === 'promote' ? 'text-emerald-600' : cfg.text}`}>
            {rec.action === 'promote'
              ? `💰 ${currency} ${rec.impact.toFixed(2)} efficiency gain already achieved`
              : `⚠️ ${currency} ${rec.impact.toFixed(2)} ${rec.action === 'review' ? 'excess spend' : 'wasted spend'}`}
          </p>
        )}

        {/* Inline action strip */}
        {done ? (
          <p className="text-[11px] font-bold text-emerald-600 mt-2">✓ {done}</p>
        ) : err ? (
          <p className="text-[11px] text-red-600 mt-2">✗ {err}</p>
        ) : (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <select
              value={mt}
              onChange={e => setMt(e.target.value as MatchType)}
              disabled={!!doing}
              className="text-[10px] border border-cloud rounded-lg px-1.5 py-1 bg-white text-navy focus:outline-none focus:border-cyan disabled:opacity-40"
            >
              <option value="EXACT">Exact</option>
              <option value="PHRASE">Phrase</option>
              <option value="BROAD">Broad</option>
            </select>
            {rec.action !== 'promote' && (
              <button
                onClick={() => act('exclude')}
                disabled={!!doing}
                className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-40 flex items-center gap-1"
              >
                {doing === 'exclude' ? <span className="inline-block w-3 h-3 border border-red-500 border-t-transparent rounded-full animate-spin" /> : '⊖'} Exclude
              </button>
            )}
            {(rec.action === 'promote' || rec.action === 'review') && (
              <button
                onClick={() => act('add')}
                disabled={!!doing}
                className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-40 flex items-center gap-1"
              >
                {doing === 'add' ? <span className="inline-block w-3 h-3 border border-emerald-500 border-t-transparent rounded-full animate-spin" /> : '⊕'} Add Keyword
              </button>
            )}
            {rec.action === 'exclude' && (
              <button
                onClick={() => act('add')}
                disabled={!!doing}
                className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-cloud text-navy/50 hover:bg-cloud transition-colors disabled:opacity-40 flex items-center gap-1"
              >
                {doing === 'add' ? <span className="inline-block w-3 h-3 border border-navy/40 border-t-transparent rounded-full animate-spin" /> : '⊕'} Add Keyword Instead
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export function SearchTermsTab({
  clientId, startDate, endDate, currency, campaignId,
}: {
  clientId:   string
  startDate:  string
  endDate:    string
  currency:   string
  campaignId?: string
}) {
  const [terms,   setTerms]   = useState<SearchTermRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [fetched, setFetched] = useState('')   // last-fetched key to prevent double-fetch

  // Filters + UI state
  const [recsExpanded,    setRecsExpanded]    = useState(false)
  const [filterCampaign,  setFilterCampaign]  = useState('')
  const [filterStatus,    setFilterStatus]    = useState('')     // '' | 'NONE' | 'ADDED' | 'EXCLUDED'
  const [filterRec,       setFilterRec]       = useState<'' | 'exclude' | 'review' | 'promote'>('')
  const [search,          setSearch]          = useState('')
  const [sortCol,         setSortCol]         = useState<SortKey>('cost')
  const [sortDir,         setSortDir]         = useState<'asc' | 'desc'>('desc')
  const [page,            setPage]            = useState(1)
  const [copied,          setCopied]          = useState(false)

  // Per-row inline action state
  // openAction: which row + which action type has the match-type picker open
  const [openAction, setOpenAction] = useState<{ termKey: string; type: 'exclude' | 'add' } | null>(null)
  const [actionMt,   setActionMt]   = useState<MatchType>('EXACT')
  const [rowPending, setRowPending] = useState<Set<string>>(new Set())
  const [rowResults, setRowResults] = useState<Map<string, ActionResult>>(new Map())

  // Fetch data
  useEffect(() => {
    if (!clientId || !startDate || !endDate) return
    const key = `${clientId}|${startDate}|${endDate}|${campaignId ?? ''}`
    if (fetched === key) return
    setFetched(key)
    setLoading(true); setError(''); setTerms([]); setPage(1)
    const url = `/api/search-terms?client_account_id=${clientId}&start_date=${startDate}&end_date=${endDate}${campaignId ? `&campaign_id=${campaignId}` : ''}`
    fetch(url)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setTerms(d.terms ?? []) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [clientId, startDate, endDate, campaignId, fetched])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [filterCampaign, filterStatus, filterRec, search, sortCol, sortDir])

  // Derived data
  const avgs = useMemo(() => computeAvgs(terms), [terms])
  const recs  = useMemo(() => buildRecs(terms, avgs), [terms, avgs])

  // Rec lookup map for table row badges: termKey → Rec (highest priority per term)
  const recMap = useMemo(() => {
    const m = new Map<string, Rec>()
    const ORDER: Record<RecPriority, number> = { critical: 0, high: 1, medium: 2, opportunity: 3 }
    for (const r of recs) {
      // key stripped to base (term+campaign+adgroup) for table lookup
      const baseKey = r.key.replace(/_(waste|hcpa|lctr|opp)$/, '')
      const existing = m.get(baseKey)
      if (!existing || ORDER[r.priority] < ORDER[existing.priority]) m.set(baseKey, r)
    }
    return m
  }, [recs])

  // Unique campaigns for dropdown
  const campaigns = useMemo(() => {
    const seen = new Map<string, string>()
    for (const t of terms) if (!seen.has(t.campaignId)) seen.set(t.campaignId, t.campaignName)
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [terms])

  // Summary stats
  const summary = useMemo(() => {
    const active         = terms.filter(t => t.status !== 'EXCLUDED')
    const converting     = active.filter(t => t.conversions > 0)
    const wastedTerms    = recs.filter(r => r.action === 'exclude' && (r.priority === 'critical' || r.priority === 'high'))
    const wastedSpend    = wastedTerms.reduce((s, r) => s + r.impact, 0)
    const totalSavings   = recs.filter(r => r.action !== 'promote').reduce((s, r) => s + r.impact, 0)
    return {
      totalTerms:    active.length,
      totalSpend:    active.reduce((s, t) => s + t.cost, 0),
      wastedSpend,
      convPct:       active.length > 0 ? (converting.length / active.length) * 100 : 0,
      recCount:      recs.length,
      totalSavings,
    }
  }, [terms, recs])

  // Filtered + sorted rows
  const filtered = useMemo(() => {
    const recFilterKeys = new Set(
      filterRec ? recs.filter(r => r.action === filterRec).map(r => r.key.replace(/_(waste|hcpa|lctr|opp)$/, '')) : []
    )
    return terms.filter(t => {
      if (filterCampaign && t.campaignId !== filterCampaign) return false
      if (filterStatus   && t.status !== filterStatus)       return false
      if (search && !t.term.toLowerCase().includes(search.toLowerCase())) return false
      if (filterRec) {
        const k = `${t.campaignId}__${t.adGroupId}__${t.term}`
        return recFilterKeys.has(k)
      }
      return true
    })
  }, [terms, filterCampaign, filterStatus, filterRec, search, recs])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol]
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [filtered, sortCol, sortDir])

  const visibleRows = sorted.slice(0, page * PAGE_SIZE)
  const hasMore     = sorted.length > visibleRows.length

  // Footer totals for filtered set
  const totals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
    for (const r of filtered) {
      t.impressions  += r.impressions
      t.clicks       += r.clicks
      t.cost         += r.cost
      t.conversions  += r.conversions
    }
    return t
  }, [filtered])

  function toggleSort(col: SortKey) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  function copyNegatives() {
    const terms = recs.filter(r => r.action === 'exclude').map(r => r.term)
    const unique = terms.filter((t, i) => terms.indexOf(t) === i)
    const list = unique.join('\n')
    navigator.clipboard.writeText(list).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  // ── Shared action API handlers ─────────────────────────────────────────────
  async function handleExclude(
    term: string, termCampaignId: string, _adGroupId: string, matchType: MatchType
  ) {
    const res = await fetch('/api/negative-keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_account_id: clientId,
        campaign_id:       termCampaignId,
        text:              term,
        match_type:        matchType,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Failed to exclude')
    // Optimistically update status in terms list
    setTerms(prev => prev.map(t =>
      t.term === term && t.campaignId === termCampaignId
        ? { ...t, status: 'EXCLUDED' }
        : t
    ))
  }

  async function handleAddKeyword(
    term: string, _campaignId: string, adGroupId: string, matchType: MatchType
  ) {
    const res = await fetch('/api/add-keyword', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_account_id: clientId,
        ad_group_id:       adGroupId,
        text:              term,
        match_type:        matchType,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Failed to add keyword')
    // Optimistically update status
    setTerms(prev => prev.map(t =>
      t.term === term && t.adGroupId === adGroupId
        ? { ...t, status: t.status === 'EXCLUDED' ? 'ADDED_EXCLUDED' : 'ADDED' }
        : t
    ))
  }

  // ── Per-row inline action (table) ──────────────────────────────────────────
  function openRowAction(termKey: string, type: 'exclude' | 'add') {
    if (openAction?.termKey === termKey && openAction.type === type) {
      setOpenAction(null)   // toggle off
    } else {
      setOpenAction({ termKey, type })
      setActionMt('EXACT')
    }
  }

  async function confirmRowAction(
    term: string, termCampaignId: string, adGroupId: string
  ) {
    if (!openAction) return
    const { termKey, type } = openAction
    setOpenAction(null)
    setRowPending(prev => { const s = Array.from(prev); s.push(termKey); return new Set(s) })
    try {
      if (type === 'exclude') await handleExclude(term, termCampaignId, adGroupId, actionMt)
      else                    await handleAddKeyword(term, termCampaignId, adGroupId, actionMt)
      setRowResults(prev => {
        const m = new Map(prev)
        m.set(termKey, {
          type,
          ok:  true,
          msg: type === 'exclude'
            ? `Excluded (${actionMt.toLowerCase()})`
            : `Added as ${actionMt.toLowerCase()} keyword`,
        })
        return m
      })
    } catch (e: any) {
      setRowResults(prev => {
        const m = new Map(prev)
        m.set(termKey, { type, ok: false, msg: e.message })
        return m
      })
    } finally {
      setRowPending(prev => { const s = Array.from(prev).filter(k => k !== termKey); return new Set(s) })
    }
  }

  // ─── Loading / error / empty states ────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-20 text-teal text-sm">
        <div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
        Analysing search terms…
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 mt-4">
        {error}
      </div>
    )
  }

  if (terms.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-3xl mb-3">🔍</p>
        <p className="font-heading font-bold text-navy mb-1">No search term data found</p>
        <p className="text-xs text-teal max-w-xs mx-auto leading-relaxed">
          Search terms appear once your Search campaigns receive impressions within the selected date range.
          Performance Max campaigns may show limited search term data.
        </p>
      </div>
    )
  }

  // ─── Main UI ────────────────────────────────────────────────────────────────
  const topRecs     = recsExpanded ? recs : recs.slice(0, 5)
  const excludeRecs = recs.filter(r => r.action === 'exclude')

  return (
    <div className="space-y-5">

      {/* ── Summary scorecards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SumCard
          label="Search Terms"
          value={summary.totalTerms.toLocaleString()}
          sub={`${terms.filter(t => t.status === 'EXCLUDED').length} already excluded`}
        />
        <SumCard
          label="Total Spend"
          value={`${currency} ${summary.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub={avgs.cpa > 0 ? `Avg CPA ${currency} ${avgs.cpa.toFixed(2)}` : undefined}
        />
        <SumCard
          label="Wasted Spend"
          value={`${currency} ${summary.wastedSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub="High-priority zero-conv terms"
          accent={summary.wastedSpend > 0 ? 'text-red-600' : undefined}
        />
        <SumCard
          label="Converting Terms"
          value={`${summary.convPct.toFixed(1)}%`}
          sub={`${terms.filter(t => t.conversions > 0).length} of ${summary.totalTerms} terms`}
          accent={summary.convPct < 10 ? 'text-amber-600' : 'text-emerald-600'}
        />
        <SumCard
          label="Actions Found"
          value={String(summary.recCount)}
          sub={summary.totalSavings > 0 ? `${currency} ${summary.totalSavings.toFixed(0)} potential savings` : undefined}
          accent={summary.recCount > 0 ? 'text-amber-600' : undefined}
        />
      </div>

      {/* ── Recommendations panel ── */}
      {recs.length > 0 && (
        <div className="border border-cloud rounded-2xl overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-mist border-b border-cloud">
            <div className="flex items-center gap-3">
              <p className="font-heading font-bold text-navy text-sm">📋 Recommendations</p>
              <span className="text-[11px] font-bold bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full">
                {recs.length} action{recs.length !== 1 ? 's' : ''}
              </span>
              {summary.totalSavings > 0 && (
                <span className="text-[11px] text-teal">
                  · {currency} {summary.totalSavings.toFixed(2)} potential savings
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {excludeRecs.length > 0 && (
                <button
                  onClick={copyNegatives}
                  className={`text-[11px] font-bold border px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${copied ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'text-navy/60 hover:text-navy border-cloud hover:border-cyan/40'}`}
                  title="Copy all recommended negative keywords to clipboard"
                >
                  {copied ? '✓ Copied!' : `📋 Copy ${excludeRecs.length} negatives`}
                </button>
              )}
              <button
                onClick={() => setRecsExpanded(e => !e)}
                className="text-[11px] font-bold text-cyan hover:text-cyan/70 transition-colors"
              >
                {recsExpanded ? '▲ Show less' : `▼ Show all ${recs.length}`}
              </button>
            </div>
          </div>

          {/* Rec cards */}
          <div className="p-4 space-y-2.5">
            {topRecs.map(r => (
              <RecCard
                key={r.key}
                rec={r}
                currency={currency}
                clientId={clientId}
                onExclude={handleExclude}
                onAdd={handleAddKeyword}
              />
            ))}
            {!recsExpanded && recs.length > 5 && (
              <button
                onClick={() => setRecsExpanded(true)}
                className="w-full text-center text-[11px] font-bold text-cyan hover:text-cyan/70 py-2 border border-dashed border-cyan/30 rounded-xl transition-all hover:border-cyan/60"
              >
                + {recs.length - 5} more recommendations
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Campaign filter */}
        {campaigns.length > 1 && (
          <select
            value={filterCampaign}
            onChange={e => setFilterCampaign(e.target.value)}
            className="text-xs border border-cloud rounded-xl px-3 py-2 text-navy focus:outline-none focus:border-cyan bg-white"
          >
            <option value="">All campaigns</option>
            {campaigns.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="text-xs border border-cloud rounded-xl px-3 py-2 text-navy focus:outline-none focus:border-cyan bg-white"
        >
          <option value="">All statuses</option>
          <option value="NONE">Unmatched</option>
          <option value="ADDED">Keywords</option>
          <option value="EXCLUDED">Negatives</option>
          <option value="ADDED_EXCLUDED">Conflicts</option>
        </select>

        {/* Recommendation filter chips */}
        <div className="flex items-center gap-1">
          {([
            { value: '',        label: 'All' },
            { value: 'exclude', label: '🔴 Exclude' },
            { value: 'review',  label: '🟠 Review'  },
            { value: 'promote', label: '🟢 Promote' },
          ] as { value: '' | 'exclude' | 'review' | 'promote'; label: string }[]).map(f => (
            <button
              key={f.value}
              onClick={() => setFilterRec(f.value)}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap ${filterRec === f.value ? 'bg-cyan text-navy border-cyan' : 'border-cloud text-navy/60 hover:border-cyan/40 hover:text-navy'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Text search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-navy/30 text-xs pointer-events-none">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search terms…"
            className="w-full pl-8 pr-3 py-2 text-xs border border-cloud rounded-xl bg-white text-navy placeholder-navy/30 focus:outline-none focus:border-cyan"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-navy/30 hover:text-navy text-sm transition-colors">×</button>
          )}
        </div>

        {/* Result count */}
        <p className="text-[11px] text-teal ml-auto whitespace-nowrap">
          {filtered.length !== terms.length
            ? <>{filtered.length} of {terms.length} terms</>
            : <>{terms.length} term{terms.length !== 1 ? 's' : ''}</>}
        </p>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-2xl border border-cloud">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="border-b border-cloud bg-mist">
              <th className="w-6 px-3 py-3" />
              <th className="px-4 py-3 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Search Term</th>
              <th className="px-3 py-3 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal whitespace-nowrap">Status</th>
              {!campaignId && (
                <th className="px-4 py-3 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Campaign</th>
              )}
              <th className="px-4 py-3 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Ad Group</th>
              <th className="px-4 py-3 text-center text-[10px] font-heading font-bold uppercase tracking-wider text-teal whitespace-nowrap">Actions</th>
              {([
                { col: 'impressions' as SortKey, label: 'Impr' },
                { col: 'clicks'      as SortKey, label: 'Clicks' },
                { col: 'ctr'         as SortKey, label: 'CTR' },
                { col: 'cost'        as SortKey, label: 'Cost' },
                { col: 'conversions' as SortKey, label: 'Conv' },
                { col: 'cpa'         as SortKey, label: 'CPA' },
              ]).map(({ col, label }) => {
                const active = sortCol === col
                return (
                  <th key={col} className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleSort(col)}
                      className={`inline-flex items-center gap-1 text-[10px] font-heading font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${active ? 'text-cyan' : 'text-teal hover:text-navy'}`}
                    >
                      {active && <span className="text-[9px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                      {label}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-cloud">
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={campaignId ? 10 : 11} className="text-center py-12 text-teal text-sm">
                  No terms match this filter.
                </td>
              </tr>
            ) : visibleRows.map(t => {
              const baseKey   = `${t.campaignId}__${t.adGroupId}__${t.term}`
              const rec       = recMap.get(baseKey)
              const cfg       = rec ? REC_CFG[rec.priority] : null
              const stsCfg    = STATUS_CFG[t.status] ?? STATUS_CFG.NONE
              const isPending = rowPending.has(baseKey)
              const result    = rowResults.get(baseKey)
              const isOpen    = openAction?.termKey === baseKey
              const alreadyActioned = t.status === 'EXCLUDED' || t.status === 'ADDED_EXCLUDED'

              return (
                <tr
                  key={baseKey}
                  className={`transition-colors hover:bg-mist/60 ${cfg?.rowBg ?? ''}`}
                >
                  {/* Priority dot */}
                  <td className="px-3 py-3 text-center">
                    {cfg && <span className="text-sm leading-none">{cfg.icon}</span>}
                  </td>

                  {/* Term */}
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="text-xs font-medium text-navy truncate" title={t.term}>{t.term}</p>
                  </td>

                  {/* Status — updates optimistically */}
                  <td className="px-3 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${stsCfg.bg} ${stsCfg.text}`}>
                      {stsCfg.label}
                    </span>
                  </td>

                  {/* Campaign (account-level only) */}
                  {!campaignId && (
                    <td className="px-4 py-3 max-w-[140px]">
                      <p className="text-[11px] text-navy/70 truncate" title={t.campaignName}>{t.campaignName}</p>
                    </td>
                  )}

                  {/* Ad Group */}
                  <td className="px-4 py-3 max-w-[140px]">
                    <p className="text-[11px] text-navy/60 truncate" title={t.adGroupName}>{t.adGroupName}</p>
                  </td>

                  {/* Metrics */}
                  <td className="px-4 py-3 text-right tabular-nums text-xs text-navy/80">{t.impressions.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs text-navy/80">{t.clicks.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs text-navy/80">{t.ctr.toFixed(2)}%</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs text-navy/80 whitespace-nowrap">
                    {currency} {t.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs text-navy/80">
                    {t.conversions > 0 ? t.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums text-xs whitespace-nowrap ${t.cpa > 0 && avgs.cpa > 0 && t.cpa > avgs.cpa * 2 ? 'text-red-600 font-bold' : 'text-navy/80'}`}>
                    {t.cpa > 0 ? `${currency} ${t.cpa.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                  </td>

                  {/* ── Actions cell ── */}
                  <td className="px-3 py-2 text-center min-w-[160px]">
                    {isPending ? (
                      <div className="flex justify-center">
                        <span className="inline-block w-4 h-4 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : result ? (
                      <span className={`text-[10px] font-bold ${result.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                        {result.ok ? '✓' : '✗'} {result.msg}
                      </span>
                    ) : isOpen ? (
                      /* Match-type picker + confirm */
                      <div className="flex items-center gap-1 justify-center flex-wrap">
                        {(['EXACT','PHRASE','BROAD'] as MatchType[]).map(m => (
                          <button
                            key={m}
                            onClick={() => setActionMt(m)}
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                              actionMt === m
                                ? openAction!.type === 'exclude'
                                  ? 'bg-red-100 border-red-300 text-red-700'
                                  : 'bg-emerald-100 border-emerald-300 text-emerald-700'
                                : 'border-cloud text-navy/40 hover:border-cyan/40'
                            }`}
                          >
                            {m[0] + m.slice(1).toLowerCase()}
                          </button>
                        ))}
                        <button
                          onClick={() => confirmRowAction(t.term, t.campaignId, t.adGroupId)}
                          className={`text-[9px] font-bold px-2 py-0.5 rounded border transition-colors ${
                            openAction!.type === 'exclude'
                              ? 'bg-red-500 border-red-500 text-white hover:bg-red-600'
                              : 'bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600'
                          }`}
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => setOpenAction(null)}
                          className="text-[9px] text-navy/30 hover:text-navy px-1 py-0.5"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      /* Default: two action buttons */
                      <div className="flex items-center gap-1 justify-center">
                        <button
                          onClick={() => openRowAction(baseKey, 'exclude')}
                          disabled={alreadyActioned}
                          title="Exclude as negative keyword"
                          className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          ⊖ Excl
                        </button>
                        <button
                          onClick={() => openRowAction(baseKey, 'add')}
                          title="Add as positive keyword"
                          className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100 transition-colors whitespace-nowrap"
                        >
                          ⊕ Add
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>

          {/* Totals footer */}
          <tfoot>
            <tr className="border-t-2 border-cloud/70 bg-mist">
              <td colSpan={campaignId ? 5 : 6} className="px-4 py-3 text-[11px] font-heading font-bold text-navy">
                Total · {filtered.length} term{filtered.length !== 1 ? 's' : ''}
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">{totals.impressions.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">{totals.clicks.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">
                {totals.impressions > 0 ? `${((totals.clicks / totals.impressions) * 100).toFixed(2)}%` : '—'}
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums whitespace-nowrap">
                {currency} {totals.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">
                {totals.conversions > 0 ? totals.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums whitespace-nowrap">
                {totals.conversions > 0 ? `${currency} ${(totals.cost / totals.conversions).toFixed(2)}` : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => setPage(p => p + 1)}
            className="text-xs font-bold text-cyan hover:text-cyan/70 border border-cyan/30 hover:border-cyan px-6 py-2.5 rounded-xl transition-all"
          >
            Load {Math.min(PAGE_SIZE, sorted.length - visibleRows.length)} more
            <span className="text-navy/40 ml-1.5">· {sorted.length - visibleRows.length} remaining</span>
          </button>
        </div>
      )}

    </div>
  )
}
