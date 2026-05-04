'use client'
import { useState, useEffect, useRef } from 'react'
import type { AdGroupMetrics, AdData, AssetPerformance, AssetGroupMetrics } from '@/lib/google-ads'
import { SearchTermsTab } from '@/components/dashboard/SearchTermsTab'

// ─── Maps ──────────────────────────────────────────────────────────────────────
const AD_TYPE_MAP: Record<string, string> = {
  RESPONSIVE_SEARCH_AD: 'RSA', EXPANDED_TEXT_AD: 'ETA',
  CALL_ONLY_AD: 'Call Only', CALL_AD: 'Call Ad',
  RESPONSIVE_DISPLAY_AD: 'Display', SHOPPING_PRODUCT_AD: 'Shopping',
  VIDEO_AD: 'Video', SMART_CAMPAIGN_AD: 'Smart',
  '15': 'RSA', '2': 'ETA', '6': 'Call Only', '29': 'Call Ad',
  '19': 'Display', '10': 'Shopping', '12': 'Video', '25': 'Smart',
}

const STRENGTH_CFG: Record<string, { label: string; color: string; bg: string }> = {
  EXCELLENT: { label: 'Excellent', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  GOOD:      { label: 'Good',      color: 'text-cyan-700',    bg: 'bg-cyan/15'     },
  AVERAGE:   { label: 'Average',   color: 'text-amber-700',   bg: 'bg-amber-100'   },
  POOR:      { label: 'Poor',      color: 'text-red-700',     bg: 'bg-red-100'     },
  PENDING:   { label: 'Pending',   color: 'text-navy/50',     bg: 'bg-cloud'       },
  UNKNOWN:   { label: 'Unknown',   color: 'text-navy/40',     bg: 'bg-cloud'       },
}

const PERF_LABEL_CFG: Record<string, { dot: string; text: string; label: string }> = {
  BEST:     { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Best'     },
  GOOD:     { dot: 'bg-cyan-500',    text: 'text-cyan-700',    label: 'Good'     },
  LOW:      { dot: 'bg-red-400',     text: 'text-red-600',     label: 'Low'      },
  LEARNING: { dot: 'bg-amber-400',   text: 'text-amber-600',   label: 'Learning' },
  UNRATED:  { dot: 'bg-navy/20',     text: 'text-navy/40',     label: 'Unrated'  },
}

// ─── Asset chip background / border / text by performance label ───────────────
const ASSET_CHIP: Record<string, string> = {
  BEST:     'bg-emerald-50 border-emerald-200 text-emerald-800',
  GOOD:     'bg-cyan/10 border-cyan/30 text-cyan-800',
  LOW:      'bg-red-50 border-red-200 text-red-700',
  LEARNING: 'bg-amber-50 border-amber-200 text-amber-700',
  UNRATED:  'bg-cloud/60 border-cloud text-navy/50',
}

// ─── Ad strength sort order: worst (0) → best (5) ────────────────────────────
const STRENGTH_ORDER: Record<string, number> = {
  POOR: 0, AVERAGE: 1, GOOD: 2, EXCELLENT: 3, PENDING: 4, UNKNOWN: 5,
}

// ─── Derive one actionable hint from ad data ──────────────────────────────────
function getActionHint(ad: AdData): { icon: string; msg: string; level: 'error' | 'warn' | 'info' } | null {
  if ((AD_TYPE_MAP[ad.type] ?? ad.type) !== 'RSA') return null
  const s = ad.ad_strength
  const h = ad.headlines.length
  const d = ad.descriptions.length
  if (s === 'POOR') {
    if (h < 5) return { icon: '⚠️', msg: `Add ${5 - h} more headline${5 - h === 1 ? '' : 's'} — Poor strength needs at least 5`, level: 'error' }
    if (d < 2) return { icon: '⚠️', msg: 'Add at least 2 descriptions to reach Good strength', level: 'error' }
    return { icon: '⚠️', msg: 'Ad Strength is Poor — add unique, keyword-rich headlines and descriptions', level: 'error' }
  }
  if (s === 'AVERAGE') {
    if (h < 8) return { icon: '💡', msg: `Add ${8 - h} more headline${8 - h === 1 ? '' : 's'} to improve ad strength`, level: 'warn' }
    if (d < 3) return { icon: '💡', msg: 'Add a 3rd description — it gives Google more rotation options', level: 'warn' }
    return { icon: '💡', msg: 'Diversify headlines — avoid repeating similar phrases to improve strength', level: 'warn' }
  }
  if (h < 10) return { icon: '✨', msg: `${15 - h} headline slot${15 - h === 1 ? '' : 's'} unused — more options give Google better combinations`, level: 'info' }
  return null
}

// ─── Asset coverage progress bar (Headlines X/15, Descriptions X/4) ──────────
function AssetCoverageMeter({ label, current, max, warn }: {
  label: string; current: number; max: number; warn: number
}) {
  const pct = Math.min((current / max) * 100, 100)
  const low = current < warn
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal">{label}</p>
        <p className={`text-[10px] tabular-nums font-bold ${low ? 'text-amber-600' : 'text-navy/40'}`}>{current}/{max}</p>
      </div>
      <div className="h-1.5 bg-cloud rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${low ? 'bg-amber-400' : 'bg-cyan'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Ad-group column definitions ──────────────────────────────────────────────
type AgMetricKey = 'impressions' | 'clicks' | 'ctr' | 'cost' | 'conversions' | 'conversion_rate' | 'avg_cpc' | 'cost_per_conversion'

interface AgColDef {
  key:       AgMetricKey
  label:     string
  defaultOn: boolean
  sort:      AgSortCol | null  // null = not independently sortable (derived)
  format:    (g: AdGroupMetrics, currency: string) => string
  total?:    (groups: AdGroupMetrics[], currency: string) => string
}

const ALL_AG_COLS: AgColDef[] = [
  { key: 'impressions',         label: 'Impressions', defaultOn: true,  sort: 'impressions',
    format: g => g.impressions.toLocaleString(),
    total: gs => gs.reduce((s, g) => s + g.impressions, 0).toLocaleString() },
  { key: 'clicks',              label: 'Clicks',      defaultOn: true,  sort: 'clicks',
    format: g => g.clicks.toLocaleString(),
    total: gs => gs.reduce((s, g) => s + g.clicks, 0).toLocaleString() },
  { key: 'ctr',                 label: 'CTR',         defaultOn: true,  sort: 'ctr',
    format: g => `${g.ctr.toFixed(2)}%`,
    total: gs => {
      const imp = gs.reduce((s, g) => s + g.impressions, 0)
      const clk = gs.reduce((s, g) => s + g.clicks, 0)
      return imp > 0 ? `${((clk / imp) * 100).toFixed(2)}%` : '0.00%'
    }},
  { key: 'cost',                label: 'Cost',        defaultOn: true,  sort: 'cost',
    format: (g, cur) => `${cur} ${g.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    total: (gs, cur) => `${cur} ${gs.reduce((s, g) => s + g.cost, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
  { key: 'avg_cpc',             label: 'Avg. CPC',   defaultOn: false, sort: null,
    format: (g, cur) => g.clicks > 0 ? `${cur} ${(g.cost / g.clicks).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—',
    total: (gs, cur) => {
      const cost = gs.reduce((s, g) => s + g.cost, 0)
      const clk  = gs.reduce((s, g) => s + g.clicks, 0)
      return clk > 0 ? `${cur} ${(cost / clk).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'
    }},
  { key: 'conversions',         label: 'Conversions', defaultOn: true,  sort: 'conversions',
    format: g => g.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 }),
    total: gs => gs.reduce((s, g) => s + g.conversions, 0).toLocaleString(undefined, { maximumFractionDigits: 1 }) },
  { key: 'conversion_rate',     label: 'Conv. Rate',  defaultOn: true,  sort: 'conversion_rate',
    format: g => `${g.conversion_rate.toFixed(2)}%`,
    total: gs => {
      const clk  = gs.reduce((s, g) => s + g.clicks, 0)
      const conv = gs.reduce((s, g) => s + g.conversions, 0)
      return clk > 0 ? `${((conv / clk) * 100).toFixed(2)}%` : '0.00%'
    }},
  { key: 'cost_per_conversion', label: 'Cost/Conv',   defaultOn: false, sort: null,
    format: (g, cur) => g.conversions > 0 ? `${cur} ${(g.cost / g.conversions).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—',
    total: (gs, cur) => {
      const cost = gs.reduce((s, g) => s + g.cost, 0)
      const conv = gs.reduce((s, g) => s + g.conversions, 0)
      return conv > 0 ? `${cur} ${(cost / conv).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'
    }},
]

const DEFAULT_AG_COL_ORDER    = ALL_AG_COLS.map(c => c.key)
const DEFAULT_AG_ENABLED_KEYS = new Set(ALL_AG_COLS.filter(c => c.defaultOn).map(c => c.key))
const AG_LS_KEY = 'ws_adgroup_cols_v2'

function loadAgColState(): { order: string[]; enabled: Set<string> } {
  if (typeof window === 'undefined') return { order: DEFAULT_AG_COL_ORDER, enabled: DEFAULT_AG_ENABLED_KEYS }
  try {
    const raw = localStorage.getItem(AG_LS_KEY)
    if (!raw) return { order: DEFAULT_AG_COL_ORDER, enabled: DEFAULT_AG_ENABLED_KEYS }
    const { order, enabled } = JSON.parse(raw) as { order: string[]; enabled: string[] }
    const savedSet = new Set(order)
    const fullOrder = [...order, ...DEFAULT_AG_COL_ORDER.filter(k => !savedSet.has(k))]
    return { order: fullOrder, enabled: new Set(enabled) }
  } catch { return { order: DEFAULT_AG_COL_ORDER, enabled: DEFAULT_AG_ENABLED_KEYS } }
}

function saveAgColState(order: string[], enabled: Set<string>) {
  try { localStorage.setItem(AG_LS_KEY, JSON.stringify({ order, enabled: Array.from(enabled) })) } catch {}
}

// ─── Ad-group column picker (with drag-to-reorder) ────────────────────────────
function AgColumnPicker({ colOrder, enabledKeys, onChange }: {
  colOrder:    string[]
  enabledKeys: Set<string>
  onChange:    (order: string[], enabled: Set<string>) => void
}) {
  const [open,     setOpen]     = useState(false)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const dragIdx                 = useRef<number | null>(null)
  const ref                     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])

  function toggleEnabled(key: string, on: boolean) {
    const next = new Set(enabledKeys)
    on ? next.add(key) : next.delete(key)
    onChange(colOrder, next)
  }

  function handleDragStart(idx: number) { dragIdx.current = idx }
  function handleDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); setDragOver(idx) }
  function handleDrop(idx: number) {
    if (dragIdx.current === null || dragIdx.current === idx) { setDragOver(null); return }
    const next = [...colOrder]
    const [moved] = next.splice(dragIdx.current, 1)
    next.splice(idx, 0, moved)
    dragIdx.current = null; setDragOver(null)
    onChange(next, enabledKeys)
  }
  function handleDragEnd() { dragIdx.current = null; setDragOver(null) }

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
            Columns <span className="text-navy/30 font-normal normal-case tracking-normal ml-1">— drag to reorder</span>
          </p>
          <div className="space-y-0.5">
            {colOrder.map((key, idx) => {
              const col = ALL_AG_COLS.find(c => c.key === key)
              if (!col) return null
              return (
                <div
                  key={key}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-mist select-none transition-colors ${dragOver === idx ? 'border-t-2 border-cyan' : ''}`}
                >
                  <span className="text-navy/25 cursor-grab text-base leading-none flex-shrink-0" title="Drag to reorder">⠿</span>
                  <label className="flex items-center gap-2 flex-1 cursor-pointer">
                    <input
                      type="checkbox" checked={enabledKeys.has(key)}
                      onChange={e => toggleEnabled(key, e.target.checked)}
                      className="accent-cyan w-3.5 h-3.5 flex-shrink-0"
                    />
                    <span className="text-xs text-navy">{col.label}</span>
                  </label>
                </div>
              )
            })}
          </div>
          <div className="border-t border-cloud mt-2 pt-2 flex items-center gap-3 px-1">
            <button onClick={() => onChange([...DEFAULT_AG_COL_ORDER], new Set(DEFAULT_AG_ENABLED_KEYS))} className="text-[10px] text-navy/40 hover:text-navy transition-colors">Reset defaults</button>
            <button onClick={() => onChange(colOrder, new Set(ALL_AG_COLS.map(c => c.key)))} className="text-[10px] text-navy/40 hover:text-navy transition-colors">Show all</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Shared helpers ────────────────────────────────────────────────────────────
function isEnabled(status: string) { return status === 'ENABLED' || status === '2' }

function StatusBadge({ status }: { status: string }) {
  const on = isEnabled(status)
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${on ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${on ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {on ? 'Active' : 'Paused'}
    </span>
  )
}

function ToggleBtn({ active, loading, error, onToggle }: {
  active: boolean; loading: boolean; error: string; onToggle: () => void
}) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        onClick={onToggle}
        disabled={loading}
        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 whitespace-nowrap ${active ? 'border-amber-300 text-amber-700 hover:bg-amber-50' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}
      >
        {loading ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : active ? 'Pause' : 'Resume'}
      </button>
      {error && <p className="text-[9px] text-red-500 max-w-[100px] text-right leading-tight">{error}</p>}
    </div>
  )
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-heading font-bold uppercase tracking-wider text-teal mb-0.5">{label}</p>
      <p className="font-heading font-bold text-navy text-sm tabular-nums">{value}</p>
    </div>
  )
}

function PanelError({ msg }: { msg: string }) {
  return <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 mt-4">{msg}</div>
}

function PanelSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-teal text-sm">
      <div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
      {label}
    </div>
  )
}

// ─── Ad Group row with inline ads expansion ────────────────────────────────────
function AdGroupRow({ g, currency, clientId, campaignId, startDate, endDate, visibleCols }: {
  g: AdGroupMetrics; currency: string; clientId: string;
  campaignId: string; startDate: string; endDate: string
  visibleCols: AgColDef[]
}) {
  const [status,     setStatus]     = useState(g.status)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  // Inline ads panel state
  const [adsOpen,    setAdsOpen]    = useState(false)
  const [ads,        setAds]        = useState<AdData[]>([])
  const [adsLoading, setAdsLoading] = useState(false)
  const [adsError,   setAdsError]   = useState('')
  const [adsFetched, setAdsFetched] = useState(false)

  async function toggle() {
    const next = isEnabled(status) ? 'PAUSED' : 'ENABLED'
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/ad-group-status', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, ad_group_id: g.id, status: next }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setStatus(next)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function toggleAds() {
    const next = !adsOpen
    setAdsOpen(next)
    if (next && !adsFetched && !adsLoading) {
      setAdsLoading(true); setAdsError('')
      try {
        const res = await fetch(`/api/ads?client_account_id=${clientId}&campaign_id=${campaignId}&ad_group_id=${g.id}&start_date=${startDate}&end_date=${endDate}`)
        const d = await res.json()
        if (!res.ok) throw new Error(d.error)
        setAds(d.ads ?? [])
        setAdsFetched(true)
      } catch (e: any) { setAdsError(e.message) }
      finally { setAdsLoading(false) }
    }
  }

  return (
    <>
      <tr className={`transition-colors ${adsOpen ? 'bg-cyan/5' : 'hover:bg-mist/50'}`}>
        <td className="px-4 py-3 font-medium text-navy max-w-[220px]">
          <p className="truncate text-sm" title={g.name}>{g.name}</p>
        </td>
        <td className="px-4 py-3"><StatusBadge status={status} /></td>
        {visibleCols.map(col => (
          <td key={col.key} className="px-4 py-3 text-right tabular-nums text-sm text-navy/80 whitespace-nowrap">
            {col.format(g, currency)}
          </td>
        ))}
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={toggleAds}
              className={`text-[11px] font-bold border px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap ${adsOpen ? 'bg-cyan/10 border-cyan text-cyan' : 'text-cyan hover:text-cyan/70 border-cyan/30 hover:border-cyan'}`}
            >
              {adsOpen ? '▲ Ads' : 'Ads ▼'}
            </button>
            <ToggleBtn active={isEnabled(status)} loading={loading} error={error} onToggle={toggle} />
          </div>
        </td>
      </tr>
      {adsOpen && (
        <tr>
          <td colSpan={visibleCols.length + 3} className="p-0">
            <div className="bg-mist/40 border-b border-cloud px-5 py-4">
              <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-3">
                Ads in <span className="text-navy normal-case font-medium">{g.name}</span>
              </p>
              <AdsTab ads={ads} currency={currency} clientId={clientId} loading={adsLoading} error={adsError} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Ad Groups tab ─────────────────────────────────────────────────────────────
type AgSortCol = 'name' | 'impressions' | 'clicks' | 'ctr' | 'cost' | 'conversions' | 'conversion_rate'

function AdGroupsTab({ adGroups, currency, clientId, campaignId, startDate, endDate, loading, error }: {
  adGroups: AdGroupMetrics[]; currency: string; clientId: string;
  campaignId: string; startDate: string; endDate: string
  loading: boolean; error: string
}) {
  const [sortCol,      setSortCol]      = useState<AgSortCol>('cost')
  const [sortDir,      setSortDir]      = useState<'asc' | 'desc'>('desc')
  const [colOrder,     setColOrder]     = useState<string[]>(DEFAULT_AG_COL_ORDER)
  const [colKeys,      setColKeys]      = useState<Set<string>>(DEFAULT_AG_ENABLED_KEYS)
  const [showInactive, setShowInactive] = useState(true)

  // Load saved column state on mount
  useEffect(() => {
    const saved = loadAgColState()
    setColOrder(saved.order)
    setColKeys(saved.enabled)
  }, [])

  function handleColChange(nextOrder: string[], nextEnabled: Set<string>) {
    setColOrder(nextOrder); setColKeys(nextEnabled)
    saveAgColState(nextOrder, nextEnabled)
  }

  if (loading) return <PanelSpinner label="Loading ad groups…" />
  if (error)   return <PanelError msg={error} />
  if (adGroups.length === 0) return <div className="text-center py-16 text-teal text-sm">No ad groups found.</div>

  function toggleSort(col: AgSortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const visibleCols = colOrder
    .filter(k => colKeys.has(k))
    .map(k => ALL_AG_COLS.find(c => c.key === k))
    .filter((c): c is AgColDef => c !== undefined)

  const sorted = [...adGroups].sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol]
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
    return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })

  const visible = showInactive ? sorted : sorted.filter(g => isEnabled(g.status))

  function SortTh({ col, label, align = 'right' }: { col: AgSortCol; label: string; align?: 'left' | 'right' }) {
    const active = sortCol === col
    return (
      <th className={`px-4 py-3 text-${align}`}>
        <button
          onClick={() => toggleSort(col)}
          className={`inline-flex items-center gap-1 text-[10px] font-heading font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${active ? 'text-cyan' : 'text-teal hover:text-navy'}`}
        >
          {align === 'right' && active && <span className="text-[9px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
          {label}
          {align === 'left' && active && <span className="text-[9px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
        </button>
      </th>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-teal">
          {visible.length} ad group{visible.length !== 1 ? 's' : ''}
          {!showInactive && sorted.length !== visible.length && (
            <span className="ml-1.5 text-amber-600">({sorted.length - visible.length} hidden)</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInactive(s => !s)}
            className={`text-[11px] font-bold border px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${!showInactive ? 'bg-amber-50 text-amber-700 border-amber-300' : 'text-navy/60 hover:text-navy border-cloud hover:border-cyan/40'}`}
            title={showInactive ? 'Hide paused ad groups' : 'Show all ad groups'}
          >
            {showInactive ? '◉ Hide Inactive' : '◎ Show Inactive'}
          </button>
          <AgColumnPicker colOrder={colOrder} enabledKeys={colKeys} onChange={handleColChange} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-cloud">
              <SortTh col="name" label="Ad Group" align="left" />
              <th className="px-4 py-3 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Status</th>
              {visibleCols.map(col => (
                col.sort ? (
                  <SortTh key={col.key} col={col.sort as AgSortCol} label={col.label} />
                ) : (
                  <th key={col.key} className="px-4 py-3 text-right text-[10px] font-heading font-bold uppercase tracking-wider text-teal whitespace-nowrap">
                    {col.label}
                  </th>
                )
              ))}
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-cloud">
            {visible.map(g => (
              <AdGroupRow key={g.id} g={g} currency={currency} clientId={clientId} campaignId={campaignId} startDate={startDate} endDate={endDate} visibleCols={visibleCols} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-cloud/70 bg-mist">
              <td className="px-4 py-3 text-[11px] font-heading font-bold text-navy">
                Total · {visible.length} group{visible.length !== 1 ? 's' : ''}
              </td>
              <td />
              {visibleCols.map(col => (
                <td key={col.key} className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums whitespace-nowrap">
                  {col.total ? col.total(visible, currency) : ''}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─── Asset Groups tab (Performance Max) ───────────────────────────────────────
type AgxSortCol = 'name' | 'impressions' | 'clicks' | 'ctr' | 'cost' | 'conversions' | 'conversion_rate'

function AssetGroupsTab({ assetGroups, currency, loading, error }: {
  assetGroups: AssetGroupMetrics[]; currency: string; loading: boolean; error: string
}) {
  const [sortCol, setSortCol] = useState<AgxSortCol>('cost')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  if (loading) return <PanelSpinner label="Loading asset groups…" />
  if (error)   return <PanelError msg={error} />
  if (assetGroups.length === 0) return <div className="text-center py-16 text-teal text-sm">No asset groups found for this period.</div>

  function toggleSort(col: AgxSortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const sorted = [...assetGroups].sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol]
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
    return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })

  const totals = assetGroups.reduce(
    (acc, g) => ({ impressions: acc.impressions + g.impressions, clicks: acc.clicks + g.clicks, cost: acc.cost + g.cost, conversions: acc.conversions + g.conversions }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
  )

  function SortTh({ col, label, align = 'right' }: { col: AgxSortCol; label: string; align?: 'left' | 'right' }) {
    const active = sortCol === col
    return (
      <th className={`px-4 py-3 text-${align}`}>
        <button
          onClick={() => toggleSort(col)}
          className={`inline-flex items-center gap-1 text-[10px] font-heading font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${active ? 'text-cyan' : 'text-teal hover:text-navy'}`}
        >
          {align === 'right' && active && <span className="text-[9px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
          {label}
          {align === 'left' && active && <span className="text-[9px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
        </button>
      </th>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
        <span className="text-sm flex-shrink-0">⚡</span>
        <p className="text-[11px] text-amber-800">Performance Max campaigns use <strong>Asset Groups</strong> instead of traditional ad groups. Each asset group contains headlines, descriptions, images, and videos that Google assembles into ads automatically.</p>
      </div>
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className="border-b border-cloud">
            <SortTh col="name"            label="Asset Group"  align="left" />
            <th className="px-4 py-3 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Status</th>
            <SortTh col="impressions"     label="Impressions" />
            <SortTh col="clicks"          label="Clicks" />
            <SortTh col="ctr"             label="CTR" />
            <SortTh col="cost"            label="Cost" />
            <SortTh col="conversions"     label="Conversions" />
            <SortTh col="conversion_rate" label="Conv. Rate" />
          </tr>
        </thead>
        <tbody className="divide-y divide-cloud">
          {sorted.map(g => (
            <tr key={g.id} className="hover:bg-mist/50 transition-colors">
              <td className="px-4 py-3 max-w-[240px]">
                <p className="font-medium text-navy text-sm truncate" title={g.name}>{g.name}</p>
                {g.final_urls[0] && (
                  <p className="text-[10px] text-teal truncate mt-0.5" title={g.final_urls[0]}>🌐 {g.final_urls[0]}</p>
                )}
              </td>
              <td className="px-4 py-3"><StatusBadge status={g.status} /></td>
              <td className="px-4 py-3 text-right tabular-nums text-sm text-navy/80">{g.impressions.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tabular-nums text-sm text-navy/80">{g.clicks.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tabular-nums text-sm text-navy/80">{g.ctr.toFixed(2)}%</td>
              <td className="px-4 py-3 text-right tabular-nums text-sm text-navy/80">
                {currency} {g.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-sm text-navy/80">{g.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
              <td className="px-4 py-3 text-right tabular-nums text-sm text-navy/80">{g.conversion_rate.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-cloud/70 bg-mist">
            <td className="px-4 py-3 text-[11px] font-heading font-bold text-navy">Total · {assetGroups.length} asset group{assetGroups.length !== 1 ? 's' : ''}</td>
            <td />
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">{totals.impressions.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">{totals.clicks.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">{totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : '0.00'}%</td>
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">{currency} {totals.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">{totals.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">{totals.clicks > 0 ? ((totals.conversions / totals.clicks) * 100).toFixed(2) : '0.00'}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Ad strength badge ─────────────────────────────────────────────────────────
function AdStrengthBadge({ strength }: { strength: string }) {
  const cfg = STRENGTH_CFG[strength] ?? STRENGTH_CFG.UNKNOWN
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
      Ad Strength: {cfg.label}
    </span>
  )
}

// ─── Performance label chip ────────────────────────────────────────────────────
function PerfChip({ label }: { label: string }) {
  const cfg = PERF_LABEL_CFG[label] ?? PERF_LABEL_CFG.UNRATED
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ─── RSA inline editor ─────────────────────────────────────────────────────────
function AdEditor({ ad, clientId, assets, onSaved, onCancel }: {
  ad: AdData; clientId: string; assets: AssetPerformance[]
  onSaved: (h: string[], d: string[]) => void; onCancel: () => void
}) {
  const [headlines,    setHeadlines]    = useState<string[]>([...ad.headlines])
  const [descriptions, setDescriptions] = useState<string[]>([...ad.descriptions])
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  // Map original text → performance label (only original, unmodified text gets a label)
  const assetMap = new Map(assets.map(a => [a.text, a.label]))

  async function save() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/ad-assets', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, ad_group_id: ad.ad_group_id, ad_id: ad.id, headlines, descriptions }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      onSaved(headlines, descriptions)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  function setHeadline(i: number, v: string) { setHeadlines(prev => prev.map((h, idx) => idx === i ? v : h)) }
  function addHeadline() { if (headlines.length < 15) setHeadlines(p => [...p, '']) }
  function removeHeadline(i: number) { if (headlines.length > 3) setHeadlines(p => p.filter((_, idx) => idx !== i)) }

  function setDescription(i: number, v: string) { setDescriptions(prev => prev.map((d, idx) => idx === i ? v : d)) }
  function addDescription() { if (descriptions.length < 4) setDescriptions(p => [...p, '']) }
  function removeDescription(i: number) { if (descriptions.length > 2) setDescriptions(p => p.filter((_, idx) => idx !== i)) }

  return (
    <div className="space-y-5">

      {/* Performance context banner (only shown if we have data) */}
      {assets.length > 0 && (
        <div className="flex items-center gap-2 bg-cyan/5 border border-cyan/20 rounded-xl px-3 py-2">
          <span className="text-sm">📊</span>
          <p className="text-[11px] text-teal">Performance labels are shown next to each asset based on your campaign data. Labels only appear for unchanged text.</p>
        </div>
      )}

      {/* Headlines */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal">
            Headlines <span className="text-navy/40 font-normal normal-case tracking-normal">({headlines.length}/15, min 3)</span>
          </p>
          {headlines.length < 15 && (
            <button onClick={addHeadline} className="text-[11px] font-bold text-cyan hover:text-cyan/70 transition-colors">+ Add</button>
          )}
        </div>
        <div className="space-y-2">
          {headlines.map((h, i) => {
            const perfLabel = assetMap.get(h)
            return (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <input
                    value={h}
                    maxLength={30}
                    onChange={e => setHeadline(i, e.target.value)}
                    className={`w-full border rounded-lg px-3 py-1.5 text-sm text-navy focus:outline-none focus:border-cyan bg-white pr-14 ${h.length > 30 ? 'border-red-400' : 'border-cloud'}`}
                    placeholder={`Headline ${i + 1}`}
                  />
                  <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] tabular-nums ${h.length > 28 ? 'text-amber-500' : 'text-navy/30'}`}>
                    {h.length}/30
                  </span>
                </div>
                {perfLabel && <PerfChip label={perfLabel} />}
                {headlines.length > 3 && (
                  <button onClick={() => removeHeadline(i)} className="text-navy/30 hover:text-red-500 transition-colors text-sm px-1 flex-shrink-0">✕</button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Descriptions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal">
            Descriptions <span className="text-navy/40 font-normal normal-case tracking-normal">({descriptions.length}/4, min 2)</span>
          </p>
          {descriptions.length < 4 && (
            <button onClick={addDescription} className="text-[11px] font-bold text-cyan hover:text-cyan/70 transition-colors">+ Add</button>
          )}
        </div>
        <div className="space-y-2">
          {descriptions.map((d, i) => {
            const perfLabel = assetMap.get(d)
            return (
              <div key={i} className="flex items-start gap-2">
                <div className="flex-1 relative">
                  <textarea
                    rows={2}
                    value={d}
                    maxLength={90}
                    onChange={e => setDescription(i, e.target.value)}
                    className={`w-full border rounded-lg px-3 py-1.5 text-sm text-navy focus:outline-none focus:border-cyan bg-white resize-none pr-14 ${d.length > 90 ? 'border-red-400' : 'border-cloud'}`}
                    placeholder={`Description ${i + 1}`}
                  />
                  <span className={`absolute right-2.5 bottom-2 text-[10px] tabular-nums ${d.length > 85 ? 'text-amber-500' : 'text-navy/30'}`}>
                    {d.length}/90
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1 pt-1 flex-shrink-0">
                  {perfLabel && <PerfChip label={perfLabel} />}
                  {descriptions.length > 2 && (
                    <button onClick={() => removeDescription(i)} className="text-navy/30 hover:text-red-500 transition-colors text-sm px-1">✕</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {error && <PanelError msg={error} />}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="bg-cyan text-navy font-heading font-bold text-sm px-5 py-2 rounded-xl hover:bg-cyan/80 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Ad'}
        </button>
        <button onClick={onCancel} className="text-sm text-navy/50 hover:text-navy transition-colors">Cancel</button>
      </div>
    </div>
  )
}

// ─── Single ad card ────────────────────────────────────────────────────────────
function AdCard({ ad: initialAd, clientId, currency, autoLoad = false }: {
  ad: AdData; clientId: string; currency: string; autoLoad?: boolean
}) {
  const [ad,       setAd]       = useState(initialAd)
  const [status,   setStatus]   = useState(initialAd.status)
  const [editing,  setEditing]  = useState(false)
  const [toggling, setToggling] = useState(false)
  const [toggleErr,setToggleErr]= useState('')

  // Asset performance
  const [assets,      setAssets]      = useState<AssetPerformance[]>([])
  const [assetsLoaded,setAssetsLoaded]= useState(false)
  const [assetsLoad,  setAssetsLoad]  = useState(false)
  const [assetsErr,   setAssetsErr]   = useState('')
  const [showInsights,setShowInsights]= useState(false)

  const typeLabel = AD_TYPE_MAP[ad.type] ?? ad.type
  const isRSA     = typeLabel === 'RSA'

  // Auto-load asset performance for RSA ads when requested by the parent tab
  useEffect(() => {
    if (!autoLoad || !isRSA || assetsLoaded || assetsLoad) return
    setAssetsLoad(true); setAssetsErr('')
    fetch(`/api/ad-assets?client_account_id=${clientId}&ad_group_id=${ad.ad_group_id}&ad_id=${ad.id}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setAssets(d.assets ?? []); setAssetsLoaded(true) })
      .catch(e => setAssetsErr(e.message))
      .finally(() => setAssetsLoad(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, isRSA])

  async function toggleStatus() {
    const next = isEnabled(status) ? 'PAUSED' : 'ENABLED'
    setToggling(true); setToggleErr('')
    try {
      const res = await fetch('/api/ad-status', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, ad_group_id: ad.ad_group_id, ad_id: ad.id, status: next }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setStatus(next)
    } catch (e: any) { setToggleErr(e.message) }
    finally { setToggling(false) }
  }

  async function fetchAssets(): Promise<AssetPerformance[]> {
    if (assetsLoaded) return assets
    setAssetsLoad(true); setAssetsErr('')
    try {
      const res = await fetch(`/api/ad-assets?client_account_id=${clientId}&ad_group_id=${ad.ad_group_id}&ad_id=${ad.id}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      const loaded: AssetPerformance[] = d.assets ?? []
      setAssets(loaded)
      setAssetsLoaded(true)
      return loaded
    } catch (e: any) { setAssetsErr(e.message); return [] }
    finally { setAssetsLoad(false) }
  }

  async function loadInsights() {
    if (assetsLoaded) { setShowInsights(s => !s); return }
    await fetchAssets()
    setShowInsights(true)
  }

  async function openEditor() {
    setEditing(true)
    // Pre-load performance data so labels appear immediately in the editor
    if (!assetsLoaded) fetchAssets()
  }

  // Build asset lookup map: text → label
  const assetMap = new Map(assets.map(a => [a.text, a.label]))

  // Merge performance data into headline/description lists
  function labeledItems(items: string[]) {
    return items.map(text => ({ text, label: assetMap.get(text) ?? 'UNRATED' }))
  }

  const hint         = !editing ? getActionHint(ad) : null
  const noImpressions = isEnabled(status) && ad.impressions === 0

  return (
    <div className="border border-cloud rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-mist px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-[11px] font-bold bg-navy/10 text-navy px-2.5 py-1 rounded-full">{typeLabel}</span>
          <AdStrengthBadge strength={ad.ad_strength} />
          {noImpressions && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
              ⚠️ No impressions
            </span>
          )}
          <p className="text-xs text-teal truncate" title={ad.ad_group_name}>Ad Group: {ad.ad_group_name}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={status} />
          <ToggleBtn active={isEnabled(status)} loading={toggling} error={toggleErr} onToggle={toggleStatus} />
        </div>
      </div>

      {/* Action hint banner */}
      {hint && (
        <div className={`flex items-center gap-2 px-5 py-2.5 border-b border-cloud text-xs font-medium ${hint.level === 'error' ? 'bg-red-50 text-red-700' : hint.level === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-cyan/5 text-teal'}`}>
          <span className="flex-shrink-0">{hint.icon}</span>
          <span>{hint.msg}</span>
        </div>
      )}

      {/* Body */}
      <div className="px-5 py-4 border-b border-cloud space-y-4">
        {editing ? (
          <AdEditor
            ad={ad}
            clientId={clientId}
            assets={assets}
            onSaved={(h, d) => { setAd(prev => ({ ...prev, headlines: h, descriptions: d })); setEditing(false) }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            {/* URL */}
            {ad.final_url && (
              <p className="text-[11px] text-emerald-700 truncate" title={ad.final_url}>🌐 {ad.final_url}</p>
            )}

            {/* Asset coverage meters (RSA only) */}
            {isRSA && (
              <div className="flex gap-4">
                <AssetCoverageMeter label="Headlines"    current={ad.headlines.length}    max={15} warn={8} />
                <AssetCoverageMeter label="Descriptions" current={ad.descriptions.length} max={4}  warn={3} />
              </div>
            )}

            {/* Headlines */}
            {ad.headlines.length > 0 && (
              <div>
                <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-2">
                  Headlines
                  {isRSA && <span className="ml-1 text-navy/30 font-normal normal-case tracking-normal">({ad.headlines.length})</span>}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {labeledItems(ad.headlines).map(({ text, label }, i) => {
                    const chipCls = assetsLoaded
                      ? (ASSET_CHIP[label] ?? ASSET_CHIP.UNRATED)
                      : 'bg-cyan/10 border-cyan/20 text-navy'
                    return (
                      <span key={i} className={`text-xs px-2.5 py-1 rounded-lg border inline-block transition-colors ${chipCls}`}>
                        {text}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Descriptions */}
            {ad.descriptions.length > 0 && (
              <div>
                <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-2">Descriptions</p>
                <div className="space-y-2">
                  {labeledItems(ad.descriptions).map(({ text, label }, i) => {
                    const chipCls = assetsLoaded ? (ASSET_CHIP[label] ?? ASSET_CHIP.UNRATED) : ''
                    return (
                      <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-lg border transition-colors ${assetsLoaded ? chipCls : 'border-transparent'}`}>
                        <p className="text-xs leading-relaxed flex-1">{text}</p>
                        {assetsLoaded && <div className="flex-shrink-0"><PerfChip label={label} /></div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-1 flex-wrap">
              {isRSA && (
                <button
                  onClick={openEditor}
                  className="text-xs font-bold text-cyan hover:text-cyan/70 border border-cyan/30 hover:border-cyan px-3 py-1.5 rounded-lg transition-all"
                >
                  ✏️ Edit Ad
                </button>
              )}
              <button
                onClick={loadInsights}
                disabled={assetsLoad}
                className="text-xs font-bold text-navy/60 hover:text-navy border border-cloud hover:border-cyan/40 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
              >
                {assetsLoad ? '…' : showInsights ? '📊 Hide Insights' : '📊 Show Performance Insights'}
              </button>
            </div>

            {assetsErr && <PanelError msg={assetsErr} />}

            {/* Insights panel */}
            {showInsights && assetsLoaded && (
              <div className="border-t border-cloud/60 pt-4 mt-2">
                <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-3">Performance Insights</p>
                {assets.length === 0 ? (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                    <span className="text-sm flex-shrink-0">ℹ️</span>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      No asset data returned. This usually means the ad hasn't served enough impressions yet, or the ad type doesn't support asset-level reporting.
                    </p>
                  </div>
                ) : (() => {
                  // After backend normalisation, labels are only: BEST | GOOD | LOW | LEARNING | UNRATED
                  const LABEL_ORDER = { BEST: 0, GOOD: 1, LOW: 2, LEARNING: 3, UNRATED: 4 }
                  const hasPerformance = assets.some(a => a.label === 'BEST' || a.label === 'GOOD' || a.label === 'LOW')
                  const allLearning    = !hasPerformance && assets.some(a => a.label === 'LEARNING')
                  const allUnrated     = !hasPerformance && !allLearning
                  return (
                    <>
                      {allUnrated && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4">
                          <span className="text-sm flex-shrink-0">ℹ️</span>
                          <p className="text-xs text-amber-800 leading-relaxed">
                            <strong>All assets are Unrated</strong> — Google needs roughly <strong>5,000 impressions per asset</strong> before assigning BEST / GOOD / LOW labels. Check back once the campaign has more traffic.
                          </p>
                        </div>
                      )}
                      {allLearning && (
                        <div className="flex items-start gap-2 bg-cyan/5 border border-cyan/20 rounded-xl px-3 py-2.5 mb-4">
                          <span className="text-sm flex-shrink-0">🔄</span>
                          <p className="text-xs text-teal leading-relaxed">
                            <strong>Assets are in the Learning phase</strong> — Google is actively collecting impression data. Performance labels (BEST / GOOD / LOW) will appear once sufficient data is gathered.
                          </p>
                        </div>
                      )}
                      <div className="grid sm:grid-cols-2 gap-5">
                        {(['HEADLINE', 'DESCRIPTION'] as const).map(fieldType => {
                          const filtered = assets.filter(a => a.field_type === fieldType)
                          if (filtered.length === 0) return null
                          const sortedAssets = [...filtered].sort((a, b) =>
                            (LABEL_ORDER[a.label as keyof typeof LABEL_ORDER] ?? 4) -
                            (LABEL_ORDER[b.label as keyof typeof LABEL_ORDER] ?? 4)
                          )
                          return (
                            <div key={fieldType}>
                              <p className="text-[10px] font-bold text-navy/50 uppercase tracking-wider mb-2">
                                {fieldType === 'HEADLINE' ? `Headlines (${filtered.length})` : `Descriptions (${filtered.length})`}
                              </p>
                              <div className="divide-y divide-cloud/60">
                                {sortedAssets.map((a, i) => (
                                  <div key={i} className="flex items-center justify-between gap-3 py-1.5">
                                    <p className="text-xs text-navy/75 leading-snug flex-1 min-w-0">{a.text}</p>
                                    <div className="flex-shrink-0"><PerfChip label={a.label} /></div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
          </>
        )}
      </div>

      {/* Metrics */}
      <div className="px-5 py-3.5 grid grid-cols-4 gap-4">
        <MetricCell label="Impressions" value={ad.impressions.toLocaleString()} />
        <MetricCell label="Clicks"      value={ad.clicks.toLocaleString()} />
        <MetricCell label="CTR"         value={`${ad.ctr.toFixed(2)}%`} />
        <MetricCell label="Cost"        value={`${currency} ${ad.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
      </div>
    </div>
  )
}

// ─── Ads tab ───────────────────────────────────────────────────────────────────
type AdSortBy = 'strength' | 'impressions' | 'clicks' | 'cost' | 'ctr'
type AdFilter = '' | 'POOR' | 'AVERAGE' | 'GOOD' | 'EXCELLENT' | 'no_impressions'

function AdsTab({ ads, currency, clientId, loading, error }: {
  ads: AdData[]; currency: string; clientId: string; loading: boolean; error: string
}) {
  const [sortBy,         setSortBy]         = useState<AdSortBy>('strength')
  const [filterStrength, setFilterStrength] = useState<AdFilter>('')
  const [showInactive,   setShowInactive]   = useState(true)

  if (loading) return <PanelSpinner label="Loading ads…" />
  if (error)   return <PanelError msg={error} />
  if (ads.length === 0) return <div className="text-center py-16 text-teal text-sm">No ads found for this period.</div>

  // Inactive filter applied first
  const activeAds = showInactive ? ads : ads.filter(a => isEnabled(a.status))

  // Optimisation summary counts (always from full list)
  const poorOrAvg     = ads.filter(a => a.ad_strength === 'POOR' || a.ad_strength === 'AVERAGE')
  const zeroImprAds   = ads.filter(a => isEnabled(a.status) && a.impressions === 0)

  // Apply strength filter on top of inactive filter
  const filtered = activeAds.filter(a => {
    if (!filterStrength) return true
    if (filterStrength === 'no_impressions') return isEnabled(a.status) && a.impressions === 0
    return a.ad_strength === filterStrength
  })

  // Apply sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'strength')    return (STRENGTH_ORDER[a.ad_strength] ?? 5) - (STRENGTH_ORDER[b.ad_strength] ?? 5)
    if (sortBy === 'impressions') return b.impressions - a.impressions
    if (sortBy === 'clicks')      return b.clicks - a.clicks
    if (sortBy === 'cost')        return b.cost - a.cost
    if (sortBy === 'ctr')         return b.ctr - a.ctr
    return 0
  })

  const FILTERS: { value: AdFilter; label: string }[] = [
    { value: '',               label: 'All' },
    { value: 'POOR',           label: '🔴 Poor' },
    { value: 'AVERAGE',        label: '🟡 Average' },
    { value: 'GOOD',           label: '🟢 Good' },
    { value: 'EXCELLENT',      label: '⭐ Excellent' },
    { value: 'no_impressions', label: '⚠️ No impressions' },
  ]

  return (
    <div className="space-y-4">

      {/* Optimisation summary banner */}
      {(poorOrAvg.length > 0 || zeroImprAds.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
          <span className="text-sm flex-shrink-0 mt-0.5">🔍</span>
          <div className="text-xs text-amber-800 space-y-0.5">
            {poorOrAvg.length > 0 && (
              <p><strong>{poorOrAvg.length} ad{poorOrAvg.length !== 1 ? 's' : ''}</strong> have Poor or Average strength — expand each card for specific improvement tips.</p>
            )}
            {zeroImprAds.length > 0 && (
              <p><strong>{zeroImprAds.length} active ad{zeroImprAds.length !== 1 ? 's' : ''}</strong> have zero impressions — check bid strategy, targeting, or ad approval status.</p>
            )}
          </div>
        </div>
      )}

      {/* Sort + filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setShowInactive(s => !s)}
          className={`text-[11px] font-bold border px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${!showInactive ? 'bg-amber-50 text-amber-700 border-amber-300' : 'text-navy/60 hover:text-navy border-cloud hover:border-cyan/40'}`}
          title={showInactive ? 'Hide paused ads' : 'Show all ads'}
        >
          {showInactive ? '◉ Hide Inactive' : '◎ Show Inactive'}
        </button>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal whitespace-nowrap">Sort by</label>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as AdSortBy)}
            className="text-xs border border-cloud rounded-lg px-2.5 py-1.5 text-navy focus:outline-none focus:border-cyan bg-white"
          >
            <option value="strength">Ad Strength (worst first)</option>
            <option value="impressions">Impressions</option>
            <option value="clicks">Clicks</option>
            <option value="cost">Cost</option>
            <option value="ctr">CTR</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilterStrength(f.value)}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap ${filterStrength === f.value ? 'bg-cyan text-navy border-cyan' : 'border-cloud text-navy/60 hover:border-cyan/40 hover:text-navy'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Result count when filtered */}
      {filterStrength && (
        <p className="text-[11px] text-teal">{sorted.length} of {ads.length} ad{ads.length !== 1 ? 's' : ''} shown</p>
      )}

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-teal text-sm">No ads match this filter.</div>
      ) : sorted.map(ad => (
        <AdCard key={ad.id} ad={ad} clientId={clientId} currency={currency} autoLoad />
      ))}
    </div>
  )
}

// ─── Main drill-down panel ─────────────────────────────────────────────────────
type DrillTab = 'groups' | 'search_terms'

interface Props {
  campaignId:   string
  campaignName: string
  clientId:     string
  currency:     string
  startDate:    string
  endDate:      string
  channelType:  string
  onClose:      () => void
}

export function CampaignDrillDown({ campaignId, campaignName, clientId, currency, startDate, endDate, channelType, onClose }: Props) {
  const isPMax = channelType === 'PERFORMANCE_MAX' || channelType === '10'

  const [activeTab, setActiveTab] = useState<DrillTab>('groups')

  // Ad groups (non-PMax)
  const [adGroups,  setAdGroups]  = useState<AdGroupMetrics[]>([])
  const [agLoading, setAgLoading] = useState(false)
  const [agError,   setAgError]   = useState('')
  const [agFetched, setAgFetched] = useState(false)

  // Asset groups (Performance Max)
  const [assetGroups,  setAssetGroups]  = useState<AssetGroupMetrics[]>([])
  const [axLoading,    setAxLoading]    = useState(false)
  const [axError,      setAxError]      = useState('')
  const [axFetched,    setAxFetched]    = useState(false)

  // Fetch ad groups on mount (non-PMax)
  useEffect(() => {
    if (isPMax || agFetched) return
    setAgLoading(true); setAgError('')
    fetch(`/api/ad-groups?client_account_id=${clientId}&campaign_id=${campaignId}&start_date=${startDate}&end_date=${endDate}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setAdGroups(d.adGroups ?? []); setAgFetched(true) })
      .catch(e => setAgError(String(e)))
      .finally(() => setAgLoading(false))
  }, [agFetched, isPMax, clientId, campaignId, startDate, endDate])

  // Fetch asset groups on mount (PMax only)
  useEffect(() => {
    if (!isPMax || axFetched) return
    setAxLoading(true); setAxError('')
    fetch(`/api/asset-groups?client_account_id=${clientId}&campaign_id=${campaignId}&start_date=${startDate}&end_date=${endDate}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setAssetGroups(d.assetGroups ?? []); setAxFetched(true) })
      .catch(e => setAxError(String(e)))
      .finally(() => setAxLoading(false))
  }, [axFetched, isPMax, clientId, campaignId, startDate, endDate])

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const groupsLabel = isPMax ? 'Asset Groups' : 'Ad Groups'

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-cloud bg-mist">
        <div className="flex items-center gap-2.5 min-w-0">
          <p className="font-heading font-bold text-navy text-sm truncate" title={campaignName}>{campaignName}</p>
          {isPMax && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex-shrink-0">⚡ PMax</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-cloud text-navy/40 hover:text-navy text-lg transition-colors flex-shrink-0"
          title="Close"
        >
          ×
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 px-5 pt-4 pb-0 border-b border-cloud">
        {([
          { id: 'groups'       as DrillTab, label: groupsLabel },
          { id: 'search_terms' as DrillTab, label: '🔍 Search Terms' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-heading font-bold rounded-t-lg border-b-2 transition-all -mb-px whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-cyan text-cyan bg-cyan/5'
                : 'border-transparent text-navy/50 hover:text-navy hover:border-cloud'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="p-5">
        {activeTab === 'groups' ? (
          isPMax ? (
            <AssetGroupsTab assetGroups={assetGroups} currency={currency} loading={axLoading} error={axError} />
          ) : (
            <AdGroupsTab
              adGroups={adGroups}
              currency={currency}
              clientId={clientId}
              campaignId={campaignId}
              startDate={startDate}
              endDate={endDate}
              loading={agLoading}
              error={agError}
            />
          )
        ) : (
          <SearchTermsTab
            clientId={clientId}
            startDate={startDate}
            endDate={endDate}
            currency={currency}
            campaignId={campaignId}
          />
        )}
      </div>
    </div>
  )
}
