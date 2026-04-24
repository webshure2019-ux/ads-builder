'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis,
} from 'recharts'
import type { DailyMetrics, AccountStats } from '@/lib/google-ads'

interface GoogleClient { id: string; name: string }

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toYMD(d: Date) { return d.toISOString().split('T')[0] }

function getRange(preset: string) {
  const end   = new Date()
  const start = new Date()
  const days  = parseInt(preset)
  start.setDate(end.getDate() - (isNaN(days) ? 30 : days))
  return { start: toYMD(start), end: toYMD(end) }
}

const PRESETS = [
  { label: '7D',  value: '7'  },
  { label: '14D', value: '14' },
  { label: '30D', value: '30' },
  { label: '90D', value: '90' },
]

// ─── Stat card config ─────────────────────────────────────────────────────────
type MetricKey = 'clicks' | 'cost' | 'conversions' | 'conversion_rate' | 'ctr'

interface CardCfg {
  key:    MetricKey
  label:  string
  color:  string
  format: (v: number, currency?: string) => string
  suffix?: string
}

const CARDS: CardCfg[] = [
  {
    key:    'clicks',
    label:  'Clicks',
    color:  '#00C2CB',
    format: v => v.toLocaleString(),
  },
  {
    key:    'cost',
    label:  'Cost',
    color:  '#FF6B35',
    format: (v, cur) => `${cur ?? 'ZAR'} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  },
  {
    key:    'conversions',
    label:  'Conversions',
    color:  '#10b981',
    format: v => v.toLocaleString(undefined, { maximumFractionDigits: 1 }),
  },
  {
    key:    'conversion_rate',
    label:  'Conv. Rate',
    color:  '#8b5cf6',
    format: v => `${v.toFixed(2)}%`,
  },
  {
    key:    'ctr',
    label:  'CTR',
    color:  '#3b82f6',
    format: v => `${v.toFixed(2)}%`,
  },
]

// ─── Tooltip ──────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, format, currency }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-navy text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg pointer-events-none">
      <p className="text-white/50 mb-0.5">{label}</p>
      <p className="font-bold">{format(payload[0].value, currency)}</p>
    </div>
  )
}

// ─── Individual stat card ─────────────────────────────────────────────────────
function StatCard({ cfg, total, daily, currency }: {
  cfg: CardCfg
  total: number
  daily: DailyMetrics[]
  currency: string
}) {
  const chartData = daily.map(d => ({ date: d.date.slice(5), value: d[cfg.key] }))

  return (
    <div className="bg-white border border-cloud rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal">
          {cfg.label}
        </p>
        <div className="w-2 h-2 rounded-full mt-0.5" style={{ backgroundColor: cfg.color }} />
      </div>

      <p className="font-heading font-black text-2xl text-navy leading-none">
        {cfg.format(total, currency)}
      </p>

      <div className="h-16 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${cfg.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={cfg.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={cfg.color} stopOpacity={0}    />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <Tooltip
              content={<ChartTooltip format={cfg.format} currency={currency} />}
              cursor={{ stroke: cfg.color, strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={cfg.color}
              strokeWidth={2}
              fill={`url(#grad-${cfg.key})`}
              dot={false}
              activeDot={{ r: 3, fill: cfg.color }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export function ClientDashboard() {
  const [clients,  setClients]  = useState<GoogleClient[]>([])
  const [clientId, setClientId] = useState('')
  const [preset,   setPreset]   = useState('30')
  const [stats,    setStats]    = useState<AccountStats | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  // Load client list
  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then(d => setClients(d.clients || []))
      .catch(() => {})
  }, [])

  // Fetch stats whenever client or date range changes
  const fetchStats = useCallback(async (id: string, p: string) => {
    if (!id) return
    const { start, end } = getRange(p)
    setLoading(true)
    setError('')
    setStats(null)
    try {
      const res = await fetch(
        `/api/stats?client_account_id=${id}&start_date=${start}&end_date=${end}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load stats')
      setStats(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  function handleClientChange(id: string) {
    setClientId(id)
    fetchStats(id, preset)
  }

  function handlePresetChange(p: string) {
    setPreset(p)
    fetchStats(clientId, p)
  }

  const selectedClient = clients.find(c => c.id === clientId)

  return (
    <div className="max-w-7xl mx-auto px-5 py-8 space-y-6">

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <select
            value={clientId}
            onChange={e => handleClientChange(e.target.value)}
            className="bg-white border border-cloud rounded-xl px-4 py-2.5 text-sm text-navy focus:outline-none focus:border-cyan min-w-[220px]"
          >
            <option value="">Select a client...</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {selectedClient && (
            <span className="text-xs text-teal font-mono">ID: {selectedClient.id}</span>
          )}
        </div>

        {/* Date range presets */}
        <div className="flex gap-1 bg-white border border-cloud rounded-xl p-1">
          {PRESETS.map(p => (
            <button
              key={p.value}
              onClick={() => handlePresetChange(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                preset === p.value
                  ? 'bg-navy text-cyan'
                  : 'text-navy/50 hover:text-navy'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* States */}
      {!clientId && (
        <div className="bg-white border border-cloud rounded-2xl p-16 text-center">
          <p className="text-4xl mb-4">📊</p>
          <p className="font-heading font-bold text-navy text-lg mb-1">Select a client</p>
          <p className="text-sm text-teal">Choose a client account above to view their performance stats</p>
        </div>
      )}

      {clientId && loading && (
        <div className="bg-white border border-cloud rounded-2xl p-16 text-center">
          <div className="w-8 h-8 border-2 border-cyan border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-teal">Loading stats...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Stat cards */}
      {stats && !loading && (
        <>
          {/* Period label */}
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-bold text-navy text-lg">
              {selectedClient?.name}
            </h2>
            <p className="text-xs text-teal">
              {getRange(preset).start} → {getRange(preset).end}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {CARDS.map(cfg => (
              <StatCard
                key={cfg.key}
                cfg={cfg}
                total={stats.totals[cfg.key]}
                daily={stats.daily}
                currency={stats.currency}
              />
            ))}
          </div>

          {stats.daily.length === 0 && (
            <div className="bg-white border border-cloud rounded-2xl p-12 text-center">
              <p className="text-sm text-teal">No data found for this period. The account may have no active campaigns.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
