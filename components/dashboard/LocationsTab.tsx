'use client'
import { useState, useEffect, useRef } from 'react'
import type { LocationTargetRow, GeoTargetResult } from '@/lib/google-ads'

// ─── Optimisation rules (pure, exported for testing) ─────────────────────────
export interface LocationSuggestion {
  criterionId: string
  name:        string
  type:        'exclude' | 'increase_bid' | 'reduce_bid' | 'remove'
  message:     string
  action:      { bidModifier?: number; remove?: boolean }
}

export function buildLocationSuggestions(rows: LocationTargetRow[]): LocationSuggestion[] {
  const included = rows.filter(r => !r.negative)
  if (included.length === 0) return []

  const totalCost   = included.reduce((s, r) => s + r.cost, 0)
  const totalConv   = included.reduce((s, r) => s + r.conversions, 0)
  const totalClicks = included.reduce((s, r) => s + r.clicks, 0)
  const avgCPA      = totalConv > 0 ? totalCost / totalConv : 0
  const avgConvRate = totalClicks > 0 ? (totalConv / totalClicks) * 100 : 0

  const suggestions: LocationSuggestion[] = []

  for (const row of included) {
    if (avgCPA > 0 && row.cost > 2 * avgCPA && row.conversions === 0 && row.clicks >= 20) {
      suggestions.push({
        criterionId: row.criterionId, name: row.name, type: 'exclude',
        message: `${row.clicks} clicks, 0 conversions — cost exceeds 2× avg CPA`,
        action: { remove: true },
      })
    } else if (avgConvRate > 0 && row.convRate >= 1.5 * avgConvRate && row.conversions >= 5) {
      suggestions.push({
        criterionId: row.criterionId, name: row.name, type: 'increase_bid',
        message: `${row.convRate.toFixed(1)}% conv rate vs ${avgConvRate.toFixed(1)}% avg — strong performer`,
        action: { bidModifier: Math.min(parseFloat((row.bidModifier * 1.2).toFixed(2)), 10) },
      })
    } else if (avgCPA > 0 && row.cpa >= 2 * avgCPA && row.conversions > 0) {
      suggestions.push({
        criterionId: row.criterionId, name: row.name, type: 'reduce_bid',
        message: `CPA of ${row.cpa.toFixed(2)} is 2× account average — high cost per conversion`,
        action: { bidModifier: Math.max(parseFloat((row.bidModifier * 0.8).toFixed(2)), 0.1) },
      })
    } else if (row.impressions === 0) {
      suggestions.push({
        criterionId: row.criterionId, name: row.name, type: 'remove',
        message: `No impressions in this period`,
        action: { remove: true },
      })
    }
  }
  return suggestions
}

// ─── Bid modifier helpers ─────────────────────────────────────────────────────
function fmtBidMod(bm: number): string {
  if (bm === 1.0) return '—'
  const pct = Math.round((bm - 1) * 100)
  return pct > 0 ? `+${pct}%` : `${pct}%`
}

function parseBidModInput(s: string): number | null {
  const cleaned = s.trim().replace('%', '')
  const num = parseFloat(cleaned)
  if (isNaN(num)) return null
  const ratio = 1 + num / 100
  if (ratio < 0.1 || ratio > 10) return null
  return parseFloat(ratio.toFixed(4))
}

// ─── Module-level sub-components ─────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-block text-[9px] font-heading font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cloud text-navy/60">
      {type || '—'}
    </span>
  )
}

function SuggestionIcon({ type }: { type: LocationSuggestion['type'] }) {
  if (type === 'increase_bid') return <span className="text-emerald-600">⬆</span>
  if (type === 'reduce_bid')   return <span className="text-amber-500">⬇</span>
  return <span className="text-red-500">✕</span>
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  clientId:   string
  campaignId: string
  startDate:  string
  endDate:    string
  currency:   string
}

export function LocationsTab({ clientId, campaignId, startDate, endDate, currency }: Props) {
  const [rows,        setRows]        = useState<LocationTargetRow[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const fetched = useRef('')

  // Search state
  const [searchQ,       setSearchQ]       = useState('')
  const [searchRes,     setSearchRes]     = useState<GeoTargetResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showDropdown,  setShowDropdown]  = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Inline bid modifier editing
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editingVal, setEditingVal] = useState('')

  // Suggestions dismissed/applied sets
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [applied,   setApplied]   = useState<Set<string>>(new Set())

  // Mutation error
  const [mutErr, setMutErr] = useState('')

  function doFetch() {
    const key = `${campaignId}-${startDate}-${endDate}`
    fetched.current = key
    setLoading(true); setError('')
    const qs = new URLSearchParams({
      client_account_id: clientId,
      campaign_id:       campaignId,
      start_date:        startDate,
      end_date:          endDate,
    })
    fetch(`/api/location-targets?${qs}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Failed to load')
        setRows(d.rows ?? [])
      })
      .catch(e => { fetched.current = ''; setError(String(e)) })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const key = `${campaignId}-${startDate}-${endDate}`
    if (fetched.current === key) return
    doFetch()
  }, [clientId, campaignId, startDate, endDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced geo search
  function handleSearchChange(q: string) {
    setSearchQ(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (q.trim().length < 2) { setSearchRes([]); setShowDropdown(false); return }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/geo-target-search?${new URLSearchParams({ q })}`)
        const d = await res.json()
        setSearchRes(d.results ?? [])
        setShowDropdown(true)
      } catch { setSearchRes([]) }
      finally { setSearchLoading(false) }
    }, 300)
  }

  async function handleAddLocation(geo: GeoTargetResult) {
    setShowDropdown(false); setSearchQ('')
    setMutErr('')
    try {
      const res = await fetch('/api/location-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_account_id: clientId,
          campaign_id:       campaignId,
          geo_target_id:     geo.id,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to add')
      setRows(prev => [...prev, {
        criterionId: d.criterionId, geoTargetId: geo.id,
        name: geo.name, canonicalName: geo.canonicalName,
        targetType: geo.targetType, countryCode: geo.countryCode,
        negative: false, bidModifier: 1.0,
        clicks: 0, impressions: 0, cost: 0, conversions: 0, convRate: 0, cpa: 0, roas: 0,
      }])
    } catch (e: unknown) {
      setMutErr(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleRemove(criterionId: string) {
    setMutErr('')
    setRows(prev => prev.filter(r => r.criterionId !== criterionId))
    try {
      const res = await fetch('/api/location-targets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_account_id: clientId,
          campaign_id:       campaignId,
          criterion_id:      criterionId,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to remove')
    } catch (e: unknown) {
      setMutErr(e instanceof Error ? e.message : String(e))
      doFetch()
      throw e
    }
  }

  async function handleBidModifierSave(criterionId: string) {
    const bm = parseBidModInput(editingVal)
    setEditingId(null); setEditingVal('')
    if (bm === null) return
    setMutErr('')
    setRows(prev => prev.map(r => r.criterionId === criterionId ? { ...r, bidModifier: bm } : r))
    try {
      const res = await fetch('/api/location-targets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_account_id: clientId,
          campaign_id:       campaignId,
          criterion_id:      criterionId,
          bid_modifier:      bm,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to update')
    } catch (e: unknown) {
      setMutErr(e instanceof Error ? e.message : String(e))
      doFetch()
    }
  }

  async function handleApplySuggestion(s: LocationSuggestion) {
    setMutErr('')
    setApplied(prev => { const n = new Set(Array.from(prev)); n.add(s.criterionId); return n })
    try {
      if (s.action.remove) {
        await handleRemove(s.criterionId)
      } else if (s.action.bidModifier !== undefined) {
        const res = await fetch('/api/location-targets', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_account_id: clientId,
            campaign_id:       campaignId,
            criterion_id:      s.criterionId,
            bid_modifier:      s.action.bidModifier,
          }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? 'Failed to apply')
        setRows(prev => prev.map(r =>
          r.criterionId === s.criterionId ? { ...r, bidModifier: s.action.bidModifier! } : r
        ))
      }
    } catch (e: unknown) {
      setMutErr(e instanceof Error ? e.message : String(e))
      setApplied(prev => { const n = new Set(Array.from(prev)); n.delete(s.criterionId); return n })
    }
  }

  function curr(n: number) {
    return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-teal text-sm">
        <div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
        Loading location targets…
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

  const suggestions = buildLocationSuggestions(rows).filter(
    s => !dismissed.has(s.criterionId) && !applied.has(s.criterionId)
  )

  return (
    <div className="space-y-5">

      {/* ① Add location search */}
      <div className="relative">
        <div className="flex items-center gap-2 bg-mist/40 border border-cloud rounded-xl px-3 py-2">
          <span className="text-navy/40 text-sm">📍</span>
          <input
            type="text"
            value={searchQ}
            onChange={e => handleSearchChange(e.target.value)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder="Search cities, regions, countries…"
            className="flex-1 bg-transparent text-xs text-navy placeholder-navy/30 outline-none"
          />
          {searchLoading && (
            <div className="w-3 h-3 border border-cyan border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        {showDropdown && searchRes.length > 0 && (
          <div className="absolute z-20 top-full mt-1 w-full bg-white border border-cloud rounded-xl shadow-lg overflow-hidden">
            {searchRes.map(geo => (
              <button
                key={geo.id}
                onMouseDown={() => handleAddLocation(geo)}
                className="w-full text-left px-4 py-2.5 hover:bg-mist/50 transition-colors border-b border-cloud/50 last:border-0"
              >
                <span className="text-xs font-medium text-navy">{geo.canonicalName}</span>
                <span className="ml-2 text-[9px] font-heading font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cloud text-navy/50">
                  {geo.targetType}
                </span>
                <span className="ml-1 text-[9px] text-navy/30">{geo.countryCode}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mutation error banner */}
      {mutErr && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {mutErr}
          <button onClick={() => setMutErr('')} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* ② Location targets table */}
      {rows.length === 0 ? (
        <div className="text-center py-16 text-navy/40">
          <p className="text-2xl mb-2">🌍</p>
          <p className="text-sm">No location targets — this campaign targets all locations.</p>
          <p className="text-xs mt-1 text-navy/30">Use the search above to add specific location targets.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-cloud">
                {['Location', 'Type', 'Status', 'Bid Adj', 'Clicks', 'Cost', 'Conv', 'Conv Rate', 'CPA', 'ROAS', ''].map(h => (
                  <th key={h} className="py-2 px-2 text-left font-heading font-bold text-[10px] uppercase tracking-wider text-navy/50 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.criterionId}
                  className={`border-b border-cloud/50 ${i % 2 === 0 ? 'bg-white' : 'bg-mist/20'} ${row.negative ? 'opacity-60' : ''}`}
                >
                  <td className="py-2.5 px-2 max-w-[200px]">
                    <span className={`text-navy text-xs ${row.negative ? 'line-through' : ''}`}>
                      {row.negative && <span className="mr-1">🚫</span>}
                      {row.canonicalName || row.name}
                    </span>
                  </td>
                  <td className="py-2.5 px-2"><TypeBadge type={row.targetType} /></td>
                  <td className="py-2.5 px-2">
                    <span className={`text-[10px] font-bold ${row.negative ? 'text-red-500' : 'text-teal'}`}>
                      {row.negative ? 'Excluded' : 'Included'}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    {row.negative ? (
                      <span className="text-navy/30 text-xs">—</span>
                    ) : editingId === row.criterionId ? (
                      <input
                        autoFocus
                        value={editingVal}
                        onChange={e => setEditingVal(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleBidModifierSave(row.criterionId)
                          if (e.key === 'Escape') { setEditingId(null); setEditingVal('') }
                        }}
                        onBlur={() => handleBidModifierSave(row.criterionId)}
                        placeholder="+20 or -10"
                        className="w-20 text-xs border border-cyan rounded px-1.5 py-0.5 outline-none text-navy"
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setEditingId(row.criterionId)
                          setEditingVal(fmtBidMod(row.bidModifier).replace('%', '').replace('—', ''))
                        }}
                        className="text-xs text-navy hover:text-cyan transition-colors font-mono"
                        title="Click to edit bid modifier"
                      >
                        {fmtBidMod(row.bidModifier)} ✎
                      </button>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right text-navy/70">{row.clicks.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-right text-navy/70">{curr(row.cost)}</td>
                  <td className="py-2.5 px-2 text-right text-navy/70">{row.conversions.toFixed(1)}</td>
                  <td className="py-2.5 px-2 text-right text-navy/70">{row.convRate.toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-right text-navy/70">{row.conversions > 0 ? curr(row.cpa) : '—'}</td>
                  <td className="py-2.5 px-2 text-right text-navy/70">{row.roas > 0 ? `${row.roas.toFixed(2)}×` : '—'}</td>
                  <td className="py-2.5 px-2">
                    <button
                      onClick={() => handleRemove(row.criterionId)}
                      className="text-navy/30 hover:text-red-500 transition-colors text-base leading-none"
                      title="Remove location target"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ③ Optimisation suggestions */}
      {suggestions.length > 0 && (
        <div>
          <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-navy/40 mb-2">
            💡 Location Optimisation Suggestions
          </p>
          <div className="space-y-2">
            {suggestions.map(s => (
              <div key={s.criterionId} className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <span className="text-base mt-0.5"><SuggestionIcon type={s.type} /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-navy">{s.name}</p>
                  <p className="text-xs text-navy/60 mt-0.5">{s.message}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleApplySuggestion(s)}
                    className="text-[10px] font-heading font-bold bg-navy text-white px-2.5 py-1 rounded-lg hover:bg-navy/80 transition-colors"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => setDismissed(prev => {
                      const n = new Set(Array.from(prev))
                      n.add(s.criterionId)
                      return n
                    })}
                    className="text-[10px] font-heading font-bold text-navy/50 hover:text-navy transition-colors px-1"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
