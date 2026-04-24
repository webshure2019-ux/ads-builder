'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import type { DailyMetrics, AccountStats } from '@/lib/google-ads'

interface GoogleClient { id: string; name: string }

// ─── Date helpers ──────────────────────────────────────────────────────────────
function toYMD(d: Date) { return d.toISOString().split('T')[0] }

function getPresetRange(preset: string): { start: string; end: string } {
  const end   = new Date()
  const start = new Date()
  start.setDate(end.getDate() - parseInt(preset))
  return { start: toYMD(start), end: toYMD(end) }
}

function getPreviousRange(start: string, end: string) {
  const s    = new Date(start)
  const e    = new Date(end)
  // Inclusive day count (e.g. Jan 1→Jan 7 = 7 days, not 6)
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1
  const pe   = new Date(s); pe.setDate(pe.getDate() - 1)       // day before current start
  const ps   = new Date(pe); ps.setDate(ps.getDate() - (days - 1)) // same length
  return { start: toYMD(ps), end: toYMD(pe) }
}

// ─── Metric config ─────────────────────────────────────────────────────────────
type MetricKey = 'clicks' | 'cost' | 'conversions' | 'conversion_rate' | 'ctr'

interface CardCfg {
  key:    MetricKey
  label:  string
  color:  string
  format: (v: number, cur?: string) => string
}

const CARDS: CardCfg[] = [
  { key: 'clicks',          label: 'Clicks',      color: '#00C2CB',
    format: v => v.toLocaleString() },
  { key: 'cost',            label: 'Cost',        color: '#FF6B35',
    format: (v, cur) => `${cur ?? 'ZAR'} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  { key: 'conversions',     label: 'Conversions', color: '#10b981',
    format: v => v.toLocaleString(undefined, { maximumFractionDigits: 1 }) },
  { key: 'conversion_rate', label: 'Conv. Rate',  color: '#8b5cf6',
    format: v => `${v.toFixed(2)}%` },
  { key: 'ctr',             label: 'CTR',         color: '#3b82f6',
    format: v => `${v.toFixed(2)}%` },
]

const PRESETS = [
  { label: '7D',     value: '7'      },
  { label: '14D',    value: '14'     },
  { label: '30D',    value: '30'     },
  { label: '90D',    value: '90'     },
  { label: 'Custom', value: 'custom' },
]

// ─── Delta badge ───────────────────────────────────────────────────────────────
function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null
  const pct = ((current - previous) / Math.abs(previous)) * 100
  const up  = pct >= 0
  return (
    <span className={`text-[11px] font-bold flex items-center gap-0.5 ${up ? 'text-emerald-500' : 'text-red-500'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  )
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

// ─── Sparkline stat card ───────────────────────────────────────────────────────
function StatCard({ cfg, total, prevTotal, daily, prevDaily, currency, active, onClick }: {
  cfg:       CardCfg
  total:     number
  prevTotal: number | null
  daily:     DailyMetrics[]
  prevDaily: DailyMetrics[]
  currency:  string
  active:    boolean
  onClick:   () => void
}) {
  const chartData = daily.map((d, i) => ({
    date:     d.date.slice(5),
    current:  d[cfg.key],
    previous: prevDaily[i]?.[cfg.key] ?? null,
  }))

  return (
    <button
      onClick={onClick}
      className={`text-left bg-white border rounded-2xl p-5 flex flex-col gap-2.5 transition-all hover:shadow-md w-full group ${
        active ? 'border-cyan ring-2 ring-cyan/20 shadow-md' : 'border-cloud hover:border-cyan/40'
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal">{cfg.label}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-navy/30 group-hover:text-navy/50 transition-colors">
            {active ? 'click to close' : 'click to expand'}
          </span>
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
        </div>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <p className="font-heading font-black text-2xl text-navy leading-none">
          {cfg.format(total, currency)}
        </p>
        {prevTotal !== null && <DeltaBadge current={total} previous={prevTotal} />}
      </div>

      {prevTotal !== null && (
        <p className="text-[9px] text-navy/40">vs {cfg.format(prevTotal, currency)} prev period</p>
      )}

      <div className="h-14 -mx-2 mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 2, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id={`sg-${cfg.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={cfg.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={cfg.color} stopOpacity={0}    />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <Tooltip content={<ChartTooltip format={cfg.format} currency={currency} />} cursor={false} />
            <Area type="monotone" dataKey="current"  stroke={cfg.color} strokeWidth={2}
              fill={`url(#sg-${cfg.key})`} dot={false} activeDot={{ r: 3, fill: cfg.color }} name="current" />
            {prevTotal !== null && (
              <Area type="monotone" dataKey="previous" stroke={cfg.color} strokeWidth={1.5}
                strokeDasharray="4 3" fill="none" dot={false} activeDot={{ r: 2 }}
                strokeOpacity={0.5} name="previous" />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </button>
  )
}

// ─── Expanded chart panel ──────────────────────────────────────────────────────
function ExpandedChart({ cfg, daily, prevDaily, currency, onClose }: {
  cfg:      CardCfg
  daily:    DailyMetrics[]
  prevDaily: DailyMetrics[]
  currency: string
  onClose:  () => void
}) {
  const hasCompare = prevDaily.length > 0

  const data = daily.map((d, i) => ({
    date:     d.date,
    current:  d[cfg.key],
    previous: prevDaily[i]?.[cfg.key] ?? null,
  }))

  // Summary stats for expanded view
  const max     = Math.max(...daily.map(d => d[cfg.key]))
  const min     = Math.min(...daily.map(d => d[cfg.key]))
  const avg     = daily.length > 0 ? daily.reduce((s, d) => s + d[cfg.key], 0) / daily.length : 0

  return (
    <div className="bg-white border-2 border-cyan/30 rounded-2xl p-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-heading font-bold text-navy text-xl">{cfg.label}</h3>
          {hasCompare && (
            <div className="flex items-center gap-5 mt-1.5">
              <span className="flex items-center gap-2 text-xs text-navy/60">
                <span className="inline-block w-8 h-0.5 rounded" style={{ backgroundColor: cfg.color }} />
                Current period
              </span>
              <span className="flex items-center gap-2 text-xs text-navy/60">
                <span className="inline-block w-8 rounded" style={{
                  borderTop: `2px dashed ${cfg.color}`,
                  opacity: 0.5,
                }} />
                Previous period
              </span>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cloud text-navy/40 hover:text-navy text-lg transition-colors"
        >
          ×
        </button>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Peak',    value: cfg.format(max, currency) },
          { label: 'Average', value: cfg.format(avg, currency) },
          { label: 'Low',     value: cfg.format(min, currency) },
        ].map(s => (
          <div key={s.label} className="bg-mist rounded-xl px-4 py-3">
            <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-1">{s.label}</p>
            <p className="font-heading font-bold text-navy text-lg">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Full chart */}
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
          <defs>
            <linearGradient id={`eg-${cfg.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={cfg.color} stopOpacity={0.2} />
              <stop offset="95%" stopColor={cfg.color} stopOpacity={0}   />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e8eef0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => {
              const raw = cfg.format(v, currency)
              return raw.replace(`${currency} `, '').replace('ZAR ', '')
            }}
            width={65}
          />
          <Tooltip content={<ChartTooltip format={cfg.format} currency={currency} />} />
          <Area type="monotone" dataKey="current"
            stroke={cfg.color} strokeWidth={2.5}
            fill={`url(#eg-${cfg.key})`}
            dot={false} activeDot={{ r: 5, fill: cfg.color }}
            name="current"
          />
          {hasCompare && (
            <Area type="monotone" dataKey="previous"
              stroke={cfg.color} strokeWidth={2}
              strokeDasharray="5 4" fill="none"
              dot={false} activeDot={{ r: 3 }}
              strokeOpacity={0.45} name="previous"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Main dashboard ────────────────────────────────────────────────────────────
export function ClientDashboard() {
  const [clients,      setClients]      = useState<GoogleClient[]>([])
  const [clientId,     setClientId]     = useState('')
  const [preset,       setPreset]       = useState('30')
  const [customStart,  setCustomStart]  = useState('')
  const [customEnd,    setCustomEnd]    = useState('')
  const [compare,      setCompare]      = useState(false)
  const [stats,        setStats]        = useState<AccountStats | null>(null)
  const [compareStats, setCompareStats] = useState<AccountStats | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [activeCard,   setActiveCard]   = useState<MetricKey | null>(null)

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(d => setClients(d.clients || [])).catch(() => {})
  }, [])

  const fetchStats = useCallback(async (
    id: string, start: string, end: string, doCompare: boolean
  ) => {
    if (!id || !start || !end) return
    setLoading(true)
    setError('')

    try {
      const prevRange = getPreviousRange(start, end)
      const [res, cRes] = await Promise.all([
        fetch(`/api/stats?client_account_id=${id}&start_date=${start}&end_date=${end}`),
        doCompare
          ? fetch(`/api/stats?client_account_id=${id}&start_date=${prevRange.start}&end_date=${prevRange.end}`)
          : Promise.resolve(null),
      ])

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load stats')
      setStats(data)
      setCompareStats(cRes ? await cRes.json() : null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  function activeRange() {
    return preset === 'custom'
      ? { start: customStart, end: customEnd }
      : getPresetRange(preset)
  }

  function run(id: string, p: string, cmp: boolean, cs: string, ce: string) {
    const { start, end } = p === 'custom' ? { start: cs, end: ce } : getPresetRange(p)
    if (start && end) fetchStats(id, start, end, cmp)
  }

  const selectedClient = clients.find(c => c.id === clientId)
  const activeCardCfg  = CARDS.find(c => c.key === activeCard)
  const { start: rs, end: re } = activeRange()

  return (
    <div className="max-w-7xl mx-auto px-5 py-8 space-y-5">

      {/* ── Controls bar ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3 items-center">

          {/* Client */}
          <select
            value={clientId}
            onChange={e => { setClientId(e.target.value); run(e.target.value, preset, compare, customStart, customEnd) }}
            className="bg-white border border-cloud rounded-xl px-4 py-2.5 text-sm text-navy focus:outline-none focus:border-cyan min-w-[220px]"
          >
            <option value="">Select a client...</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Presets */}
          <div className="flex gap-1 bg-white border border-cloud rounded-xl p-1">
            {PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => {
                  setPreset(p.value)
                  if (p.value !== 'custom') run(clientId, p.value, compare, customStart, customEnd)
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                  preset === p.value ? 'bg-navy text-cyan' : 'text-navy/50 hover:text-navy'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Compare toggle */}
          <button
            onClick={() => {
              const next = !compare
              setCompare(next)
              if (clientId && rs && re) fetchStats(clientId, rs, re, next)
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-heading font-bold transition-all ${
              compare
                ? 'bg-navy text-cyan border-navy'
                : 'bg-white text-navy/60 border-cloud hover:border-cyan/50 hover:text-navy'
            }`}
          >
            <span className="text-xs">{compare ? '◆' : '◇'}</span>
            Compare to previous period
          </button>
        </div>

        {/* Custom date pickers */}
        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="bg-white border border-cloud rounded-xl px-3 py-2 text-sm text-navy focus:outline-none focus:border-cyan"
            />
            <span className="text-navy/30 text-sm font-bold">→</span>
            <input type="date" value={customEnd} max={toYMD(new Date())}
              onChange={e => setCustomEnd(e.target.value)}
              className="bg-white border border-cloud rounded-xl px-3 py-2 text-sm text-navy focus:outline-none focus:border-cyan"
            />
            <button
              onClick={() => run(clientId, 'custom', compare, customStart, customEnd)}
              disabled={!customStart || !customEnd || customEnd <= customStart || !clientId}
              className="bg-cyan text-navy font-heading font-bold text-sm px-5 py-2 rounded-xl hover:bg-cyan/80 disabled:opacity-40 transition-colors"
            >
              Apply
            </button>
          </div>
        )}

        {/* Active range label */}
        {stats && rs && re && (
          <p className="text-xs text-teal">
            <span className="font-medium">{rs}</span> → <span className="font-medium">{re}</span>
            {compare && compareStats && (() => {
              const p = getPreviousRange(rs, re)
              return <> · vs <span className="font-medium">{p.start}</span> → <span className="font-medium">{p.end}</span></>
            })()}
          </p>
        )}
      </div>

      {/* ── Empty state ── */}
      {!clientId && (
        <div className="bg-white border border-cloud rounded-2xl p-16 text-center">
          <p className="text-4xl mb-4">📊</p>
          <p className="font-heading font-bold text-navy text-lg mb-1">Select a client</p>
          <p className="text-sm text-teal">Choose a client account above to view their performance</p>
        </div>
      )}

      {/* ── Loading ── */}
      {clientId && loading && (
        <div className="bg-white border border-cloud rounded-2xl p-16 text-center">
          <div className="w-8 h-8 border-2 border-cyan border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-teal">Loading stats...</p>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* ── Dashboard ── */}
      {stats && !loading && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-bold text-navy text-xl">{selectedClient?.name}</h2>
            {stats.daily.length > 0 && (
              <p className="text-xs text-navy/40">Click any card to expand</p>
            )}
          </div>

          {stats.daily.length === 0 ? (
            <div className="bg-white border border-cloud rounded-2xl p-12 text-center">
              <p className="text-sm text-teal">No data found for this period.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {CARDS.map(cfg => (
                <StatCard
                  key={cfg.key}
                  cfg={cfg}
                  total={stats.totals[cfg.key]}
                  prevTotal={compareStats ? compareStats.totals[cfg.key] : null}
                  daily={stats.daily}
                  prevDaily={compareStats?.daily ?? []}
                  currency={stats.currency}
                  active={activeCard === cfg.key}
                  onClick={() => setActiveCard(prev => prev === cfg.key ? null : cfg.key)}
                />
              ))}

              {/* Expanded chart — full width below cards */}
              {activeCard && activeCardCfg && stats.daily.length > 0 && (
                <div className="col-span-full">
                  <ExpandedChart
                    cfg={activeCardCfg}
                    daily={stats.daily}
                    prevDaily={compareStats?.daily ?? []}
                    currency={stats.currency}
                    onClose={() => setActiveCard(null)}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
