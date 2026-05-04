'use client'
import { useState } from 'react'
import type { CampaignMetrics } from '@/lib/google-ads'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysBetween(start: string, end: string): number {
  const a = new Date(start), b = new Date(end)
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1)
}

function daysInMonth(dateStr: string): number {
  const d = new Date(dateStr)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

function fmt(n: number, cur: string) {
  return `${cur} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Pacing data per campaign ──────────────────────────────────────────────────
interface PacingRow {
  id:                  string
  name:                string
  status:              string
  dailyBudget:         number
  totalSpend:          number
  avgDailySpend:       number
  pacingRatio:         number   // avgDailySpend / dailyBudget (1.0 = on pace)
  projectedMonthly:    number   // avgDailySpend * 30.4
  monthlyBudget:       number   // dailyBudget * 30.4
  conversions:         number
  cpa:                 number
  roas:                number
}

type PacingStatus = 'over' | 'on_track' | 'under' | 'severe_under' | 'no_budget'
function getPacingStatus(row: PacingRow): PacingStatus {
  if (row.dailyBudget <= 0) return 'no_budget'
  if (row.pacingRatio > 1.20) return 'over'
  if (row.pacingRatio >= 0.85) return 'on_track'
  if (row.pacingRatio >= 0.40) return 'under'
  return 'severe_under'
}

const STATUS_CFG: Record<PacingStatus, { label: string; dot: string; bar: string; bg: string; text: string }> = {
  over:         { label: 'Over-pacing',    dot: 'bg-red-500',     bar: 'bg-red-400',     bg: 'bg-red-50',     text: 'text-red-700'     },
  on_track:     { label: 'On Track',       dot: 'bg-emerald-500', bar: 'bg-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  under:        { label: 'Under-pacing',   dot: 'bg-amber-500',   bar: 'bg-amber-400',   bg: 'bg-amber-50',   text: 'text-amber-700'   },
  severe_under: { label: 'Idle',           dot: 'bg-red-400',     bar: 'bg-red-300',     bg: 'bg-red-50',     text: 'text-red-600'     },
  no_budget:    { label: 'No Budget Set',  dot: 'bg-cloud',       bar: 'bg-cloud',       bg: 'bg-cloud/40',   text: 'text-navy/40'     },
}

function PacingBar({ ratio, status }: { ratio: number; status: PacingStatus }) {
  // Bar fills to 100% at 1.0 pacing; cap at 150% visually
  const pct = Math.min(Math.round(ratio * 100), 150)
  const cfg = STATUS_CFG[status]
  return (
    <div className="relative h-2 bg-cloud rounded-full overflow-hidden w-full min-w-[80px]">
      {/* 100% target line */}
      <div className="absolute top-0 bottom-0 w-px bg-navy/20 z-10" style={{ left: `${Math.min((1 / 1.5) * 100, 100)}%` }} />
      <div className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`} style={{ width: `${Math.min(pct / 1.5, 100)}%` }} />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  campaigns: CampaignMetrics[]
  startDate: string
  endDate:   string
  currency:  string
}

export function BudgetPacingSection({ campaigns, startDate, endDate, currency }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [sortCol,  setSortCol]  = useState<'pacing' | 'budget' | 'spend' | 'cpa'>('pacing')
  const [sortDir,  setSortDir]  = useState<'asc' | 'desc'>('desc')
  const [filter,   setFilter]   = useState<'all' | 'over' | 'under' | 'on_track'>('all')

  const days = daysBetween(startDate, endDate)
  const dim  = daysInMonth(endDate)

  // Build pacing rows — only ENABLED campaigns with a daily budget
  const rows: PacingRow[] = campaigns
    .filter(c => c.status === 'ENABLED' || c.status === '2')
    .map(c => {
      const avgDailySpend    = c.cost / days
      const pacingRatio      = c.daily_budget > 0 ? avgDailySpend / c.daily_budget : 0
      const projectedMonthly = avgDailySpend * dim
      const monthlyBudget    = c.daily_budget * dim
      return {
        id:               c.id,
        name:             c.name,
        status:           c.status,
        dailyBudget:      c.daily_budget,
        totalSpend:       c.cost,
        avgDailySpend,
        pacingRatio,
        projectedMonthly,
        monthlyBudget,
        conversions:      c.conversions,
        cpa:              c.cost_per_conversion,
        roas:             c.conversions_value > 0 && c.cost > 0 ? c.conversions_value / c.cost : 0,
      }
    })

  // ── Summary ─────────────────────────────────────────────────────────────────
  const totalBudget   = rows.reduce((s, r) => s + r.dailyBudget, 0) * days
  const totalSpend    = rows.reduce((s, r) => s + r.totalSpend, 0)
  const overCount     = rows.filter(r => getPacingStatus(r) === 'over').length
  const underCount    = rows.filter(r => getPacingStatus(r) === 'under' || getPacingStatus(r) === 'severe_under').length
  const onTrackCount  = rows.filter(r => getPacingStatus(r) === 'on_track').length
  const totalPacing   = totalBudget > 0 ? Math.round((totalSpend / totalBudget) * 100) : 0

  // ── Reallocation suggestions ───────────────────────────────────────────────
  // Find pairs: high-performing under-pacers that could absorb budget from over-pacers
  const overPacers  = rows.filter(r => getPacingStatus(r) === 'over')
    .sort((a, b) => (b.avgDailySpend - b.dailyBudget) - (a.avgDailySpend - a.dailyBudget))
  const underPacers = rows.filter(r => getPacingStatus(r) === 'under' || getPacingStatus(r) === 'severe_under')
    .sort((a, b) => {
      // Sort by "opportunity lost" × performance
      const aMissed = (a.dailyBudget - a.avgDailySpend) * Math.max(1, a.conversions)
      const bMissed = (b.dailyBudget - b.avgDailySpend) * Math.max(1, b.conversions)
      return bMissed - aMissed
    })

  // ── Filtering & sorting ────────────────────────────────────────────────────
  const filtered = rows.filter(r => {
    if (filter === 'over')     return getPacingStatus(r) === 'over'
    if (filter === 'under')    return getPacingStatus(r) === 'under' || getPacingStatus(r) === 'severe_under'
    if (filter === 'on_track') return getPacingStatus(r) === 'on_track'
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    let av: number, bv: number
    if (sortCol === 'pacing') { av = a.pacingRatio; bv = b.pacingRatio }
    else if (sortCol === 'budget') { av = a.dailyBudget; bv = b.dailyBudget }
    else if (sortCol === 'spend')  { av = a.avgDailySpend; bv = b.avgDailySpend }
    else                           { av = a.cpa; bv = b.cpa }
    return sortDir === 'asc' ? av - bv : bv - av
  })

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  function SortTh({ col, label }: { col: typeof sortCol; label: string }) {
    const active = sortCol === col
    return (
      <th className="px-4 py-2.5 text-right">
        <button
          onClick={() => toggleSort(col)}
          className={`inline-flex items-center gap-1 text-[10px] font-heading font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${active ? 'text-cyan' : 'text-teal hover:text-navy'}`}
        >
          {active && <span className="text-[9px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
          {label}
        </button>
      </th>
    )
  }

  return (
    <div className="bg-white border border-cloud rounded-3xl overflow-hidden">
      {/* ── Header ── */}
      <button
        onClick={() => setExpanded(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-mist/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">💰</span>
          <div>
            <p className="font-heading font-bold text-navy text-sm">Budget Pacing</p>
            <p className="text-[10px] text-navy/50 mt-0.5">
              {days}-day period · {overCount > 0 && <span className="text-red-600 font-bold">{overCount} over-pacing</span>}
              {overCount > 0 && underCount > 0 && <span className="text-navy/40"> · </span>}
              {underCount > 0 && <span className="text-amber-600 font-bold">{underCount} under-pacing</span>}
              {overCount === 0 && underCount === 0 && <span className="text-emerald-600 font-bold">All {onTrackCount} campaigns on track</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-bold text-navy tabular-nums">{totalPacing}% of budget used</p>
            <p className="text-[10px] text-navy/40">{fmt(totalSpend, currency)} of {fmt(totalBudget, currency)} budgeted</p>
          </div>
          <span className="text-navy/40">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-cloud px-6 pb-6 space-y-5">

          {/* ── Overall pace bar ── */}
          <div className="pt-5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Account-wide Pacing</p>
              <span className={`text-xs font-bold tabular-nums ${totalPacing > 120 ? 'text-red-600' : totalPacing >= 85 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {totalPacing}%
              </span>
            </div>
            <div className="h-3 bg-cloud rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${totalPacing > 120 ? 'bg-red-400' : totalPacing >= 85 ? 'bg-emerald-400' : 'bg-amber-400'}`}
                style={{ width: `${Math.min(totalPacing, 150)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-navy/40">0%</p>
              <p className="text-[10px] text-navy/40">100% (on target)</p>
            </div>
          </div>

          {/* ── Reallocation suggestions ── */}
          {overPacers.length > 0 && underPacers.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-amber-700 mb-2">💡 Budget Reallocation Opportunities</p>
              <div className="space-y-2">
                {overPacers.slice(0, 2).map((op, i) => {
                  const up = underPacers[i] ?? underPacers[0]
                  if (!up) return null
                  const excess     = Math.round((op.avgDailySpend - op.dailyBudget) * 100) / 100
                  const headroom   = Math.round((up.dailyBudget - up.avgDailySpend) * 100) / 100
                  const suggested  = Math.min(excess, headroom)
                  return (
                    <div key={op.id} className="flex items-start gap-2 text-xs text-amber-800">
                      <span className="flex-shrink-0 mt-0.5">→</span>
                      <p>
                        Move ~{fmt(suggested, currency)}/day from{' '}
                        <strong className="text-red-700">"{op.name}"</strong>{' '}
                        (over-pacing {Math.round(op.pacingRatio * 100)}%) to{' '}
                        <strong className="text-emerald-700">"{up.name}"</strong>{' '}
                        (under-pacing {Math.round(up.pacingRatio * 100)}%
                        {up.conversions > 0 ? `, CPA ${fmt(up.cpa, currency)}` : ''})
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Filters ── */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { v: 'all',      l: 'All Campaigns'  },
              { v: 'over',     l: '🔴 Over-pacing'  },
              { v: 'under',    l: '🟡 Under-pacing' },
              { v: 'on_track', l: '🟢 On Track'     },
            ] as { v: typeof filter; l: string }[]).map(({ v, l }) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all whitespace-nowrap ${filter === v ? 'bg-cyan text-navy border-cyan' : 'border-cloud text-navy/60 hover:border-cyan/40 hover:text-navy'}`}
              >
                {l}
              </button>
            ))}
            <p className="text-[10px] text-navy/40 ml-auto">{sorted.length} campaign{sorted.length !== 1 ? 's' : ''}</p>
          </div>

          {/* ── Table ── */}
          <div className="overflow-x-auto rounded-2xl border border-cloud">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-cloud bg-mist">
                  <th className="px-4 py-2.5 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal whitespace-nowrap">Campaign</th>
                  <SortTh col="budget" label={`Daily Budget (${currency})`} />
                  <SortTh col="spend"  label="Avg Daily Spend" />
                  <SortTh col="pacing" label="Pacing" />
                  <th className="px-4 py-2.5 text-right text-[10px] font-heading font-bold uppercase tracking-wider text-teal whitespace-nowrap">Proj. Monthly</th>
                  <SortTh col="cpa" label="CPA" />
                </tr>
              </thead>
              <tbody className="divide-y divide-cloud">
                {sorted.map(r => {
                  const status = getPacingStatus(r)
                  const cfg    = STATUS_CFG[status]
                  const pctStr = r.dailyBudget > 0 ? `${Math.round(r.pacingRatio * 100)}%` : '—'
                  return (
                    <tr key={r.id} className={`transition-colors hover:bg-mist/40`}>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-xs font-medium text-navy truncate" title={r.name}>{r.name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                          <span className={`text-[10px] font-bold ${cfg.text}`}>{cfg.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-navy/70 whitespace-nowrap">
                        {fmt(r.dailyBudget, currency)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-navy/70 whitespace-nowrap">
                        {fmt(r.avgDailySpend, currency)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <PacingBar ratio={r.pacingRatio} status={status} />
                          <span className={`text-[11px] font-bold tabular-nums w-10 text-right flex-shrink-0 ${cfg.text}`}>
                            {pctStr}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <p className="text-xs tabular-nums text-navy/70">{fmt(r.projectedMonthly, currency)}</p>
                        {r.monthlyBudget > 0 && (
                          <p className={`text-[10px] tabular-nums ${r.projectedMonthly > r.monthlyBudget * 1.1 ? 'text-red-500' : r.projectedMonthly < r.monthlyBudget * 0.8 ? 'text-amber-500' : 'text-navy/30'}`}>
                            {r.projectedMonthly > r.monthlyBudget
                              ? `+${fmt(r.projectedMonthly - r.monthlyBudget, currency)} over`
                              : r.projectedMonthly < r.monthlyBudget
                              ? `${fmt(r.monthlyBudget - r.projectedMonthly, currency)} under`
                              : 'On budget'}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-navy/70 whitespace-nowrap">
                        {r.cpa > 0 ? fmt(r.cpa, currency) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {sorted.length === 0 && (
            <div className="text-center py-8 text-teal text-sm">No campaigns match this filter.</div>
          )}

          {/* ── Legend ── */}
          <p className="text-[10px] text-navy/30 leading-relaxed">
            Pacing = average daily spend ÷ daily budget over the selected period.{' '}
            100% = exactly on target. The vertical line on each bar marks the 100% target.{' '}
            Projected monthly = (avg daily spend) × {dim} days.
          </p>
        </div>
      )}
    </div>
  )
}
