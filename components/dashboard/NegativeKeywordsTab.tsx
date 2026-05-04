'use client'
import { useState, useCallback } from 'react'
import type { NegativeKeyword } from '@/lib/google-ads'

// ─── Match type badge ─────────────────────────────────────────────────────────
const MATCH_CFG: Record<string, { label: string; cls: string; symbol: string }> = {
  EXACT:   { label: 'Exact',  symbol: '[e]', cls: 'bg-cyan/15 text-cyan-800'    },
  PHRASE:  { label: 'Phrase', symbol: '"p"', cls: 'bg-navy/10 text-navy'        },
  BROAD:   { label: 'Broad',  symbol: 'bm',  cls: 'bg-amber-100 text-amber-800' },
  UNKNOWN: { label: '?',      symbol: '?',   cls: 'bg-cloud text-navy/40'       },
}

function MatchBadge({ matchType }: { matchType: string }) {
  const cfg = MATCH_CFG[matchType] ?? MATCH_CFG.UNKNOWN
  return (
    <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${cfg.cls}`}>
      {cfg.symbol}
    </span>
  )
}

// ─── Parse a pasted keyword line for match type ───────────────────────────────
// [keyword] → EXACT  |  "keyword" → PHRASE  |  plain → BROAD
function parsePastedKw(line: string): { text: string; matchType: 'EXACT' | 'PHRASE' | 'BROAD' } {
  const t = line.trim()
  if (t.startsWith('[') && t.endsWith(']')) return { text: t.slice(1, -1).trim(), matchType: 'EXACT'  }
  if (t.startsWith('"') && t.endsWith('"')) return { text: t.slice(1, -1).trim(), matchType: 'PHRASE' }
  return { text: t, matchType: 'BROAD' }
}

// ─── Conflict detection ────────────────────────────────────────────────────────
// Returns pairs of (negative, positive) that conflict.
// Rules (conservative — only flag clear blocks):
//  • neg EXACT   → blocks positive with IDENTICAL text
//  • neg PHRASE  → blocks positive containing the phrase
//  • neg BROAD   → blocks positive if ALL words of the negative appear in the positive
function detectConflicts(
  negatives: NegativeKeyword[],
  positives: { text: string; matchType: string }[]
): Array<{ neg: NegativeKeyword; posText: string; posMatchType: string; reason: string }> {
  const conflicts: Array<{ neg: NegativeKeyword; posText: string; posMatchType: string; reason: string }> = []
  for (const neg of negatives) {
    const negWords = neg.text.toLowerCase().split(/\s+/)
    for (const pos of positives) {
      const posLow = pos.text.toLowerCase()
      if (neg.matchType === 'EXACT' && posLow === neg.text.toLowerCase()) {
        conflicts.push({ neg, posText: pos.text, posMatchType: pos.matchType, reason: `Negative [${neg.text}] exactly matches positive keyword` })
      } else if (neg.matchType === 'PHRASE' && posLow.includes(neg.text.toLowerCase())) {
        conflicts.push({ neg, posText: pos.text, posMatchType: pos.matchType, reason: `Negative phrase "${neg.text}" is contained in positive keyword` })
      } else if (neg.matchType === 'BROAD' && negWords.every(w => posLow.split(/\s+/).includes(w))) {
        conflicts.push({ neg, posText: pos.text, posMatchType: pos.matchType, reason: `Broad negative "${neg.text}" would block positive keyword "${pos.text}"` })
      }
    }
  }
  return conflicts
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  clientId:   string
  campaignId: string   // always required — this is campaign-level negatives
}

// ─── Main component ───────────────────────────────────────────────────────────
export function NegativeKeywordsTab({ clientId, campaignId }: Props) {
  const [negatives,   setNegatives]   = useState<NegativeKeyword[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [fetched,     setFetched]     = useState(false)

  // Add form
  const [addText,     setAddText]     = useState('')
  const [addMatch,    setAddMatch]    = useState<'EXACT' | 'PHRASE' | 'BROAD'>('EXACT')
  const [adding,      setAdding]      = useState(false)
  const [addError,    setAddError]    = useState('')

  // Bulk add
  const [bulkOpen,    setBulkOpen]    = useState(false)
  const [bulkText,    setBulkText]    = useState('')
  const [bulkAdding,  setBulkAdding]  = useState(false)
  const [bulkError,   setBulkError]   = useState('')
  const [bulkDone,    setBulkDone]    = useState(0)

  // Remove
  const [removing,    setRemoving]    = useState<string>('')   // criterionId being removed
  const [removeError, setRemoveError] = useState('')

  // Conflict check
  const [conflicts,   setConflicts]   = useState<ReturnType<typeof detectConflicts> | null>(null)
  const [checkingConflicts, setCheckingConflicts] = useState(false)
  const [conflictError, setConflictError] = useState('')

  // Search filter
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (loading) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/negative-keywords?client_account_id=${clientId}&campaign_id=${campaignId}`)
      const d   = await res.json()
      if (!res.ok) throw new Error(d.error)
      setNegatives(d.negatives ?? [])
      setFetched(true)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [loading, clientId, campaignId])

  // ── Add single ─────────────────────────────────────────────────────────────
  async function addNegative() {
    if (!addText.trim()) return
    setAdding(true); setAddError('')
    try {
      const res = await fetch('/api/negative-keywords', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, campaign_id: campaignId, text: addText.trim(), match_type: addMatch }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      // Optimistically add to list
      setNegatives(prev => [{
        criterionId: d.criterionId ?? 'new',
        campaignId,
        campaignName: '',
        text: addText.trim().toLowerCase(),
        matchType: addMatch,
      }, ...prev])
      setAddText('')
    } catch (e: any) { setAddError(e.message) }
    finally { setAdding(false) }
  }

  // ── Bulk add ───────────────────────────────────────────────────────────────
  async function addBulk() {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) return
    setBulkAdding(true); setBulkError(''); setBulkDone(0)
    let done = 0
    const added: NegativeKeyword[] = []
    for (const line of lines) {
      const { text, matchType } = parsePastedKw(line)
      if (!text) continue
      try {
        const res = await fetch('/api/negative-keywords', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_account_id: clientId, campaign_id: campaignId, text, match_type: matchType }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(`"${text}": ${d.error}`)
        added.push({ criterionId: d.criterionId ?? 'new', campaignId, campaignName: '', text: text.toLowerCase(), matchType })
        done++
        setBulkDone(done)
      } catch (e: any) { setBulkError(e.message); break }
    }
    setNegatives(prev => [...added, ...prev])
    if (!bulkError) { setBulkText(''); setBulkOpen(false) }
    setBulkAdding(false)
  }

  // ── Remove ─────────────────────────────────────────────────────────────────
  async function removeNegative(criterionId: string) {
    setRemoving(criterionId); setRemoveError('')
    try {
      const res = await fetch('/api/negative-keywords', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_account_id: clientId, campaign_id: campaignId, criterion_id: criterionId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setNegatives(prev => prev.filter(n => n.criterionId !== criterionId))
    } catch (e: any) { setRemoveError(e.message) }
    finally { setRemoving('') }
  }

  // ── Conflict check ─────────────────────────────────────────────────────────
  async function checkConflicts() {
    setCheckingConflicts(true); setConflictError(''); setConflicts(null)
    try {
      const res = await fetch(`/api/keyword-performance?client_account_id=${clientId}&campaign_id=${campaignId}&start_date=2024-01-01&end_date=2025-12-31`)
      const d   = await res.json()
      if (!res.ok) throw new Error(d.error)
      const positives = (d.keywords ?? []).map((k: any) => ({ text: k.text, matchType: k.matchType }))
      const found     = detectConflicts(negatives, positives)
      setConflicts(found)
    } catch (e: any) { setConflictError(e.message) }
    finally { setCheckingConflicts(false) }
  }

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = negatives.filter(n => !search || n.text.toLowerCase().includes(search.toLowerCase()))

  // ── Not loaded yet ─────────────────────────────────────────────────────────
  if (!fetched && !loading && !error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-4xl">🚫</div>
        <p className="text-sm text-navy/60 text-center max-w-xs">
          View, add, and manage campaign-level negative keywords to stop wasting budget on irrelevant searches.
        </p>
        <button
          onClick={load}
          className="bg-cyan text-navy font-heading font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-cyan/80 transition-colors"
        >
          🚫 Load Negative Keywords
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-teal text-sm">
        <div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
        Loading negative keywords…
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 mt-4">
        {error}
        <button onClick={() => { setError(''); setFetched(false) }} className="ml-3 underline">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Summary bar ── */}
      <div className="flex items-center gap-4">
        <div className="flex gap-3 flex-1 flex-wrap">
          {(['EXACT', 'PHRASE', 'BROAD'] as const).map(mt => {
            const count = negatives.filter(n => n.matchType === mt).length
            return count > 0 ? (
              <div key={mt} className="flex items-center gap-1.5 bg-white border border-cloud rounded-xl px-3 py-2">
                <MatchBadge matchType={mt} />
                <span className="text-xs font-bold text-navy tabular-nums">{count}</span>
                <span className="text-[10px] text-navy/50">{MATCH_CFG[mt].label}</span>
              </div>
            ) : null
          })}
          <div className="flex items-center gap-1.5 bg-white border border-cloud rounded-xl px-3 py-2">
            <span className="text-sm">🚫</span>
            <span className="text-xs font-bold text-navy tabular-nums">{negatives.length}</span>
            <span className="text-[10px] text-navy/50">total</span>
          </div>
        </div>
        <button
          onClick={checkConflicts}
          disabled={checkingConflicts || negatives.length === 0}
          className="text-[11px] font-bold border border-amber-300 text-amber-700 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 whitespace-nowrap"
        >
          {checkingConflicts ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
              Checking…
            </span>
          ) : '⚠️ Check Conflicts'}
        </button>
      </div>

      {/* ── Conflict results ── */}
      {conflictError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">{conflictError}</div>
      )}
      {conflicts !== null && (
        <div className={`border rounded-2xl overflow-hidden ${conflicts.length > 0 ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <div className="px-4 py-3 flex items-center gap-2">
            <span className="text-sm">{conflicts.length > 0 ? '⚠️' : '✅'}</span>
            <span className="text-xs font-heading font-bold text-navy">
              {conflicts.length > 0 ? `${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''} detected` : 'No conflicts found — your negatives look clean!'}
            </span>
          </div>
          {conflicts.length > 0 && (
            <div className="px-4 pb-4 space-y-2">
              {conflicts.map((c, i) => (
                <div key={i} className="bg-white border border-red-200 rounded-xl px-3 py-2">
                  <p className="text-xs font-medium text-red-700">{c.reason}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-navy/40">NEG</span>
                      <MatchBadge matchType={c.neg.matchType} />
                      <span className="text-xs text-navy font-medium">{c.neg.text}</span>
                    </div>
                    <span className="text-navy/30 text-xs">blocks</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-navy/40">POS</span>
                      <MatchBadge matchType={c.posMatchType} />
                      <span className="text-xs text-navy font-medium">{c.posText}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-red-600 mt-1">💡 Remove the negative or adjust match type to prevent blocking your own keyword.</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add form ── */}
      <div className="bg-white border border-cloud rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-mist border-b border-cloud">
          <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Add Negative Keyword</p>
          <p className="text-[10px] text-navy/40 mt-0.5">
            [text] = Exact &nbsp;·&nbsp; "text" = Phrase &nbsp;·&nbsp; text = Broad
          </p>
        </div>
        <div className="px-4 py-3 space-y-3">
          {/* Single add */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={addText}
              onChange={e => setAddText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addNegative()}
              placeholder="Enter negative keyword…"
              className="flex-1 text-xs border border-cloud rounded-lg px-3 py-1.5 text-navy focus:outline-none focus:border-cyan bg-white"
              maxLength={80}
            />
            <div className="flex items-center gap-1">
              {(['EXACT', 'PHRASE', 'BROAD'] as const).map(mt => (
                <button
                  key={mt}
                  onClick={() => setAddMatch(mt)}
                  className={`text-[10px] font-bold px-2 py-1.5 rounded-lg border transition-all ${addMatch === mt ? 'bg-cyan text-navy border-cyan' : 'border-cloud text-navy/60 hover:border-cyan/40'}`}
                >
                  {MATCH_CFG[mt].label}
                </button>
              ))}
            </div>
            <button
              onClick={addNegative}
              disabled={adding || !addText.trim()}
              className="bg-cyan text-navy font-heading font-bold text-xs px-4 py-1.5 rounded-lg hover:bg-cyan/80 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {adding ? '…' : '+ Add'}
            </button>
          </div>
          {addError && <p className="text-[10px] text-red-500">{addError}</p>}

          {/* Bulk add toggle */}
          <div>
            <button
              onClick={() => setBulkOpen(o => !o)}
              className="text-[11px] font-bold text-cyan hover:text-cyan/70 transition-colors"
            >
              {bulkOpen ? '▲ Hide bulk add' : '▼ Bulk add (paste multiple keywords)'}
            </button>
          </div>
          {bulkOpen && (
            <div className="space-y-2">
              <p className="text-[10px] text-navy/50">
                One keyword per line. Wrap in [brackets] for Exact, "quotes" for Phrase, or leave plain for Broad.
              </p>
              <textarea
                rows={6}
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder={'[exact match keyword]\n"phrase match keyword"\nbroad match keyword'}
                className="w-full text-xs border border-cloud rounded-lg px-3 py-2 text-navy focus:outline-none focus:border-cyan bg-white resize-none font-mono"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={addBulk}
                  disabled={bulkAdding || !bulkText.trim()}
                  className="bg-cyan text-navy font-heading font-bold text-xs px-4 py-1.5 rounded-lg hover:bg-cyan/80 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {bulkAdding ? `Adding ${bulkDone}…` : `Add ${bulkText.split('\n').filter(l => l.trim()).length} Keywords`}
                </button>
                {bulkDone > 0 && !bulkAdding && (
                  <span className="text-[10px] text-emerald-600 font-bold">✓ {bulkDone} added</span>
                )}
              </div>
              {bulkError && <p className="text-[10px] text-red-500">{bulkError}</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Remove errors ── */}
      {removeError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">{removeError}</div>
      )}

      {/* ── List ── */}
      {fetched && negatives.length === 0 ? (
        <div className="text-center py-12 text-teal text-sm">
          No campaign-level negative keywords yet. Add some above!
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="flex items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter negatives…"
              className="text-xs border border-cloud rounded-lg px-3 py-1.5 text-navy focus:outline-none focus:border-cyan w-48 bg-white"
            />
            <p className="text-[10px] text-navy/40 ml-auto tabular-nums">
              {filtered.length} of {negatives.length} negative{negatives.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-cloud overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cloud bg-mist">
                  <th className="px-4 py-2.5 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Keyword</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Match Type</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-heading font-bold uppercase tracking-wider text-teal"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cloud">
                {filtered.map(n => (
                  <tr key={n.criterionId} className="hover:bg-mist/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-medium text-navy">{n.text}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <MatchBadge matchType={n.matchType} />
                        <span className="text-[10px] text-navy/50">{MATCH_CFG[n.matchType]?.label ?? n.matchType}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => removeNegative(n.criterionId)}
                        disabled={removing === n.criterionId}
                        className="text-[10px] font-bold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-2.5 py-1 rounded-lg transition-all disabled:opacity-50"
                      >
                        {removing === n.criterionId
                          ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          : '✕ Remove'
                        }
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
