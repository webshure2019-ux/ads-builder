'use client'
import { useState, useEffect, useRef } from 'react'
import type { ChangeEvent } from '@/lib/google-ads'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const RESOURCE_ICONS: Record<string, string> = {
  'Campaign':      '📢',
  'Ad Group':      '📁',
  'Ad':            '📝',
  'Keyword':       '🔑',
  'Excl. Keyword': '🚫',
  'Budget':        '💰',
  'Bid Strategy':  '🎯',
}

const OP_CFG: Record<string, { color: string; bg: string; border: string }> = {
  'Created': { color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-300' },
  'Updated': { color: 'text-cyan-700',    bg: 'bg-cyan/15',     border: 'border-cyan/30'     },
  'Removed': { color: 'text-red-700',     bg: 'bg-red-100',     border: 'border-red-300'     },
}

// Friendly field name mapping
const FIELD_LABELS: Record<string, string> = {
  status:                'Status',
  amount_micros:         'Budget',
  cpc_bid_micros:        'Max CPC',
  target_cpa:            'Target CPA',
  target_roas:           'Target ROAS',
  name:                  'Name',
  final_urls:            'Final URLs',
  headlines:             'Headlines',
  descriptions:          'Descriptions',
  bidding_strategy_type: 'Bidding Strategy',
  target_spend:          'Target Spend',
}

function friendlyField(f: string): string {
  return FIELD_LABELS[f] ?? f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatDateTime(dt: string): { date: string; time: string } {
  try {
    const d = new Date(dt.replace(' ', 'T'))
    return {
      date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    }
  } catch {
    return { date: dt.slice(0, 10), time: dt.slice(11, 16) }
  }
}

function dateOnly(dt: string): string {
  return dt.slice(0, 10)
}

// ─── Single event row ─────────────────────────────────────────────────────────
function EventRow({ event }: { event: ChangeEvent }) {
  const [open, setOpen] = useState(false)
  const { date, time } = formatDateTime(event.dateTime)
  const opCfg = OP_CFG[event.operation] ?? OP_CFG['Updated']
  const icon  = RESOURCE_ICONS[event.resourceType] ?? '🔧'

  return (
    <div className={`border rounded-xl overflow-hidden ${open ? 'border-teal/40' : 'border-cloud'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-cloud/30 transition-colors text-left"
      >
        {/* Icon */}
        <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${opCfg.bg} ${opCfg.color}`}>
              {event.operation}
            </span>
            <span className="text-xs font-medium text-navy">{event.resourceType}</span>
            {event.campaignName && (
              <span className="text-[10px] text-navy/50 truncate max-w-[180px]" title={event.campaignName}>
                {event.campaignName}
              </span>
            )}
            {event.adGroupName && (
              <span className="text-[10px] text-navy/40 truncate max-w-[140px]" title={event.adGroupName}>
                › {event.adGroupName}
              </span>
            )}
          </div>

          {/* Changed fields preview */}
          {event.changedFields.length > 0 && (
            <p className="text-[10px] text-navy/50 mt-0.5">
              {event.changedFields.slice(0, 4).map(friendlyField).join(' · ')}
              {event.changedFields.length > 4 && ` +${event.changedFields.length - 4} more`}
            </p>
          )}
        </div>

        {/* Time + source */}
        <div className="flex-shrink-0 text-right">
          <p className="text-[10px] text-navy/50">{time}</p>
          {event.clientType && (
            <p className="text-[9px] text-navy/30">{event.clientType}</p>
          )}
        </div>

        <span className="text-navy/30 text-xs flex-shrink-0 mt-0.5">{open ? '▲' : '▼'}</span>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-cloud px-4 py-3 bg-cloud/20 space-y-2">
          {event.userEmail && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-navy/40 w-20">Changed by</span>
              <span className="text-[10px] text-navy">{event.userEmail}</span>
            </div>
          )}
          {event.clientType && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-navy/40 w-20">Source</span>
              <span className="text-[10px] text-navy">{event.clientType}</span>
            </div>
          )}
          {event.campaignId && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-navy/40 w-20">Campaign ID</span>
              <span className="text-[10px] text-navy font-mono">{event.campaignId}</span>
            </div>
          )}
          {event.changedFields.length > 0 && (
            <div>
              <p className="text-[9px] text-navy/40 mb-1">Changed fields</p>
              <div className="flex flex-wrap gap-1">
                {event.changedFields.map((f, i) => (
                  <span key={i} className="text-[10px] bg-white border border-cloud px-2 py-0.5 rounded-full text-navy/70">
                    {friendlyField(f)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-navy/40 w-20">Resource</span>
            <span className="text-[10px] text-navy/50 font-mono break-all">{event.resourceName}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  clientAccountId: string
  startDate:       string
  endDate:         string
  campaignId?:     string
  campaignName?:   string
}

type FilterType = 'all' | 'Campaign' | 'Ad Group' | 'Ad' | 'Keyword' | 'Budget' | 'Bid Strategy'

export function ChangeHistorySection({
  clientAccountId, startDate, endDate, campaignId, campaignName,
}: Props) {
  const [events,   setEvents]   = useState<ChangeEvent[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [filter,   setFilter]   = useState<FilterType>('all')
  const [search,   setSearch]   = useState('')
  const fetched = useRef('')

  useEffect(() => {
    if (!expanded) return
    const key = `${clientAccountId}|${startDate}|${endDate}|${campaignId ?? ''}`
    if (fetched.current === key) return
    fetched.current = key

    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      client_account_id: clientAccountId,
      start_date:        startDate,
      end_date:          endDate,
      ...(campaignId ? { campaign_id: campaignId } : {}),
    })
    fetch(`/api/change-history?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setEvents(d.events ?? [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [expanded, clientAccountId, startDate, endDate, campaignId])

  // Filtered events
  const visible = events.filter(e => {
    if (filter !== 'all' && e.resourceType !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        e.campaignName.toLowerCase().includes(q) ||
        e.adGroupName.toLowerCase().includes(q) ||
        e.resourceType.toLowerCase().includes(q) ||
        e.operation.toLowerCase().includes(q) ||
        e.userEmail.toLowerCase().includes(q) ||
        e.changedFields.some(f => f.toLowerCase().includes(q))
      )
    }
    return true
  })

  // Group by date
  const byDate = new Map<string, ChangeEvent[]>()
  for (const e of visible) {
    const d = dateOnly(e.dateTime)
    const prev = byDate.get(d) ?? []
    prev.push(e)
    byDate.set(d, prev)
  }
  const days = Array.from(byDate.entries()).sort(([a], [b]) => b.localeCompare(a))

  // Summary counts
  const typeCounts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.resourceType] = (acc[e.resourceType] ?? 0) + 1
    return acc
  }, {})

  const FILTER_OPTIONS: FilterType[] = ['all', 'Campaign', 'Ad Group', 'Ad', 'Keyword', 'Budget', 'Bid Strategy']

  return (
    <div className="border border-cloud rounded-3xl overflow-hidden bg-white">
      {/* Header */}
      <button
        onClick={() => setExpanded(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-black/5 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-cloud flex-shrink-0">
            <span className="text-lg">📋</span>
          </div>
          <div>
            <p className="font-heading font-bold text-navy text-sm">Change History</p>
            <p className="text-[10px] text-navy/50 mt-0.5">
              {expanded && events.length > 0
                ? `${events.length} change${events.length !== 1 ? 's' : ''} in period`
                : campaignName
                  ? `Changes for ${campaignName}`
                  : 'Account-wide change log · click to load'
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {expanded && events.length > 0 && (
            <span className="bg-cloud text-navy/60 text-[10px] font-medium px-2 py-0.5 rounded-full">
              {events.length}
            </span>
          )}
          <span className="text-navy/40">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-cloud/60">

          {loading && (
            <div className="px-6 py-8 space-y-3 animate-pulse">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-12 bg-cloud rounded-xl" />
              ))}
            </div>
          )}

          {error && (
            <div className="px-6 py-5">
              <div className="border border-amber-200 bg-amber-50 rounded-xl px-4 py-3 text-xs text-amber-700">
                ⚠️ Change history unavailable: {error}. This requires the "Account" level change_event resource access.
              </div>
            </div>
          )}

          {!loading && !error && events.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-2xl mb-2">📋</p>
              <p className="text-sm text-navy/40">No change events found for this period.</p>
              <p className="text-[10px] text-navy/30 mt-1">Change history is only available for the last 30 days.</p>
            </div>
          )}

          {!loading && !error && events.length > 0 && (
            <>
              {/* Summary chips */}
              <div className="px-6 pt-4 pb-3 flex flex-wrap gap-2">
                {Object.entries(typeCounts).sort((a,b) => b[1] - a[1]).map(([type, count]) => (
                  <span key={type} className="flex items-center gap-1 text-[10px] bg-cloud px-2 py-0.5 rounded-full text-navy/60">
                    {RESOURCE_ICONS[type] ?? '🔧'} {type} <span className="font-bold text-navy">{count}</span>
                  </span>
                ))}
              </div>

              {/* Filter bar */}
              <div className="px-6 pb-4 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1 flex-wrap">
                  {FILTER_OPTIONS.map(f => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                        filter === f
                          ? 'bg-teal text-white'
                          : 'bg-cloud text-navy/50 hover:bg-cloud/70'
                      }`}
                    >
                      {f === 'all' ? 'All types' : f}
                      {f !== 'all' && typeCounts[f] ? ` (${typeCounts[f]})` : ''}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy/30 text-[10px] pointer-events-none">🔍</span>
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search changes…"
                    className="pl-7 pr-3 py-1 text-[10px] border border-cloud rounded-xl bg-white text-navy placeholder-navy/30 focus:outline-none focus:border-cyan w-40 transition-colors"
                  />
                </div>
              </div>

              {/* Timeline */}
              <div className="px-6 pb-5 space-y-5">
                {visible.length === 0 ? (
                  <p className="text-center text-xs text-navy/40 py-4">No changes match your filter.</p>
                ) : (
                  days.map(([date, dayEvents]) => {
                    const { date: fmtDate } = formatDateTime(`${date} 00:00:00`)
                    return (
                      <div key={date}>
                        {/* Day header */}
                        <div className="flex items-center gap-3 mb-2">
                          <p className="text-[10px] font-heading font-bold text-teal whitespace-nowrap">{fmtDate}</p>
                          <div className="flex-1 h-px bg-cloud" />
                          <span className="text-[9px] text-navy/30">{dayEvents.length} change{dayEvents.length !== 1 ? 's' : ''}</span>
                        </div>

                        {/* Events for this day */}
                        <div className="space-y-1.5 pl-2 border-l-2 border-cloud ml-1">
                          {dayEvents.map(event => (
                            <EventRow key={event.id} event={event} />
                          ))}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="px-6 pb-4">
                <p className="text-[10px] text-navy/30 border-t border-cloud pt-3">
                  Change history is limited to the last 30 days by the Google Ads API. Showing up to 200 most recent events.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
