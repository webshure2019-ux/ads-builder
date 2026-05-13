'use client'
import { useState, useRef, useEffect } from 'react'

interface WastedKeyword {
  id: string; campaignName: string; adGroupName: string
  text: string; matchType: string; qualityScore: number | null
  cost: number; conversions: number; clicks: number
}
interface LowQSKeyword {
  id: string; campaignName: string; adGroupName: string
  text: string; matchType: string; qualityScore: number | null
  cost: number; conversions: number; clicks: number
}
interface WastedSearchTerm {
  term: string; campaignName: string; adGroupName: string
  cost: number; clicks: number; status: string
  campaignId: string; adGroupId: string
}
interface WastedData {
  lowQSKeywords:     LowQSKeyword[]
  wastedKeywords:    WastedKeyword[]
  wastedSearchTerms: WastedSearchTerm[]
  meta:              { avgCpa: number; cpaThreshold: number; totalCost: number; totalConv: number }
}

const MATCH_SHORT: Record<string, string> = { EXACT: '[e]', PHRASE: '"p"', BROAD: 'b', UNKNOWN: '?' }

export function WastedSpendSection({ clientId, startDate, endDate, currency }: {
  clientId:  string
  startDate: string
  endDate:   string
  currency:  string
}) {
  const [open,    setOpen]    = useState(false)
  const [data,    setData]    = useState<WastedData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [tab,     setTab]     = useState<'zero_conv' | 'low_qs' | 'search_terms'>('zero_conv')
  const fetchedKey = useRef('')

  function toggle() {
    setOpen(o => !o)
  }

  // Fetch (or re-fetch on client/date switch) whenever the section is open and the key changes
  useEffect(() => {
    if (!open) return
    const key = `${clientId}|${startDate}|${endDate}`
    if (fetchedKey.current === key) return
    fetchedKey.current = key
    setLoading(true); setError('')
    fetch(`/api/wasted-spend?client_account_id=${encodeURIComponent(clientId)}&start_date=${startDate}&end_date=${endDate}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        setData(d)
      })
      .catch(e => { setError(e.message); fetchedKey.current = '' })
      .finally(() => setLoading(false))
  }, [clientId, startDate, endDate, open])

  const totalWasted = data
    ? data.wastedKeywords.reduce((s, k) => s + k.cost, 0)
      + data.wastedSearchTerms.reduce((s, t) => s + t.cost, 0)
    : 0

  const issueCounts = data
    ? data.wastedKeywords.length + data.wastedSearchTerms.length + data.lowQSKeywords.length
    : 0

  return (
    <div className="bg-white border border-cloud rounded-2xl overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-mist/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm">🗑</span>
          <div>
            <p className="text-[11px] font-heading font-bold uppercase tracking-wider text-teal">Wasted Spend</p>
            {!open && data && (
              <p className="text-[10px] text-navy/40 mt-0.5">
                {issueCounts} issue{issueCounts !== 1 ? 's' : ''} · {currency} {totalWasted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} identified
              </p>
            )}
          </div>
        </div>
        <span className="text-navy/40 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-cloud px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-teal">
              <div className="w-4 h-4 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
              Analysing account spend…
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">
              {error}
              <button onClick={() => { fetchedKey.current = ''; toggle() }} className="ml-2 underline">Retry</button>
            </div>
          ) : !data ? null : (
            <div className="space-y-4">

              {/* Summary row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Zero-conv keywords',   count: data.wastedKeywords.length,    cost: data.wastedKeywords.reduce((s,k)=>s+k.cost,0),    color: 'border-red-200 bg-red-50',     tab: 'zero_conv' as const },
                  { label: 'Low QS keywords (≤4)', count: data.lowQSKeywords.length,     cost: data.lowQSKeywords.reduce((s,k)=>s+k.cost,0),     color: 'border-amber-200 bg-amber-50', tab: 'low_qs' as const },
                  { label: 'Wasted search terms',  count: data.wastedSearchTerms.length, cost: data.wastedSearchTerms.reduce((s,t)=>s+t.cost,0), color: 'border-orange-200 bg-orange-50',tab: 'search_terms' as const },
                ].map(card => (
                  <button
                    key={card.tab}
                    onClick={() => setTab(card.tab)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-all hover:shadow-sm ${card.color} ${tab === card.tab ? 'ring-2 ring-cyan/30' : ''}`}
                  >
                    <p className="text-xl font-heading font-black text-navy tabular-nums">{card.count}</p>
                    <p className="text-[10px] text-navy/60 mt-0.5">{card.label}</p>
                    {card.cost > 0 && (
                      <p className="text-[10px] text-red-600 font-bold mt-1 tabular-nums">
                        {currency} {card.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {tab === 'zero_conv' && (
                data.wastedKeywords.length === 0 ? (
                  <p className="text-sm text-teal text-center py-6">
                    ✅ No zero-conversion keywords spending above threshold.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-cloud">
                    <table className="w-full text-xs min-w-[600px]">
                      <thead>
                        <tr className="border-b border-cloud bg-mist">
                          <th className="px-3 py-2 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Keyword</th>
                          <th className="px-3 py-2 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Campaign</th>
                          <th className="px-3 py-2 text-right text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Clicks</th>
                          <th className="px-3 py-2 text-right text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Cost</th>
                          <th className="px-3 py-2 text-center text-[10px] font-heading font-bold uppercase tracking-wider text-teal">QS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cloud">
                        {data.wastedKeywords.map(k => (
                          <tr key={k.id} className="hover:bg-red-50/40 transition-colors">
                            <td className="px-3 py-2 text-navy font-medium">
                              {k.text}
                              <span className="ml-1.5 text-[10px] text-navy/30">{MATCH_SHORT[k.matchType] ?? k.matchType}</span>
                            </td>
                            <td className="px-3 py-2 text-navy/60 truncate max-w-[160px]">{k.campaignName}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-navy/70">{k.clicks.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-red-600 font-bold">
                              {currency} {k.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {k.qualityScore !== null ? (
                                <span className={`inline-flex w-5 h-5 items-center justify-center rounded-full text-[10px] font-bold ${k.qualityScore <= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {k.qualityScore}
                                </span>
                              ) : <span className="text-navy/20">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {tab === 'low_qs' && (
                data.lowQSKeywords.length === 0 ? (
                  <p className="text-sm text-teal text-center py-6">
                    ✅ No low Quality Score keywords spending budget.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-cloud">
                    <table className="w-full text-xs min-w-[600px]">
                      <thead>
                        <tr className="border-b border-cloud bg-mist">
                          <th className="px-3 py-2 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Keyword</th>
                          <th className="px-3 py-2 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Campaign</th>
                          <th className="px-3 py-2 text-center text-[10px] font-heading font-bold uppercase tracking-wider text-teal">QS</th>
                          <th className="px-3 py-2 text-right text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Clicks</th>
                          <th className="px-3 py-2 text-right text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Cost</th>
                          <th className="px-3 py-2 text-right text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Conv.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cloud">
                        {data.lowQSKeywords.map(k => (
                          <tr key={k.id} className="hover:bg-amber-50/40 transition-colors">
                            <td className="px-3 py-2 text-navy font-medium">
                              {k.text}
                              <span className="ml-1.5 text-[10px] text-navy/30">{MATCH_SHORT[k.matchType] ?? k.matchType}</span>
                            </td>
                            <td className="px-3 py-2 text-navy/60 truncate max-w-[160px]">{k.campaignName}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`inline-flex w-5 h-5 items-center justify-center rounded-full text-[10px] font-bold ${(k.qualityScore ?? 10) <= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                {k.qualityScore}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-navy/70">{k.clicks.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-amber-700 font-bold">
                              {currency} {k.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-navy/70">{k.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {tab === 'search_terms' && (
                data.wastedSearchTerms.length === 0 ? (
                  <p className="text-sm text-teal text-center py-6">
                    ✅ No high-spend zero-conversion search terms found.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-cloud">
                    <table className="w-full text-xs min-w-[560px]">
                      <thead>
                        <tr className="border-b border-cloud bg-mist">
                          <th className="px-3 py-2 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Search Term</th>
                          <th className="px-3 py-2 text-left text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Campaign</th>
                          <th className="px-3 py-2 text-right text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Clicks</th>
                          <th className="px-3 py-2 text-right text-[10px] font-heading font-bold uppercase tracking-wider text-teal">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cloud">
                        {data.wastedSearchTerms.map((t, i) => (
                          <tr key={i} className="hover:bg-orange-50/40 transition-colors">
                            <td className="px-3 py-2 text-navy font-medium">{t.term}</td>
                            <td className="px-3 py-2 text-navy/60 truncate max-w-[180px]">{t.campaignName}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-navy/70">{t.clicks.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-orange-700 font-bold">
                              {currency} {t.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              <p className="text-[10px] text-navy/40">
                Threshold: {currency} {data.meta.cpaThreshold.toFixed(2)} (1.5× account avg CPA).
                Zero-conversion keywords and search terms spending above this threshold are flagged.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
