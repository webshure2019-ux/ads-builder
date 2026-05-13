'use client'
import { useState, useRef, useMemo } from 'react'
import type { GeoPerformanceRow } from '@/lib/google-ads'

type SortCol = 'locationName' | 'impressions' | 'clicks' | 'cost' | 'conversions' | 'ctr'
type SortDir = 'asc' | 'desc'

function SortBtn({ col, active, dir, onClick }: { col: SortCol; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-0.5 group">
      <span className={`transition-colors ${active ? 'text-cyan' : 'text-teal group-hover:text-navy/70'}`}>
        {col === 'locationName' ? 'Location' : col.charAt(0).toUpperCase() + col.slice(1)}
      </span>
      {active && <span className="text-[8px] text-cyan">{dir === 'desc' ? '▼' : '▲'}</span>}
    </button>
  )
}

export function GeoPerformanceTab({ clientId, campaignId, startDate, endDate, currency }: {
  clientId:   string
  campaignId: string
  startDate:  string
  endDate:    string
  currency:   string
}) {
  const [rows,     setRows]     = useState<GeoPerformanceRow[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [sortCol,  setSortCol]  = useState<SortCol>('cost')
  const [sortDir,  setSortDir]  = useState<SortDir>('desc')
  const [filter,   setFilter]   = useState<'all' | 'city' | 'region' | 'country'>('all')
  const fetched = useRef('')

  function load() {
    const key = `${clientId}|${campaignId}|${startDate}|${endDate}`
    if (fetched.current === key || loading) return
    fetched.current = key
    setLoading(true); setError('')
    fetch(`/api/geo-performance?client_account_id=${encodeURIComponent(clientId)}&campaign_id=${encodeURIComponent(campaignId)}&start_date=${startDate}&end_date=${endDate}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        setRows(d.rows ?? [])
      })
      .catch(e => { setError(e.message); fetched.current = '' })
      .finally(() => setLoading(false))
  }

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const visible = useMemo(() => {
    const filtered = filter === 'all' ? rows : rows.filter(r => r.locationType === filter)
    return [...filtered].sort((a, b) => {
      const v = sortDir === 'desc' ? -1 : 1
      if (sortCol === 'locationName') return v * a.locationName.localeCompare(b.locationName)
      return v * ((a[sortCol] as number) - (b[sortCol] as number))
    })
  }, [rows, filter, sortCol, sortDir])

  const totals = useMemo(() => visible.reduce(
    (s, r) => ({ impressions: s.impressions + r.impressions, clicks: s.clicks + r.clicks, cost: s.cost + r.cost, conversions: s.conversions + r.conversions }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
  ), [visible])

  if (!fetched.current && !loading && !error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-4xl">🌍</div>
        <p className="text-sm text-navy/60 text-center max-w-xs">
          See performance broken down by city and region. Identify your best and worst performing locations.
        </p>
        <button onClick={load}
          className="bg-cyan text-navy font-heading font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-cyan/80 transition-colors">
          🌍 Load Geo Performance
        </button>
      </div>
    )
  }

  if (loading) return (
    <div className="flex items-center justify-center gap-3 py-16 text-teal text-sm">
      <div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
      Loading geographic data…
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 mt-4">
      {error}
      <button onClick={() => { setError(''); fetched.current = ''; load() }} className="ml-3 underline">Retry</button>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm font-heading font-bold text-navy">
          🌍 Geographic Performance
          <span className="ml-2 text-[11px] font-normal text-teal">{rows.length} location{rows.length !== 1 ? 's' : ''}</span>
        </p>
        {/* Location type filter */}
        <div className="flex items-center gap-1">
          {(['all', 'city', 'region', 'country'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors capitalize ${
                filter === f ? 'bg-navy text-cyan' : 'text-navy/50 hover:text-navy bg-cloud/60'
              }`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-teal text-center py-8">No geographic data found for this campaign and date range.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-cloud">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="border-b border-cloud bg-mist">
                <th className="px-4 py-2.5 text-left text-[10px] font-heading font-bold uppercase tracking-wider">
                  <SortBtn col="locationName" active={sortCol==='locationName'} dir={sortDir} onClick={() => toggleSort('locationName')} />
                </th>
                <th className="px-4 py-2.5 text-center text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Type</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-heading font-bold uppercase tracking-wider">
                  <SortBtn col="impressions" active={sortCol==='impressions'} dir={sortDir} onClick={() => toggleSort('impressions')} />
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-heading font-bold uppercase tracking-wider">
                  <SortBtn col="clicks" active={sortCol==='clicks'} dir={sortDir} onClick={() => toggleSort('clicks')} />
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-heading font-bold uppercase tracking-wider">
                  <SortBtn col="ctr" active={sortCol==='ctr'} dir={sortDir} onClick={() => toggleSort('ctr')} />
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-heading font-bold uppercase tracking-wider">
                  <SortBtn col="cost" active={sortCol==='cost'} dir={sortDir} onClick={() => toggleSort('cost')} />
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-heading font-bold uppercase tracking-wider">
                  <SortBtn col="conversions" active={sortCol==='conversions'} dir={sortDir} onClick={() => toggleSort('conversions')} />
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-heading font-bold uppercase tracking-wider text-teal">CPA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cloud">
              {visible.map(row => {
                const cpa = row.conversions > 0 ? row.cost / row.conversions : null
                const convRate = row.clicks > 0 ? (row.conversions / row.clicks) * 100 : 0
                const avgConvRate = totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0
                const perf = avgConvRate > 0
                  ? convRate > avgConvRate * 1.2 ? 'good'
                    : convRate < avgConvRate * 0.6 ? 'poor'
                    : 'avg'
                  : 'avg'
                return (
                  <tr key={row.locationId} className="hover:bg-mist/20 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-navy flex items-center gap-1.5">
                      {perf === 'good' && <span className="text-emerald-500 text-[10px]">▲</span>}
                      {perf === 'poor' && <span className="text-red-400 text-[10px]">▼</span>}
                      {row.locationName}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-cloud text-navy/50">{row.locationType}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-navy/70">{row.impressions.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-navy/70">{row.clicks.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-navy/70">{row.ctr.toFixed(2)}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-navy font-medium">
                      {currency} {row.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-navy/70">
                      {row.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-navy/60">
                      {cpa !== null ? `${currency} ${cpa.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-cloud bg-mist/60">
                <td colSpan={2} className="px-4 py-2 text-xs font-bold text-navy">Total ({visible.length})</td>
                <td className="px-4 py-2 text-right text-xs font-bold text-navy tabular-nums">{totals.impressions.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-xs font-bold text-navy tabular-nums">{totals.clicks.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-xs font-bold text-navy tabular-nums">
                  {totals.impressions > 0 ? ((totals.clicks/totals.impressions)*100).toFixed(2) : '0.00'}%
                </td>
                <td className="px-4 py-2 text-right text-xs font-bold text-navy tabular-nums">
                  {currency} {totals.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-2 text-right text-xs font-bold text-navy tabular-nums">
                  {totals.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </td>
                <td className="px-4 py-2 text-right text-xs font-bold text-navy tabular-nums">
                  {totals.conversions > 0
                    ? `${currency} ${(totals.cost/totals.conversions).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-[10px] text-navy/40">
        ▲ above-average conversion rate · ▼ below-average. Data shows location of user presence at time of click.
      </p>
    </div>
  )
}
