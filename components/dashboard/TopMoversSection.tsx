'use client'
import { useState, useRef, useMemo } from 'react'
import type { CampaignMetrics } from '@/lib/google-ads'

interface Mover {
  id:          string
  name:        string
  metric:      'cost' | 'conversions'
  current:     number
  previous:    number
  changePct:   number
  changeAbs:   number
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0
  return ((curr - prev) / Math.abs(prev)) * 100
}

export function TopMoversSection({ clientId, campaigns, startDate, endDate, prevStartDate, prevEndDate, currency }: {
  clientId:     string
  campaigns:    CampaignMetrics[]
  startDate:    string
  endDate:      string
  prevStartDate:string
  prevEndDate:  string
  currency:     string
}) {
  const [open,        setOpen]        = useState(false)
  const [prevCampaigns, setPrevCampaigns] = useState<CampaignMetrics[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [metric,      setMetric]      = useState<'cost' | 'conversions'>('cost')
  const fetchedKey = useRef('')

  function toggle() {
    setOpen(o => !o)
    const key = `${clientId}|${prevStartDate}|${prevEndDate}`
    if (!open && fetchedKey.current !== key) {
      fetchedKey.current = key
      setLoading(true); setError('')
      fetch(`/api/campaign-stats?client_account_id=${encodeURIComponent(clientId)}&start_date=${prevStartDate}&end_date=${prevEndDate}`)
        .then(async r => {
          const d = await r.json()
          if (!r.ok) throw new Error(d.error)
          setPrevCampaigns(d.campaigns ?? [])
        })
        .catch(e => { setError(e.message); fetchedKey.current = '' })
        .finally(() => setLoading(false))
    }
  }

  const movers: { gainers: Mover[]; decliners: Mover[] } = useMemo(() => {
    if (!prevCampaigns.length || !campaigns.length) return { gainers: [], decliners: [] }
    const prevMap = new Map(prevCampaigns.map(c => [c.id, c]))

    const all = campaigns
      .filter(c => c.status === 'ENABLED')
      .map(c => {
        const prev  = prevMap.get(c.id)
        const curr  = metric === 'cost' ? c.cost : c.conversions
        const prevV = prev ? (metric === 'cost' ? prev.cost : prev.conversions) : 0
        // Only show campaigns that had meaningful spend/activity
        if (curr < 1 && prevV < 1) return null
        return {
          id: c.id, name: c.name, metric,
          current: curr, previous: prevV,
          changePct: pctChange(curr, prevV),
          changeAbs: curr - prevV,
        } as Mover
      })
      .filter((m): m is Mover => m !== null)
      .filter(m => Math.abs(m.changePct) >= 5)  // ignore tiny fluctuations

    const sorted = [...all].sort((a, b) => b.changePct - a.changePct)
    return {
      gainers:   sorted.filter(m => m.changePct > 0).slice(0, 5),
      decliners: sorted.filter(m => m.changePct < 0).reverse().slice(0, 5),
    }
  }, [campaigns, prevCampaigns, metric])

  const totalMovers = movers.gainers.length + movers.decliners.length

  return (
    <div className="bg-white border border-cloud rounded-2xl overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-mist/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm">📈</span>
          <div>
            <p className="text-[11px] font-heading font-bold uppercase tracking-wider text-teal">Top Movers</p>
            {!open && prevCampaigns.length > 0 && (
              <p className="text-[10px] text-navy/40 mt-0.5">{totalMovers} campaign{totalMovers !== 1 ? 's' : ''} moved significantly vs prior period</p>
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
              Loading previous period…
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">
              {error}
              <button onClick={() => { fetchedKey.current = ''; toggle() }} className="ml-2 underline">Retry</button>
            </div>
          ) : !prevCampaigns.length ? null : (
            <div className="space-y-4">
              {/* Metric selector */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-navy/50">Compare by:</span>
                {(['cost', 'conversions'] as const).map(m => (
                  <button key={m} onClick={() => setMetric(m)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors capitalize ${
                      metric === m ? 'bg-navy text-cyan' : 'text-navy/50 hover:text-navy bg-cloud/60'
                    }`}>
                    {m === 'cost' ? `Spend (${currency})` : 'Conversions'}
                  </button>
                ))}
              </div>

              {(movers.gainers.length === 0 && movers.decliners.length === 0) ? (
                <p className="text-sm text-teal text-center py-6">No significant movers — campaigns are stable vs the previous period.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Gainers */}
                  <div>
                    <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-emerald-600 mb-2">
                      📈 Top Gainers
                    </p>
                    {movers.gainers.length === 0 ? (
                      <p className="text-xs text-navy/40 py-2">No significant gainers.</p>
                    ) : (
                      <div className="space-y-2">
                        {movers.gainers.map(m => (
                          <MoverCard key={m.id} mover={m} currency={currency} />
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Decliners */}
                  <div>
                    <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-red-500 mb-2">
                      📉 Top Decliners
                    </p>
                    {movers.decliners.length === 0 ? (
                      <p className="text-xs text-navy/40 py-2">No significant decliners.</p>
                    ) : (
                      <div className="space-y-2">
                        {movers.decliners.map(m => (
                          <MoverCard key={m.id} mover={m} currency={currency} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-navy/40">
                Current: {startDate} → {endDate} · Previous: {prevStartDate} → {prevEndDate} · ≥5% change shown
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MoverCard({ mover, currency }: { mover: Mover; currency: string }) {
  const up      = mover.changePct > 0
  const absAmt  = Math.abs(mover.changeAbs)
  const absPct  = Math.abs(mover.changePct)
  const isCost  = mover.metric === 'cost'
  const fmt     = (v: number) => isCost
    ? `${currency} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : v.toLocaleString(undefined, { maximumFractionDigits: 1 })

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${up ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/40'}`}>
      <p className="text-xs font-medium text-navy truncate mb-1">{mover.name}</p>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-navy/50 tabular-nums">
          {fmt(mover.previous)} → {fmt(mover.current)}
        </div>
        <div className={`text-xs font-bold tabular-nums ${up ? 'text-emerald-600' : 'text-red-500'}`}>
          {up ? '+' : '-'}{absPct.toFixed(1)}%
          <span className="text-[10px] font-normal ml-1">({up ? '+' : '-'}{fmt(absAmt)})</span>
        </div>
      </div>
    </div>
  )
}
