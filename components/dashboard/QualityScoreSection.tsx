'use client'
import { useState, useRef, useEffect } from 'react'

interface QSSnapshot {
  date:    string
  avgQs:   number | null
  dist:    { low: number; mid: number; high: number }
  total:   number
  keywords: { text: string; qs: number | null; campaignId: string }[]
}

function QSBadge({ qs }: { qs: number | null }) {
  if (qs === null) return <span className="text-navy/20 text-xs">—</span>
  const color = qs <= 3 ? 'bg-red-100 text-red-700' : qs <= 6 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
  return <span className={`inline-flex w-5 h-5 items-center justify-center rounded-full text-[10px] font-bold ${color}`}>{qs}</span>
}

function DistBar({ dist, total }: { dist: QSSnapshot['dist']; total: number }) {
  if (total === 0) return null
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-cloud min-w-[120px]">
        <div className="bg-red-400 transition-all"    style={{ width: `${pct(dist.low)}%` }} title={`Low (1-3): ${dist.low}`} />
        <div className="bg-amber-400 transition-all"  style={{ width: `${pct(dist.mid)}%` }} title={`Mid (4-6): ${dist.mid}`} />
        <div className="bg-emerald-400 transition-all"style={{ width: `${pct(dist.high)}%` }} title={`High (7-10): ${dist.high}`} />
      </div>
      <span className="text-[10px] text-navy/40 whitespace-nowrap tabular-nums">{total} kws</span>
    </div>
  )
}

export function QualityScoreSection({ clientId, startDate, endDate }: {
  clientId:  string
  startDate: string
  endDate:   string
}) {
  const [open,       setOpen]       = useState(false)
  const [snapshots,  setSnapshots]  = useState<QSSnapshot[]>([])
  const [loading,    setLoading]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [saveMsg,    setSaveMsg]    = useState('')
  const [expanded,   setExpanded]   = useState<string | null>(null) // expanded snapshot date
  const fetchedKey = useRef('')

  function fetchHistory(force = false) {
    const key = clientId
    if (!force && fetchedKey.current === key) return
    fetchedKey.current = key
    setLoading(true); setError('')
    fetch(`/api/quality-score-snapshot?client_account_id=${encodeURIComponent(clientId)}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        setSnapshots(d.snapshots ?? [])
      })
      .catch(e => { setError(e.message); fetchedKey.current = '' })
      .finally(() => setLoading(false))
  }

  function toggle() {
    setOpen(o => !o)
  }

  // Fetch history on open; re-fetch when clientId changes while the section is open
  useEffect(() => {
    if (open) fetchHistory()
  }, [clientId, open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function takeSnapshot() {
    setSaving(true); setSaveMsg(''); setError('')
    try {
      const res = await fetch('/api/quality-score-snapshot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, start_date: startDate, end_date: endDate }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setSaveMsg(`✓ Snapshot saved — ${d.saved} keywords recorded`)
      fetchHistory(true)
      setTimeout(() => setSaveMsg(''), 4000)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const latest = snapshots[0]

  return (
    <div className="bg-white border border-cloud rounded-2xl overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-mist/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm">📊</span>
          <div>
            <p className="text-[11px] font-heading font-bold uppercase tracking-wider text-teal">Quality Score Tracker</p>
            {!open && latest && (
              <p className="text-[10px] text-navy/40 mt-0.5">
                Latest avg QS: {latest.avgQs ?? '—'} · {latest.total} keywords · {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
        <span className="text-navy/40 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-cloud px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-teal">
              <div className="w-4 h-4 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
              Loading QS history…
            </div>
          ) : error ? (
            <p className="text-xs text-red-500">{error}</p>
          ) : null}

          {/* Take snapshot button */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={takeSnapshot} disabled={saving}
              className="bg-cyan text-navy text-xs font-bold px-4 py-2 rounded-xl hover:bg-cyan/80 disabled:opacity-50 transition-colors"
            >
              {saving ? '⏳ Saving…' : '📸 Take QS Snapshot'}
            </button>
            <p className="text-[10px] text-navy/40">Saves the current QS for all enabled keywords to track trends over time.</p>
          </div>
          {saveMsg && <p className="text-xs text-teal">{saveMsg}</p>}

          {snapshots.length === 0 && !loading ? (
            <div className="text-center py-8 text-teal text-sm">
              No snapshots yet — take your first snapshot to start tracking QS trends.
              <br />
              <span className="text-[11px] text-navy/40">
                Note: requires the <code className="bg-cloud px-1 rounded">keyword_qs_snapshots</code> Supabase table.
                See the API route comments for the CREATE TABLE SQL.
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              {/* QS history list */}
              {snapshots.map(snap => (
                <div key={snap.date} className="border border-cloud rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpanded(expanded === snap.date ? null : snap.date)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-mist/40 hover:bg-mist/70 transition-colors text-left"
                  >
                    <div className="flex items-center gap-4 flex-1 flex-wrap">
                      <span className="text-xs font-bold text-navy">{snap.date}</span>
                      <DistBar dist={snap.dist} total={snap.total} />
                      <div className="flex items-center gap-3 text-[10px]">
                        <span className="text-red-600">🔴 {snap.dist.low} low</span>
                        <span className="text-amber-600">🟡 {snap.dist.mid} mid</span>
                        <span className="text-emerald-600">🟢 {snap.dist.high} high</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <span className="text-[11px] font-heading font-bold text-navy tabular-nums">
                        avg {snap.avgQs ?? '—'}
                      </span>
                      <span className="text-navy/30 text-[10px]">{expanded === snap.date ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {expanded === snap.date && snap.keywords.length > 0 && (
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-white border-b border-cloud">
                          <tr>
                            <th className="px-3 py-1.5 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Keyword</th>
                            <th className="px-3 py-1.5 text-center text-[10px] font-heading font-bold uppercase tracking-wider text-teal">QS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-cloud/60">
                          {snap.keywords
                            .filter(k => k.qs !== null)
                            .sort((a, b) => (a.qs ?? 10) - (b.qs ?? 10))
                            .slice(0, 100)
                            .map((k, i) => (
                              <tr key={i} className={`hover:bg-mist/20 ${(k.qs ?? 10) <= 3 ? 'bg-red-50/30' : ''}`}>
                                <td className="px-3 py-1.5 text-navy/80">{k.text}</td>
                                <td className="px-3 py-1.5 text-center"><QSBadge qs={k.qs} /></td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
