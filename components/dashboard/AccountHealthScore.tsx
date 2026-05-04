'use client'
import { useState } from 'react'
import type { CampaignMetrics, AccountStats } from '@/lib/google-ads'

// ─── Score component definitions ──────────────────────────────────────────────
interface ScoreComponent {
  name:    string
  icon:    string
  score:   number  // 0–100
  weight:  number  // fraction (sums to 1)
  status:  'good' | 'warn' | 'poor'
  detail:  string
  actions: string[]
}

function impShare(campaigns: CampaignMetrics[]): ScoreComponent {
  const searchCampaigns = campaigns.filter(c =>
    (c.status === 'ENABLED' || c.status === '2') &&
    c.search_impression_share !== null && c.search_impression_share > 0
  )
  if (searchCampaigns.length === 0) {
    return { name: 'Impression Share', icon: '👁️', score: 50, weight: 0.20, status: 'warn',
      detail: 'No impression share data — applies to Search campaigns only.',
      actions: ['Ensure Search campaigns are active and receiving traffic'] }
  }
  const avgIS  = searchCampaigns.reduce((s, c) => s + (c.search_impression_share ?? 0), 0) / searchCampaigns.length
  const score  = Math.min(100, Math.round(avgIS))
  const status: 'good' | 'warn' | 'poor' = score >= 60 ? 'good' : score >= 35 ? 'warn' : 'poor'
  const actions: string[] = []
  if (score < 35) {
    actions.push('Increase bids or budgets to capture more available impressions')
    actions.push('Review search term relevance — broad match may dilute IS')
  } else if (score < 60) {
    actions.push('Consider increasing daily budgets for campaigns with limited IS')
    actions.push('Review ad relevance and keyword match types')
  }
  return { name: 'Impression Share', icon: '👁️', score, weight: 0.20, status,
    detail: `Avg ${avgIS.toFixed(1)}% IS across ${searchCampaigns.length} Search campaign${searchCampaigns.length !== 1 ? 's' : ''}`, actions }
}

function ctrHealth(totals: AccountStats['totals']): ScoreComponent {
  const ctr     = totals.ctr
  let score     = 0
  if (ctr >= 10)     score = 100
  else if (ctr >= 7) score = 90
  else if (ctr >= 5) score = 75
  else if (ctr >= 3) score = 55
  else if (ctr >= 1) score = 30
  else               score = 10

  const status: 'good' | 'warn' | 'poor' = score >= 70 ? 'good' : score >= 45 ? 'warn' : 'poor'
  const actions: string[] = []
  if (score < 45) {
    actions.push('Tighten keyword match types (move from Broad to Phrase/Exact)')
    actions.push('Rewrite ad headlines to better match user intent')
    actions.push('Review search terms for irrelevant traffic')
  } else if (score < 70) {
    actions.push('Test additional ad variants with stronger CTAs')
    actions.push('Use Dynamic Keyword Insertion where appropriate')
  }
  return { name: 'Click-Through Rate', icon: '🖱️', score, weight: 0.20, status,
    detail: `Account CTR ${ctr.toFixed(2)}% (Search benchmark: 5–8%)`, actions }
}

function convPerf(totals: AccountStats['totals']): ScoreComponent {
  if (totals.clicks < 50) {
    return { name: 'Conversion Performance', icon: '🎯', score: 50, weight: 0.20, status: 'warn',
      detail: 'Insufficient clicks for reliable conversion analysis (< 50 clicks).',
      actions: ['Run campaigns longer to gather statistically significant data'] }
  }
  const convR   = totals.conversion_rate
  let score     = 0
  if (convR >= 8)      score = 100
  else if (convR >= 5) score = 85
  else if (convR >= 3) score = 65
  else if (convR >= 1) score = 40
  else if (convR > 0)  score = 20
  else                 score = 0

  const status: 'good' | 'warn' | 'poor' = score >= 65 ? 'good' : score >= 35 ? 'warn' : 'poor'
  const actions: string[] = []
  if (score < 35) {
    if (convR === 0) {
      actions.push('Check conversion tracking is correctly set up in Google Ads')
      actions.push('Verify conversion actions are firing on the right pages')
    } else {
      actions.push('Improve landing page relevance and loading speed')
      actions.push('Ensure ad messaging matches landing page content')
      actions.push('Test different CTAs and landing page variants')
    }
  } else if (score < 65) {
    actions.push('Run A/B tests on landing pages with different value propositions')
    actions.push('Review audience targeting to focus on high-intent users')
  }
  return { name: 'Conversion Performance', icon: '🎯', score, weight: 0.20, status,
    detail: `Conv rate ${convR.toFixed(2)}% · ${totals.conversions.toFixed(0)} total conversions`, actions }
}

function budgetEff(campaigns: CampaignMetrics[], daysElapsed: number): ScoreComponent {
  const enabled = campaigns.filter(c => (c.status === 'ENABLED' || c.status === '2') && c.daily_budget > 0)
  if (enabled.length === 0) {
    return { name: 'Budget Efficiency', icon: '💰', score: 50, weight: 0.20, status: 'warn',
      detail: 'No active campaigns with a daily budget found.',
      actions: ['Activate campaigns and set appropriate daily budgets'] }
  }
  const pacing = enabled.map(c => (c.cost / daysElapsed) / c.daily_budget)
  const avgPacing = pacing.reduce((s, p) => s + p, 0) / pacing.length
  const overCount  = pacing.filter(p => p > 1.25).length
  const underCount = pacing.filter(p => p < 0.50).length

  let score = 100
  if (avgPacing > 1.3 || avgPacing < 0.4)  score = 30
  else if (avgPacing > 1.15 || avgPacing < 0.6) score = 60
  else if (avgPacing > 1.05 || avgPacing < 0.75) score = 80

  const status: 'good' | 'warn' | 'poor' = score >= 75 ? 'good' : score >= 50 ? 'warn' : 'poor'
  const actions: string[] = []
  if (overCount > 0)  actions.push(`${overCount} campaign${overCount !== 1 ? 's' : ''} over-pacing — review budgets or bid caps`)
  if (underCount > 0) actions.push(`${underCount} campaign${underCount !== 1 ? 's' : ''} under-pacing — check bids, Quality Scores, and audience targeting`)

  return { name: 'Budget Efficiency', icon: '💰', score, weight: 0.20, status,
    detail: `Avg pacing ${Math.round(avgPacing * 100)}% · ${overCount} over · ${underCount} severely under`, actions }
}

function campaignCoverage(campaigns: CampaignMetrics[]): ScoreComponent {
  const total   = campaigns.length
  if (total === 0) {
    return { name: 'Campaign Activity', icon: '📢', score: 0, weight: 0.20, status: 'poor',
      detail: 'No campaigns found.', actions: ['Create and activate campaigns'] }
  }
  const enabled = campaigns.filter(c => c.status === 'ENABLED' || c.status === '2')
  const withImp = enabled.filter(c => c.impressions > 0)
  const score   = enabled.length > 0 ? Math.round((withImp.length / enabled.length) * 100) : 0

  const status: 'good' | 'warn' | 'poor' = score >= 80 ? 'good' : score >= 50 ? 'warn' : 'poor'
  const actions: string[] = []
  if (enabled.length < total) {
    actions.push(`${total - enabled.length} paused campaign${total - enabled.length !== 1 ? 's' : ''} — review and reactivate if relevant`)
  }
  if (withImp.length < enabled.length) {
    actions.push(`${enabled.length - withImp.length} active campaign${enabled.length - withImp.length !== 1 ? 's' : ''} with zero impressions — check targeting, bids, and budgets`)
  }
  return { name: 'Campaign Activity', icon: '📢', score, weight: 0.20, status,
    detail: `${withImp.length} of ${enabled.length} active campaigns receiving impressions`, actions }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function gradeLabel(score: number): { label: string; color: string; bg: string; ring: string } {
  if (score >= 80) return { label: 'Excellent', color: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-300' }
  if (score >= 65) return { label: 'Good',      color: 'text-cyan-700',    bg: 'bg-cyan/5',     ring: 'ring-cyan/40'    }
  if (score >= 45) return { label: 'Fair',      color: 'text-amber-700',   bg: 'bg-amber-50',   ring: 'ring-amber-300'  }
  return                  { label: 'Poor',      color: 'text-red-700',     bg: 'bg-red-50',     ring: 'ring-red-300'    }
}

function statusIcon(s: ScoreComponent['status']) {
  if (s === 'good') return '✅'
  if (s === 'warn') return '⚠️'
  return '🔴'
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-emerald-400' : score >= 65 ? 'bg-cyan' : score >= 45 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="h-1.5 bg-cloud rounded-full overflow-hidden w-full">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${score}%` }} />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  campaigns: CampaignMetrics[]
  stats:     AccountStats
  startDate: string
  endDate:   string
}

function daysBetween(start: string, end: string): number {
  const a = new Date(start), b = new Date(end)
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1)
}

export function AccountHealthScore({ campaigns, stats, startDate, endDate }: Props) {
  const [expanded, setExpanded] = useState(false)

  const days = daysBetween(startDate, endDate)

  const components: ScoreComponent[] = [
    impShare(campaigns),
    ctrHealth(stats.totals),
    convPerf(stats.totals),
    budgetEff(campaigns, days),
    campaignCoverage(campaigns),
  ]

  // Weighted composite score
  const totalWeight = components.reduce((s, c) => s + c.weight, 0)
  const rawScore    = components.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight
  const score       = Math.round(rawScore)
  const grade       = gradeLabel(score)

  // Priority actions: collect from worst components first
  const allActions = components
    .filter(c => c.status !== 'good')
    .sort((a, b) => a.score - b.score)
    .flatMap(c => c.actions.map(action => ({ action, component: c.name })))
    .slice(0, 5)

  return (
    <div className={`border rounded-3xl overflow-hidden ${grade.bg} border-cloud`}>
      {/* ── Header (always visible) ── */}
      <button
        onClick={() => setExpanded(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-black/5 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          {/* Score ring */}
          <div className={`w-16 h-16 rounded-full flex-shrink-0 flex flex-col items-center justify-center ring-4 ${grade.ring} bg-white`}>
            <span className={`font-heading font-bold text-2xl leading-none ${grade.color}`}>{score}</span>
            <span className="text-[9px] text-navy/40 leading-none mt-0.5">/ 100</span>
          </div>
          <div>
            <p className="font-heading font-bold text-navy text-sm">Account Health Score</p>
            <p className={`text-sm font-bold ${grade.color}`}>{grade.label}</p>
            <p className="text-[10px] text-navy/50 mt-0.5">
              {components.filter(c => c.status === 'good').length} of {components.length} metrics healthy
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Mini component summary */}
          <div className="hidden sm:flex items-center gap-1.5">
            {components.map(c => (
              <div key={c.name} title={`${c.name}: ${c.score}/100`} className="flex flex-col items-center gap-0.5">
                <span className="text-base">{c.icon}</span>
                <span className={`text-[9px] font-bold ${c.status === 'good' ? 'text-emerald-600' : c.status === 'warn' ? 'text-amber-600' : 'text-red-600'}`}>
                  {c.score}
                </span>
              </div>
            ))}
          </div>
          <span className="text-navy/40 ml-2">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="border-t border-cloud/60 bg-white px-6 pb-6 space-y-5">

          {/* Priority actions */}
          {allActions.length > 0 && (
            <div className="pt-5">
              <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-3">🎯 Top Priority Actions</p>
              <div className="space-y-1.5">
                {allActions.map(({ action, component }, i) => (
                  <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <span className="text-amber-600 font-bold text-xs mt-0.5 flex-shrink-0">{i + 1}.</span>
                    <div>
                      <p className="text-xs text-navy">{action}</p>
                      <p className="text-[9px] text-navy/40 mt-0.5">{component}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Component breakdown */}
          <div>
            <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-3">Score Breakdown</p>
            <div className="space-y-4">
              {components.map(c => (
                <div key={c.name} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{c.icon}</span>
                      <span className="text-xs font-medium text-navy">{c.name}</span>
                      <span className="text-[10px] text-navy/40">{statusIcon(c.status)}</span>
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${c.status === 'good' ? 'text-emerald-600' : c.status === 'warn' ? 'text-amber-600' : 'text-red-600'}`}>
                      {c.score}/100
                    </span>
                  </div>
                  <ScoreBar score={c.score} />
                  <p className="text-[10px] text-navy/50">{c.detail}</p>
                  {c.status !== 'good' && c.actions.length > 0 && (
                    <div className="space-y-0.5 pl-3">
                      {c.actions.map((a, i) => (
                        <p key={i} className="text-[10px] text-navy/60">💡 {a}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Methodology note */}
          <p className="text-[10px] text-navy/30 border-t border-cloud pt-3">
            Health score is computed from the selected date range data: Impression Share (20%) ·
            CTR (20%) · Conversion Performance (20%) · Budget Efficiency (20%) · Campaign Activity (20%).
          </p>
        </div>
      )}
    </div>
  )
}
