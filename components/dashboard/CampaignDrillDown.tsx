'use client'
import { useState, useEffect } from 'react'
import type { AdGroupMetrics, AdData } from '@/lib/google-ads'

// ─── Ad type labels ────────────────────────────────────────────────────────────
const AD_TYPE_MAP: Record<string, string> = {
  RESPONSIVE_SEARCH_AD: 'RSA',
  EXPANDED_TEXT_AD:     'ETA',
  CALL_ONLY_AD:         'Call Only',
  CALL_AD:              'Call Ad',
  RESPONSIVE_DISPLAY_AD:'Display',
  SHOPPING_PRODUCT_AD:  'Shopping',
  VIDEO_AD:             'Video',
  SMART_CAMPAIGN_AD:    'Smart',
  // Numeric enum fallbacks
  '15': 'RSA', '2': 'ETA', '6': 'Call Only', '29': 'Call Ad',
  '19': 'Display', '10': 'Shopping', '12': 'Video', '25': 'Smart',
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function isEnabled(status: string) {
  return status === 'ENABLED' || status === '2'
}

function StatusBadge({ status }: { status: string }) {
  const on = isEnabled(status)
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
      on ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${on ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {on ? 'Active' : 'Paused'}
    </span>
  )
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-heading font-bold uppercase tracking-wider text-teal mb-0.5">{label}</p>
      <p className="font-heading font-bold text-navy text-sm tabular-nums">{value}</p>
    </div>
  )
}

function PanelError({ msg }: { msg: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 mt-4">{msg}</div>
  )
}

function PanelSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-teal text-sm">
      <div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
      {label}
    </div>
  )
}

// ─── Ad Groups tab ─────────────────────────────────────────────────────────────
function AdGroupsTab({
  adGroups,
  currency,
  loading,
  error,
}: {
  adGroups: AdGroupMetrics[]
  currency: string
  loading:  boolean
  error:    string
}) {
  if (loading) return <PanelSpinner label="Loading ad groups…" />
  if (error)   return <PanelError msg={error} />
  if (adGroups.length === 0) return (
    <div className="text-center py-16 text-teal text-sm">No ad groups found for this period.</div>
  )

  const totals = adGroups.reduce(
    (acc, g) => ({ impressions: acc.impressions + g.impressions, clicks: acc.clicks + g.clicks,
      cost: acc.cost + g.cost, conversions: acc.conversions + g.conversions }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[700px]">
        <thead>
          <tr className="border-b border-cloud">
            <th className="text-left px-4 py-3 text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Ad Group</th>
            <th className="text-left px-4 py-3 text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Status</th>
            <th className="text-right px-4 py-3 text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Impressions</th>
            <th className="text-right px-4 py-3 text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Clicks</th>
            <th className="text-right px-4 py-3 text-[10px] font-heading font-bold uppercase tracking-wider text-teal">CTR</th>
            <th className="text-right px-4 py-3 text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Cost</th>
            <th className="text-right px-4 py-3 text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Conversions</th>
            <th className="text-right px-4 py-3 text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Conv. Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cloud">
          {adGroups.map(g => (
            <tr key={g.id} className="hover:bg-mist/50 transition-colors">
              <td className="px-4 py-3 font-medium text-navy max-w-[260px]">
                <p className="truncate" title={g.name}>{g.name}</p>
              </td>
              <td className="px-4 py-3"><StatusBadge status={g.status} /></td>
              <td className="px-4 py-3 text-right tabular-nums text-navy/80">{g.impressions.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tabular-nums text-navy/80">{g.clicks.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tabular-nums text-navy/80">{g.ctr.toFixed(2)}%</td>
              <td className="px-4 py-3 text-right tabular-nums text-navy/80">
                {currency} {g.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-navy/80">{g.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
              <td className="px-4 py-3 text-right tabular-nums text-navy/80">{g.conversion_rate.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-cloud/70 bg-mist">
            <td className="px-4 py-3 text-[11px] font-heading font-bold text-navy">
              Total · {adGroups.length} group{adGroups.length !== 1 ? 's' : ''}
            </td>
            <td />
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">{totals.impressions.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">{totals.clicks.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">
              {totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : '0.00'}%
            </td>
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">
              {currency} {totals.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">
              {totals.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </td>
            <td className="px-4 py-3 text-right text-xs font-bold text-navy tabular-nums">
              {totals.clicks > 0 ? ((totals.conversions / totals.clicks) * 100).toFixed(2) : '0.00'}%
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Ads tab ───────────────────────────────────────────────────────────────────
function AdsTab({
  ads,
  currency,
  loading,
  error,
}: {
  ads:      AdData[]
  currency: string
  loading:  boolean
  error:    string
}) {
  if (loading) return <PanelSpinner label="Loading ads…" />
  if (error)   return <PanelError msg={error} />
  if (ads.length === 0) return (
    <div className="text-center py-16 text-teal text-sm">No ads found for this period.</div>
  )

  return (
    <div className="space-y-4">
      {ads.map(ad => {
        const typeLabel = AD_TYPE_MAP[ad.type] ?? ad.type
        const isRSA     = typeLabel === 'RSA'
        const h         = ad.headlines.slice(0, 3)
        const d         = ad.descriptions.slice(0, 2)

        return (
          <div key={ad.id} className="border border-cloud rounded-2xl overflow-hidden">
            {/* Ad header */}
            <div className="bg-mist px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[11px] font-bold bg-navy/10 text-navy px-2.5 py-1 rounded-full whitespace-nowrap">
                  {typeLabel}
                </span>
                <p className="text-xs text-teal truncate" title={ad.ad_group_name}>
                  Ad Group: {ad.ad_group_name}
                </p>
              </div>
              <StatusBadge status={ad.status} />
            </div>

            {/* Ad copy preview */}
            <div className="px-5 py-4 border-b border-cloud">
              {/* URL */}
              {ad.final_url && (
                <p className="text-[11px] text-emerald-700 mb-2 truncate" title={ad.final_url}>
                  🌐 {ad.final_url}
                </p>
              )}

              {/* Headlines */}
              {h.length > 0 ? (
                <div className="mb-3">
                  <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-1.5">
                    Headlines {isRSA && <span className="text-navy/30 font-normal normal-case tracking-normal">(showing 3 of {ad.headlines.length})</span>}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {h.map((hl, i) => (
                      <span key={i} className="text-xs bg-cyan/10 text-navy px-2.5 py-1 rounded-lg border border-cyan/20">
                        {hl}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-navy/40 italic mb-3">No headlines available for this ad type.</p>
              )}

              {/* Descriptions */}
              {d.length > 0 && (
                <div>
                  <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-1.5">
                    Descriptions {isRSA && <span className="text-navy/30 font-normal normal-case tracking-normal">(showing 2 of {ad.descriptions.length})</span>}
                  </p>
                  <div className="space-y-1">
                    {d.map((desc, i) => (
                      <p key={i} className="text-xs text-navy/70 leading-relaxed">{desc}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Metrics row */}
            <div className="px-5 py-3.5 grid grid-cols-4 gap-4">
              <MetricCell label="Impressions" value={ad.impressions.toLocaleString()} />
              <MetricCell label="Clicks"      value={ad.clicks.toLocaleString()} />
              <MetricCell label="CTR"         value={`${ad.ctr.toFixed(2)}%`} />
              <MetricCell label="Cost"        value={`${currency} ${ad.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main drill-down panel ─────────────────────────────────────────────────────
export type DrillView = 'ad_groups' | 'ads'

interface Props {
  campaignId:   string
  campaignName: string
  clientId:     string
  currency:     string
  startDate:    string
  endDate:      string
  initialView:  DrillView
  onClose:      () => void
}

export function CampaignDrillDown({
  campaignId, campaignName, clientId, currency, startDate, endDate, initialView, onClose,
}: Props) {
  const [view, setView] = useState<DrillView>(initialView)

  // Ad groups state
  const [adGroups,    setAdGroups]    = useState<AdGroupMetrics[]>([])
  const [agLoading,   setAgLoading]   = useState(false)
  const [agError,     setAgError]     = useState('')
  const [agFetched,   setAgFetched]   = useState(false)

  // Ads state
  const [ads,         setAds]         = useState<AdData[]>([])
  const [adsLoading,  setAdsLoading]  = useState(false)
  const [adsError,    setAdsError]    = useState('')
  const [adsFetched,  setAdsFetched]  = useState(false)

  // Fetch ad groups when needed
  useEffect(() => {
    if (view !== 'ad_groups' || agFetched) return
    setAgLoading(true)
    setAgError('')
    fetch(`/api/ad-groups?client_account_id=${clientId}&campaign_id=${campaignId}&start_date=${startDate}&end_date=${endDate}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Failed to load ad groups')
        setAdGroups(d.adGroups ?? [])
        setAgFetched(true)
      })
      .catch(e => setAgError(String(e)))
      .finally(() => setAgLoading(false))
  }, [view, agFetched, clientId, campaignId, startDate, endDate])

  // Fetch ads when needed
  useEffect(() => {
    if (view !== 'ads' || adsFetched) return
    setAdsLoading(true)
    setAdsError('')
    fetch(`/api/ads?client_account_id=${clientId}&campaign_id=${campaignId}&start_date=${startDate}&end_date=${endDate}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Failed to load ads')
        setAds(d.ads ?? [])
        setAdsFetched(true)
      })
      .catch(e => setAdsError(String(e)))
      .finally(() => setAdsLoading(false))
  }, [view, adsFetched, clientId, campaignId, startDate, endDate])

  const TABS: { key: DrillView; label: string; icon: string }[] = [
    { key: 'ad_groups', label: 'Ad Groups', icon: '👥' },
    { key: 'ads',       label: 'Ads',        icon: '📄' },
  ]

  return (
    <div className="bg-white border-2 border-cyan/30 rounded-2xl overflow-hidden mt-4 animate-in fade-in duration-200">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-cloud bg-mist flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs text-navy/50 hover:text-navy transition-colors font-medium flex-shrink-0"
          >
            ← Back
          </button>
          <span className="text-navy/20 select-none">|</span>
          <p className="font-heading font-bold text-navy text-sm truncate" title={campaignName}>
            {campaignName}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-white border border-cloud rounded-xl p-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                view === t.key ? 'bg-navy text-cyan' : 'text-navy/50 hover:text-navy'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="p-5">
        {view === 'ad_groups' && (
          <AdGroupsTab
            adGroups={adGroups}
            currency={currency}
            loading={agLoading}
            error={agError}
          />
        )}
        {view === 'ads' && (
          <AdsTab
            ads={ads}
            currency={currency}
            loading={adsLoading}
            error={adsError}
          />
        )}
      </div>
    </div>
  )
}
