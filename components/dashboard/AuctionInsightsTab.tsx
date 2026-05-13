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

const SORT_LABEL: Record<SortKey, string> = {
  impressionShare:   'Impr. Share',
  overlapRate:       'Overlap',
  positionAboveRate: 'Pos Above',
  topOfPageRate:     'Top of Page',
  absTopOfPageRate:  'Abs. Top',
  outRankingShare:   'Outranking',
}

// ─── Module-level sub-component (avoids remount on every render) ──────────────
function SortBtn({
  col, sortKey, sortAsc, onToggle,
}: { col: SortKey; sortKey: SortKey; sortAsc: boolean; onToggle: (k: SortKey) => void }) {
  const active = sortKey === col
  return (
    <button
      onClick={() => onToggle(col)}
      className={`flex items-center gap-0.5 font-heading font-bold text-[10px] uppercase tracking-wider transition-colors ${
        active ? 'text-cyan' : 'text-navy/50 hover:text-navy'
      }`}
    >
      {SORT_LABEL[col]}
      <span className="ml-0.5">{active ? (sortAsc ? '↑' : '↓') : '↕'}</span>
    </button>
  )
}

export function AuctionInsightsTab({ clientId, campaignId, startDate, endDate }: Props) {
  const [rows,         setRows]         = useState<AuctionInsightRow[]>([])
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [accessDenied, setAccessDenied] = useState(false)
  const [accessMsg,    setAccessMsg]    = useState('')
  const [sortKey,      setSortKey]      = useState<SortKey>('impressionShare')
  const [sortAsc,      setSortAsc]      = useState(false)
  const fetched = useRef('')

  function doFetch() {
    const key = `${campaignId}-${startDate}-${endDate}`
    fetched.current = key
    setLoading(true); setError(''); setAccessDenied(false)
    const qs = new URLSearchParams({
      client_account_id: clientId,
      campaign_id:       campaignId,
      start_date:        startDate,
      end_date:          endDate,
    })
    fetch(`/api/auction-insights?${qs}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Failed to load')
        if (d.accessDenied) {
          setAccessDenied(true)
          setAccessMsg(d.message ?? '')
          setRows([])
        } else {
          setRows(d.rows ?? [])
        }
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const key = `${campaignId}-${startDate}-${endDate}`
    if (fetched.current === key) return
    doFetch()
  }, [clientId, campaignId, startDate, endDate]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-teal text-sm">
        <div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
        Loading auction insights…
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 mt-4">
        {error}
        <button
          onClick={() => { setError(''); fetched.current = ''; doFetch() }}
          className="ml-3 underline"
        >
          Retry
        </button>
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div
        className="rounded-2xl px-5 py-8 mx-1 my-2 flex items-start gap-4"
        style={{
          background: 'rgba(255, 138, 48, 0.08)',
          border:     '1px solid rgba(255, 138, 48, 0.30)',
        }}
      >
        <span className="text-3xl flex-shrink-0">🔒</span>
        <div className="space-y-2 min-w-0">
          <p className="font-heading font-bold text-sm" style={{ color: 'var(--text-1)' }}>
            Auction Insights is gated by Google
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
            {accessMsg || 'These metrics require a developer-token allowlist that Google currently does not accept new applicants for.'}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            Workaround: open the same campaign in the Google Ads UI → Insights & reports → Auction insights.
          </p>
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-navy/40">
        <p className="text-2xl mb-2">🔍</p>
        <p className="text-sm">No auction insights data for this period.</p>
        <p className="text-xs mt-1 text-navy/30">
          Data is only available for Search campaigns with sufficient impression volume.
        </p>
      </div>
    )
  }

  // "You" row always pinned to top; competitors sorted by chosen column
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
              <th className="py-2 px-3 text-right">
                <SortBtn col="impressionShare" sortKey={sortKey} sortAsc={sortAsc} onToggle={toggleSort} />
              </th>
              <th className="py-2 px-3 text-right">
                <SortBtn col="overlapRate" sortKey={sortKey} sortAsc={sortAsc} onToggle={toggleSort} />
              </th>
              <th className="py-2 px-3 text-right">
                <SortBtn col="positionAboveRate" sortKey={sortKey} sortAsc={sortAsc} onToggle={toggleSort} />
              </th>
              <th className="py-2 px-3 text-right">
                <SortBtn col="topOfPageRate" sortKey={sortKey} sortAsc={sortAsc} onToggle={toggleSort} />
              </th>
              <th className="py-2 px-3 text-right">
                <SortBtn col="absTopOfPageRate" sortKey={sortKey} sortAsc={sortAsc} onToggle={toggleSort} />
              </th>
              <th className="py-2 px-3 text-right">
                <SortBtn col="outRankingShare" sortKey={sortKey} sortAsc={sortAsc} onToggle={toggleSort} />
              </th>
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
        <strong>Outranking:</strong> how often you ranked above them ·{' '}
        <span className="text-navy/20">— = not applicable for your account</span>
      </p>
    </div>
  )
}
