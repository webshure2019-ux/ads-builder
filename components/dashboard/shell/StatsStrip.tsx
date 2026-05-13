'use client'
import { useMemo } from 'react'
import type { DailyMetrics, AccountStats } from '@/lib/google-ads'

export type StatKey = 'clicks' | 'cost' | 'conversions' | 'conversion_rate' | 'ctr'

interface KpiCfg {
  key:    StatKey
  label:  string
  color:  string        // sparkline / accent
  short:  string        // 1-letter mnemonic for keyboard
  format: (v: number, cur?: string) => string
}

const KPIS: KpiCfg[] = [
  { key: 'cost',            label: 'Spend',       color: '#FF8A30', short: 'S',
    format: (v, cur) => `${cur ? cur + ' ' : ''}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
  { key: 'clicks',          label: 'Clicks',      color: '#31C0FF', short: 'K',
    format: v => v.toLocaleString() },
  { key: 'conversions',     label: 'Conversions', color: '#10b981', short: 'C',
    format: v => v.toLocaleString(undefined, { maximumFractionDigits: 1 }) },
  { key: 'conversion_rate', label: 'Conv. Rate',  color: '#a855f7', short: 'R',
    format: v => `${v.toFixed(2)}%` },
  { key: 'ctr',             label: 'CTR',         color: '#0ea5e9', short: 'T',
    format: v => `${v.toFixed(2)}%` },
]

// ─── SVG sparkline ────────────────────────────────────────────────────────────
function Sparkline({ daily, dataKey, color, height = 24, width = 80 }: {
  daily: DailyMetrics[]; dataKey: StatKey; color: string; height?: number; width?: number
}) {
  const path = useMemo(() => {
    if (daily.length < 2) return ''
    const vals = daily.map(d => d[dataKey] as number)
    const min  = Math.min(...vals)
    const max  = Math.max(...vals)
    const range = max - min || 1
    const stepX = width / (daily.length - 1)
    const points = vals.map((v, i) => {
      const x = i * stepX
      const y = height - ((v - min) / range) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    return `M${points.join(' L')}`
  }, [daily, dataKey, height, width])

  const areaPath = useMemo(() => {
    if (!path) return ''
    return `${path} L${width},${height} L0,${height} Z`
  }, [path, width, height])

  if (!path) return <div style={{ width, height }} />

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="flex-shrink-0">
      <defs>
        <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0"    />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-${dataKey})`} />
      <path d={path}     fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ─── Delta badge ──────────────────────────────────────────────────────────────
function Delta({ current, previous, invert }: { current: number; previous: number; invert?: boolean }) {
  if (previous === 0) return null
  const pct = ((current - previous) / Math.abs(previous)) * 100
  const up  = pct >= 0
  const good = invert ? !up : up
  return (
    <span
      className="text-[10px] font-bold tabular-nums px-1 rounded"
      style={{
        color:      good ? '#10b981' : '#ef4444',
        background: good ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
      }}
      title={`${up ? '+' : ''}${pct.toFixed(1)}% vs previous`}
    >
      {up ? '↑' : '↓'}{Math.abs(pct).toFixed(0)}%
    </span>
  )
}

// ─── Single KPI cell ──────────────────────────────────────────────────────────
function KpiCell({
  cfg, total, prevTotal, daily, currency, active, onClick,
}: {
  cfg:       KpiCfg
  total:     number
  prevTotal: number | null
  daily:     DailyMetrics[]
  currency:  string
  active:    boolean
  onClick:   () => void
}) {
  // Spend rising is bad, everything else rising is good
  const invertDelta = cfg.key === 'cost'

  return (
    <button
      onClick={onClick}
      className="group relative flex items-center gap-3 px-3.5 py-2 rounded-xl transition-all text-left min-w-0 flex-1"
      style={{
        background: active ? 'var(--surface-hi)' : 'var(--surface-lo)',
        border:     `1px solid ${active ? cfg.color : 'var(--border-lo)'}`,
        boxShadow:  active ? `0 0 0 3px ${cfg.color}22` : 'none',
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] font-heading font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-3)' }}
          >
            {cfg.label}
          </span>
          {prevTotal !== null && <Delta current={total} previous={prevTotal} invert={invertDelta} />}
        </div>
        <p
          className="font-heading font-black tabular-nums leading-tight text-lg lg:text-xl truncate"
          style={{ color: 'var(--text-1)' }}
        >
          {cfg.format(total, currency)}
        </p>
      </div>
      <Sparkline daily={daily} dataKey={cfg.key} color={cfg.color} />
    </button>
  )
}

// ─── Main strip ───────────────────────────────────────────────────────────────
export function StatsStrip({
  stats, compareStats, activeKey, onActiveChange,
}: {
  stats:          AccountStats
  compareStats:   AccountStats | null
  activeKey:      StatKey | null
  onActiveChange: (k: StatKey | null) => void
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
      {KPIS.map(cfg => (
        <KpiCell
          key={cfg.key}
          cfg={cfg}
          total={stats.totals[cfg.key]}
          prevTotal={compareStats ? compareStats.totals[cfg.key] : null}
          daily={stats.daily}
          currency={stats.currency}
          active={activeKey === cfg.key}
          onClick={() => onActiveChange(activeKey === cfg.key ? null : cfg.key)}
        />
      ))}
    </div>
  )
}

export { KPIS }
