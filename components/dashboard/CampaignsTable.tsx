'use client'
import { useState, useEffect, useRef, Fragment } from 'react'
import type { CampaignMetrics } from '@/lib/google-ads'
import { CampaignDrillDown } from '@/components/dashboard/CampaignDrillDown'

// ─── Channel type display map ──────────────────────────────────────────────────
const CHANNEL_MAP: Record<string, { icon: string; label: string }> = {
  SEARCH:          { icon: '🔍', label: 'Search' },
  DISPLAY:         { icon: '🖥️', label: 'Display' },
  SHOPPING:        { icon: '🛒', label: 'Shopping' },
  VIDEO:           { icon: '🎥', label: 'Video' },
  PERFORMANCE_MAX: { icon: '⚡', label: 'PMax' },
  DEMAND_GEN:      { icon: '🎯', label: 'Demand Gen' },
  MULTI_CHANNEL:   { icon: '⚡', label: 'Smart' },
  LOCAL:           { icon: '📍', label: 'Local' },
  LOCAL_SERVICES:  { icon: '🔧', label: 'Local Services' },
  '2':  { icon: '🔍', label: 'Search' },
  '3':  { icon: '🖥️', label: 'Display' },
  '4':  { icon: '🛒', label: 'Shopping' },
  '6':  { icon: '🎥', label: 'Video' },
  '9':  { icon: '⚡', label: 'Smart' },
  '10': { icon: '⚡', label: 'PMax'  },
  '11': { icon: '🎯', label: 'Demand Gen' },
}

// ─── Learning phase detection ──────────────────────────────────────────────────
// bidding_strategy_system_status values that mean the campaign is still learning
const LEARNING_STATUSES = new Set([
  'LEARNING_NEW', 'LEARNING_SETTING_CHANGE', 'LEARNING_BUDGET_CHANGE',
  'LEARNING_COMPOSITIONAL_CHANGE', 'LEARNING_CONVERSION_TYPE_CHANGE',
  'LEARNING_CONVERSION_SETTING_CHANGE',
  '2', '3', '4', '5', '6', '7',  // numeric API equivalents
])

// Smart bidding types that have a learning phase
const SMART_BIDDING_TYPES = new Set([
  'MAXIMIZE_CONVERSIONS', 'MAXIMIZE_CONVERSION_VALUE', 'TARGET_CPA', 'TARGET_ROAS',
  'ENHANCED_CPC',
  '8', '9', '6', '7', '12',       // numeric API equivalents
])

function isLearning(c: CampaignMetrics) {
  return LEARNING_STATUSES.has(c.bidding_strategy_system_status)
    && SMART_BIDDING_TYPES.has(c.bidding_strategy_type)
}

// % through the ~30-day learning window based on campaign start_date
function learningPct(startDate: string): number {
  if (!startDate) return 50
  const days = (Date.now() - new Date(startDate).getTime()) / 86_400_000
  return Math.min(Math.floor((days / 30) * 100), 99)
}

// ─── Column definitions ────────────────────────────────────────────────────────
type SortKey =
  | 'name' | 'impressions' | 'clicks' | 'ctr' | 'cost' | 'avg_cpc'
  | 'conversions' | 'conversion_rate' | 'cost_per_conversion'
  | 'conversions_value' | 'all_conversions'
  | 'search_impression_share' | 'search_abs_top_is' | 'search_top_is'

interface ColDef {
  key:       SortKey
  label:     string
  defaultOn: boolean
  format:    (c: CampaignMetrics, currency: string) => string
}

const ALL_COLS: ColDef[] = [
  { key: 'impressions',           label: 'Impressions',  defaultOn: true,
    format: c => c.impressions.toLocaleString() },
  { key: 'clicks',                label: 'Clicks',       defaultOn: true,
    format: c => c.clicks.toLocaleString() },
  { key: 'ctr',                   label: 'CTR',          defaultOn: true,
    format: c => `${c.ctr.toFixed(2)}%` },
  { key: 'cost',                  label: 'Cost',         defaultOn: true,
    format: (c, cur) => `${cur} ${c.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  { key: 'avg_cpc',               label: 'Avg. CPC',     defaultOn: false,
    format: (c, cur) => c.clicks > 0 ? `${cur} ${c.avg_cpc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' },
  { key: 'conversions',           label: 'Conversions',  defaultOn: true,
    format: c => c.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 }) },
  { key: 'conversion_rate',       label: 'Conv. Rate',   defaultOn: true,
    format: c => `${c.conversion_rate.toFixed(2)}%` },
  { key: 'cost_per_conversion',   label: 'Cost/Conv',    defaultOn: false,
    format: (c, cur) => c.cost_per_conversion > 0 ? `${cur} ${c.cost_per_conversion.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' },
  { key: 'conversions_value',     label: 'Conv. Value',  defaultOn: false,
    format: (c, cur) => `${cur} ${c.conversions_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  { key: 'all_conversions',       label: 'All Conv.',    defaultOn: false,
    format: c => c.all_conversions.toLocaleString(undefined, { maximumFractionDigits: 1 }) },
  { key: 'search_impression_share', label: 'Search IS',  defaultOn: false,
    format: c => c.search_impression_share != null ? `${c.search_impression_share.toFixed(1)}%` : '—' },
  { key: 'search_abs_top_is',     label: 'Abs. Top IS',  defaultOn: false,
    format: c => c.search_abs_top_is != null ? `${c.search_abs_top_is.toFixed(1)}%` : '—' },
  { key: 'search_top_is',         label: 'Top IS',       defaultOn: false,
    format: c => c.search_top_is != null ? `${c.search_top_is.toFixed(1)}%` : '—' },
]

const DEFAULT_COL_KEYS = new Set(ALL_COLS.filter(c => c.defaultOn).map(c => c.key))
const LS_KEY = 'ws_campaign_cols_v1'

// ─── Shared helpers ────────────────────────────────────────────────────────────
function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="ml-1 text-navy/20">↕</span>
  return <span className="ml-1 text-cyan">{dir === 'asc' ? '↑' : '↓'}</span>
}

function isActive(status: string) { return status === 'ENABLED' || status === '2' }

// ─── localStorage column state ─────────────────────────────────────────────────
function loadColKeys(): Set<string> {
  if (typeof window === 'undefined') return DEFAULT_COL_KEYS
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : DEFAULT_COL_KEYS
  } catch { return DEFAULT_COL_KEYS }
}

function saveColKeys(keys: Set<string>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(Array.from(keys))) } catch {}
}

// ─── Column picker popover ─────────────────────────────────────────────────────
function ColumnPicker({
  enabledKeys, onChange,
}: { enabledKeys: Set<string>; onChange: (k: Set<string>) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])

  function toggle(key: string, on: boolean) {
    const next = new Set(enabledKeys)
    on ? next.add(key) : next.delete(key)
    onChange(next)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`text-[11px] font-bold border px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${open ? 'bg-cyan text-navy border-cyan' : 'text-navy/60 hover:text-navy border-cloud hover:border-cyan/40'}`}
        title="Show / hide columns"
      >
        ⊞ Columns <span className="text-[10px] opacity-70">({enabledKeys.size})</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 bg-white border border-cloud rounded-2xl shadow-2xl p-3 w-56">
          <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-2 px-1">
            Show / Hide Columns
          </p>
          <div className="space-y-0.5 max-h-72 overflow-y-auto">
            {ALL_COLS.map(col => (
              <label key={col.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-mist cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enabledKeys.has(col.key)}
                  onChange={e => toggle(col.key, e.target.checked)}
                  className="accent-cyan w-3.5 h-3.5 flex-shrink-0"
                />
                <span className="text-xs text-navy">{col.label}</span>
              </label>
            ))}
          </div>
          <div className="border-t border-cloud mt-2 pt-2 flex items-center gap-3 px-1">
            <button
              onClick={() => onChange(new Set(DEFAULT_COL_KEYS))}
              className="text-[10px] text-navy/40 hover:text-navy transition-colors"
            >Reset defaults</button>
            <button
              onClick={() => onChange(new Set(ALL_COLS.map(c => c.key)))}
              className="text-[10px] text-navy/40 hover:text-navy transition-colors"
            >Show all</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Inline budget editor ──────────────────────────────────────────────────────
function BudgetCell({ campaign, clientId, currency, onUpdated }: {
  campaign: CampaignMetrics; clientId: string; currency: string; onUpdated: (b: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState(String(campaign.daily_budget))
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  async function save() {
    const amount = parseFloat(value)
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a valid amount'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/campaign-budget', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, budget_resource_name: campaign.budget_resource_name, daily_budget: amount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onUpdated(amount); setEditing(false)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (!editing) return (
    <button
      onClick={() => { setValue(String(campaign.daily_budget)); setEditing(true) }}
      className="group flex items-center gap-1.5 text-right" title="Click to edit budget"
    >
      <span className="tabular-nums text-navy/80 text-sm">
        {currency} {campaign.daily_budget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span className="text-[10px] text-navy/30 group-hover:text-cyan transition-colors">✏️</span>
    </button>
  )

  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-teal flex-shrink-0">{currency}</span>
        <input
          type="number" min="1" step="0.01" value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          className="w-24 border border-cyan rounded-lg px-2 py-1 text-xs text-navy focus:outline-none bg-white tabular-nums"
          autoFocus
        />
        <button onClick={save} disabled={saving}
          className="text-[11px] font-bold bg-cyan text-navy px-2 py-1 rounded-lg hover:bg-cyan/80 disabled:opacity-50 transition-colors whitespace-nowrap">
          {saving ? '…' : 'Save'}
        </button>
        <button onClick={() => setEditing(false)} className="text-[11px] text-navy/40 hover:text-navy px-1 py-1 transition-colors">✕</button>
      </div>
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  )
}

// ─── Pause / Resume button ─────────────────────────────────────────────────────
function StatusToggleBtn({ campaignId, clientId, currentStatus, onStatusChange }: {
  campaignId: string; clientId: string; currentStatus: string; onStatusChange: (id: string, s: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const active     = isActive(currentStatus)
  const nextStatus = active ? 'PAUSED' : 'ENABLED'

  async function toggle() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/campaign-status', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, campaign_id: campaignId, status: nextStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      onStatusChange(campaignId, nextStatus)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={toggle} disabled={loading}
        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 whitespace-nowrap ${active ? 'border-amber-300 text-amber-700 hover:bg-amber-50' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}>
        {loading ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : active ? 'Pause' : 'Resume'}
      </button>
      {error && <p className="text-[9px] text-red-500 max-w-[120px] text-right leading-tight">{error}</p>}
    </div>
  )
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function exportCSV(campaigns: CampaignMetrics[], currency: string, visibleCols: ColDef[]) {
  const headers = ['Campaign', 'Type', 'Status', 'Daily Budget', ...visibleCols.map(c => c.label)]
  const rows = campaigns.map(c => [
    c.name, c.channel_type, c.status,
    c.daily_budget.toFixed(2),
    ...visibleCols.map(col => col.format(c, currency)),
  ])
  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: `campaigns-${new Date().toISOString().split('T')[0]}.csv` })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Main component ────────────────────────────────────────────────────────────
export function CampaignsTable({ campaigns: initialCampaigns, currency, clientId, startDate, endDate }: {
  campaigns:     CampaignMetrics[]
  currency:      string
  clientId:      string
  startDate:     string
  endDate:       string
}) {
  const [campaigns,  setCampaigns]  = useState<CampaignMetrics[]>(initialCampaigns)
  const [sortKey,    setSortKey]    = useState<SortKey>('cost')
  const [sortDir,    setSortDir]    = useState<'asc' | 'desc'>('desc')
  const [colKeys,    setColKeys]    = useState<Set<string>>(DEFAULT_COL_KEYS)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Load saved column preference on mount
  useEffect(() => { setColKeys(loadColKeys()) }, [])

  // Sync whenever parent delivers a fresh fetch result
  useEffect(() => { setCampaigns(initialCampaigns) }, [initialCampaigns])

  function handleColChange(next: Set<string>) { setColKeys(next); saveColKeys(next) }

  function handleBudgetUpdate(campaignId: string, newBudget: number) {
    setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, daily_budget: newBudget } : c))
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function handleStatusChange(campaignId: string, newStatus: string) {
    setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, status: newStatus } : c))
  }

  const visibleCols = ALL_COLS.filter(c => colKeys.has(c.key))

  const sorted = [...campaigns].sort((a, b) => {
    if (sortKey === 'name') {
      return sortDir === 'asc'
        ? a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        : b.name.toLowerCase().localeCompare(a.name.toLowerCase())
    }
    const av = (a[sortKey] as number | null) ?? -1
    const bv = (b[sortKey] as number | null) ?? -1
    return sortDir === 'asc' ? av - bv : bv - av
  })

  // Footer totals — for computable columns use totals; for IS use weighted avg of non-null rows
  const totals = campaigns.reduce(
    (acc, c) => ({
      impressions:      acc.impressions      + c.impressions,
      clicks:           acc.clicks           + c.clicks,
      cost:             acc.cost             + c.cost,
      conversions:      acc.conversions      + c.conversions,
      conversions_value:acc.conversions_value+ c.conversions_value,
      all_conversions:  acc.all_conversions  + c.all_conversions,
      is_sum: acc.is_sum + (c.search_impression_share ?? 0),
      is_n:   acc.is_n   + (c.search_impression_share != null ? 1 : 0),
      ab_sum: acc.ab_sum + (c.search_abs_top_is ?? 0),
      ab_n:   acc.ab_n   + (c.search_abs_top_is != null ? 1 : 0),
      tp_sum: acc.tp_sum + (c.search_top_is ?? 0),
      tp_n:   acc.tp_n   + (c.search_top_is != null ? 1 : 0),
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversions_value: 0, all_conversions: 0,
      is_sum: 0, is_n: 0, ab_sum: 0, ab_n: 0, tp_sum: 0, tp_n: 0 }
  )
  const totalCtr      = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
  const totalConvRate = totals.clicks      > 0 ? (totals.conversions / totals.clicks) * 100 : 0
  const totalAvgCpc   = totals.clicks      > 0 ? totals.cost / totals.clicks : 0
  const totalCpConv   = totals.conversions > 0 ? totals.cost / totals.conversions : 0

  function footerVal(col: ColDef): string {
    const cur = currency
    switch (col.key) {
      case 'impressions':           return totals.impressions.toLocaleString()
      case 'clicks':                return totals.clicks.toLocaleString()
      case 'ctr':                   return `${totalCtr.toFixed(2)}%`
      case 'cost':                  return `${cur} ${totals.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
      case 'avg_cpc':               return totals.clicks > 0 ? `${cur} ${totalAvgCpc.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'
      case 'conversions':           return totals.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })
      case 'conversion_rate':       return `${totalConvRate.toFixed(2)}%`
      case 'cost_per_conversion':   return totals.conversions > 0 ? `${cur} ${totalCpConv.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'
      case 'conversions_value':     return `${cur} ${totals.conversions_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
      case 'all_conversions':       return totals.all_conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })
      case 'search_impression_share': return totals.is_n > 0 ? `${(totals.is_sum / totals.is_n).toFixed(1)}%` : '—'
      case 'search_abs_top_is':     return totals.ab_n > 0 ? `${(totals.ab_sum / totals.ab_n).toFixed(1)}%` : '—'
      case 'search_top_is':         return totals.tp_n > 0 ? `${(totals.tp_sum / totals.tp_n).toFixed(1)}%` : '—'
      default: return ''
    }
  }

  if (campaigns.length === 0) return (
    <div className="bg-white border border-cloud rounded-2xl p-12 text-center">
      <p className="text-2xl mb-3">📋</p>
      <p className="text-sm text-teal">No campaigns found for this period.</p>
    </div>
  )

  return (
    <div className="bg-white border border-cloud rounded-2xl overflow-hidden">

      {/* ── Toolbar ── */}
      <div className="px-5 py-2.5 border-b border-cloud/60 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-teal">{sorted.length} campaign{sorted.length !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          <ColumnPicker enabledKeys={colKeys} onChange={handleColChange} />
          <button
            onClick={() => exportCSV(sorted, currency, visibleCols)}
            className="text-[11px] font-bold text-navy/60 hover:text-navy border border-cloud hover:border-cyan/40 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
            title="Download campaigns as CSV"
          >
            ⬇ Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-auto max-h-[640px]">
        <table className="w-full text-sm min-w-[900px]">

          {/* ── Header ── */}
          <thead className="sticky top-0 z-10 bg-mist">
            <tr className="border-b border-cloud">
              <th
                className="text-left px-5 py-3.5 text-[10px] font-heading font-bold uppercase tracking-wider text-teal cursor-pointer hover:text-navy transition-colors select-none whitespace-nowrap"
                onClick={() => handleSort('name')}
              >
                Campaign <SortArrow active={sortKey === 'name'} dir={sortDir} />
              </th>
              <th className="text-left px-4 py-3.5 text-[10px] font-heading font-bold uppercase tracking-wider text-teal whitespace-nowrap">
                Status
              </th>
              <th className="text-right px-4 py-3.5 text-[10px] font-heading font-bold uppercase tracking-wider text-teal whitespace-nowrap">
                Daily Budget
              </th>
              {visibleCols.map(col => (
                <th
                  key={col.key}
                  className="px-4 py-3.5 text-[10px] font-heading font-bold uppercase tracking-wider text-teal cursor-pointer hover:text-navy transition-colors text-right select-none whitespace-nowrap"
                  onClick={() => handleSort(col.key)}
                >
                  {col.label} <SortArrow active={sortKey === col.key} dir={sortDir} />
                </th>
              ))}
              <th className="px-4 py-3.5 text-[10px] font-heading font-bold uppercase tracking-wider text-teal text-right whitespace-nowrap">
                Actions
              </th>
            </tr>
          </thead>

          {/* ── Rows ── */}
          <tbody className="divide-y divide-cloud">
            {sorted.map(c => {
              const ch          = CHANNEL_MAP[c.channel_type] ?? { icon: '📋', label: c.channel_type }
              const active      = isActive(c.status)
              const isDrillOpen = expandedId === c.id
              const learning    = isLearning(c)
              const pct         = learning ? learningPct(c.start_date) : 0

              return (
                <Fragment key={c.id}>
                  <tr className={`transition-colors ${isDrillOpen ? 'bg-cyan/5 border-l-2 border-l-cyan' : 'hover:bg-mist/50'}`}>

                    {/* Name + type (clickable — toggles inline drill-down) */}
                    <td
                      className="px-5 py-3.5 cursor-pointer group/name"
                      onClick={() => setExpandedId(id => id === c.id ? null : c.id)}
                      title="Click to expand ad groups & ads"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl leading-none flex-shrink-0" title={ch.label}>{ch.icon}</span>
                        <div className="min-w-0">
                          <p className="font-medium text-navy leading-snug truncate max-w-[240px] group-hover/name:text-cyan transition-colors" title={c.name}>
                            {c.name}
                          </p>
                          <p className="text-[10px] text-teal mt-0.5">{ch.label}</p>
                        </div>
                      </div>
                    </td>

                    {/* Status badge + learning bar */}
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        {active ? 'Active' : 'Paused'}
                      </span>
                      {learning && (
                        <div className="mt-1.5 min-w-[110px]">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Learning</span>
                            <span className="text-[9px] text-amber-500 tabular-nums">{pct}%</span>
                          </div>
                          <div className="h-1 bg-amber-100 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Daily budget (editable) */}
                    <td className="px-4 py-3.5 text-right">
                      <BudgetCell campaign={c} clientId={clientId} currency={currency} onUpdated={b => handleBudgetUpdate(c.id, b)} />
                    </td>

                    {/* Visible metric cells */}
                    {visibleCols.map(col => (
                      <td key={col.key} className="px-4 py-3.5 text-right tabular-nums text-navy/80 whitespace-nowrap">
                        {col.format(c, currency)}
                      </td>
                    ))}

                    {/* Pause / Resume */}
                    <td className="px-4 py-3.5 text-right">
                      <StatusToggleBtn
                        campaignId={c.id} clientId={clientId}
                        currentStatus={c.status} onStatusChange={handleStatusChange}
                      />
                    </td>
                  </tr>

                  {/* ── Inline drill-down — expands directly below the campaign row ── */}
                  {isDrillOpen && (
                    <tr>
                      <td colSpan={visibleCols.length + 4} className="p-0">
                        <div className="border-t-2 border-cyan/20 animate-in fade-in duration-150">
                          <CampaignDrillDown
                            campaignId={c.id}
                            campaignName={c.name}
                            clientId={clientId}
                            currency={currency}
                            startDate={startDate}
                            endDate={endDate}
                            channelType={c.channel_type}
                            onClose={() => setExpandedId(null)}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>

          {/* ── Totals footer ── */}
          <tfoot>
            <tr className="border-t-2 border-cloud/70 bg-mist">
              <td className="px-5 py-3.5">
                <p className="text-[11px] font-heading font-bold text-navy">Total</p>
                <p className="text-[10px] text-teal mt-0.5">{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}</p>
              </td>
              <td /><td />{/* Status · Daily Budget */}
              {visibleCols.map(col => (
                <td key={col.key} className="px-4 py-3.5 text-right tabular-nums font-bold text-navy text-xs whitespace-nowrap">
                  {footerVal(col)}
                </td>
              ))}
              <td />{/* Actions */}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
