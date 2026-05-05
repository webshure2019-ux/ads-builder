'use client'
import { useState } from 'react'
import type { CampaignMetrics } from '@/lib/google-ads'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pctFmt(v: number | null): string {
  if (v === null || v <= 0) return '—'
  return `${v.toFixed(1)}%`
}

function isBar(value: number | null, color: string, opacity = 1) {
  if (value === null || value <= 0) return null
  return (
    <div className="h-1.5 bg-cloud rounded-full overflow-hidden w-full">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${Math.min(100, value)}%`, opacity }}
      />
    </div>
  )
}

// IS health colour
function isColor(v: number | null): string {
  if (v === null) return 'text-navy/30'
  if (v >= 60) return 'text-emerald-600'
  if (v >= 35) return 'text-amber-600'
  return 'text-red-600'
}

// Insight label for lost IS composition
function lostInsight(rank: number | null, budget: number | null): string | null {
  if (rank === null && budget === null) return null
  const r = rank ?? 0
  const b = budget ?? 0
  if (b > r * 1.5)  return '💸 Budget-constrained — increase daily spend to capture more impressions'
  if (r > b * 1.5)  return '🏆 Rank-constrained — improve QS, ad relevance, or raise bids'
  if (r > 0 && b > 0) return '⚖️ Mixed losses (rank + budget) — review both bids and daily budget'
  return null
}

function fmtCost(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  campaigns: CampaignMetrics[]
  currency:  string
}

export function ImpressionShareSection({ campaigns, currency }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [sortCol, setSortCol] = useState<'is' | 'rank_lost' | 'budget_lost' | 'cost'>('cost')

  // Only show Search campaigns that have IS data
  const searchCampaigns = campaigns.filter(
    c => c.search_impression_share !== null &&
         (c.status === 'ENABLED' || c.status === '2')
  )

  if (searchCampaigns.length === 0) return null

  // Account-level aggregates (weighted by impressions)
  const totalImpressions = searchCampaigns.reduce((s, c) => s + c.impressions, 0)
  const weightedIS = totalImpressions > 0
    ? searchCampaigns.reduce((s, c) => s + (c.search_impression_share ?? 0) * c.impressions, 0) / totalImpressions
    : 0
  const avgRankLost   = searchCampaigns.filter(c => c.search_rank_lost_is   !== null)
    .reduce((s, c) => s + (c.search_rank_lost_is   ?? 0), 0) / (searchCampaigns.length || 1)
  const avgBudgetLost = searchCampaigns.filter(c => c.search_budget_lost_is !== null)
    .reduce((s, c) => s + (c.search_budget_lost_is ?? 0), 0) / (searchCampaigns.length || 1)

  // Sort
  const sorted = [...searchCampaigns].sort((a, b) => {
    if (sortCol === 'is')          return (b.search_impression_share ?? 0) - (a.search_impression_share ?? 0)
    if (sortCol === 'rank_lost')   return (b.search_rank_lost_is     ?? 0) - (a.search_rank_lost_is     ?? 0)
    if (sortCol === 'budget_lost') return (b.search_budget_lost_is   ?? 0) - (a.search_budget_lost_is   ?? 0)
    return b.cost - a.cost
  })

  // Campaigns needing attention (IS < 35 or high lost IS)
  const needsAttention = sorted.filter(c =>
    (c.search_impression_share ?? 100) < 35 ||
    (c.search_rank_lost_is     ?? 0)   > 30 ||
    (c.search_budget_lost_is   ?? 0)   > 30
  )

  function SortBtn({ col, label }: { col: typeof sortCol; label: string }) {
    return (
      <button
        onClick={() => setSortCol(col)}
        className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
          sortCol === col
            ? 'bg-teal text-white'
            : 'bg-cloud text-navy/50 hover:bg-cloud/70'
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="border border-cloud rounded-3xl overflow-hidden bg-white">
      {/* ── Header (always visible) ── */}
      <button
        onClick={() => setExpanded(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-black/5 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          {/* IS ring */}
          <div className={`w-14 h-14 rounded-full flex-shrink-0 flex flex-col items-center justify-center ring-4 bg-white ${
            weightedIS >= 60 ? 'ring-emerald-300' : weightedIS >= 35 ? 'ring-amber-300' : 'ring-red-300'
          }`}>
            <span className={`font-heading font-bold text-xl leading-none ${isColor(weightedIS)}`}>
              {weightedIS.toFixed(0)}
            </span>
            <span className="text-[8px] text-navy/40 leading-none">IS%</span>
          </div>
          <div>
            <p className="font-heading font-bold text-navy text-sm">Impression Share Deep Dive</p>
            <p className="text-[10px] text-navy/50 mt-0.5">
              {searchCampaigns.length} Search campaign{searchCampaigns.length !== 1 ? 's' : ''} ·{' '}
              Avg IS {weightedIS.toFixed(1)}%
            </p>
            <p className="text-[10px] text-navy/40">
              Lost Rank {avgRankLost.toFixed(1)}% · Lost Budget {avgBudgetLost.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Alert badge */}
        <div className="flex items-center gap-3">
          {needsAttention.length > 0 && (
            <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {needsAttention.length} need attention
            </span>
          )}
          <span className="text-navy/40 ml-1">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* ── Expanded ── */}
      {expanded && (
        <div className="border-t border-cloud/60">
          {/* Account-level IS breakdown bar */}
          <div className="px-6 pt-5 pb-4">
            <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-3">
              Account IS Composition
            </p>
            <div className="space-y-2">
              {/* Stacked visual */}
              <div className="h-4 rounded-full overflow-hidden flex gap-px bg-cloud">
                <div
                  className="bg-emerald-400 h-full transition-all duration-700"
                  style={{ width: `${Math.min(100, weightedIS)}%` }}
                  title={`Won: ${weightedIS.toFixed(1)}%`}
                />
                <div
                  className="bg-red-400 h-full transition-all duration-700"
                  style={{ width: `${Math.min(100, avgRankLost)}%` }}
                  title={`Lost (Rank): ${avgRankLost.toFixed(1)}%`}
                />
                <div
                  className="bg-amber-400 h-full transition-all duration-700"
                  style={{ width: `${Math.min(100, avgBudgetLost)}%` }}
                  title={`Lost (Budget): ${avgBudgetLost.toFixed(1)}%`}
                />
              </div>
              <div className="flex items-center gap-4 text-[10px]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Won {weightedIS.toFixed(1)}%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Lost (Rank) {avgRankLost.toFixed(1)}%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Lost (Budget) {avgBudgetLost.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Campaigns needing attention */}
          {needsAttention.length > 0 && (
            <div className="px-6 pb-4">
              <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-3">
                ⚠️ Campaigns Needing Attention
              </p>
              <div className="space-y-2">
                {needsAttention.map(c => {
                  const insight = lostInsight(c.search_rank_lost_is, c.search_budget_lost_is)
                  return (
                    <div key={c.id} className="border border-amber-200 bg-amber-50 rounded-xl px-4 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-navy truncate max-w-[60%]">{c.name}</p>
                        <div className="flex items-center gap-2 flex-shrink-0 text-[10px]">
                          <span className={`font-bold ${isColor(c.search_impression_share)}`}>
                            IS {pctFmt(c.search_impression_share)}
                          </span>
                          {c.search_rank_lost_is   !== null && c.search_rank_lost_is   > 0 && (
                            <span className="text-red-600">↘ Rank {pctFmt(c.search_rank_lost_is)}</span>
                          )}
                          {c.search_budget_lost_is !== null && c.search_budget_lost_is > 0 && (
                            <span className="text-amber-600">↘ Budget {pctFmt(c.search_budget_lost_is)}</span>
                          )}
                        </div>
                      </div>
                      {insight && <p className="text-[10px] text-navy/60 mt-1">{insight}</p>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Full campaign table */}
          <div className="px-6 pb-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal">
                All Campaigns
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-navy/40 mr-1">Sort:</span>
                <SortBtn col="cost"        label="Spend" />
                <SortBtn col="is"          label="IS" />
                <SortBtn col="rank_lost"   label="Lost (Rank)" />
                <SortBtn col="budget_lost" label="Lost (Budget)" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto pb-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-cloud/50 text-navy/50 text-[10px] uppercase tracking-wide">
                  <th className="text-left px-5 py-2 font-medium">Campaign</th>
                  <th className="text-right px-3 py-2 font-medium">IS Won</th>
                  <th className="text-right px-3 py-2 font-medium">Lost (Rank)</th>
                  <th className="text-right px-3 py-2 font-medium">Lost (Budget)</th>
                  <th className="text-right px-3 py-2 font-medium">Abs Top IS</th>
                  <th className="text-right px-3 py-2 font-medium">Top IS</th>
                  <th className="text-right px-3 py-2 font-medium">Spend</th>
                  <th className="text-left px-4 py-2 font-medium min-w-[140px]">IS Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, i) => {
                  const is     = c.search_impression_share
                  const rank   = c.search_rank_lost_is
                  const budget = c.search_budget_lost_is
                  return (
                    <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-cloud/20'}>
                      <td className="px-5 py-2.5 max-w-[180px]">
                        <p className="font-medium text-navy truncate" title={c.name}>{c.name}</p>
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${isColor(is)}`}>
                        {pctFmt(is)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-600">
                        {pctFmt(rank)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">
                        {pctFmt(budget)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-navy/60">
                        {pctFmt(c.search_abs_top_is)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-navy/60">
                        {pctFmt(c.search_top_is)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-navy/70">
                        {fmtCost(c.cost, currency)}
                      </td>
                      {/* Visual breakdown bar */}
                      <td className="px-4 py-2.5">
                        <div className="h-3 rounded-full overflow-hidden flex gap-px bg-cloud min-w-[100px]">
                          {is !== null && is > 0 && (
                            <div className="bg-emerald-400 h-full" style={{ width: `${Math.min(100, is)}%` }} title={`Won: ${is.toFixed(1)}%`} />
                          )}
                          {rank !== null && rank > 0 && (
                            <div className="bg-red-400 h-full"     style={{ width: `${Math.min(100, rank)}%` }}   title={`Lost Rank: ${rank.toFixed(1)}%`} />
                          )}
                          {budget !== null && budget > 0 && (
                            <div className="bg-amber-400 h-full"   style={{ width: `${Math.min(100, budget)}%` }} title={`Lost Budget: ${budget.toFixed(1)}%`} />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="px-6 pb-5 pt-1">
            <p className="text-[10px] text-navy/30">
              IS Won = share of available auctions you appeared in · Lost Rank = auctions lost to poor QS or low bid · Lost Budget = auctions missed due to daily budget exhaustion.
              Data reflects current account state (unsegmented snapshot).
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
