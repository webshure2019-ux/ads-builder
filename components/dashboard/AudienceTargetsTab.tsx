'use client'
import { useState, useRef } from 'react'
import type { AudienceTargetRow } from '@/lib/google-ads'

// ─── Bid modifier helpers ─────────────────────────────────────────────────────
function bidPct(modifier: number): string {
  const pct = Math.round((modifier - 1) * 100)
  if (pct === 0) return '0%'
  return pct > 0 ? `+${pct}%` : `${pct}%`
}

function bidColor(modifier: number): string {
  const pct = (modifier - 1) * 100
  if (pct > 20)  return 'bg-emerald-100 text-emerald-700 border-emerald-300'
  if (pct > 0)   return 'bg-emerald-50  text-emerald-600 border-emerald-200'
  if (pct < -20) return 'bg-red-100 text-red-700 border-red-200'
  if (pct < 0)   return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-cloud text-navy/60 border-cloud'
}

// ─── Inline bid modifier editor ───────────────────────────────────────────────
function BidModCell({ audience, clientId, onUpdated }: {
  audience: AudienceTargetRow
  clientId: string
  onUpdated: (modifier: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState(String(Math.round((audience.bidModifier - 1) * 100)))
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  async function save() {
    const pct = parseFloat(value)
    if (!Number.isFinite(pct)) { setError('Enter a number'); return }
    const modifier = 1 + pct / 100
    if (modifier < 0.1) { setError('Minimum is -90%'); return }
    if (modifier > 10)  { setError('Maximum is +900%'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/audience-targets', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, resource_name: audience.resourceName, bid_modifier: modifier }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      onUpdated(modifier); setEditing(false)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (!editing) return (
    <button
      onClick={() => { setValue(String(Math.round((audience.bidModifier - 1) * 100))); setEditing(true) }}
      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border cursor-pointer hover:ring-2 hover:ring-cyan/30 transition-all ${bidColor(audience.bidModifier)}`}
      title="Click to edit bid adjustment"
    >
      {bidPct(audience.bidModifier)} <span className="text-[9px] opacity-60">✏️</span>
    </button>
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

// ─── Main component ───────────────────────────────────────────────────────────
export function AudienceTargetsTab({ clientId, campaignId }: {
  clientId:   string
  campaignId: string
}) {
  const [audiences, setAudiences] = useState<AudienceTargetRow[]>([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const fetched = useRef('')

  function load() {
    const key = `${clientId}|${campaignId}`
    if (fetched.current === key || loading) return
    fetched.current = key
    setLoading(true); setError('')
    fetch(`/api/audience-targets?client_account_id=${encodeURIComponent(clientId)}&campaign_id=${encodeURIComponent(campaignId)}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        setAudiences(d.audiences ?? [])
      })
      .catch(e => { setError(e.message); fetched.current = '' })
      .finally(() => setLoading(false))
  }

  if (!fetched.current && !loading && !error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-4xl">👥</div>
        <p className="text-sm text-navy/60 text-center max-w-xs">
          View audience targets with bid adjustments for this campaign. Observation audiences show performance data without restricting reach.
        </p>
        <button
          onClick={load}
          className="bg-cyan text-navy font-heading font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-cyan/80 transition-colors"
        >
          👥 Load Audiences
        </button>
      </div>
    )
  }

  if (loading) return (
    <div className="flex items-center justify-center gap-3 py-16 text-teal text-sm">
      <div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
      Loading audiences…
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
      <div className="flex items-center gap-3">
        <p className="text-sm text-navy font-heading font-bold">
          👥 Audience Targets
        </p>
        <span className="text-[11px] text-teal">
          {audiences.length === 0 ? 'No audience targets set' : `${audiences.length} audience${audiences.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {audiences.length === 0 ? (
        <div className="text-center py-12 text-teal text-sm">
          No audience targets found for this campaign.<br />
          <span className="text-[11px] text-navy/40">Add audiences in Google Ads to set bid adjustments here.</span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-cloud">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-cloud bg-mist">
                <th className="px-4 py-2.5 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Audience</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Mode</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Bid Adjustment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cloud">
              {audiences.map(a => (
                <tr key={a.criterionId} className="hover:bg-mist/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-navy font-medium">{a.userListName}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full border ${a.targeting === 'TARGETING' ? 'bg-cyan/10 text-cyan-800 border-cyan/30' : 'bg-cloud/60 text-navy/50 border-cloud'}`}>
                      {a.targeting === 'TARGETING' ? 'Targeting' : 'Observation'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <BidModCell
                      audience={a}
                      clientId={clientId}
                      onUpdated={mod => setAudiences(prev => prev.map(x => x.criterionId === a.criterionId ? { ...x, bidModifier: mod } : x))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-navy/40 leading-relaxed">
        <strong>Observation:</strong> ads show to all users; bid is adjusted for audience members. <strong>Targeting:</strong> ads only show to audience members.
        Edit bid adjustments by clicking the percentage badge. Add or remove audiences in Google Ads directly.
      </p>
    </div>
  )
}
