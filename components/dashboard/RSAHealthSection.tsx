'use client'
import { useState, useRef, useMemo, useEffect } from 'react'
import type { RSAHealthRow } from '@/lib/google-ads'

type Strength = 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'POOR' | 'PENDING' | 'UNSPECIFIED'

const STRENGTH_CFG: Record<Strength, { label: string; color: string; bg: string; ring: string; order: number }> = {
  EXCELLENT:   { label: 'Excellent', color: 'text-emerald-700', bg: 'bg-emerald-100',  ring: 'border-emerald-300', order: 0 },
  GOOD:        { label: 'Good',      color: 'text-cyan-800',    bg: 'bg-cyan/10',      ring: 'border-cyan/30',    order: 1 },
  AVERAGE:     { label: 'Average',   color: 'text-amber-700',   bg: 'bg-amber-100',    ring: 'border-amber-300',  order: 2 },
  POOR:        { label: 'Poor',      color: 'text-red-700',     bg: 'bg-red-100',      ring: 'border-red-300',    order: 3 },
  PENDING:     { label: 'Pending',   color: 'text-navy/50',     bg: 'bg-cloud',        ring: 'border-cloud',      order: 4 },
  UNSPECIFIED: { label: '—',         color: 'text-navy/30',     bg: 'bg-cloud/60',     ring: 'border-cloud/60',   order: 5 },
}

function strengthKey(s: string): Strength {
  return (s in STRENGTH_CFG) ? s as Strength : 'UNSPECIFIED'
}

function StrengthBadge({ strength }: { strength: string }) {
  const key = strengthKey(strength)
  const cfg = STRENGTH_CFG[key]
  return (
    <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.ring}`}>
      {cfg.label}
    </span>
  )
}

interface CampaignSummary {
  campaignId:   string
  campaignName: string
  ads:          RSAHealthRow[]
  excellent:    number
  good:         number
  average:      number
  poor:         number
  pending:      number
}

export function RSAHealthSection({ clientId }: { clientId: string }) {
  const [open,    setOpen]    = useState(false)
  const [ads,     setAds]     = useState<RSAHealthRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const fetchedKey = useRef('')

  function toggle() {
    setOpen(o => !o)
  }

  // Fetch (or re-fetch on client switch) whenever the section is open and the key changes
  useEffect(() => {
    if (!open || fetchedKey.current === clientId) return
    fetchedKey.current = clientId
    setAds([]); setError('')
    setLoading(true)
    fetch(`/api/rsa-health?client_account_id=${encodeURIComponent(clientId)}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        setAds(d.ads ?? [])
      })
      .catch(e => { setError(e.message); fetchedKey.current = '' })
      .finally(() => setLoading(false))
  }, [clientId, open])

  const { byCampaign, dist } = useMemo(() => {
    const map = new Map<string, CampaignSummary>()
    const d   = { EXCELLENT: 0, GOOD: 0, AVERAGE: 0, POOR: 0, PENDING: 0, UNSPECIFIED: 0 }
    for (const ad of ads) {
      const key = strengthKey(ad.adStrength)
      d[key] = (d[key] ?? 0) + 1
      const prev = map.get(ad.campaignId) ?? {
        campaignId: ad.campaignId, campaignName: ad.campaignName, ads: [],
        excellent: 0, good: 0, average: 0, poor: 0, pending: 0,
      }
      prev.ads.push(ad)
      if (key === 'EXCELLENT')   prev.excellent++
      else if (key === 'GOOD')   prev.good++
      else if (key === 'AVERAGE')prev.average++
      else if (key === 'POOR')   prev.poor++
      else                       prev.pending++
      map.set(ad.campaignId, prev)
    }
    return { byCampaign: Array.from(map.values()).sort((a,b) => b.poor - a.poor || a.excellent - b.excellent), dist: d }
  }, [ads])

  const total       = ads.length
  const attentionCnt = byCampaign.filter(c => c.poor > 0 || (c.excellent === 0 && c.good === 0 && c.average > 0)).length

  return (
    <div className="bg-white border border-cloud rounded-2xl overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-mist/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm">✍️</span>
          <div>
            <p className="text-[11px] font-heading font-bold uppercase tracking-wider text-teal">RSA Ad Strength</p>
            {!open && ads.length > 0 && (
              <p className="text-[10px] text-navy/40 mt-0.5">
                {total} ads · {dist.EXCELLENT + dist.GOOD} strong · {dist.POOR > 0 ? `${dist.POOR} poor` : 'no poor'}
                {attentionCnt > 0 && ` · ${attentionCnt} campaign${attentionCnt !== 1 ? 's' : ''} need attention`}
              </p>
            )}
          </div>
        </div>
        <span className="text-navy/40 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-cloud px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-teal">
              <div className="w-4 h-4 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
              Loading RSA health…
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">
              {error}
              <button onClick={() => { fetchedKey.current = ''; toggle() }} className="ml-2 underline">Retry</button>
            </div>
          ) : ads.length === 0 && !loading ? (
            <p className="text-sm text-teal text-center py-6">No RSA ads found in this account.</p>
          ) : (
            <div className="space-y-4">
              {/* Distribution summary */}
              <div className="flex items-center gap-3 flex-wrap">
                {(Object.entries(dist) as [Strength, number][])
                  .filter(([, n]) => n > 0)
                  .sort(([a], [b]) => STRENGTH_CFG[a].order - STRENGTH_CFG[b].order)
                  .map(([strength, n]) => (
                    <div key={strength} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${STRENGTH_CFG[strength].bg} ${STRENGTH_CFG[strength].ring}`}>
                      <span className={`text-lg font-heading font-black ${STRENGTH_CFG[strength].color} tabular-nums`}>{n}</span>
                      <span className={`text-[10px] font-bold ${STRENGTH_CFG[strength].color}`}>{STRENGTH_CFG[strength].label}</span>
                    </div>
                  ))}
              </div>

              {/* Distribution bar */}
              {total > 0 && (
                <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-cloud">
                  {(Object.entries(dist) as [Strength, number][])
                    .filter(([, n]) => n > 0)
                    .sort(([a], [b]) => STRENGTH_CFG[a].order - STRENGTH_CFG[b].order)
                    .map(([s, n]) => {
                      const colorMap: Record<Strength, string> = {
                        EXCELLENT: 'bg-emerald-500', GOOD: 'bg-cyan', AVERAGE: 'bg-amber-400',
                        POOR: 'bg-red-400', PENDING: 'bg-cloud', UNSPECIFIED: 'bg-cloud/60',
                      }
                      return <div key={s} className={`${colorMap[s]} transition-all`} style={{ width: `${(n/total)*100}%` }} title={`${STRENGTH_CFG[s].label}: ${n}`} />
                    })}
                </div>
              )}

              {/* Per-campaign breakdown */}
              <div className="space-y-2">
                {byCampaign.map(c => {
                  const needsAttention = c.poor > 0 || (c.excellent === 0 && c.good === 0)
                  return (
                    <div key={c.campaignId} className={`rounded-xl border px-4 py-3 ${needsAttention ? 'border-amber-200 bg-amber-50/30' : 'border-cloud'}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs font-medium text-navy">{c.campaignName}</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {c.excellent > 0 && <span className="text-[10px] font-bold text-emerald-600">✅ {c.excellent} excellent</span>}
                          {c.good      > 0 && <span className="text-[10px] font-bold text-cyan-700">🟢 {c.good} good</span>}
                          {c.average   > 0 && <span className="text-[10px] font-bold text-amber-600">🟡 {c.average} average</span>}
                          {c.poor      > 0 && <span className="text-[10px] font-bold text-red-600">🔴 {c.poor} poor</span>}
                          {c.pending   > 0 && <span className="text-[10px] text-navy/40">⏳ {c.pending} pending</span>}
                        </div>
                      </div>
                      {/* Individual ads */}
                      {c.ads.length <= 6 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {c.ads.map(ad => (
                            <div key={ad.adId} className="flex items-center gap-1 text-[10px] text-navy/60">
                              <StrengthBadge strength={ad.adStrength} />
                              <span className="truncate max-w-[120px]">{ad.adGroupName}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <p className="text-[10px] text-navy/40">
                Ad strength reflects headline/description variety, keyword inclusion, and asset count.
                Aim for at least one Good or Excellent RSA per ad group.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
