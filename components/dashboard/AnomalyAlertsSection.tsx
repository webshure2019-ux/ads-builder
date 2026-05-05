'use client'
import { useState, useMemo } from 'react'
import type { AccountStats, CampaignMetrics } from '@/lib/google-ads'

// ─── Types ────────────────────────────────────────────────────────────────────
type Severity = 'critical' | 'warning' | 'info'

interface Alert {
  id:       string
  severity: Severity
  icon:     string
  title:    string
  detail:   string
  metric:   string
  change:   number   // % change (positive = increase, negative = drop)
}

// ─── Statistical helpers ──────────────────────────────────────────────────────
function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, n) => s + n, 0) / arr.length
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((s, n) => s + (n - m) ** 2, 0) / arr.length)
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0
  return ((curr - prev) / prev) * 100
}

function fmt(n: number): string {
  return n >= 0 ? `+${n.toFixed(1)}%` : `${n.toFixed(1)}%`
}

// ─── Anomaly detection ────────────────────────────────────────────────────────
function detectAnomalies(
  stats:     AccountStats,
  prevStats: AccountStats | null,
  campaigns: CampaignMetrics[]
): Alert[] {
  const alerts: Alert[] = []
  const daily = stats.daily

  // ── 1. Period-over-period (current totals vs previous totals) ─────────────
  if (prevStats && prevStats.totals.clicks > 0) {
    const cur  = stats.totals
    const prev = prevStats.totals

    const checks: Array<{
      key:    keyof typeof cur
      label:  string
      icon:   string
      metric: string
      critThreshold: number   // % change considered critical
      warnThreshold: number
      higherIsBetter: boolean
    }> = [
      { key: 'cost',            label: 'Spend',            icon: '💸', metric: 'cost',            critThreshold: 50, warnThreshold: 25, higherIsBetter: false },
      { key: 'conversions',     label: 'Conversions',      icon: '🎯', metric: 'conversions',     critThreshold: 40, warnThreshold: 20, higherIsBetter: true  },
      { key: 'clicks',          label: 'Clicks',           icon: '🖱️', metric: 'clicks',          critThreshold: 50, warnThreshold: 30, higherIsBetter: true  },
      { key: 'conversion_rate', label: 'Conversion Rate',  icon: '📉', metric: 'conversion_rate', critThreshold: 35, warnThreshold: 20, higherIsBetter: true  },
      { key: 'ctr',             label: 'CTR',              icon: '📊', metric: 'ctr',             critThreshold: 40, warnThreshold: 25, higherIsBetter: true  },
      { key: 'impressions',     label: 'Impressions',      icon: '👁️', metric: 'impressions',     critThreshold: 50, warnThreshold: 30, higherIsBetter: true  },
    ]

    for (const c of checks) {
      const curVal  = cur[c.key]  as number
      const prevVal = prev[c.key] as number
      if (prevVal === 0) continue
      const chg = pctChange(curVal, prevVal)
      const drop = c.higherIsBetter ? chg < 0 : chg > 0
      const absChg = Math.abs(chg)

      if (absChg >= c.critThreshold) {
        alerts.push({
          id:       `pop_${c.key}`,
          severity: 'critical',
          icon:     c.icon,
          title:    drop ? `${c.label} dropped ${absChg.toFixed(0)}% vs prior period` : `${c.label} spiked ${absChg.toFixed(0)}% vs prior period`,
          detail:   `Current: ${fmtVal(c.key, curVal)} · Prior: ${fmtVal(c.key, prevVal)}`,
          metric:   c.metric,
          change:   chg,
        })
      } else if (absChg >= c.warnThreshold) {
        alerts.push({
          id:       `pop_${c.key}`,
          severity: 'warning',
          icon:     c.icon,
          title:    drop ? `${c.label} down ${absChg.toFixed(0)}% vs prior period` : `${c.label} up ${absChg.toFixed(0)}% vs prior period`,
          detail:   `Current: ${fmtVal(c.key, curVal)} · Prior: ${fmtVal(c.key, prevVal)}`,
          metric:   c.metric,
          change:   chg,
        })
      }
    }
  }

  // ── 2. Intra-period: z-score anomalies on the last 3 days ─────────────────
  if (daily.length >= 5) {
    const baseDays    = daily.slice(0, -3)  // all but last 3
    const recentDays  = daily.slice(-3)

    type MetricKey = 'cost' | 'clicks' | 'conversions' | 'ctr' | 'conversion_rate'
    const metrics: Array<{ key: MetricKey; label: string; icon: string; higherIsBetter: boolean }> = [
      { key: 'cost',            label: 'Daily Spend',   icon: '💸', higherIsBetter: false },
      { key: 'conversions',     label: 'Conversions',   icon: '🎯', higherIsBetter: true  },
      { key: 'ctr',             label: 'CTR',           icon: '📊', higherIsBetter: true  },
      { key: 'conversion_rate', label: 'Conv Rate',     icon: '📉', higherIsBetter: true  },
    ]

    for (const m of metrics) {
      const baseVals = baseDays.map(d => d[m.key])
      const mu  = mean(baseVals)
      const sig = stdDev(baseVals)
      if (sig === 0 || mu === 0) continue

      for (const day of recentDays) {
        const val = day[m.key]
        const z   = (val - mu) / sig
        if (Math.abs(z) < 2) continue  // within 2σ — not anomalous

        const drop   = m.higherIsBetter ? val < mu : val > mu
        const absChg = pctChange(val, mu)

        alerts.push({
          id:       `intra_${m.key}_${day.date}`,
          severity: Math.abs(z) >= 3 ? 'critical' : 'warning',
          icon:     m.icon,
          title:    drop
            ? `${m.label} unusually low on ${day.date}`
            : `${m.label} unusually high on ${day.date}`,
          detail:   `${fmtVal(m.key, val)} vs period avg ${fmtVal(m.key, mu)} (${fmt(absChg)}, z=${z.toFixed(1)})`,
          metric:   m.key,
          change:   absChg,
        })
      }
    }
  }

  // ── 3. Campaign-level signals: zero impressions on active campaigns ─────────
  const activeCampaigns = campaigns.filter(c => c.status === 'ENABLED' || c.status === '2')
  const darkCampaigns   = activeCampaigns.filter(c => c.impressions === 0)
  if (darkCampaigns.length > 0) {
    alerts.push({
      id:       'dark_campaigns',
      severity: darkCampaigns.length >= 3 ? 'critical' : 'warning',
      icon:     '📭',
      title:    `${darkCampaigns.length} active campaign${darkCampaigns.length !== 1 ? 's' : ''} with zero impressions`,
      detail:   darkCampaigns.slice(0, 3).map(c => c.name).join(', ') + (darkCampaigns.length > 3 ? ` +${darkCampaigns.length - 3} more` : ''),
      metric:   'impressions',
      change:   -100,
    })
  }

  // ── 4. Budget over-spend: any campaign spending >150% of daily budget ──────
  if (stats.daily.length > 0) {
    const days    = stats.daily.length
    const overCamps = campaigns.filter(c =>
      c.daily_budget > 0 &&
      c.cost > 0 &&
      (c.cost / days) > c.daily_budget * 1.5
    )
    if (overCamps.length > 0) {
      alerts.push({
        id:       'budget_overspend',
        severity: 'critical',
        icon:     '🚨',
        title:    `${overCamps.length} campaign${overCamps.length !== 1 ? 's' : ''} over-spending by >50% of daily budget`,
        detail:   overCamps.slice(0, 2).map(c => {
          const pace = Math.round(((c.cost / days) / c.daily_budget) * 100)
          return `${c.name} (${pace}% of budget)`
        }).join(', '),
        metric:   'cost',
        change:   50,
      })
    }
  }

  // Deduplicate by id (period-over-period wins over intra-period for same metric)
  const seen = new Set<string>()
  const unique = alerts.filter(a => {
    if (seen.has(a.id)) return false
    seen.add(a.id)
    return true
  })

  // Sort: critical first, then by abs change
  return unique.sort((a, b) => {
    const sOrder = { critical: 0, warning: 1, info: 2 }
    if (sOrder[a.severity] !== sOrder[b.severity]) return sOrder[a.severity] - sOrder[b.severity]
    return Math.abs(b.change) - Math.abs(a.change)
  })
}

// ─── Format helper ────────────────────────────────────────────────────────────
function fmtVal(key: string, v: number): string {
  if (key === 'cost')            return `$${v.toFixed(2)}`
  if (key === 'ctr')             return `${v.toFixed(2)}%`
  if (key === 'conversion_rate') return `${v.toFixed(2)}%`
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

// ─── Severity config ──────────────────────────────────────────────────────────
const SEV_CFG: Record<Severity, { border: string; bg: string; badge: string; badgeText: string; dot: string }> = {
  critical: { border: 'border-red-200',   bg: 'bg-red-50',   badge: 'bg-red-100',   badgeText: 'text-red-700',   dot: 'bg-red-500'   },
  warning:  { border: 'border-amber-200', bg: 'bg-amber-50', badge: 'bg-amber-100', badgeText: 'text-amber-700', dot: 'bg-amber-400' },
  info:     { border: 'border-blue-200',  bg: 'bg-blue-50',  badge: 'bg-blue-100',  badgeText: 'text-blue-700',  dot: 'bg-blue-400'  },
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  stats:     AccountStats
  prevStats: AccountStats | null
  campaigns: CampaignMetrics[]
}

export function AnomalyAlertsSection({ stats, prevStats, campaigns }: Props) {
  const [dismissed,   setDismissed]   = useState<Set<string>>(new Set())
  const [expanded,    setExpanded]    = useState(true)

  const allAlerts  = useMemo(() => detectAnomalies(stats, prevStats, campaigns), [stats, prevStats, campaigns])
  const visible    = allAlerts.filter(a => !dismissed.has(a.id))
  const critCount  = visible.filter(a => a.severity === 'critical').length
  const warnCount  = visible.filter(a => a.severity === 'warning').length

  function dismiss(id: string) {
    setDismissed(prev => {
      const next = Array.from(prev)
      next.push(id)
      return new Set(next)
    })
  }

  function dismissAll() {
    setDismissed(new Set(allAlerts.map(a => a.id)))
  }

  if (allAlerts.length === 0) return null

  if (visible.length === 0) return (
    <button
      onClick={() => setDismissed(new Set())}
      className="w-full text-[10px] text-navy/30 text-center py-1.5 hover:text-navy/60 transition-colors"
    >
      {allAlerts.length} dismissed alert{allAlerts.length !== 1 ? 's' : ''} — click to restore
    </button>
  )

  return (
    <div className={`border rounded-3xl overflow-hidden ${critCount > 0 ? 'border-red-200 bg-red-50/30' : 'border-amber-200 bg-amber-50/30'}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(o => !o)}
        className="w-full flex items-center justify-between px-6 py-3.5 hover:bg-black/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">🔔</span>
          <div>
            <p className="font-heading font-bold text-navy text-sm">Anomaly Alerts</p>
            <p className="text-[10px] text-navy/50">
              {critCount > 0 && `${critCount} critical`}
              {critCount > 0 && warnCount > 0 && ' · '}
              {warnCount > 0 && `${warnCount} warning${warnCount !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {critCount > 0 && (
            <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {critCount} critical
            </span>
          )}
          {warnCount > 0 && (
            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {warnCount} warning{warnCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-navy/40 ml-1">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Alerts list */}
      {expanded && (
        <div className="border-t border-black/10 px-5 py-4 space-y-2">
          {visible.map(alert => {
            const cfg = SEV_CFG[alert.severity]
            return (
              <div
                key={alert.id}
                className={`flex items-start justify-between gap-3 border rounded-xl px-4 py-2.5 ${cfg.border} ${cfg.bg}`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="text-base flex-shrink-0 mt-0.5">{alert.icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-navy">{alert.title}</p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${cfg.badge} ${cfg.badgeText}`}>
                        {alert.change >= 0 ? '+' : ''}{alert.change.toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-[10px] text-navy/50 mt-0.5">{alert.detail}</p>
                  </div>
                </div>
                <button
                  onClick={() => dismiss(alert.id)}
                  className="flex-shrink-0 text-navy/30 hover:text-navy transition-colors text-lg leading-none mt-0.5"
                  title="Dismiss"
                >
                  ×
                </button>
              </div>
            )
          })}

          {visible.length > 1 && (
            <button
              onClick={dismissAll}
              className="text-[10px] text-navy/30 hover:text-navy/60 transition-colors w-full text-center pt-1"
            >
              Dismiss all
            </button>
          )}
        </div>
      )}
    </div>
  )
}
