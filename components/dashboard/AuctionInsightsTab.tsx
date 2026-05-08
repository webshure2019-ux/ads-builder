'use client'
import { useState, useEffect, useRef } from 'react'
import type { AuctionInsightRow } from '@/lib/google-ads'

type SortKey = keyof Omit<AuctionInsightRow, 'domain'>

interface Props {
  clientId:   string
  campaignId: string
  startDate:  string
  endDate:    string
}

function pct(n: number) { return `${n.toFixed(1)}%` }

export function AuctionInsightsTab({ clientId, campaignId, startDate, endDate }: Props) {
  const [rows,    setRows]    = useState<AuctionInsightRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('impressionShare')
  const [sortAsc, setSortAsc] = useState(false)
  const fetched = useRef('')

  useEffect(() => {
    const key = `${campaignId}-${startDate}-${endDate}`
    if (fetched.current === key) return
    fetched.current = key
    setLoading(true); setError('')
    fetch(
      `/api/auction-insights?client_account_id=${clientId}&campaign_id=${campaignId}&start_date=${startDate}&end_date=${endDate}`
    )
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Failed to load')
        setRows(d.rows ?? [])
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [clientId, campaignId, startDate, endDate])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  function SortBtn({ col }: { col: SortKey }) {
    const active = sortKey === col
    return (
      <button
        onClick={() => toggleSort(col)}
        className={`flex items-center gap-0.5 font-heading font-bold text-[10px] uppercase tracking-wider transition-colors ${
          active ? 'text-cyan' : 'text-navy/50 hover:text-navy'
        }`}
      >
        {col === 'impressionShare'    ? 'Impr. Share'
         : col === 'overlapRate'      ? 'Overlap'
         : col === 'positionAboveRate' ? 'Pos Above'
         : col === 'topOfPageRate'    ? 'Top of Page'
         : col === 'absTopOfPageRate' ? 'Abs. Top'
         : 'Outranking'}
        <span className="ml-0.5">{active ? (sortAsc ? '↑' : '↓') : '↕'}</span>
      </button>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-navy/40 text-sm">
        Loading auction insights…
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
        {error}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-navy/40">
        <p className="text-2xl mb-2">🔍</p>
        <p className="text-sm">No auction insights data for this period.</p>
        <p className="text-xs mt-1 text-navy/30">
          Data is only available for Search campaigns with sufficient impression volume.
        </p>
      </div>
    )
  }

  // Sort: "You" row always pinned to top; competitors sorted by chosen column
  const youRow = rows.find(r => r.domain === '')
  const competitors = rows
    .filter(r => r.domain !== '')
    .sort((a, b) => {
      const diff = a[sortKey] - b[sortKey]
      return sortAsc ? diff : -diff
    })
  const sorted = youRow ? [youRow, ...competitors] : competitors

  return (
    <div>
      <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-navy/40 mb-3">
        Auction Insights — competitor overlap for this campaign
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-cloud">
              <th className="text-left py-2 pr-4 font-heading font-bold text-[10px] uppercase tracking-wider text-navy/50 w-48">
                Competitor
              </th>
              <th className="py-2 px-3 text-right"><SortBtn col="impressionShare" /></th>
              <th className="py-2 px-3 text-right"><SortBtn col="overlapRate" /></th>
              <th className="py-2 px-3 text-right"><SortBtn col="positionAboveRate" /></th>
              <th className="py-2 px-3 text-right"><SortBtn col="topOfPageRate" /></th>
              <th className="py-2 px-3 text-right"><SortBtn col="absTopOfPageRate" /></th>
              <th className="py-2 px-3 text-right"><SortBtn col="outRankingShare" /></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const isYou = row.domain === ''
              return (
                <tr
                  key={row.domain || 'you'}
                  className={`border-b border-cloud/50 ${
                    isYou ? 'bg-cyan/5' : i % 2 === 0 ? 'bg-white' : 'bg-mist/30'
                  }`}
                >
                  <td className="py-2.5 pr-4">
                    {isYou ? (
                      <span className="font-bold text-cyan">You (this account)</span>
                    ) : (
                      <span className="text-navy">{row.domain}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className={isYou ? 'font-bold text-cyan' : 'text-navy'}>
                        {pct(row.impressionShare)}
                      </span>
                      <div className="w-16 h-1 bg-cloud rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isYou ? 'bg-cyan' : 'bg-navy/30'}`}
                          style={{ width: `${Math.min(row.impressionShare, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right text-navy/70">
                    {isYou ? '—' : pct(row.overlapRate)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-navy/70">
                    {isYou ? '—' : pct(row.positionAboveRate)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-navy/70">
                    {pct(row.topOfPageRate)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-navy/70">
                    {pct(row.absTopOfPageRate)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-navy/70">
                    {isYou ? '—' : pct(row.outRankingShare)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-navy/30 mt-3">
        <strong>Overlap:</strong> how often a competitor&apos;s ad showed alongside yours ·{' '}
        <strong>Pos Above:</strong> how often they ranked above you ·{' '}
        <strong>Outranking:</strong> how often you ranked above them
      </p>
    </div>
  )
}
