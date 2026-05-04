'use client'
import { useState, useCallback } from 'react'
import type { HourlyRow } from '@/lib/google-ads'

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const DAY_LABELS: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu',
  FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
}
const HOURS = Array.from({ length: 24 }, (_, i) => i)

type Metric = 'conversions' | 'clicks' | 'cost' | 'ctr' | 'convRate' | 'cpa'

const METRIC_CFG: Record<Metric, { label: string; format: (v: number, cur: string) => string; higherIsBetter: boolean }> = {
  conversions: { label: 'Conversions', format: (v) => v.toFixed(1),                               higherIsBetter: true  },
  clicks:      { label: 'Clicks',      format: (v) => v.toLocaleString(),                          higherIsBetter: true  },
  cost:        { label: 'Cost',        format: (v, cur) => `${cur} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, higherIsBetter: false },
  ctr:         { label: 'CTR',         format: (v) => `${v.toFixed(2)}%`,                          higherIsBetter: true  },
  convRate:    { label: 'Conv Rate',   format: (v) => `${v.toFixed(2)}%`,                          higherIsBetter: true  },
  cpa:         { label: 'CPA',         format: (v, cur) => v > 0 ? `${cur} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—', higherIsBetter: false },
}

function fmt12h(h: number) {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

// ─── Heat colour: 0=no data, 0–1=normalized intensity ─────────────────────────
// higherIsBetter=true → green scale; false → red scale (high = bad)
function heatColor(intensity: number, hasData: boolean, higherIsBetter: boolean): string {
  if (!hasData) return 'bg-cloud/40 text-navy/20'
  if (intensity === 0) return 'bg-cloud/60 text-navy/30'
  const i = intensity
  if (higherIsBetter) {
    if (i < 0.2)  return 'bg-emerald-50  text-emerald-900'
    if (i < 0.4)  return 'bg-emerald-100 text-emerald-900'
    if (i < 0.6)  return 'bg-emerald-200 text-emerald-900'
    if (i < 0.8)  return 'bg-emerald-400 text-white'
    return               'bg-emerald-600 text-white'
  } else {
    if (i < 0.2)  return 'bg-slate-50  text-slate-500'
    if (i < 0.4)  return 'bg-amber-100 text-amber-900'
    if (i < 0.6)  return 'bg-amber-300 text-amber-900'
    if (i < 0.8)  return 'bg-red-300   text-red-900'
    return               'bg-red-500   text-white'
  }
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
function Tooltip({ row, currency }: { row: HourlyRow | null; currency: string }) {
  if (!row) return null
  return (
    <div className="absolute z-50 bg-navy text-white rounded-xl shadow-xl px-3 py-2.5 text-[11px] pointer-events-none w-48 left-1/2 -translate-x-1/2 -top-36">
      <p className="font-bold mb-1.5">{DAY_LABELS[row.dayOfWeek]} · {fmt12h(row.hour)}</p>
      <div className="space-y-0.5">
        <p>Impressions: <strong>{row.impressions.toLocaleString()}</strong></p>
        <p>Clicks: <strong>{row.clicks.toLocaleString()}</strong></p>
        <p>CTR: <strong>{row.ctr.toFixed(2)}%</strong></p>
        <p>Cost: <strong>{currency} {row.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
        <p>Conv: <strong>{row.conversions.toFixed(1)}</strong></p>
        <p>Conv Rate: <strong>{row.convRate.toFixed(2)}%</strong></p>
        {row.cpa > 0 && <p>CPA: <strong>{currency} {row.cpa.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>}
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-navy rotate-45" />
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  clientId:   string
  startDate:  string
  endDate:    string
  currency:   string
  campaignId?: string
}

// ─── Main component ───────────────────────────────────────────────────────────
export function HeatmapTab({ clientId, startDate, endDate, currency, campaignId }: Props) {
  const [rows,     setRows]     = useState<HourlyRow[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [fetched,  setFetched]  = useState('')
  const [metric,   setMetric]   = useState<Metric>('conversions')
  const [hovered,  setHovered]  = useState<{ day: string; hour: number } | null>(null)

  const fetchKey = `${clientId}|${startDate}|${endDate}|${campaignId ?? ''}`

  const load = useCallback(async () => {
    if (loading || fetched === fetchKey) return
    setLoading(true); setError('')
    try {
      const qs = new URLSearchParams({
        client_account_id: clientId, start_date: startDate, end_date: endDate,
        ...(campaignId ? { campaign_id: campaignId } : {}),
      })
      const res = await fetch(`/api/hourly-performance?${qs}`)
      const d   = await res.json()
      if (!res.ok) throw new Error(d.error)
      setRows(d.rows ?? [])
      setFetched(fetchKey)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [loading, fetched, fetchKey, clientId, startDate, endDate, campaignId])

  // ── Build lookup: `${day}|${hour}` → HourlyRow ────────────────────────────
  const grid = new Map<string, HourlyRow>()
  for (const r of rows) grid.set(`${r.dayOfWeek}|${r.hour}`, r)

  const hoveredRow = hovered ? grid.get(`${hovered.day}|${hovered.hour}`) ?? null : null
  const cfg        = METRIC_CFG[metric]

  // ── Normalise metric for colour intensity ──────────────────────────────────
  const values = rows.map(r => r[metric] as number).filter(v => v > 0)
  const maxVal = values.length > 0 ? Math.max(...values) : 1

  // ── Bid adjustment recommendations ────────────────────────────────────────
  const withConv   = rows.filter(r => r.clicks >= 5)   // min sample
  const avgConvR   = withConv.length > 0 ? withConv.reduce((s, r) => s + r.convRate, 0) / withConv.length : 0
  const avgCPA     = withConv.filter(r => r.conversions > 0).reduce((s, r, _, a) => s + r.cpa / a.length, 0)

  const topSlots   = [...rows].filter(r => r.conversions > 0 && r.clicks >= 5)
    .sort((a, b) => b.convRate - a.convRate).slice(0, 3)
  const worstSlots = [...rows].filter(r => r.cost > 0 && r.clicks >= 5)
    .sort((a, b) => {
      // Sort by cost-weighted underperformance
      const aScore = a.convRate > 0 ? a.cpa : a.cost * 999
      const bScore = b.convRate > 0 ? b.cpa : b.cost * 999
      return bScore - aScore
    }).slice(0, 3)

  // ── Unloaded state ────────────────────────────────────────────────────────
  if (!fetched && !loading && !error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-4xl">⏰</div>
        <p className="text-sm text-navy/60 text-center max-w-xs">
          Discover the best times to show your ads — by hour and day of week — and get bid adjustment recommendations.
        </p>
        <button
          onClick={load}
          className="bg-cyan text-navy font-heading font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-cyan/80 transition-colors"
        >
          ⏰ Load Performance Heatmap
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-teal text-sm">
        <div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
        Loading hourly performance data…
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

  if (fetched && rows.length === 0) {
    return <div className="text-center py-16 text-teal text-sm">No hourly data available for this period.</div>
  }

  return (
    <div className="space-y-5">

      {/* ── Metric selector ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Show:</p>
        {(Object.keys(METRIC_CFG) as Metric[]).map(m => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap ${metric === m ? 'bg-cyan text-navy border-cyan' : 'border-cloud text-navy/60 hover:border-cyan/40 hover:text-navy'}`}
          >
            {METRIC_CFG[m].label}
          </button>
        ))}
        <p className="text-[10px] text-navy/40 ml-auto">
          {cfg.higherIsBetter
            ? '🟢 Darker green = better performance'
            : '🔴 Darker red = higher spend / worse performance'}
        </p>
      </div>

      {/* ── Heatmap grid ── */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="grid" style={{ gridTemplateColumns: `3rem repeat(7, 1fr)`, gap: '2px' }}>
            {/* Header row */}
            <div /> {/* empty corner */}
            {DAYS_ORDER.map(day => (
              <div key={day} className="text-center text-[10px] font-heading font-bold uppercase text-teal pb-1">
                {DAY_LABELS[day]}
              </div>
            ))}

            {/* Data rows (one per hour) */}
            {HOURS.map(hour => (
              <>
                {/* Hour label */}
                <div key={`h-${hour}`} className="flex items-center justify-end pr-1.5 text-[9px] text-navy/30 tabular-nums">
                  {fmt12h(hour)}
                </div>
                {/* Day cells */}
                {DAYS_ORDER.map(day => {
                  const row       = grid.get(`${day}|${hour}`)
                  const val       = row ? (row[metric] as number) : 0
                  const intensity = maxVal > 0 && val > 0 ? val / maxVal : 0
                  const isHovered = hovered?.day === day && hovered?.hour === hour
                  return (
                    <div
                      key={`${day}-${hour}`}
                      className={`relative h-7 rounded cursor-pointer transition-all duration-150 flex items-center justify-center ${heatColor(intensity, !!row, cfg.higherIsBetter)} ${isHovered ? 'ring-2 ring-cyan ring-offset-1 z-20' : ''}`}
                      onMouseEnter={() => setHovered({ day, hour })}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {isHovered && row && (
                        <div className="absolute z-50" style={{ top: '-9.5rem', left: '50%', transform: 'translateX(-50%)' }}>
                          <Tooltip row={row} currency={currency} />
                        </div>
                      )}
                      {val > 0 && (
                        <span className="text-[9px] font-bold tabular-nums leading-none select-none">
                          {cfg.format(val, '').replace(currency, '').trim().split(' ')[0]}
                        </span>
                      )}
                    </div>
                  )
                })}
              </>
            ))}
          </div>
        </div>
      </div>

      {/* ── Totals by day / hour ── */}
      <div className="grid grid-cols-2 gap-4">
        {/* By day of week */}
        <div className="bg-white border border-cloud rounded-2xl p-4">
          <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-3">Performance by Day</p>
          <div className="space-y-2">
            {DAYS_ORDER.map(day => {
              const dayRows  = rows.filter(r => r.dayOfWeek === day)
              const totClicks = dayRows.reduce((s, r) => s + r.clicks, 0)
              const totCost   = dayRows.reduce((s, r) => s + r.cost, 0)
              const totConv   = dayRows.reduce((s, r) => s + r.conversions, 0)
              const maxDayCost = Math.max(...DAYS_ORDER.map(d => rows.filter(r => r.dayOfWeek === d).reduce((s, r) => s + r.cost, 0)), 1)
              const pct       = Math.round((totCost / maxDayCost) * 100)
              return (
                <div key={day} className="flex items-center gap-2">
                  <span className="text-[10px] text-navy/50 w-8 font-bold">{DAY_LABELS[day]}</span>
                  <div className="flex-1 h-1.5 bg-cloud rounded-full overflow-hidden">
                    <div className="h-full bg-cyan rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] tabular-nums text-navy/60 w-10 text-right">{totClicks.toLocaleString()}</span>
                  <span className="text-[10px] tabular-nums text-emerald-600 w-10 text-right">{totConv.toFixed(0)}</span>
                </div>
              )
            })}
            <p className="text-[9px] text-navy/30 mt-1">Clicks · Conversions</p>
          </div>
        </div>

        {/* Bid recommendations */}
        <div className="bg-white border border-cloud rounded-2xl p-4">
          <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-3">💡 Bid Adjustment Suggestions</p>
          {topSlots.length === 0 && worstSlots.length === 0 ? (
            <p className="text-[10px] text-navy/40">Insufficient conversion data to make recommendations. Run campaigns for longer and check back.</p>
          ) : (
            <div className="space-y-2.5">
              {topSlots.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider mb-1.5">Best Time Slots — consider bid +20%</p>
                  {topSlots.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 py-0.5">
                      <span className="text-[10px] text-emerald-600 font-bold">↑ +20%</span>
                      <span className="text-[10px] text-navy">{DAY_LABELS[r.dayOfWeek]} {fmt12h(r.hour)}</span>
                      <span className="text-[10px] text-navy/40 ml-auto">{r.convRate.toFixed(1)}% CVR</span>
                    </div>
                  ))}
                </div>
              )}
              {worstSlots.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-red-600 uppercase tracking-wider mb-1.5 mt-2">Worst Time Slots — consider bid −30%</p>
                  {worstSlots.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 py-0.5">
                      <span className="text-[10px] text-red-500 font-bold">↓ −30%</span>
                      <span className="text-[10px] text-navy">{DAY_LABELS[r.dayOfWeek]} {fmt12h(r.hour)}</span>
                      <span className="text-[10px] text-navy/40 ml-auto">
                        {r.conversions > 0 ? `CPA ${currency} ${r.cpa.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `${currency} ${r.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })} 0 conv`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {avgConvR > 0 && (
                <p className="text-[9px] text-navy/30 pt-1 border-t border-cloud">
                  Avg conv rate {avgConvR.toFixed(2)}% · Avg CPA {currency} {avgCPA.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="text-[10px] text-navy/30">
        Hours shown in the account&apos;s timezone. Hover any cell for full metrics. Cells with no data are transparent.
      </p>
    </div>
  )
}
