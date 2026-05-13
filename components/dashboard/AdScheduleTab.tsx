'use client'
import { useState, useRef } from 'react'
import type { AdScheduleEntry, DayOfWeek } from '@/lib/google-ads'

// ─── Constants ─────────────────────────────────────────────────────────────────
const DAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const DAY_SHORT: Record<DayOfWeek, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu',
  FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
}
const HOURS = Array.from({ length: 25 }, (_, i) => i)  // 0–24
const MINUTES = [0, 15, 30, 45]

// ─── Bid modifier helpers ─────────────────────────────────────────────────────
function bidPct(modifier: number): string {
  if (modifier === 0) return 'Excluded'
  const pct = Math.round((modifier - 1) * 100)
  if (pct === 0) return '0%'
  return pct > 0 ? `+${pct}%` : `${pct}%`
}

function bidColor(modifier: number): string {
  if (modifier === 0) return 'bg-red-100 text-red-700 border-red-300'
  const pct = (modifier - 1) * 100
  if (pct > 20)  return 'bg-emerald-100 text-emerald-700 border-emerald-300'
  if (pct > 0)   return 'bg-emerald-50  text-emerald-600 border-emerald-200'
  if (pct < -20) return 'bg-red-100 text-red-700 border-red-200'
  if (pct < 0)   return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-cloud text-navy/60 border-cloud'
}

function fmt(h: number, m: number) {
  if (h === 24) return '24:00'
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ─── Inline bid modifier editor ───────────────────────────────────────────────
function BidModCell({ entry, clientId, onUpdated, onRemove }: {
  entry: AdScheduleEntry
  clientId: string
  onUpdated: (modifier: number) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState(String(Math.round((entry.bidModifier - 1) * 100)))
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  async function save() {
    const pct = parseFloat(value)
    if (!Number.isFinite(pct)) { setError('Enter a number'); return }
    const modifier = pct === -100 ? 0 : 1 + pct / 100
    if (modifier < 0) { setError('Minimum is -100%'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/ad-schedule', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, resource_name: entry.resourceName, bid_modifier: modifier }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      onUpdated(modifier); setEditing(false)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function remove() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/ad-schedule', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, resource_name: entry.resourceName }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      onRemove()
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  if (!editing) return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full border ${bidColor(entry.bidModifier)}`}>
        {bidPct(entry.bidModifier)}
      </span>
      <button
        onClick={() => { setValue(String(Math.round((entry.bidModifier - 1) * 100))); setEditing(true) }}
        className="text-[9px] text-navy/25 hover:text-cyan transition-colors"
        title="Edit bid modifier"
      >✏️</button>
      <button
        onClick={remove}
        disabled={saving}
        className="text-[9px] text-navy/25 hover:text-red-500 transition-colors"
        title="Remove this schedule entry"
      >🗑</button>
    </div>
  )

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          type="number" step="1" value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          className="w-16 border border-cyan rounded-lg px-2 py-0.5 text-xs text-navy focus:outline-none bg-white tabular-nums"
          autoFocus
        />
        <span className="text-xs text-teal">%</span>
        <button onClick={save} disabled={saving}
          className="text-[10px] font-bold bg-cyan text-navy px-2 py-0.5 rounded-lg hover:bg-cyan/80 disabled:opacity-50 transition-colors">
          {saving ? '…' : '✓'}
        </button>
        <button onClick={() => setEditing(false)} className="text-[10px] text-navy/40 hover:text-navy px-1">✕</button>
      </div>
      {error && <p className="text-[9px] text-red-500">{error}</p>}
    </div>
  )
}

// ─── Add schedule entry form ──────────────────────────────────────────────────
function AddEntryForm({ clientId, campaignId, onAdded }: {
  clientId:   string
  campaignId: string
  onAdded:    (entry: AdScheduleEntry) => void
}) {
  const [open,    setOpen]    = useState(false)
  const [day,     setDay]     = useState<DayOfWeek>('MONDAY')
  const [startH,  setStartH]  = useState(0)
  const [startM,  setStartM]  = useState(0)
  const [endH,    setEndH]    = useState(24)
  const [endM,    setEndM]    = useState(0)
  const [pct,     setPct]     = useState('0')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  async function submit() {
    const pctNum  = parseFloat(pct)
    const modifier = pctNum === -100 ? 0 : 1 + pctNum / 100
    if (!Number.isFinite(modifier) || modifier < 0) { setError('Invalid modifier'); return }
    if (startH * 60 + startM >= endH * 60 + endM) { setError('End must be after start'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/ad-schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_account_id: clientId, campaign_id: campaignId,
          entry: { dayOfWeek: day, startHour: startH, startMinute: startM, endHour: endH, endMinute: endM, bidModifier: modifier },
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      onAdded({
        resourceName: d.resourceName,
        criterionId: String(d.criterionId),
        dayOfWeek: day, startHour: startH, startMinute: startM,
        endHour: endH, endMinute: endM, bidModifier: modifier,
      })
      setOpen(false)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="text-[11px] font-bold text-navy/60 hover:text-cyan border border-dashed border-cloud hover:border-cyan/40 px-3 py-1.5 rounded-xl transition-all"
    >
      + Add Schedule
    </button>
  )

  return (
    <div className="bg-cyan/5 border border-cyan/20 rounded-2xl px-4 py-3 space-y-3">
      <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal">New Schedule Entry</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-[10px] text-navy/50 block mb-1">Day</label>
          <select value={day} onChange={e => setDay(e.target.value as DayOfWeek)}
            className="border border-cloud rounded-lg px-2 py-1.5 text-xs text-navy bg-white focus:outline-none focus:border-cyan">
            {DAYS.map(d => <option key={d} value={d}>{DAY_SHORT[d]}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-navy/50 block mb-1">Start</label>
          <div className="flex items-center gap-1">
            <select value={startH} onChange={e => setStartH(Number(e.target.value))}
              className="border border-cloud rounded-lg px-2 py-1.5 text-xs text-navy bg-white focus:outline-none focus:border-cyan">
              {HOURS.filter(h => h < 24).map(h => <option key={h} value={h}>{String(h).padStart(2,'0')}</option>)}
            </select>
            <span className="text-navy/40 text-xs">:</span>
            <select value={startM} onChange={e => setStartM(Number(e.target.value))}
              className="border border-cloud rounded-lg px-2 py-1.5 text-xs text-navy bg-white focus:outline-none focus:border-cyan">
              {MINUTES.map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-navy/50 block mb-1">End</label>
          <div className="flex items-center gap-1">
            <select value={endH} onChange={e => { const h = Number(e.target.value); setEndH(h); if (h === 24) setEndM(0) }}
              className="border border-cloud rounded-lg px-2 py-1.5 text-xs text-navy bg-white focus:outline-none focus:border-cyan">
              {HOURS.map(h => <option key={h} value={h}>{h === 24 ? '24' : String(h).padStart(2,'0')}</option>)}
            </select>
            <span className="text-navy/40 text-xs">:</span>
            <select value={endM} onChange={e => setEndM(Number(e.target.value))} disabled={endH === 24}
              className="border border-cloud rounded-lg px-2 py-1.5 text-xs text-navy bg-white focus:outline-none focus:border-cyan disabled:opacity-50">
              {MINUTES.map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-navy/50 block mb-1">Bid Adjustment</label>
          <div className="flex items-center gap-1">
            <input
              type="number" step="1" value={pct}
              onChange={e => setPct(e.target.value)}
              className="w-16 border border-cloud rounded-lg px-2 py-1.5 text-xs text-navy bg-white focus:outline-none focus:border-cyan tabular-nums"
            />
            <span className="text-xs text-teal">%</span>
          </div>
        </div>
        <button onClick={submit} disabled={saving}
          className="bg-cyan text-navy text-xs font-bold px-4 py-1.5 rounded-xl hover:bg-cyan/80 disabled:opacity-50 transition-colors">
          {saving ? '…' : 'Add'}
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-navy/40 hover:text-navy transition-colors">Cancel</button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdScheduleTab({ clientId, campaignId }: {
  clientId:   string
  campaignId: string
}) {
  const [schedule, setSchedule] = useState<AdScheduleEntry[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const fetched = useRef('')

  function load() {
    const key = `${clientId}|${campaignId}`
    if (fetched.current === key || loading) return
    fetched.current = key
    setLoading(true); setError('')
    fetch(`/api/ad-schedule?client_account_id=${encodeURIComponent(clientId)}&campaign_id=${encodeURIComponent(campaignId)}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        setSchedule(d.schedule ?? [])
      })
      .catch(e => { setError(e.message); fetched.current = '' })
      .finally(() => setLoading(false))
  }

  function handleUpdated(resourceName: string, modifier: number) {
    setSchedule(prev => prev.map(e => e.resourceName === resourceName ? { ...e, bidModifier: modifier } : e))
  }

  function handleRemoved(resourceName: string) {
    setSchedule(prev => prev.filter(e => e.resourceName !== resourceName))
  }

  function handleAdded(entry: AdScheduleEntry) {
    setSchedule(prev => [...prev, entry])
  }

  // ── Not loaded yet ─────────────────────────────────────────────────────────
  if (!fetched.current && !loading && !error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-4xl">📅</div>
        <p className="text-sm text-navy/60 text-center max-w-xs">
          View and adjust bid modifiers by day and hour. Boost bids on high-performing slots or exclude off-hours.
        </p>
        <button
          onClick={load}
          className="bg-cyan text-navy font-heading font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-cyan/80 transition-colors"
        >
          📅 Load Ad Schedule
        </button>
      </div>
    )
  }

  if (loading) return (
    <div className="flex items-center justify-center gap-3 py-16 text-teal text-sm">
      <div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
      Loading ad schedule…
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 mt-4">
      {error}
      <button onClick={() => { setError(''); fetched.current = ''; load() }} className="ml-3 underline">Retry</button>
    </div>
  )

  // ── Group by day ─────────────────────────────────────────────────────────
  const byDay = new Map<DayOfWeek, AdScheduleEntry[]>()
  for (const entry of schedule) {
    const arr = byDay.get(entry.dayOfWeek) ?? []
    arr.push(entry)
    byDay.set(entry.dayOfWeek, arr)
  }

  return (
    <div className="space-y-5">

      {/* Summary strip */}
      <div className="flex items-center gap-4 flex-wrap">
        <p className="text-sm text-navy font-heading font-bold">
          📅 Ad Schedule
          <span className="ml-2 text-[11px] font-normal text-teal">
            {schedule.length === 0 ? 'No custom schedule — running all hours' : `${schedule.length} entr${schedule.length !== 1 ? 'ies' : 'y'}`}
          </span>
        </p>
        <AddEntryForm clientId={clientId} campaignId={campaignId} onAdded={handleAdded} />
      </div>

      {schedule.length === 0 ? (
        <div className="text-center py-12 text-teal text-sm">
          No ad schedule entries — your ads run 24/7 with no bid adjustments.<br />
          <span className="text-[11px] text-navy/40">Use "+ Add Schedule" above to set bid adjustments for specific days and times.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {DAYS.filter(d => byDay.has(d)).map(day => {
            const entries = (byDay.get(day) ?? []).sort((a, b) =>
              a.startHour * 60 + a.startMinute - (b.startHour * 60 + b.startMinute)
            )
            return (
              <div key={day} className="bg-white border border-cloud rounded-2xl overflow-hidden">
                <div className="px-4 py-2 bg-mist border-b border-cloud/60 flex items-center gap-2">
                  <span className="text-[11px] font-heading font-bold text-navy uppercase tracking-wide">{DAY_SHORT[day]}</span>
                  <span className="text-[10px] text-navy/40">{entries.length} slot{entries.length !== 1 ? 's' : ''}</span>
                </div>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-cloud">
                    {entries.map(entry => (
                      <tr key={entry.criterionId || entry.resourceName} className="hover:bg-mist/30 transition-colors">
                        <td className="px-4 py-2.5 tabular-nums text-navy/70 whitespace-nowrap">
                          {fmt(entry.startHour, entry.startMinute)} – {fmt(entry.endHour, entry.endMinute)}
                        </td>
                        <td className="px-4 py-2.5">
                          <BidModCell
                            entry={entry}
                            clientId={clientId}
                            onUpdated={mod => handleUpdated(entry.resourceName, mod)}
                            onRemove={() => handleRemoved(entry.resourceName)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
