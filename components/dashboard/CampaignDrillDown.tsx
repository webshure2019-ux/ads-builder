'use client'
import { useState, useEffect } from 'react'
import type { AdGroupMetrics, AdData, AssetPerformance, AssetGroupMetrics } from '@/lib/google-ads'

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

// ─── Ad Group row with its own pause/resume state ─────────────────────────────
function AdGroupRow({ g, currency, clientId }: { g: AdGroupMetrics; currency: string; clientId: string }) {
  const [status,  setStatus]  = useState(g.status)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

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

  return (
    <tr className="hover:bg-mist/50 transition-colors">
      <td className="px-4 py-3 font-medium text-navy max-w-[220px]">
        <p className="truncate text-sm" title={g.name}>{g.name}</p>
      </td>
      <td className="px-4 py-3"><StatusBadge status={status} /></td>
      <td className="px-4 py-3 text-right tabular-nums text-sm text-navy/80">{g.impressions.toLocaleString()}</td>
      <td className="px-4 py-3 text-right tabular-nums text-sm text-navy/80">{g.clicks.toLocaleString()}</td>
      <td className="px-4 py-3 text-right tabular-nums text-sm text-navy/80">{g.ctr.toFixed(2)}%</td>
      <td className="px-4 py-3 text-right tabular-nums text-sm text-navy/80">
        {currency} {g.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-sm text-navy/80">{g.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
      <td className="px-4 py-3 text-right tabular-nums text-sm text-navy/80">{g.conversion_rate.toFixed(2)}%</td>
      <td className="px-4 py-3 text-right">
        <ToggleBtn active={isEnabled(status)} loading={loading} error={error} onToggle={toggle} />
      </td>
    </tr>
  )
}

// ─── Ad Groups tab ─────────────────────────────────────────────────────────────
type AgSortCol = 'name' | 'impressions' | 'clicks' | 'ctr' | 'cost' | 'conversions' | 'conversion_rate'

function AdGroupsTab({ adGroups, currency, clientId, loading, error }: {
  adGroups: AdGroupMetrics[]; currency: string; clientId: string; loading: boolean; error: string
}) {
  const [sortCol, setSortCol] = useState<AgSortCol>('cost')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  if (loading) return <PanelSpinner label="Loading ad groups…" />
  if (error)   return <PanelError msg={error} />
  if (adGroups.length === 0) return <div className="text-center py-16 text-teal text-sm">No ad groups found.</div>

  function toggleSort(col: AgSortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const sorted = [...adGroups].sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol]
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
    return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })

  const totals = adGroups.reduce(
    (acc, g) => ({ impressions: acc.impressions + g.impressions, clicks: acc.clicks + g.clicks, cost: acc.cost + g.cost, conversions: acc.conversions + g.conversions }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
  )

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
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className="border-b border-cloud">
            <SortTh col="name"            label="Ad Group"   align="left" />
            <th className="px-4 py-3 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Status</th>
            <SortTh col="impressions"     label="Impressions" />
            <SortTh col="clicks"          label="Clicks" />
            <SortTh col="ctr"             label="CTR" />
            <SortTh col="cost"            label="Cost" />
            <SortTh col="conversions"     label="Conversions" />
            <SortTh col="conversion_rate" label="Conv. Rate" />
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-cloud">
          {sorted.map(g => <AdGroupRow key={g.id} g={g} currency={currency} clientId={clientId} />)}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-cloud/70 bg-mist">
            <td className="px-4 py-3 text-[11px] font-heading font-bold text-navy">Total · {adGroups.length} groups</td>
            <td /><td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">{totals.impressions.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">{totals.clicks.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">{totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : '0.00'}%</td>
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">{currency} {totals.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">{totals.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">{totals.clicks > 0 ? ((totals.conversions / totals.clicks) * 100).toFixed(2) : '0.00'}%</td>
            <td />
          </tr>
        </tfoot>
      </table>
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
function AdCard({ ad: initialAd, clientId, currency }: { ad: AdData; clientId: string; currency: string }) {
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

  const typeLabel = AD_TYPE_MAP[ad.type] ?? ad.type
  const isRSA     = typeLabel === 'RSA'

  // Build asset lookup map: text → label
  const assetMap = new Map(assets.map(a => [a.text, a.label]))

  // Merge performance data into headline/description lists
  function labeledItems(items: string[]) {
    return items.map(text => ({ text, label: assetMap.get(text) ?? 'UNRATED' }))
  }

  return (
    <div className="border border-cloud rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-mist px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-[11px] font-bold bg-navy/10 text-navy px-2.5 py-1 rounded-full">{typeLabel}</span>
          <AdStrengthBadge strength={ad.ad_strength} />
          <p className="text-xs text-teal truncate" title={ad.ad_group_name}>Ad Group: {ad.ad_group_name}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={status} />
          <ToggleBtn active={isEnabled(status)} loading={toggling} error={toggleErr} onToggle={toggleStatus} />
        </div>
      </div>

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

            {/* Headlines */}
            {ad.headlines.length > 0 && (
              <div>
                <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-2">
                  Headlines
                  {isRSA && <span className="ml-1 text-navy/30 font-normal normal-case tracking-normal">({ad.headlines.length})</span>}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {labeledItems(ad.headlines).map(({ text, label }, i) => (
                    <div key={i} className="group relative">
                      <span className="text-xs bg-cyan/10 text-navy px-2.5 py-1 rounded-lg border border-cyan/20 inline-block">
                        {text}
                      </span>
                      {assetsLoaded && (
                        <span className="absolute -top-5 left-0 whitespace-nowrap">
                          <PerfChip label={label} />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Descriptions */}
            {ad.descriptions.length > 0 && (
              <div>
                <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-2">Descriptions</p>
                <div className="space-y-2">
                  {labeledItems(ad.descriptions).map(({ text, label }, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <p className="text-xs text-navy/70 leading-relaxed flex-1">{text}</p>
                      {assetsLoaded && <PerfChip label={label} />}
                    </div>
                  ))}
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
                    <p className="text-xs text-amber-800 leading-relaxed">No asset data returned. This can happen for non-RSA ad types or very new ads.</p>
                  </div>
                ) : (() => {
                  const allUnrated = assets.every(a => a.label === 'UNRATED' || a.label === '0')
                  const LABEL_ORDER = { BEST: 0, GOOD: 1, LOW: 2, LEARNING: 3, UNRATED: 4 }
                  return (
                    <>
                      {allUnrated && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4">
                          <span className="text-sm flex-shrink-0">ℹ️</span>
                          <p className="text-xs text-amber-800 leading-relaxed">
                            <strong>All assets are currently Unrated</strong> — this is normal. Google requires roughly <strong>5,000 impressions per asset</strong> before it assigns BEST / GOOD / LOW labels. Labels will appear automatically as your campaign collects more data.
                          </p>
                        </div>
                      )}
                      <div className="grid sm:grid-cols-2 gap-5">
                        {(['HEADLINE', 'DESCRIPTION'] as const).map(fieldType => {
                          const filtered = assets.filter(a =>
                            a.field_type === fieldType ||
                            a.field_type === (fieldType === 'HEADLINE' ? '5' : '6')
                          )
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
function AdsTab({ ads, currency, clientId, loading, error }: {
  ads: AdData[]; currency: string; clientId: string; loading: boolean; error: string
}) {
  if (loading) return <PanelSpinner label="Loading ads…" />
  if (error)   return <PanelError msg={error} />
  if (ads.length === 0) return <div className="text-center py-16 text-teal text-sm">No ads found for this period.</div>

  return (
    <div className="space-y-4">
      {ads.map(ad => (
        <AdCard key={ad.id} ad={ad} clientId={clientId} currency={currency} />
      ))}
    </div>
  )
}

// ─── Main drill-down panel ─────────────────────────────────────────────────────
export type DrillView = 'ad_groups' | 'ads'

interface Props {
  campaignId:   string
  campaignName: string
  clientId:     string
  currency:     string
  startDate:    string
  endDate:      string
  initialView:  DrillView
  channelType:  string
  onClose:      () => void
}

export function CampaignDrillDown({ campaignId, campaignName, clientId, currency, startDate, endDate, initialView, channelType, onClose }: Props) {
  const isPMax = channelType === 'PERFORMANCE_MAX' || channelType === '10'

  const [view, setView] = useState<DrillView>(initialView)

  // Ad groups (Search / Display / Shopping / etc.)
  const [adGroups,  setAdGroups]  = useState<AdGroupMetrics[]>([])
  const [agLoading, setAgLoading] = useState(false)
  const [agError,   setAgError]   = useState('')
  const [agFetched, setAgFetched] = useState(false)

  // Asset groups (Performance Max)
  const [assetGroups,  setAssetGroups]  = useState<AssetGroupMetrics[]>([])
  const [axLoading,    setAxLoading]    = useState(false)
  const [axError,      setAxError]      = useState('')
  const [axFetched,    setAxFetched]    = useState(false)

  // Ads
  const [ads,        setAds]        = useState<AdData[]>([])
  const [adsLoading, setAdsLoading] = useState(false)
  const [adsError,   setAdsError]   = useState('')
  const [adsFetched, setAdsFetched] = useState(false)

  // Fetch ad groups (non-PMax)
  useEffect(() => {
    if (isPMax || view !== 'ad_groups' || agFetched) return
    setAgLoading(true); setAgError('')
    fetch(`/api/ad-groups?client_account_id=${clientId}&campaign_id=${campaignId}&start_date=${startDate}&end_date=${endDate}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setAdGroups(d.adGroups ?? []); setAgFetched(true) })
      .catch(e => setAgError(String(e)))
      .finally(() => setAgLoading(false))
  }, [view, agFetched, isPMax, clientId, campaignId, startDate, endDate])

  // Fetch asset groups (PMax only)
  useEffect(() => {
    if (!isPMax || view !== 'ad_groups' || axFetched) return
    setAxLoading(true); setAxError('')
    fetch(`/api/asset-groups?client_account_id=${clientId}&campaign_id=${campaignId}&start_date=${startDate}&end_date=${endDate}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setAssetGroups(d.assetGroups ?? []); setAxFetched(true) })
      .catch(e => setAxError(String(e)))
      .finally(() => setAxLoading(false))
  }, [view, axFetched, isPMax, clientId, campaignId, startDate, endDate])

  // Fetch ads (non-PMax only)
  useEffect(() => {
    if (isPMax || view !== 'ads' || adsFetched) return
    setAdsLoading(true); setAdsError('')
    fetch(`/api/ads?client_account_id=${clientId}&campaign_id=${campaignId}&start_date=${startDate}&end_date=${endDate}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setAds(d.ads ?? []); setAdsFetched(true) })
      .catch(e => setAdsError(String(e)))
      .finally(() => setAdsLoading(false))
  }, [view, adsFetched, isPMax, clientId, campaignId, startDate, endDate])

  // Build tab list based on campaign type
  const TABS: { key: DrillView; label: string; icon: string }[] = isPMax
    ? [{ key: 'ad_groups', label: 'Asset Groups', icon: '🎯' }]
    : [
        { key: 'ad_groups', label: 'Ad Groups', icon: '👥' },
        { key: 'ads',       label: 'Ads',        icon: '📄' },
      ]

  return (
    <div className="bg-white border-2 border-cyan/30 rounded-2xl overflow-hidden mt-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-cloud bg-mist flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="flex items-center gap-1.5 text-xs text-navy/50 hover:text-navy transition-colors font-medium flex-shrink-0">
            ← Back
          </button>
          <span className="text-navy/20 select-none">|</span>
          <p className="font-heading font-bold text-navy text-sm truncate" title={campaignName}>{campaignName}</p>
          {isPMax && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex-shrink-0">⚡ PMax</span>
          )}
        </div>
        <div className="flex gap-1 bg-white border border-cloud rounded-xl p-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setView(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${view === t.key ? 'bg-navy text-cyan' : 'text-navy/50 hover:text-navy'}`}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {view === 'ad_groups' && isPMax  && <AssetGroupsTab assetGroups={assetGroups} currency={currency} loading={axLoading} error={axError} />}
        {view === 'ad_groups' && !isPMax && <AdGroupsTab adGroups={adGroups} currency={currency} clientId={clientId} loading={agLoading} error={agError} />}
        {view === 'ads'       && !isPMax && <AdsTab ads={ads} currency={currency} clientId={clientId} loading={adsLoading} error={adsError} />}
      </div>
    </div>
  )
}
