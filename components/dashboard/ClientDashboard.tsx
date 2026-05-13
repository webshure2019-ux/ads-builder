'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import type { DailyMetrics, AccountStats, CampaignMetrics, ConversionAction } from '@/lib/google-ads'
import { CampaignsTable }            from '@/components/dashboard/CampaignsTable'
import { SearchTermsTab }            from '@/components/dashboard/SearchTermsTab'
import { BudgetPacingSection }       from '@/components/dashboard/BudgetPacingSection'
import { AccountHealthScore }        from '@/components/dashboard/AccountHealthScore'
import { ImpressionShareSection }    from '@/components/dashboard/ImpressionShareSection'
import { DevicePerformanceSection }  from '@/components/dashboard/DevicePerformanceSection'
import { LandingPageSection }        from '@/components/dashboard/LandingPageSection'
import { AnomalyAlertsSection }      from '@/components/dashboard/AnomalyAlertsSection'
import { ChangeHistorySection }      from '@/components/dashboard/ChangeHistorySection'
import { ClientReportSection }       from '@/components/dashboard/ClientReportSection'
import { RecommendationsSection }    from '@/components/dashboard/RecommendationsSection'
import { AIAnalystSection }          from '@/components/dashboard/AIAnalystSection'
import { SharedBudgetsSection }      from '@/components/dashboard/SharedBudgetsSection'
import { WastedSpendSection }        from '@/components/dashboard/WastedSpendSection'
import { QualityScoreSection }       from '@/components/dashboard/QualityScoreSection'
import { TopMoversSection }          from '@/components/dashboard/TopMoversSection'
import { RSAHealthSection }          from '@/components/dashboard/RSAHealthSection'

import { TopControlBar }             from '@/components/dashboard/shell/TopControlBar'
import { StatsStrip, type StatKey, KPIS } from '@/components/dashboard/shell/StatsStrip'
import { SectionRail, type SectionId }    from '@/components/dashboard/shell/SectionRail'
import { InsightPanel }              from '@/components/dashboard/shell/InsightPanel'
import { DrillDownPanel }            from '@/components/dashboard/shell/DrillDownPanel'
import { CommandPalette }            from '@/components/dashboard/shell/CommandPalette'

interface GoogleClient { id: string; name: string }

// ─── Date helpers ──────────────────────────────────────────────────────────────
function toYMD(d: Date) { return d.toISOString().split('T')[0] }

function resolveRange(preset: string, customStart: string, customEnd: string): { start: string; end: string } {
  if (preset === 'custom') return { start: customStart, end: customEnd }
  if (preset === 'mtd') {
    const now = new Date()
    return { start: toYMD(new Date(now.getFullYear(), now.getMonth(), 1)), end: toYMD(now) }
  }
  if (preset === 'last_mo') {
    const lastDay  = new Date(new Date().getFullYear(), new Date().getMonth(), 0)
    const firstDay = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1)
    return { start: toYMD(firstDay), end: toYMD(lastDay) }
  }
  const end = new Date(), start = new Date()
  start.setDate(end.getDate() - parseInt(preset))
  return { start: toYMD(start), end: toYMD(end) }
}

function getPreviousRange(start: string, end: string) {
  const s    = new Date(start)
  const e    = new Date(end)
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1
  const pe   = new Date(s); pe.setDate(pe.getDate() - 1)
  const ps   = new Date(pe); ps.setDate(ps.getDate() - (days - 1))
  return { start: toYMD(ps), end: toYMD(pe) }
}

// ─── Conversion category icons ─────────────────────────────────────────────────
const CONV_CATEGORY_ICONS: Record<string, string> = {
  PURCHASE: '🛒', PURCHASE_AND_SALE: '🛒', LEAD: '📋', SUBMIT_LEAD_FORM: '📝',
  SIGNUP: '✍️', PHONE_CALL_LEAD: '📞', IMPORTED_LEAD: '📥', BOOK_APPOINTMENT: '📅',
  REQUEST_QUOTE: '💬', GET_DIRECTIONS: '📍', OUTBOUND_CLICK: '🔗', PAGE_VIEW: '👁️',
  DOWNLOAD: '⬇️', ADD_TO_CART: '🛍️', BEGIN_CHECKOUT: '💳', SUBSCRIBE_PAID: '💰',
  CONTACT: '📬', STORE_VISIT: '🏪', STORE_SALE: '🏷️', ENGAGEMENT: '⭐', DEFAULT: '🎯',
  '1': '🎯', '2': '👁️', '3': '🛒', '4': '✍️', '5': '📋', '6': '⬇️', '7': '🛍️',
  '8': '💳', '9': '💰', '10': '📞', '11': '📥', '12': '📝', '13': '📅', '14': '💬',
  '15': '📍', '16': '🔗', '17': '📬', '18': '⭐', '19': '🏪', '20': '🏷️',
}

// ─── Shared tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, format, currency }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-navy text-white text-xs rounded-xl px-3 py-2 shadow-xl pointer-events-none space-y-1">
      <p className="text-white/50">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="font-bold" style={{ color: p.color ?? p.stroke }}>
          {p.name === 'previous' ? 'Prev: ' : 'Now:  '}{format(p.value ?? 0, currency)}
        </p>
      ))}
    </div>
  )
}

// ─── KPI focus chart (slides down below the strip when a KPI is selected) ────
function FocusChart({ kpiKey, daily, prevDaily, currency, onClose }: {
  kpiKey: StatKey; daily: DailyMetrics[]; prevDaily: DailyMetrics[]; currency: string; onClose: () => void
}) {
  const cfg = KPIS.find(k => k.key === kpiKey)!
  const data = daily.map((d, i) => ({
    date: d.date,
    current: d[kpiKey] as number,
    previous: prevDaily[i]?.[kpiKey] as number ?? null,
  }))
  const max = Math.max(...daily.map(d => d[kpiKey] as number))
  const min = Math.min(...daily.map(d => d[kpiKey] as number))
  const avg = daily.length > 0 ? daily.reduce((s, d) => s + (d[kpiKey] as number), 0) / daily.length : 0

  return (
    <div
      className="rounded-xl px-4 py-3 animate-slide-up relative"
      style={{
        background: 'var(--surface)',
        border:     `1px solid ${cfg.color}33`,
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md hover:bg-cyan/10 transition-colors text-xs"
        style={{ color: 'var(--text-3)' }}
        aria-label="Close chart"
      >
        ✕
      </button>
      <div className="flex items-center gap-6 mb-2 text-[10px]" style={{ color: 'var(--text-3)' }}>
        <span><span className="font-bold" style={{ color: cfg.color }}>{cfg.label}</span></span>
        <span>peak <span className="font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{cfg.format(max, currency)}</span></span>
        <span>avg <span className="font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{cfg.format(avg, currency)}</span></span>
        <span>low <span className="font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{cfg.format(min, currency)}</span></span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`focus-${kpiKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={cfg.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={cfg.color} stopOpacity={0}    />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border-lo)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-3)' as any }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)' as any }} tickLine={false} axisLine={false}
                 tickFormatter={v => cfg.format(v, currency).replace(/^[A-Z]{3}\s/, '')} width={55} />
          <Tooltip content={<ChartTooltip format={cfg.format} currency={currency} />} />
          <Area type="monotone" dataKey="current" stroke={cfg.color} strokeWidth={2}
                fill={`url(#focus-${kpiKey})`} dot={false} activeDot={{ r: 4, fill: cfg.color }} name="current" />
          {prevDaily.length > 0 && (
            <Area type="monotone" dataKey="previous" stroke={cfg.color} strokeWidth={1.5}
                  strokeDasharray="4 3" fill="none" dot={false} strokeOpacity={0.5} name="previous" />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Conversion breakdown (renders only when activeKpi === 'conversions') ────
function ConversionBreakdown({ actions, loading, error, currency }: {
  actions: ConversionAction[]; loading: boolean; error: string; currency: string
}) {
  const total = actions.reduce((s, a) => s + a.count, 0)

  if (loading) return (
    <div className="flex items-center gap-2 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
      <div className="w-3 h-3 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
      Loading conversion breakdown…
    </div>
  )
  if (error) return <p className="text-xs text-red-500 py-2">{error}</p>
  if (actions.length === 0) return null

  return (
    <div className="space-y-2 mt-2">
      <p className="text-[10px] font-heading font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
        Conversion Actions
      </p>
      {actions.slice(0, 8).map(a => {
        const pct = total > 0 ? (a.count / total) * 100 : 0
        const icon = CONV_CATEGORY_ICONS[a.category] ?? CONV_CATEGORY_ICONS.DEFAULT
        return (
          <div key={a.name} className="flex items-center gap-2">
            <span className="flex-shrink-0">{icon}</span>
            <span className="flex-1 text-xs truncate" title={a.name} style={{ color: 'var(--text-1)' }}>{a.name}</span>
            <div className="w-24 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-lo)' }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#10b981' }} />
            </div>
            <span className="text-[10px] tabular-nums flex-shrink-0 w-16 text-right" style={{ color: 'var(--text-2)' }}>
              {a.count.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </span>
          </div>
        )
      })}
      {actions.length > 8 && (
        <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>+{actions.length - 8} more</p>
      )}
    </div>
  )
}

// ─── Learning phase detection ─────────────────────────────────────────────────
// Numeric codes per BiddingStrategyType enum (google-ads-api v23):
//   ENHANCED_CPC=2, TARGET_CPA=6, TARGET_ROAS=8,
//   MAXIMIZE_CONVERSIONS=10, MAXIMIZE_CONVERSION_VALUE=11, TARGET_IMPRESSION_SHARE=15
const LEARNING_STATUSES_DB = new Set([
  'LEARNING_NEW', 'LEARNING_SETTING_CHANGE', 'LEARNING_BUDGET_CHANGE',
  'LEARNING_COMPOSITIONAL_CHANGE', 'LEARNING_CONVERSION_TYPE_CHANGE',
  'LEARNING_CONVERSION_SETTING_CHANGE',
  '2', '3', '4', '5', '6', '7',
])
const SMART_BIDDING_TYPES_DB = new Set([
  'MAXIMIZE_CONVERSIONS', 'MAXIMIZE_CONVERSION_VALUE', 'TARGET_CPA', 'TARGET_ROAS',
  'ENHANCED_CPC', 'TARGET_IMPRESSION_SHARE',
  '2', '6', '8', '10', '11', '15',
])

function isCampaignLearning(c: CampaignMetrics) {
  return LEARNING_STATUSES_DB.has(c.bidding_strategy_system_status)
    && SMART_BIDDING_TYPES_DB.has(c.bidding_strategy_type)
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onPick }: { onPick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-32 px-6">
      <div className="text-5xl mb-4">📊</div>
      <h2 className="font-heading font-bold text-xl mb-1" style={{ color: 'var(--text-1)' }}>
        Pick a client to begin
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-2)' }}>
        Use the picker above — or press <kbd className="px-1.5 py-0.5 rounded font-mono text-[11px]"
          style={{ background: 'var(--surface-lo)', border: '1px solid var(--border-lo)' }}>⌘K</kbd> to search.
      </p>
      <button
        onClick={onPick}
        className="px-5 py-2.5 rounded-xl font-heading font-bold text-sm transition-all hover:scale-[1.02]"
        style={{ background: '#31C0FF', color: '#052E4B' }}
      >
        Open command palette
      </button>
    </div>
  )
}

// ─── Compact learning pill (replaces full LearningBanner) ─────────────────────
function LearningPill({ campaigns, onClick }: { campaigns: CampaignMetrics[]; onClick: () => void }) {
  const learning = campaigns.filter(isCampaignLearning)
  if (learning.length === 0) return null
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-bold transition-all hover:scale-[1.03]"
      style={{
        background: 'rgba(255, 138, 48, 0.10)',
        border:     '1px solid rgba(255, 138, 48, 0.30)',
        color:      '#c2410c',
      }}
      title="Click for details"
    >
      <span>🎓</span>
      {learning.length} learning
    </button>
  )
}

// ─── Anomaly badge count ──────────────────────────────────────────────────────
function useAnomalyCount(stats: AccountStats | null, prevStats: AccountStats | null, campaigns: CampaignMetrics[]) {
  return useMemo(() => {
    if (!stats || !prevStats) return 0
    let count = 0
    const checks: Array<{ key: keyof typeof stats.totals; threshold: number; higherIsBetter: boolean }> = [
      { key: 'cost',            threshold: 25, higherIsBetter: false },
      { key: 'conversions',     threshold: 20, higherIsBetter: true  },
      { key: 'clicks',          threshold: 30, higherIsBetter: true  },
      { key: 'conversion_rate', threshold: 20, higherIsBetter: true  },
      { key: 'ctr',             threshold: 25, higherIsBetter: true  },
    ]
    for (const c of checks) {
      const cur  = stats.totals[c.key] as number
      const prev = prevStats.totals[c.key] as number
      if (!prev) continue
      const chg = ((cur - prev) / prev) * 100
      const drop = c.higherIsBetter ? chg < 0 : chg > 0
      if (drop && Math.abs(chg) >= c.threshold) count++
    }
    // Dark campaigns
    const enabled = campaigns.filter(c => c.status === 'ENABLED' || c.status === '2')
    count += enabled.filter(c => c.impressions === 0 && c.cost === 0).length
    return count
  }, [stats, prevStats, campaigns])
}

// ─── Main dashboard ────────────────────────────────────────────────────────────
export function ClientDashboard() {
  const searchParams = useSearchParams()

  // ── Data state (preserved verbatim from the previous version) ───────────────
  const [clients,          setClients]          = useState<GoogleClient[]>([])
  const [clientId,         setClientId]         = useState(() => searchParams.get('client') ?? '')
  const [preset,           setPreset]           = useState(() => {
    if (typeof window === 'undefined') return '30'
    return localStorage.getItem('ads_date_preset') ?? '30'
  })
  const [customStart,      setCustomStart]      = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('ads_date_custom_start') ?? ''
  })
  const [customEnd,        setCustomEnd]        = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('ads_date_custom_end') ?? ''
  })
  const [compare,          setCompare]          = useState(false)
  const [stats,            setStats]            = useState<AccountStats | null>(null)
  const [compareStats,     setCompareStats]     = useState<AccountStats | null>(null)
  const [prevStats,        setPrevStats]        = useState<AccountStats | null>(null)
  const [campaigns,        setCampaigns]        = useState<CampaignMetrics[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(false)
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState('')
  const [activeKpi,        setActiveKpi]        = useState<StatKey | null>(null)
  const [convActions,      setConvActions]      = useState<ConversionAction[]>([])
  const [convLoading,      setConvLoading]      = useState(false)
  const [convError,        setConvError]        = useState('')
  const [campaignSearch,   setCampaignSearch]   = useState('')

  // ── Shell state ─────────────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<SectionId | null>(null)
  const [commandOpen,   setCommandOpen]   = useState(false)
  const [drillCampaign, setDrillCampaign] = useState<CampaignMetrics | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Insight panel and drill-down panel share the same right-side slot — they're
  // mutually exclusive. Opening one auto-closes the other.
  useEffect(() => { if (drillCampaign) setActiveSection(null) }, [drillCampaign])
  useEffect(() => { if (activeSection) setDrillCampaign(null) }, [activeSection])

  // Persist date range preference
  useEffect(() => { localStorage.setItem('ads_date_preset', preset) }, [preset])
  useEffect(() => { localStorage.setItem('ads_date_custom_start', customStart) }, [customStart])
  useEffect(() => { localStorage.setItem('ads_date_custom_end',   customEnd)   }, [customEnd])

  // ── Initial clients load + URL-driven pre-selection ─────────────────────────
  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(d => {
      setClients(d.clients || [])
      const preSelected = searchParams.get('client')
      if (preSelected) {
        const { start, end } = resolveRange('30', '', '')
        if (start && end) fetchStats(preSelected, start, end, false)
      }
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lazy conversion breakdown when conversions KPI is active ────────────────
  useEffect(() => {
    if (activeKpi !== 'conversions' || !clientId) return
    const { start, end } = resolveRange(preset, customStart, customEnd)
    if (!start || !end) return
    setConvLoading(true); setConvError('')
    fetch(`/api/conversion-breakdown?client_account_id=${clientId}&start_date=${start}&end_date=${end}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Failed to load breakdown')
        setConvActions(d.actions ?? [])
      })
      .catch(e => setConvError(String(e)))
      .finally(() => setConvLoading(false))
  }, [activeKpi, clientId, preset, customStart, customEnd])

  // Reset transient state on client/date change
  useEffect(() => {
    setConvActions([]); setConvError(''); setCampaignSearch('')
  }, [clientId, preset, customStart, customEnd])

  // ── Core fetch ──────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async (
    id: string, start: string, end: string, doCompare: boolean
  ) => {
    if (!id || !start || !end) return
    setLoading(true); setCampaignsLoading(true); setError('')

    try {
      const prevRange = getPreviousRange(start, end)
      const prevFetch = fetch(`/api/stats?client_account_id=${id}&start_date=${prevRange.start}&end_date=${prevRange.end}`)
      const [res, cRes, campRes] = await Promise.all([
        fetch(`/api/stats?client_account_id=${id}&start_date=${start}&end_date=${end}`),
        doCompare ? prevFetch : Promise.resolve(null),
        fetch(`/api/campaign-stats?client_account_id=${id}&start_date=${start}&end_date=${end}`),
      ])

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load stats')
      setStats(data)

      if (cRes) {
        const prevData = await cRes.json()
        setCompareStats(prevData)
        setPrevStats(prevData)
      } else {
        setCompareStats(null)
        prevFetch.then(r => r.json()).then(d => setPrevStats(d)).catch(() => {})
      }

      const campData = await campRes.json()
      setCampaigns(campRes.ok ? (campData.campaigns ?? []) : [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false); setCampaignsLoading(false)
    }
  }, [])

  function activeRange() { return resolveRange(preset, customStart, customEnd) }
  function run(id: string, p: string, cmp: boolean, cs: string, ce: string) {
    const { start, end } = resolveRange(p, cs, ce)
    if (start && end) fetchStats(id, start, end, cmp)
  }

  const { start: rs, end: re } = activeRange()
  const selectedClient = clients.find(c => c.id === clientId)
  const anomalyCount   = useAnomalyCount(stats, prevStats, campaigns)

  // Visible campaign list (after search filter) — used for prev/next navigation in the drill-down panel
  const filteredCampaigns = useMemo(() => campaigns.filter(c =>
    !campaignSearch || c.name.toLowerCase().includes(campaignSearch.toLowerCase())
  ), [campaigns, campaignSearch])

  const drillIdx = drillCampaign ? filteredCampaigns.findIndex(c => c.id === drillCampaign.id) : -1
  const drillPrev = drillIdx > 0 ? () => setDrillCampaign(filteredCampaigns[drillIdx - 1]) : undefined
  const drillNext = drillIdx >= 0 && drillIdx < filteredCampaigns.length - 1
    ? () => setDrillCampaign(filteredCampaigns[drillIdx + 1])
    : undefined

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore when typing in inputs / textareas / contenteditable
      const t = e.target as HTMLElement
      const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

      // ⌘K / Ctrl+K → command palette (always, even in fields)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setCommandOpen(o => !o); return
      }
      if (inField) return

      // ESC → close panels (drill > section > kpi)
      if (e.key === 'Escape') {
        if (drillCampaign)   { setDrillCampaign(null); return }
        if (activeSection)   { setActiveSection(null); return }
        if (activeKpi)       { setActiveKpi(null); return }
      }
      // [ / ] → cycle date presets
      const presets = ['7', '14', '30', '90', 'mtd', 'last_mo']
      if (e.key === '[' || e.key === ']') {
        const i = presets.indexOf(preset)
        const next = e.key === ']' ? presets[(i + 1) % presets.length] : presets[(i - 1 + presets.length) % presets.length]
        setPreset(next); if (clientId) run(clientId, next, compare, customStart, customEnd)
        e.preventDefault()
      }
      // "/" → focus the campaign search input
      if (e.key === '/' && clientId) {
        searchInputRef.current?.focus(); e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeKpi, activeSection, drillCampaign, preset, clientId, compare, customStart, customEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  // Range label for the top bar
  const rangeLabel = stats && rs && re
    ? `${rs} → ${re}${compare && compareStats ? ' · vs prev' : ''}`
    : ''

  // ── Section rail badges ─────────────────────────────────────────────────────
  const badges = useMemo(() => {
    const out: Partial<Record<SectionId, { count?: number; tone?: 'alert' | 'warn' | 'info' }>> = {}
    if (anomalyCount > 0) out.anomalies = { count: anomalyCount, tone: 'alert' }
    return out
  }, [anomalyCount])

  // ── Render a section into the insight panel ─────────────────────────────────
  function renderActiveSection(): React.ReactNode {
    if (!stats || !clientId || !rs || !re) return null
    switch (activeSection) {
      case 'health':
        return <AccountHealthScore campaigns={campaigns} stats={stats} startDate={rs} endDate={re} />
      case 'pacing':
        return <BudgetPacingSection campaigns={campaigns} startDate={rs} endDate={re} currency={stats.currency} />
      case 'shared_budgets':
        return <SharedBudgetsSection clientId={clientId} currency={stats.currency} />
      case 'wasted':
        return <WastedSpendSection clientId={clientId} startDate={rs} endDate={re} currency={stats.currency} />
      case 'movers': {
        const prev = getPreviousRange(rs, re)
        return <TopMoversSection clientId={clientId} campaigns={campaigns} startDate={rs} endDate={re}
                                 prevStartDate={prev.start} prevEndDate={prev.end} currency={stats.currency} />
      }
      case 'qs':
        return <QualityScoreSection clientId={clientId} startDate={rs} endDate={re} />
      case 'rsa':
        return <RSAHealthSection clientId={clientId} />
      case 'is':
        return <ImpressionShareSection campaigns={campaigns} currency={stats.currency} />
      case 'devices':
        return <DevicePerformanceSection clientAccountId={clientId} startDate={rs} endDate={re} currency={stats.currency} />
      case 'landing':
        return <LandingPageSection clientAccountId={clientId} startDate={rs} endDate={re} currency={stats.currency} />
      case 'anomalies':
        return <AnomalyAlertsSection stats={stats} prevStats={prevStats} campaigns={campaigns} currency={stats.currency} />
      case 'changes':
        return <ChangeHistorySection clientAccountId={clientId} startDate={rs} endDate={re} />
      case 'ai':
        return <AIAnalystSection clientAccountId={clientId} startDate={rs} endDate={re} />
      case 'recs':
        return <RecommendationsSection clientAccountId={clientId} startDate={rs} endDate={re} currency={stats.currency} />
      case 'report':
        return <ClientReportSection clientName={selectedClient?.name ?? clientId} startDate={rs} endDate={re}
                                    stats={stats} prevStats={prevStats} campaigns={campaigns} />
      case 'search_terms':
        return <SearchTermsTab clientId={clientId} startDate={rs} endDate={re} currency={stats.currency} />
      default: return null
    }
  }

  return (
    <>
      {/* Sticky control bar */}
      <TopControlBar
        clients={clients}
        clientId={clientId}
        onClientChange={(id) => { setClientId(id); run(id, preset, compare, customStart, customEnd) }}
        preset={preset}
        onPresetChange={(p) => { setPreset(p); if (p !== 'custom') run(clientId, p, compare, customStart, customEnd) }}
        customStart={customStart}
        customEnd={customEnd}
        onCustomChange={(s, e) => {
          setCustomStart(s); setCustomEnd(e)
          if (s && e && e > s) run(clientId, 'custom', compare, s, e)
        }}
        compare={compare}
        onCompareChange={(v) => { setCompare(v); if (clientId && rs && re) fetchStats(clientId, rs, re, v) }}
        rangeLabel={rangeLabel}
        loading={loading || campaignsLoading}
        onOpenCommandPalette={() => setCommandOpen(true)}
      />

      {/* Body: rail + main + (overlay) insight panel */}
      <div className="flex" style={{ minHeight: 'calc(100vh - var(--nav-h, 56px) - 52px)' }}>

        <SectionRail
          activeId={activeSection}
          onSelect={setActiveSection}
          badges={badges}
        />

        {/* Main content. When a side panel is open AND the viewport is wide
            enough (--panel-push > 0), reserve space so the content reflows
            beside the panel. On narrower viewports the panel overlays. */}
        <div
          className="flex-1 min-w-0 px-5 py-3 space-y-3 transition-[padding] duration-200"
          style={{
            paddingRight: (activeSection || drillCampaign)
              ? 'calc(var(--panel-push, 0px) + 1.25rem)'
              : '1.25rem',
          }}
        >
          {/* Empty / loading / error states */}
          {!clientId && (
            <EmptyState onPick={() => setCommandOpen(true)} />
          )}

          {clientId && error && (
            <div className="rounded-2xl p-5 border" style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.30)', color: '#dc2626' }}>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {clientId && stats && (
            <>
              {/* Client name row + learning pill + density toggle slot */}
              <div className="flex items-center gap-3">
                <h1 className="font-heading font-bold text-base" style={{ color: 'var(--text-1)' }}>
                  {selectedClient?.name ?? clientId}
                </h1>
                {!campaignsLoading && (
                  <LearningPill campaigns={campaigns} onClick={() => setActiveSection('recs')} />
                )}
              </div>

              {/* Stats strip */}
              {stats.daily.length > 0 ? (
                <>
                  <StatsStrip
                    stats={stats}
                    compareStats={compareStats}
                    activeKey={activeKpi}
                    onActiveChange={setActiveKpi}
                  />

                  {/* Focus chart slides in below */}
                  {activeKpi && (
                    <>
                      <FocusChart
                        kpiKey={activeKpi}
                        daily={stats.daily}
                        prevDaily={compareStats?.daily ?? []}
                        currency={stats.currency}
                        onClose={() => setActiveKpi(null)}
                      />
                      {activeKpi === 'conversions' && (
                        <ConversionBreakdown
                          actions={convActions}
                          loading={convLoading}
                          error={convError}
                          currency={stats.currency}
                        />
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface-lo)', border: '1px solid var(--border-lo)', color: 'var(--text-2)' }}>
                  <p className="text-sm">No data in this period.</p>
                </div>
              )}

              {/* Campaigns — the workhorse */}
              {!campaignsLoading && (
                <>
                  {/* Search above the table — `/` shortcut focuses this */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 max-w-sm">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] pointer-events-none"
                            style={{ color: 'var(--text-3)' }}>⌕</span>
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={campaignSearch}
                        onChange={e => setCampaignSearch(e.target.value)}
                        placeholder="Filter campaigns…"
                        className="field text-xs h-8 pl-7 pr-9"
                      />
                      <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[9px] font-mono pointer-events-none"
                           style={{ background: 'var(--surface-lo)', border: '1px solid var(--border-lo)', color: 'var(--text-3)' }}>
                        /
                      </kbd>
                    </div>
                    {campaignSearch && (
                      <button
                        onClick={() => setCampaignSearch('')}
                        className="text-[10px] px-2 py-1 rounded transition-colors"
                        style={{ color: 'var(--text-3)' }}
                      >
                        clear
                      </button>
                    )}
                  </div>

                  <CampaignsTable
                    campaigns={filteredCampaigns}
                    currency={stats.currency}
                    clientId={clientId}
                    startDate={rs}
                    endDate={re}
                    selectedCampaignId={drillCampaign?.id ?? null}
                    onSelectCampaign={setDrillCampaign}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Insight side panel — sections */}
      <InsightPanel
        activeId={activeSection}
        onClose={() => setActiveSection(null)}
      >
        {renderActiveSection()}
      </InsightPanel>

      {/* Drill-down side panel — campaigns (shares the same right-edge slot) */}
      {clientId && stats && rs && re && (
        <DrillDownPanel
          campaign={drillCampaign}
          clientId={clientId}
          currency={stats.currency}
          startDate={rs}
          endDate={re}
          onClose={() => setDrillCampaign(null)}
          onPrev={drillPrev}
          onNext={drillNext}
        />
      )}

      {/* Command palette */}
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        clients={clients}
        campaigns={campaigns}
        onSelectClient={(id) => { setClientId(id); run(id, preset, compare, customStart, customEnd) }}
        onSelectSection={(id) => setActiveSection(id)}
        onSelectPreset={(p) => {
          setPreset(p); if (p !== 'custom' && clientId) run(clientId, p, compare, customStart, customEnd)
        }}
        onSelectCampaign={(id) => {
          const c = campaigns.find(x => x.id === id)
          if (c) setDrillCampaign(c)
        }}
        actions={[
          {
            id: 'action:toggle-compare', kind: 'action', icon: compare ? '◆' : '◇',
            label: compare ? 'Turn off period comparison' : 'Compare to previous period',
            hint: 'Action',
            run: () => {
              const next = !compare; setCompare(next)
              if (clientId && rs && re) fetchStats(clientId, rs, re, next)
            },
          },
          {
            id: 'action:export-csv', kind: 'action', icon: '⬇️',
            label: 'Print / Export client report', hint: 'Action',
            run: () => { setActiveSection('report') },
          },
        ]}
      />
    </>
  )
}
