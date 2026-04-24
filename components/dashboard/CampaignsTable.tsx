'use client'
import { useState, useEffect } from 'react'
import type { CampaignMetrics } from '@/lib/google-ads'

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
  // Numeric fallbacks
  '2':  { icon: '🔍', label: 'Search' },
  '3':  { icon: '🖥️', label: 'Display' },
  '4':  { icon: '🛒', label: 'Shopping' },
  '6':  { icon: '🎥', label: 'Video' },
  '9':  { icon: '⚡', label: 'PMax' },
  '10': { icon: '⚡', label: 'PMax' },
  '11': { icon: '🎯', label: 'Demand Gen' },
}

// ─── Column definitions ────────────────────────────────────────────────────────
type SortKey = 'name' | 'impressions' | 'clicks' | 'ctr' | 'cost' | 'conversions' | 'conversion_rate'

interface ColDef {
  key:    SortKey
  label:  string
  format: (c: CampaignMetrics, currency: string) => string
}

const COLUMNS: ColDef[] = [
  { key: 'impressions',     label: 'Impressions', format: c => c.impressions.toLocaleString() },
  { key: 'clicks',          label: 'Clicks',       format: c => c.clicks.toLocaleString() },
  { key: 'ctr',             label: 'CTR',          format: c => `${c.ctr.toFixed(2)}%` },
  { key: 'cost',            label: 'Cost',         format: (c, cur) =>
      `${cur} ${c.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  { key: 'conversions',     label: 'Conversions',  format: c =>
      c.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 }) },
  { key: 'conversion_rate', label: 'Conv. Rate',   format: c => `${c.conversion_rate.toFixed(2)}%` },
]

function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="ml-1 text-navy/20">↕</span>
  return <span className="ml-1 text-cyan">{dir === 'asc' ? '↑' : '↓'}</span>
}

// ─── Whether a status string counts as "active" ────────────────────────────────
function isActive(status: string) {
  return status === 'ENABLED' || status === '2'
}

// ─── Pause / Resume button ─────────────────────────────────────────────────────
function StatusToggleBtn({
  campaignId,
  clientId,
  currentStatus,
  onStatusChange,
}: {
  campaignId:     string
  clientId:       string
  currentStatus:  string
  onStatusChange: (campaignId: string, newStatus: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const active     = isActive(currentStatus)
  const nextStatus = active ? 'PAUSED' : 'ENABLED'
  const label      = active ? 'Pause' : 'Resume'

  async function toggle() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/campaign-status', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          client_account_id: clientId,
          campaign_id:       campaignId,
          status:            nextStatus,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      // Optimistic update via callback
      onStatusChange(campaignId, nextStatus)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={loading}
        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 whitespace-nowrap ${
          active
            ? 'border-amber-300 text-amber-700 hover:bg-amber-50 bg-transparent'
            : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 bg-transparent'
        }`}
      >
        {loading
          ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          : label
        }
      </button>
      {error && <p className="text-[9px] text-red-500 max-w-[120px] text-right leading-tight">{error}</p>}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export function CampaignsTable({
  campaigns: initialCampaigns,
  currency,
  clientId,
}: {
  campaigns: CampaignMetrics[]
  currency:  string
  clientId:  string
}) {
  // Local copy so optimistic status updates don't require a full refetch
  const [campaigns, setCampaigns] = useState<CampaignMetrics[]>(initialCampaigns)
  const [sortKey,   setSortKey]   = useState<SortKey>('cost')
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('desc')

  // Sync whenever parent delivers a fresh fetch result
  useEffect(() => {
    setCampaigns(initialCampaigns)
  }, [initialCampaigns])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function handleStatusChange(campaignId: string, newStatus: string) {
    setCampaigns(prev =>
      prev.map(c => c.id === campaignId ? { ...c, status: newStatus } : c)
    )
  }

  const sorted = [...campaigns].sort((a, b) => {
    const av = sortKey === 'name' ? a.name.toLowerCase() : (a[sortKey] as number)
    const bv = sortKey === 'name' ? b.name.toLowerCase() : (b[sortKey] as number)
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  // Footer totals
  const totals = campaigns.reduce(
    (acc, c) => ({
      impressions: acc.impressions + c.impressions,
      clicks:      acc.clicks      + c.clicks,
      cost:        acc.cost        + c.cost,
      conversions: acc.conversions + c.conversions,
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
  )
  const totalCtr      = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
  const totalConvRate = totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0

  if (campaigns.length === 0) {
    return (
      <div className="bg-white border border-cloud rounded-2xl p-12 text-center">
        <p className="text-2xl mb-3">📋</p>
        <p className="text-sm text-teal">No campaigns found for this period.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-cloud rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">

          {/* ── Header ── */}
          <thead>
            <tr className="border-b border-cloud bg-mist">
              <th
                className="text-left px-5 py-3.5 text-[10px] font-heading font-bold uppercase tracking-wider text-teal cursor-pointer hover:text-navy transition-colors select-none whitespace-nowrap"
                onClick={() => handleSort('name')}
              >
                Campaign <SortArrow active={sortKey === 'name'} dir={sortDir} />
              </th>
              <th className="text-left px-4 py-3.5 text-[10px] font-heading font-bold uppercase tracking-wider text-teal whitespace-nowrap">
                Status
              </th>
              {COLUMNS.map(col => (
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
              const ch     = CHANNEL_MAP[c.channel_type] ?? { icon: '📋', label: c.channel_type }
              const active = isActive(c.status)

              return (
                <tr key={c.id} className="hover:bg-mist/50 transition-colors">

                  {/* Name + type */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="text-xl leading-none flex-shrink-0" title={ch.label}>
                        {ch.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-navy leading-snug truncate max-w-[260px]" title={c.name}>
                          {c.name}
                        </p>
                        <p className="text-[10px] text-teal mt-0.5">{ch.label}</p>
                      </div>
                    </div>
                  </td>

                  {/* Status badge */}
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
                      active ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        active ? 'bg-emerald-500' : 'bg-amber-500'
                      }`} />
                      {active ? 'Active' : 'Paused'}
                    </span>
                  </td>

                  {/* Metric cells */}
                  {COLUMNS.map(col => (
                    <td key={col.key} className="px-4 py-3.5 text-right tabular-nums text-navy/80 whitespace-nowrap">
                      {col.format(c, currency)}
                    </td>
                  ))}

                  {/* Pause / Resume action */}
                  <td className="px-4 py-3.5 text-right">
                    <StatusToggleBtn
                      campaignId={c.id}
                      clientId={clientId}
                      currentStatus={c.status}
                      onStatusChange={handleStatusChange}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>

          {/* ── Totals footer ── */}
          <tfoot>
            <tr className="border-t-2 border-cloud/70 bg-mist">
              <td className="px-5 py-3.5">
                <p className="text-[11px] font-heading font-bold text-navy">Total</p>
                <p className="text-[10px] text-teal mt-0.5">
                  {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
                </p>
              </td>
              <td />
              <td className="px-4 py-3.5 text-right tabular-nums font-bold text-navy text-xs whitespace-nowrap">
                {totals.impressions.toLocaleString()}
              </td>
              <td className="px-4 py-3.5 text-right tabular-nums font-bold text-navy text-xs whitespace-nowrap">
                {totals.clicks.toLocaleString()}
              </td>
              <td className="px-4 py-3.5 text-right tabular-nums font-bold text-navy text-xs whitespace-nowrap">
                {totalCtr.toFixed(2)}%
              </td>
              <td className="px-4 py-3.5 text-right tabular-nums font-bold text-navy text-xs whitespace-nowrap">
                {currency} {totals.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="px-4 py-3.5 text-right tabular-nums font-bold text-navy text-xs whitespace-nowrap">
                {totals.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </td>
              <td className="px-4 py-3.5 text-right tabular-nums font-bold text-navy text-xs whitespace-nowrap">
                {totalConvRate.toFixed(2)}%
              </td>
              {/* Empty actions column */}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
