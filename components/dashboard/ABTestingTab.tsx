'use client'
import { useState, useEffect, useRef } from 'react'
import type { AdData } from '@/lib/google-ads'

// ─── Statistical helpers ──────────────────────────────────────────────────────
// Two-proportion z-test (one-tailed: is A better than B?)
function zTest(hits_a: number, n_a: number, hits_b: number, n_b: number): {
  z: number; confidence: number; significant: boolean
} {
  if (n_a < 30 || n_b < 30) return { z: 0, confidence: 0, significant: false }
  const p_a = hits_a / n_a
  const p_b = hits_b / n_b
  const p   = (hits_a + hits_b) / (n_a + n_b)  // pooled proportion
  const se  = Math.sqrt(p * (1 - p) * (1 / n_a + 1 / n_b))
  if (se === 0) return { z: 0, confidence: 0, significant: false }
  const z = (p_a - p_b) / se
  // Approximate confidence from |z|
  const absZ = Math.abs(z)
  let confidence = 0
  if (absZ >= 2.576) confidence = 99
  else if (absZ >= 1.960) confidence = 95
  else if (absZ >= 1.645) confidence = 90
  else if (absZ >= 1.282) confidence = 80
  return { z, confidence, significant: confidence >= 90 }
}

interface TestResult {
  metric:      'CTR' | 'CVR'
  winner:      'A' | 'B' | null   // null = inconclusive
  z:           number
  confidence:  number
  significant: boolean
  diff:        number   // % difference of winner vs loser
}

function runTests(adA: AdData, adB: AdData): TestResult[] {
  const results: TestResult[] = []

  // CTR test
  const ctr = zTest(adA.clicks, adA.impressions, adB.clicks, adB.impressions)
  results.push({
    metric:      'CTR',
    winner:      !ctr.significant ? null : ctr.z > 0 ? 'A' : 'B',
    z:           ctr.z,
    confidence:  ctr.confidence,
    significant: ctr.significant,
    diff: adB.ctr > 0 ? Math.abs(adA.ctr - adB.ctr) / adB.ctr * 100 : 0,
  })

  // CVR test (needs enough clicks)
  if (adA.clicks >= 30 && adB.clicks >= 30) {
    const cvr = zTest(adA.conversions, adA.clicks, adB.conversions, adB.clicks)
    results.push({
      metric:      'CVR',
      winner:      !cvr.significant ? null : cvr.z > 0 ? 'A' : 'B',
      z:           cvr.z,
      confidence:  cvr.confidence,
      significant: cvr.significant,
      diff: adB.conversion_rate > 0
        ? Math.abs(adA.conversion_rate - adB.conversion_rate) / adB.conversion_rate * 100 : 0,
    })
  }

  return results
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pct(n: number) { return `${n.toFixed(2)}%` }
function conf(c: number) {
  if (c === 0) return 'Inconclusive'
  return `${c}% confidence`
}

const CONF_COLOR: Record<number, string> = {
  99: 'text-emerald-700 bg-emerald-100',
  95: 'text-emerald-600 bg-emerald-50',
  90: 'text-amber-700 bg-amber-100',
  80: 'text-amber-600 bg-amber-50',
  0:  'text-navy/40 bg-cloud',
}

// Pick top 2 RSA ads per group (by impressions)
function pickVariants(ads: AdData[]): [AdData, AdData] | null {
  const enabled = ads
    .filter(a => a.status === 'ENABLED' || a.status === '2')
    .sort((a, b) => b.impressions - a.impressions)
  if (enabled.length < 2) return null
  return [enabled[0], enabled[1]]
}

function headlinePreview(ad: AdData): string {
  return ad.headlines.slice(0, 3).join(' | ') || '(no headlines)'
}

// ─── Ad card ─────────────────────────────────────────────────────────────────
function AdVariantCard({
  ad, label, isWinner, tests,
}: { ad: AdData; label: 'A' | 'B'; isWinner: boolean; tests: TestResult[] }) {
  const winBg    = isWinner ? 'border-emerald-300 bg-emerald-50/50' : 'border-cloud bg-white'
  const labelCfg = isWinner
    ? 'bg-emerald-500 text-white'
    : 'bg-navy/10 text-navy/60'

  return (
    <div className={`border rounded-2xl p-4 flex-1 min-w-0 ${winBg}`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${labelCfg}`}>
          Variant {label}
        </span>
        {isWinner && (
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
            🏆 Leading
          </span>
        )}
      </div>

      {/* Headline preview */}
      <p className="text-xs text-navy font-medium leading-snug mb-3 line-clamp-2">
        {headlinePreview(ad)}
      </p>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
        <div>
          <p className="text-navy/40 uppercase tracking-wide text-[9px]">Impressions</p>
          <p className="font-bold text-navy">{ad.impressions.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-navy/40 uppercase tracking-wide text-[9px]">Clicks</p>
          <p className="font-bold text-navy">{ad.clicks.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-navy/40 uppercase tracking-wide text-[9px]">CTR</p>
          <p className={`font-bold ${tests.find(t => t.metric === 'CTR')?.winner === label ? 'text-emerald-600' : 'text-navy'}`}>
            {pct(ad.ctr)}
          </p>
        </div>
        <div>
          <p className="text-navy/40 uppercase tracking-wide text-[9px]">Conv Rate</p>
          <p className={`font-bold ${tests.find(t => t.metric === 'CVR')?.winner === label ? 'text-emerald-600' : 'text-navy'}`}>
            {pct(ad.conversion_rate)}
          </p>
        </div>
        <div>
          <p className="text-navy/40 uppercase tracking-wide text-[9px]">Conversions</p>
          <p className="font-bold text-navy">{ad.conversions.toFixed(0)}</p>
        </div>
        <div>
          <p className="text-navy/40 uppercase tracking-wide text-[9px]">Cost</p>
          <p className="font-bold text-navy">${ad.cost.toFixed(2)}</p>
        </div>
      </div>

      {/* Ad strength badge */}
      <div className="mt-3 pt-2.5 border-t border-cloud/60">
        <p className="text-[9px] text-navy/40">
          Ad Strength: <span className="font-bold text-navy/60">{ad.ad_strength}</span>
          {' · '}{ad.headlines.length} headlines · {ad.descriptions.length} descriptions
        </p>
      </div>
    </div>
  )
}

// ─── Ad group test section ────────────────────────────────────────────────────
function AdGroupTest({ groupName, adA, adB }: {
  groupName: string
  adA: AdData
  adB: AdData
}) {
  const tests = runTests(adA, adB)
  const ctrTest = tests.find(t => t.metric === 'CTR')!
  const cvrTest = tests.find(t => t.metric === 'CVR')

  // Overall winner: prefer CVR winner (higher value), fallback to CTR
  const overallWinner = cvrTest?.winner ?? ctrTest?.winner ?? null

  // Data sufficiency
  const minImpressions = Math.min(adA.impressions, adB.impressions)
  const hasEnoughData  = minImpressions >= 100

  return (
    <div className="border border-cloud rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 bg-cloud/30 border-b border-cloud flex items-center justify-between gap-3">
        <div>
          <p className="font-heading font-bold text-navy text-xs">{groupName}</p>
          <p className="text-[10px] text-navy/50 mt-0.5">
            {minImpressions < 100
              ? `⚠️ Need ≥100 impressions per variant for reliable results (min: ${minImpressions})`
              : `${adA.impressions.toLocaleString()} vs ${adB.impressions.toLocaleString()} impressions`
            }
          </p>
        </div>
        {overallWinner && hasEnoughData && (
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-full flex-shrink-0">
            Variant {overallWinner} leading
          </span>
        )}
        {!overallWinner && hasEnoughData && (
          <span className="text-[10px] font-medium text-navy/40 bg-cloud px-2.5 py-1 rounded-full flex-shrink-0">
            No clear winner yet
          </span>
        )}
      </div>

      {/* Variant cards side-by-side */}
      <div className="p-4 flex gap-3">
        <AdVariantCard
          ad={adA}
          label="A"
          isWinner={overallWinner === 'A'}
          tests={tests}
        />
        <div className="flex items-center justify-center flex-shrink-0 text-navy/20 font-bold text-sm">
          vs
        </div>
        <AdVariantCard
          ad={adB}
          label="B"
          isWinner={overallWinner === 'B'}
          tests={tests}
        />
      </div>

      {/* Statistical results */}
      {hasEnoughData && (
        <div className="border-t border-cloud px-5 pb-4 pt-3 space-y-2.5">
          <p className="text-[9px] font-heading font-bold uppercase tracking-wider text-teal">Statistical Test Results</p>
          {tests.map(test => (
            <div key={test.metric} className="flex items-center gap-3">
              <span className="text-[10px] font-medium text-navy/60 w-8">{test.metric}</span>
              <div className="flex-1 h-1.5 bg-cloud rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    test.confidence >= 95 ? 'bg-emerald-400' :
                    test.confidence >= 90 ? 'bg-amber-400' :
                    test.confidence >= 80 ? 'bg-amber-300' : 'bg-cloud'
                  }`}
                  style={{ width: `${test.confidence}%` }}
                />
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${CONF_COLOR[test.confidence] ?? CONF_COLOR[0]}`}>
                {conf(test.confidence)}
              </span>
              {test.significant && test.winner && (
                <span className="text-[10px] text-navy/50 flex-shrink-0">
                  Variant {test.winner} +{test.diff.toFixed(1)}%
                </span>
              )}
            </div>
          ))}

          {/* Recommendation */}
          <div className={`mt-3 px-3 py-2 rounded-xl text-[10px] border ${
            overallWinner
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-cloud border-cloud text-navy/50'
          }`}>
            {overallWinner && ctrTest.significant
              ? `💡 Recommendation: Variant ${overallWinner} is performing significantly better. Consider pausing the weaker variant or allocating more budget to the winner.`
              : '💡 Continue running both variants. More data is needed to reach statistical significance. Aim for ≥1,000 impressions per variant.'}
          </div>
        </div>
      )}

      {/* Not enough data */}
      {!hasEnoughData && (
        <div className="border-t border-cloud px-5 py-3">
          <p className="text-[10px] text-navy/40">
            📊 Gather at least <strong>100 impressions per variant</strong> before drawing conclusions.
            Currently at {minImpressions} impressions minimum.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Main tab ─────────────────────────────────────────────────────────────────
interface Props {
  clientId:   string
  campaignId: string
  startDate:  string
  endDate:    string
  currency:   string
}

export function ABTestingTab({ clientId, campaignId, startDate, endDate }: Props) {
  const [ads,     setAds]     = useState<AdData[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const fetched = useRef(false)

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    setLoading(true)
    fetch(`/api/ads?client_account_id=${clientId}&campaign_id=${campaignId}&start_date=${startDate}&end_date=${endDate}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setAds(d.ads ?? [])
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [clientId, campaignId, startDate, endDate])

  if (loading) return (
    <div className="space-y-4 py-4 animate-pulse">
      {[1,2].map(i => <div key={i} className="h-48 bg-cloud rounded-2xl" />)}
    </div>
  )

  if (error) return (
    <div className="py-6 text-center text-sm text-red-600">{error}</div>
  )

  // Group by ad group
  const byGroup = new Map<string, { name: string; ads: AdData[] }>()
  for (const ad of ads) {
    const prev = byGroup.get(ad.ad_group_id)
    if (prev) {
      prev.ads.push(ad)
    } else {
      byGroup.set(ad.ad_group_id, { name: ad.ad_group_name, ads: [ad] })
    }
  }

  // Only keep groups with 2+ ads
  const testableGroups = Array.from(byGroup.entries())
    .filter(([, g]) => g.ads.length >= 2)
    .sort(([, a], [, b]) => {
      const aImpr = a.ads.reduce((s, ad) => s + ad.impressions, 0)
      const bImpr = b.ads.reduce((s, ad) => s + ad.impressions, 0)
      return bImpr - aImpr
    })

  const untestableGroups = Array.from(byGroup.entries())
    .filter(([, g]) => g.ads.length < 2)

  if (ads.length === 0) return (
    <div className="py-12 text-center text-sm text-navy/40">
      <p className="text-2xl mb-2">🧪</p>
      <p>No ads found for this campaign.</p>
    </div>
  )

  if (testableGroups.length === 0) return (
    <div className="py-12 text-center text-sm text-navy/40 space-y-2">
      <p className="text-2xl">🧪</p>
      <p className="font-medium text-navy/60">No A/B test pairs found</p>
      <p className="text-xs">Each ad group needs at least 2 active ads to compare.</p>
      <p className="text-xs">
        {untestableGroups.length} ad group{untestableGroups.length !== 1 ? 's' : ''} found — all have only 1 active ad.
      </p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-navy/50">
          {testableGroups.length} ad group{testableGroups.length !== 1 ? 's' : ''} with active variants
        </p>
        <p className="text-[10px] text-navy/30">
          Two-proportion z-test · 90% confidence threshold
        </p>
      </div>

      {/* Test groups */}
      {testableGroups.map(([groupId, group]) => {
        const pair = pickVariants(group.ads)
        if (!pair) return null
        return (
          <AdGroupTest
            key={groupId}
            groupName={group.name}
            adA={pair[0]}
            adB={pair[1]}
          />
        )
      })}

      {/* Groups with only 1 ad */}
      {untestableGroups.length > 0 && (
        <div className="border border-cloud rounded-2xl p-4 bg-cloud/20">
          <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-navy/40 mb-2">
            Single-ad groups (no test possible)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {untestableGroups.map(([id, g]) => (
              <span key={id} className="text-[10px] bg-white border border-cloud text-navy/50 px-2 py-0.5 rounded-full">
                {g.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Methodology note */}
      <p className="text-[10px] text-navy/30 pt-2">
        Statistical significance is calculated using a two-proportion z-test comparing CTR (clicks/impressions)
        and CVR (conversions/clicks) between the two highest-impression variants per ad group.
        Results at ≥90% confidence are considered actionable.
      </p>
    </div>
  )
}
