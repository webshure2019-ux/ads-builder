'use client'
import { useState, useEffect, useRef } from 'react'
import type { AdData, AssetPerformance } from '@/lib/google-ads'

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_HEADLINES    = 15
const MAX_DESCRIPTIONS = 4

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STRENGTH_CFG: Record<string, { label: string; color: string; bg: string }> = {
  EXCELLENT: { label: 'Excellent', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  GOOD:      { label: 'Good',      color: 'text-cyan-700',    bg: 'bg-cyan/15'     },
  AVERAGE:   { label: 'Average',   color: 'text-amber-700',   bg: 'bg-amber-100'   },
  POOR:      { label: 'Poor',      color: 'text-red-700',     bg: 'bg-red-100'     },
  PENDING:   { label: 'Pending',   color: 'text-navy/50',     bg: 'bg-cloud'       },
  UNKNOWN:   { label: 'Unknown',   color: 'text-navy/40',     bg: 'bg-cloud'       },
}

const PERF_CFG: Record<string, { label: string; dot: string; text: string }> = {
  BEST:     { label: 'Best',     dot: 'bg-emerald-500', text: 'text-emerald-700' },
  GOOD:     { label: 'Good',     dot: 'bg-cyan-500',    text: 'text-cyan-700'    },
  LOW:      { label: 'Low',      dot: 'bg-red-400',     text: 'text-red-600'     },
  LEARNING: { label: 'Learning', dot: 'bg-amber-400',   text: 'text-amber-600'   },
  UNRATED:  { label: 'Unrated',  dot: 'bg-navy/20',     text: 'text-navy/40'     },
}

function isDKI(text: string) { return /\{KeyWord:/i.test(text) }

// Copy suggestions based on asset analysis
interface Suggestion { icon: string; text: string; severity: 'error' | 'warn' | 'info' }

function buildSuggestions(ad: AdData, assets: AssetPerformance[]): Suggestion[] {
  const suggs: Suggestion[] = []
  const headlines    = ad.headlines
  const descriptions = ad.descriptions

  // Coverage
  if (headlines.length < 10)
    suggs.push({ icon: '📝', severity: 'error', text: `Only ${headlines.length}/15 headlines — add ${10 - headlines.length}+ more to maximise Google's testing` })
  else if (headlines.length < 15)
    suggs.push({ icon: '📝', severity: 'warn', text: `${headlines.length}/15 headlines — consider filling all 15 slots for maximum coverage` })

  if (descriptions.length < 4)
    suggs.push({ icon: '📝', severity: 'warn', text: `Only ${descriptions.length}/4 descriptions — add more variants for better rotation` })

  // Low performers
  const headlineAssets = assets.filter(a => a.field_type === 'HEADLINE')
  const descAssets     = assets.filter(a => a.field_type === 'DESCRIPTION')
  const lowHeadlines   = headlineAssets.filter(a => a.label === 'LOW')
  const bestHeadlines  = headlineAssets.filter(a => a.label === 'BEST')

  if (lowHeadlines.length > 0)
    suggs.push({ icon: '🔴', severity: 'error', text: `${lowHeadlines.length} headline${lowHeadlines.length !== 1 ? 's' : ''} rated LOW — replace with stronger CTAs or include keyword-rich variants` })

  if (bestHeadlines.length === 0 && headlineAssets.length > 0)
    suggs.push({ icon: '⭐', severity: 'warn', text: 'No BEST-rated headlines yet — let ads run longer or try more specific, benefit-driven copy' })

  // DKI usage
  const hasDKI = headlines.some(isDKI)
  if (!hasDKI && headlines.length > 0)
    suggs.push({ icon: '🔑', severity: 'info', text: 'No Dynamic Keyword Insertion detected — consider adding {KeyWord:Fallback} for relevance boost' })

  // Duplication check
  const normalised = headlines.map(h => h.toLowerCase().replace(/\s+/g, ' ').trim())
  const dupes = normalised.filter((h, i) => normalised.indexOf(h) !== i)
  if (dupes.length > 0)
    suggs.push({ icon: '♻️', severity: 'warn', text: `Possible duplicate headline text detected — ensure each headline is unique` })

  // Length variety: encourage short + long mix
  const shortHeadlines = headlines.filter(h => h.replace(/\{[^}]+\}/g, 'X').length <= 15)
  if (shortHeadlines.length === 0 && headlines.length >= 5)
    suggs.push({ icon: '📏', severity: 'info', text: 'All headlines are long — add 2–3 short (≤15 char) headlines for smaller ad placements' })

  // Description length
  const shortDescs = descriptions.filter(d => d.length < 60)
  if (shortDescs.length > 0)
    suggs.push({ icon: '📏', severity: 'info', text: `${shortDescs.length} description${shortDescs.length !== 1 ? 's' : ''} under 60 chars — use the full 90 characters to convey more value` })

  // Ad strength
  if (ad.ad_strength === 'POOR' || ad.ad_strength === 'AVERAGE')
    suggs.push({ icon: '💪', severity: 'error', text: `Ad strength is ${ad.ad_strength} — improve headlines, descriptions, and add more unique copy variations` })

  return suggs
}

// ─── Asset performance panel (lazy-loaded per ad) ─────────────────────────────
function AssetPanel({ clientId, adGroupId, adId, ad }: {
  clientId:   string
  adGroupId:  string
  adId:       string
  ad:         AdData
}) {
  const [assets,  setAssets]  = useState<AssetPerformance[] | null>(null)
  const [loading, setLoading] = useState(false)
  const fetched = useRef(false)

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    setLoading(true)
    fetch(`/api/ad-assets?client_account_id=${clientId}&ad_group_id=${adGroupId}&ad_id=${adId}`)
      .then(r => r.json())
      .then(d => setAssets(d.assets ?? []))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false))
  }, [clientId, adGroupId, adId])

  const suggestions = assets ? buildSuggestions(ad, assets) : []
  const headlineAssets    = assets?.filter(a => a.field_type === 'HEADLINE')    ?? []
  const descriptionAssets = assets?.filter(a => a.field_type === 'DESCRIPTION') ?? []

  if (loading) return (
    <div className="animate-pulse space-y-2 py-3">
      {[1,2,3].map(i => <div key={i} className="h-5 bg-cloud rounded" />)}
    </div>
  )

  return (
    <div className="space-y-4 pt-3">
      {/* Coverage bars */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[9px] text-navy/40 uppercase tracking-wide">Headlines</p>
            <p className={`text-[10px] font-bold ${ad.headlines.length >= 10 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {ad.headlines.length}/{MAX_HEADLINES}
            </p>
          </div>
          <div className="h-1.5 bg-cloud rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${ad.headlines.length >= 10 ? 'bg-emerald-400' : 'bg-amber-400'}`}
              style={{ width: `${(ad.headlines.length / MAX_HEADLINES) * 100}%` }}
            />
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[9px] text-navy/40 uppercase tracking-wide">Descriptions</p>
            <p className={`text-[10px] font-bold ${ad.descriptions.length >= 4 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {ad.descriptions.length}/{MAX_DESCRIPTIONS}
            </p>
          </div>
          <div className="h-1.5 bg-cloud rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${ad.descriptions.length >= 4 ? 'bg-emerald-400' : 'bg-amber-400'}`}
              style={{ width: `${(ad.descriptions.length / MAX_DESCRIPTIONS) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Headlines with performance labels */}
      {ad.headlines.length > 0 && (
        <div>
          <p className="text-[9px] text-navy/40 uppercase tracking-wide mb-2">Headlines</p>
          <div className="space-y-1">
            {ad.headlines.map((h, i) => {
              const asset  = headlineAssets.find(a => a.text === h)
              const perf   = PERF_CFG[asset?.label ?? 'UNRATED']
              const charLen = h.replace(/\{[^}]+\}/g, 'XXXXXXXXXXXXXXXXXXX').length // estimate after DKI
              return (
                <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-cloud/30 transition-colors">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${perf.dot}`} title={perf.label} />
                  <span className="text-xs text-navy flex-1 truncate" title={h}>
                    {h}
                    {isDKI(h) && <span className="ml-1 text-[9px] text-teal bg-teal/10 px-1 rounded">DKI</span>}
                  </span>
                  <span className={`text-[9px] flex-shrink-0 ${perf.text}`}>{perf.label}</span>
                  <span className={`text-[9px] flex-shrink-0 tabular-nums ${charLen > 30 ? 'text-red-500' : 'text-navy/30'}`}>
                    {h.length}c
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Descriptions with performance labels */}
      {ad.descriptions.length > 0 && (
        <div>
          <p className="text-[9px] text-navy/40 uppercase tracking-wide mb-2">Descriptions</p>
          <div className="space-y-1">
            {ad.descriptions.map((d, i) => {
              const asset = descriptionAssets.find(a => a.text === d)
              const perf  = PERF_CFG[asset?.label ?? 'UNRATED']
              return (
                <div key={i} className="flex items-start gap-2 rounded-lg px-2 py-1 hover:bg-cloud/30 transition-colors">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${perf.dot}`} title={perf.label} />
                  <span className="text-xs text-navy flex-1 leading-snug">{d}</span>
                  <span className={`text-[9px] flex-shrink-0 ${perf.text}`}>{perf.label}</span>
                  <span className={`text-[9px] flex-shrink-0 tabular-nums ${d.length > 90 ? 'text-red-500' : 'text-navy/30'}`}>
                    {d.length}c
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-1.5 border-t border-cloud pt-3">
          <p className="text-[9px] text-navy/40 uppercase tracking-wide mb-2">💡 Copy Recommendations</p>
          {suggestions.map((s, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 px-3 py-2 rounded-xl text-xs ${
                s.severity === 'error' ? 'bg-red-50 border border-red-200' :
                s.severity === 'warn'  ? 'bg-amber-50 border border-amber-200' :
                'bg-blue-50 border border-blue-200'
              }`}
            >
              <span className="flex-shrink-0">{s.icon}</span>
              <p className={
                s.severity === 'error' ? 'text-red-700' :
                s.severity === 'warn'  ? 'text-amber-700' :
                'text-blue-700'
              }>{s.text}</p>
            </div>
          ))}
        </div>
      )}

      {suggestions.length === 0 && assets && assets.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2 border border-emerald-200">
          <span>✅</span>
          <p>Copy looks healthy — no significant issues detected.</p>
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

export function RSACopyTab({ clientId, campaignId, startDate, endDate, currency }: Props) {
  const [ads,     setAds]     = useState<AdData[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [openId,  setOpenId]  = useState<string | null>(null)
  const fetched = useRef(false)

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    setLoading(true)
    fetch(`/api/ads?client_account_id=${clientId}&campaign_id=${campaignId}&start_date=${startDate}&end_date=${endDate}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        // Filter to RSA only
        const rsas = (d.ads as AdData[]).filter(a =>
          a.type === 'RSA' || a.type === '15' || a.type === 'RESPONSIVE_SEARCH_AD'
        )
        setAds(rsas)
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [clientId, campaignId, startDate, endDate])

  if (loading) return (
    <div className="space-y-3 py-4">
      {[1,2,3].map(i => (
        <div key={i} className="animate-pulse border border-cloud rounded-2xl p-4">
          <div className="h-4 w-1/2 bg-cloud rounded mb-2" />
          <div className="h-3 w-1/3 bg-cloud rounded" />
        </div>
      ))}
    </div>
  )

  if (error) return (
    <div className="py-6 text-center text-sm text-red-600">{error}</div>
  )

  if (ads.length === 0) return (
    <div className="py-12 text-center text-sm text-navy/40">
      <p className="text-2xl mb-2">📝</p>
      <p>No Responsive Search Ads found for this campaign.</p>
    </div>
  )

  // Account-level summary
  const strengthCounts = ads.reduce<Record<string, number>>((acc, a) => {
    acc[a.ad_strength] = (acc[a.ad_strength] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border border-cloud rounded-2xl px-4 py-3 text-center">
          <p className="text-[9px] text-navy/40 uppercase tracking-wide mb-0.5">RSAs</p>
          <p className="font-heading font-bold text-navy text-xl">{ads.length}</p>
        </div>
        {(['EXCELLENT','GOOD','AVERAGE','POOR'] as const).map(s => (
          <div key={s} className={`border rounded-2xl px-4 py-3 text-center ${STRENGTH_CFG[s].bg}`}>
            <p className="text-[9px] text-navy/40 uppercase tracking-wide mb-0.5">{STRENGTH_CFG[s].label}</p>
            <p className={`font-heading font-bold text-xl ${STRENGTH_CFG[s].color}`}>
              {strengthCounts[s] ?? 0}
            </p>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-navy/50">
        {Object.entries(PERF_CFG).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full inline-block ${cfg.dot}`} />
            {cfg.label}
          </span>
        ))}
      </div>

      {/* RSA cards */}
      {ads.map(ad => {
        const strength = STRENGTH_CFG[ad.ad_strength] ?? STRENGTH_CFG['UNKNOWN']
        const isOpen   = openId === ad.id
        return (
          <div key={ad.id} className="border border-cloud rounded-2xl overflow-hidden">
            {/* Card header */}
            <button
              onClick={() => setOpenId(isOpen ? null : ad.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-cloud/30 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${strength.bg} ${strength.color}`}>
                  {strength.label}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-navy truncate">{ad.ad_group_name}</p>
                  <p className="text-[10px] text-navy/40">
                    {ad.headlines.length} headlines · {ad.descriptions.length} descriptions ·{' '}
                    {ad.impressions.toLocaleString()} impr · {ad.clicks.toLocaleString()} clicks
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {ad.ad_strength === 'POOR' && (
                  <span className="text-red-500 text-[10px] font-bold">⚠️ Needs work</span>
                )}
                <span className="text-navy/40 text-sm">{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {/* Expanded panel */}
            {isOpen && (
              <div className="border-t border-cloud px-4 pb-4">
                <AssetPanel
                  clientId={clientId}
                  adGroupId={ad.ad_group_id}
                  adId={ad.id}
                  ad={ad}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
