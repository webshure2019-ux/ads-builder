'use client'
import { useState, useEffect, useRef } from 'react'
import type { DeviceRow } from '@/lib/google-ads'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DEVICE_LABELS: Record<string, { label: string; icon: string }> = {
  DESKTOP:       { label: 'Desktop',       icon: '🖥️' },
  MOBILE:        { label: 'Mobile',        icon: '📱' },
  TABLET:        { label: 'Tablet',        icon: '📲' },
  CONNECTED_TV:  { label: 'Connected TV',  icon: '📺' },
  OTHER:         { label: 'Other',         icon: '🔌' },
}

function fmt(n: number, prefix = '', suffix = '') {
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(2)}M${suffix}`
  if (n >= 1_000)     return `${prefix}${(n / 1_000).toFixed(1)}k${suffix}`
  return `${prefix}${n.toLocaleString()}${suffix}`
}

function pct(n: number) { return `${n.toFixed(2)}%` }
function curr(n: number, c: string) { return `${c} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }

// Bid-adjustment suggestion based on conv rate vs account average
function bidSuggestion(row: DeviceRow, avgConvRate: number): {
  label: string; color: string; pct: number
} | null {
  if (row.clicks < 30) return null  // not enough data
  const ratio = avgConvRate > 0 ? row.convRate / avgConvRate : 1
  if (ratio > 1.25)  return { label: `↑ Increase bids ~${Math.round((ratio - 1) * 100)}%`, color: 'text-emerald-700', pct: Math.round((ratio - 1) * 100) }
  if (ratio < 0.75)  return { label: `↓ Decrease bids ~${Math.round((1 - ratio) * 100)}%`, color: 'text-red-600',     pct: -Math.round((1 - ratio) * 100) }
  return { label: '✓ Bids on target', color: 'text-navy/50', pct: 0 }
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  clientAccountId: string
  startDate:       string
  endDate:         string
  campaignId?:     string
  campaignName?:   string
  currency:        string
}

export function DevicePerformanceSection({
  clientAccountId, startDate, endDate, campaignId, campaignName, currency,
}: Props) {
  const [rows,    setRows]    = useState<DeviceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
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
    fetch(`/api/device-performance?${params}`)
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
      <div className="h-4 w-48 bg-cloud rounded mb-4" />
      <div className="grid grid-cols-3 gap-4">
        {[1,2,3].map(i => <div key={i} className="h-28 bg-cloud rounded-2xl" />)}
      </div>
    </div>
  )

  if (error) return (
    <div className="border border-red-200 rounded-3xl p-5 bg-red-50 text-sm text-red-700">
      Device performance error: {error}
    </div>
  )

  if (rows.length === 0) return null

  // Filter to meaningful devices (exclude CONNECTED_TV + OTHER if no spend)
  const meaningful = rows.filter(r => r.impressions > 0)
  if (meaningful.length === 0) return null

  const totalConversions = meaningful.reduce((s, r) => s + r.conversions, 0)
  const totalClicks      = meaningful.reduce((s, r) => s + r.clicks, 0)
  const avgConvRate      = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0
  const totalCost        = meaningful.reduce((s, r) => s + r.cost, 0)

  return (
    <div className="border border-cloud rounded-3xl overflow-hidden bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-cloud flex items-center justify-between">
        <div>
          <p className="font-heading font-bold text-navy text-sm">
            📱 Device Performance
          </p>
          {campaignName && (
            <p className="text-[10px] text-navy/50 mt-0.5">{campaignName}</p>
          )}
        </div>
        <p className="text-[10px] text-navy/40">
          Avg conv rate: {pct(avgConvRate)}
        </p>
      </div>

      {/* Device cards */}
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {meaningful.map(row => {
          const info  = DEVICE_LABELS[row.device] ?? DEVICE_LABELS['OTHER']
          const share = totalCost > 0 ? (row.cost / totalCost) * 100 : 0
          const sugg  = bidSuggestion(row, avgConvRate)

          return (
            <div key={row.device} className="border border-cloud rounded-2xl p-4 space-y-3">
              {/* Device header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{info.icon}</span>
                  <span className="font-heading font-bold text-navy text-sm">{info.label}</span>
                </div>
                <span className="text-[10px] text-navy/40 bg-cloud px-2 py-0.5 rounded-full">
                  {share.toFixed(0)}% of spend
                </span>
              </div>

              {/* Spend bar */}
              <div className="h-1.5 bg-cloud rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal rounded-full transition-all duration-700"
                  style={{ width: `${share}%` }}
                />
              </div>

              {/* Key metrics */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-navy/40 text-[9px] uppercase tracking-wide">Spend</p>
                  <p className="font-bold text-navy">{curr(row.cost, currency)}</p>
                </div>
                <div>
                  <p className="text-navy/40 text-[9px] uppercase tracking-wide">Clicks</p>
                  <p className="font-bold text-navy">{fmt(row.clicks)}</p>
                </div>
                <div>
                  <p className="text-navy/40 text-[9px] uppercase tracking-wide">Conv Rate</p>
                  <p className="font-bold text-navy">{pct(row.convRate)}</p>
                </div>
                <div>
                  <p className="text-navy/40 text-[9px] uppercase tracking-wide">CPA</p>
                  <p className="font-bold text-navy">{row.cpa > 0 ? curr(row.cpa, currency) : '—'}</p>
                </div>
                <div>
                  <p className="text-navy/40 text-[9px] uppercase tracking-wide">CTR</p>
                  <p className="font-bold text-navy">{pct(row.ctr)}</p>
                </div>
                <div>
                  <p className="text-navy/40 text-[9px] uppercase tracking-wide">Avg CPC</p>
                  <p className="font-bold text-navy">{curr(row.avgCpc, currency)}</p>
                </div>
              </div>

              {/* Conversions */}
              {row.conversions > 0 && (
                <p className="text-[10px] text-navy/50">
                  {row.conversions.toFixed(0)} conversions
                </p>
              )}

              {/* Bid suggestion */}
              {sugg && (
                <div className={`text-[10px] font-medium ${sugg.color} border-t border-cloud pt-2`}>
                  💡 {sugg.label}
                </div>
              )}
              {!sugg && row.clicks < 30 && (
                <div className="text-[10px] text-navy/30 border-t border-cloud pt-2">
                  Need ≥30 clicks for bid suggestions
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Summary table for quick comparison */}
      <div className="border-t border-cloud overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-cloud/50 text-navy/50 text-[10px] uppercase tracking-wide">
              <th className="text-left px-4 py-2 font-medium">Device</th>
              <th className="text-right px-3 py-2 font-medium">Impr</th>
              <th className="text-right px-3 py-2 font-medium">Clicks</th>
              <th className="text-right px-3 py-2 font-medium">CTR</th>
              <th className="text-right px-3 py-2 font-medium">Spend</th>
              <th className="text-right px-3 py-2 font-medium">Conv</th>
              <th className="text-right px-3 py-2 font-medium">CVR</th>
              <th className="text-right px-3 py-2 font-medium">CPA</th>
            </tr>
          </thead>
          <tbody>
            {meaningful.map((row, i) => {
              const info = DEVICE_LABELS[row.device] ?? DEVICE_LABELS['OTHER']
              return (
                <tr key={row.device} className={i % 2 === 0 ? 'bg-white' : 'bg-cloud/20'}>
                  <td className="px-4 py-2 font-medium text-navy">
                    {info.icon} {info.label}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-navy/70">{fmt(row.impressions)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-navy/70">{fmt(row.clicks)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-navy/70">{pct(row.ctr)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-navy/70">{curr(row.cost, currency)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-navy/70">{row.conversions.toFixed(0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-navy/70">{pct(row.convRate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-navy/70">{row.cpa > 0 ? curr(row.cpa, currency) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
