'use client'
import { useState, useRef } from 'react'
import type { AccountStats, CampaignMetrics } from '@/lib/google-ads'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function curr(n: number, c = 'USD') {
  return `${c} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function pct(n: number)  { return `${n.toFixed(2)}%` }
function num(n: number)  { return n.toLocaleString(undefined, { maximumFractionDigits: 1 }) }

function pctChange(cur: number, prev: number) {
  if (prev === 0) return cur > 0 ? '+100%' : '—'
  const chg = ((cur - prev) / prev) * 100
  return `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%`
}

function pctChangeNum(cur: number, prev: number) {
  if (prev === 0) return null
  return ((cur - prev) / prev) * 100
}

// ─── Report content (also used for print) ─────────────────────────────────────
interface ReportData {
  clientName:  string
  startDate:   string
  endDate:     string
  stats:       AccountStats
  prevStats:   AccountStats | null
  campaigns:   CampaignMetrics[]
  currency:    string
}

function ReportContent({ data, printMode = false }: { data: ReportData; printMode?: boolean }) {
  const { clientName, startDate, endDate, stats, prevStats, campaigns, currency } = data
  const cur  = stats.totals
  const prev = prevStats?.totals

  const topCampaigns = [...campaigns]
    .filter(c => c.impressions > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5)

  const base = printMode ? 'text-black' : 'text-navy'

  return (
    <div className={`space-y-6 ${base} ${printMode ? 'print-report' : ''}`}>
      {/* Report header */}
      <div className="border-b-2 border-teal pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className={`font-heading font-bold text-2xl ${printMode ? 'text-black' : 'text-navy'}`}>
              Performance Report
            </h1>
            <p className={`text-lg font-medium mt-1 ${printMode ? 'text-gray-700' : 'text-teal'}`}>
              {clientName}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{startDate} → {endDate}</p>
            <p className={`text-xs mt-1 ${printMode ? 'text-gray-500' : 'text-navy/40'}`}>
              Generated {new Date().toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Executive summary */}
      <div>
        <h2 className={`font-heading font-bold text-base mb-3 ${printMode ? 'text-black' : 'text-navy'}`}>
          Executive Summary
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total Spend',       value: curr(cur.cost, currency),              prev: prev ? pctChange(cur.cost, prev.cost) : null,              positive: false },
            { label: 'Total Clicks',      value: num(cur.clicks),                       prev: prev ? pctChange(cur.clicks, prev.clicks) : null,           positive: true  },
            { label: 'Total Conversions', value: num(cur.conversions),                  prev: prev ? pctChange(cur.conversions, prev.conversions) : null,  positive: true  },
            { label: 'Avg CTR',           value: pct(cur.ctr),                          prev: prev ? pctChange(cur.ctr, prev.ctr) : null,                 positive: true  },
            { label: 'Conv Rate',         value: pct(cur.conversion_rate),              prev: prev ? pctChange(cur.conversion_rate, prev.conversion_rate) : null, positive: true },
            { label: 'Impressions',       value: num(cur.impressions),                  prev: prev ? pctChange(cur.impressions, prev.impressions) : null,  positive: true  },
          ].map(item => {
            const chgNum = prev && item.label !== 'Total Spend'
              ? pctChangeNum(
                  cur[item.label === 'Avg CTR' ? 'ctr' : item.label === 'Conv Rate' ? 'conversion_rate' : item.label === 'Total Spend' ? 'cost' : item.label === 'Total Clicks' ? 'clicks' : item.label === 'Total Conversions' ? 'conversions' : 'impressions'],
                  prev[item.label === 'Avg CTR' ? 'ctr' : item.label === 'Conv Rate' ? 'conversion_rate' : item.label === 'Total Spend' ? 'cost' : item.label === 'Total Clicks' ? 'clicks' : item.label === 'Total Conversions' ? 'conversions' : 'impressions']
                )
              : null
            const positive = chgNum !== null ? (item.positive ? chgNum >= 0 : chgNum <= 0) : null

            return (
              <div key={item.label} className={`rounded-xl p-3 ${printMode ? 'border border-gray-200' : 'border border-cloud bg-cloud/30'}`}>
                <p className={`text-[9px] uppercase tracking-wide mb-1 ${printMode ? 'text-gray-500' : 'text-navy/40'}`}>{item.label}</p>
                <p className="font-bold text-base">{item.value}</p>
                {item.prev && (
                  <p className={`text-[10px] font-medium mt-0.5 ${
                    positive === null ? 'text-gray-400' :
                    positive ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {item.prev} vs prior period
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Top campaigns */}
      {topCampaigns.length > 0 && (
        <div>
          <h2 className={`font-heading font-bold text-base mb-3 ${printMode ? 'text-black' : 'text-navy'}`}>
            Top 5 Campaigns by Spend
          </h2>
          <table className="w-full text-xs">
            <thead>
              <tr className={`${printMode ? 'bg-gray-100' : 'bg-cloud/50'} text-[10px] uppercase tracking-wide`}>
                <th className="text-left px-3 py-2 font-medium">Campaign</th>
                <th className="text-right px-2 py-2 font-medium">Spend</th>
                <th className="text-right px-2 py-2 font-medium">Clicks</th>
                <th className="text-right px-2 py-2 font-medium">CTR</th>
                <th className="text-right px-2 py-2 font-medium">Conv</th>
                <th className="text-right px-2 py-2 font-medium">CVR</th>
                <th className="text-right px-2 py-2 font-medium">CPA</th>
              </tr>
            </thead>
            <tbody>
              {topCampaigns.map((c, i) => (
                <tr key={c.id} className={i % 2 === 0 ? '' : (printMode ? 'bg-gray-50' : 'bg-cloud/20')}>
                  <td className="px-3 py-2 font-medium truncate max-w-[160px]" title={c.name}>{c.name}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{curr(c.cost, currency)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.clicks.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{pct(c.ctr)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.conversions.toFixed(0)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{pct(c.conversion_rate)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.cost_per_conversion > 0 ? curr(c.cost_per_conversion, currency) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Insights */}
      <div>
        <h2 className={`font-heading font-bold text-base mb-3 ${printMode ? 'text-black' : 'text-navy'}`}>
          Key Insights
        </h2>
        <div className="space-y-2">
          {generateInsights(cur, prev, campaigns, currency).map((insight, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 text-xs px-3 py-2 rounded-xl ${
                printMode ? 'border border-gray-200' :
                insight.type === 'positive' ? 'bg-emerald-50 border border-emerald-200' :
                insight.type === 'negative' ? 'bg-red-50 border border-red-200' :
                'bg-amber-50 border border-amber-200'
              }`}
            >
              <span className="flex-shrink-0">{insight.icon}</span>
              <p>{insight.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className={`border-t pt-3 text-[10px] ${printMode ? 'text-gray-400 border-gray-200' : 'text-navy/30 border-cloud'}`}>
        Report generated by Ads Builder · {new Date().toLocaleString()} · Data from Google Ads API
      </div>
    </div>
  )
}

// ─── Auto-generate insights ────────────────────────────────────────────────────
function generateInsights(
  cur: AccountStats['totals'],
  prev: AccountStats['totals'] | undefined,
  campaigns: CampaignMetrics[],
  currency: string
): Array<{ icon: string; text: string; type: 'positive' | 'negative' | 'neutral' }> {
  const insights = []

  if (prev) {
    const costChg = pctChangeNum(cur.cost, prev.cost)
    const convChg = pctChangeNum(cur.conversions, prev.conversions)

    if (convChg !== null && convChg > 20)
      insights.push({ icon: '🎯', type: 'positive' as const, text: `Conversions increased ${convChg.toFixed(0)}% vs prior period, indicating strong campaign performance.` })
    else if (convChg !== null && convChg < -20)
      insights.push({ icon: '⚠️', type: 'negative' as const, text: `Conversions dropped ${Math.abs(convChg).toFixed(0)}% vs prior period — recommend reviewing landing pages and keyword quality.` })

    if (costChg !== null && costChg > 30 && (convChg ?? 0) < costChg * 0.5)
      insights.push({ icon: '💸', type: 'negative' as const, text: `Spend increased ${costChg.toFixed(0)}% while conversions did not grow proportionally — review budget allocation.` })
  }

  const activeCampaigns = campaigns.filter(c => c.status === 'ENABLED' || c.status === '2')
  const darkCampaigns   = activeCampaigns.filter(c => c.impressions === 0)
  if (darkCampaigns.length > 0)
    insights.push({ icon: '📭', type: 'negative' as const, text: `${darkCampaigns.length} active campaign${darkCampaigns.length !== 1 ? 's' : ''} received zero impressions — check targeting, bids, and daily budgets.` })

  const searchCampaigns = campaigns.filter(c => c.search_impression_share !== null && c.search_impression_share > 0)
  if (searchCampaigns.length > 0) {
    const avgIS = searchCampaigns.reduce((s, c) => s + (c.search_impression_share ?? 0), 0) / searchCampaigns.length
    if (avgIS < 35)
      insights.push({ icon: '👁️', type: 'negative' as const, text: `Average Search Impression Share is ${avgIS.toFixed(0)}% — significant traffic is being missed. Consider raising bids or budgets.` })
    else if (avgIS >= 70)
      insights.push({ icon: '✅', type: 'positive' as const, text: `Strong average Impression Share of ${avgIS.toFixed(0)}% across Search campaigns.` })
  }

  if (cur.ctr < 2)
    insights.push({ icon: '🖱️', type: 'negative' as const, text: `Account CTR of ${pct(cur.ctr)} is below benchmark — consider refreshing ad copy and tightening keyword match types.` })
  else if (cur.ctr >= 6)
    insights.push({ icon: '🖱️', type: 'positive' as const, text: `Excellent CTR of ${pct(cur.ctr)} — ads are highly relevant to search queries.` })

  if (insights.length === 0)
    insights.push({ icon: 'ℹ️', type: 'neutral' as const, text: `Account performance is within normal parameters for the selected period.` })

  return insights
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  clientName:  string
  startDate:   string
  endDate:     string
  stats:       AccountStats
  prevStats:   AccountStats | null
  campaigns:   CampaignMetrics[]
}

export function ClientReportSection({
  clientName, startDate, endDate, stats, prevStats, campaigns,
}: Props) {
  const [open,     setOpen]     = useState(false)
  const reportRef  = useRef<HTMLDivElement>(null)

  function handlePrint() {
    window.print()
  }

  const data: ReportData = {
    clientName, startDate, endDate, stats, prevStats, campaigns,
    currency: stats.currency,
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="w-full border border-cloud rounded-2xl px-5 py-3.5 bg-white hover:border-teal/40 hover:bg-teal/5 transition-colors text-left flex items-center justify-between group"
    >
      <div className="flex items-center gap-3">
        <span className="text-lg">📄</span>
        <div>
          <p className="font-heading font-bold text-navy text-sm">Generate Client Report</p>
          <p className="text-[10px] text-navy/40 mt-0.5">Printable performance summary with insights</p>
        </div>
      </div>
      <span className="text-teal text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
        Open →
      </span>
    </button>
  )

  return (
    <div className="border border-cloud rounded-3xl overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-cloud bg-cloud/30">
        <div className="flex items-center gap-2">
          <span className="text-base">📄</span>
          <p className="font-heading font-bold text-navy text-sm">Client Report Preview</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-teal text-white text-xs font-heading font-bold px-4 py-2 rounded-xl hover:bg-teal/80 transition-colors"
          >
            🖨️ Print / Save PDF
          </button>
          <button
            onClick={() => setOpen(false)}
            className="text-navy/40 hover:text-navy text-sm px-2 py-1 rounded-lg hover:bg-cloud transition-colors"
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Report preview */}
      <div ref={reportRef} className="px-8 py-6">
        <ReportContent data={data} />
      </div>
    </div>
  )
}
