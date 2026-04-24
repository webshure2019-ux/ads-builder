'use client'
import { useState } from 'react'
import { AdGroup, Keyword, NegativeKeyword, MatchType } from '@/types'
import { KeywordChip } from '@/components/ui/KeywordChip'

interface Props {
  adGroups: AdGroup[]
  onChange: (adGroups: AdGroup[]) => void
}

const MATCH_TYPES: MatchType[] = ['exact', 'phrase', 'broad']

export function AdGroupDetails({ adGroups, onChange }: Props) {
  const filledGroups = adGroups.filter(ag => ag.name.trim())
  const [activeId, setActiveId] = useState<string>(filledGroups[0]?.id ?? '')
  const [seeds, setSeeds] = useState<Record<string, string>>({})
  const [loadingKw, setLoadingKw] = useState<Record<string, boolean>>({})
  const [kwError, setKwError] = useState<Record<string, string>>({})
  const [scraping, setScraping] = useState<Record<string, boolean>>({})
  const [scrapeError, setScrapeError] = useState<Record<string, string>>({})
  const [scrapeSuccess, setScrapeSuccess] = useState<Record<string, string>>({})
  const [showPaste, setShowPaste] = useState<Record<string, boolean>>({})
  const [pasteContent, setPasteContent] = useState<Record<string, string>>({})
  const [negInput, setNegInput] = useState<Record<string, string>>({})
  const [negMatchType, setNegMatchType] = useState<Record<string, MatchType>>({})

  const activeGroup = filledGroups.find(ag => ag.id === activeId) ?? filledGroups[0]

  function updateGroup(id: string, patch: Partial<AdGroup>) {
    onChange(adGroups.map(ag => ag.id === id ? { ...ag, ...patch } : ag))
  }

  async function handleScrape(ag: AdGroup) {
    if (!ag.url) return
    setScraping(prev => ({ ...prev, [ag.id]: true }))
    setScrapeError(prev => ({ ...prev, [ag.id]: '' }))
    setScrapeSuccess(prev => ({ ...prev, [ag.id]: '' }))
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ag.url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const usps: string[] = data.content.usps ?? []
      if (usps.length > 0) {
        updateGroup(ag.id, { usps })
        setScrapeSuccess(prev => ({ ...prev, [ag.id]: `Found ${usps.length} USPs from the page` }))
      } else {
        // Nothing found — leave existing USPs intact and let the user know
        setScrapeSuccess(prev => ({
          ...prev,
          [ag.id]: 'Page scraped but no USPs detected — please enter them manually below',
        }))
      }
    } catch (err) {
      setScrapeError(prev => ({ ...prev, [ag.id]: `Scrape failed: ${String(err)}` }))
    } finally {
      setScraping(prev => ({ ...prev, [ag.id]: false }))
    }
  }

  function handleExtractFromPaste(ag: AdGroup) {
    const text = pasteContent[ag.id] || ''
    if (!text.trim()) return
    // Extract lines that look like USPs: short sentences, bullet points, list markers
    const lines = text
      .split(/\n|•|–|—|\*/)
      .map(l => l.replace(/^[-–—•*\d.)\s]+/, '').trim())
      .filter(l => l.length > 8 && l.length < 120)
    const usps = Array.from(new Set(lines)).slice(0, 6)
    if (usps.length > 0) {
      updateGroup(ag.id, { usps })
      setScrapeSuccess(prev => ({ ...prev, [ag.id]: `Extracted ${usps.length} USPs from pasted content` }))
    } else {
      setScrapeError(prev => ({ ...prev, [ag.id]: 'Could not extract USPs — try shorter bullet-point sentences' }))
    }
    setShowPaste(prev => ({ ...prev, [ag.id]: false }))
    setPasteContent(prev => ({ ...prev, [ag.id]: '' }))
  }

  async function handleResearchKeywords(ag: AdGroup) {
    const seedList = (seeds[ag.id] || '').split(',').map(s => s.trim()).filter(Boolean)
    if (!seedList.length) return
    setLoadingKw(prev => ({ ...prev, [ag.id]: true }))
    setKwError(prev => ({ ...prev, [ag.id]: '' }))
    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed_keywords: seedList }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const newKeywords: Keyword[] = data.suggestions.map((s: any) => ({
        text: s.text,
        match_type: 'exact' as MatchType,
        volume: s.volume,
        competition: s.competition,
        suggested_bid: s.suggested_bid,
        selected: true,
      }))
      const merged = [
        ...(ag.keywords || []),
        ...newKeywords.filter(n => !ag.keywords?.find(k => k.text === n.text)),
      ]
      updateGroup(ag.id, { keywords: merged })
    } catch (err) {
      // Show a helpful message distinguishing API-not-connected from other errors
      const msg = String(err).toLowerCase().includes('fetch')
        ? 'Google Ads API not connected yet — add your API keys in Vercel, or add keywords manually below'
        : `Failed to fetch suggestions — add keywords manually below`
      setKwError(prev => ({ ...prev, [ag.id]: msg }))
    } finally {
      setLoadingKw(prev => ({ ...prev, [ag.id]: false }))
    }
  }

  function addManualKeyword(ag: AdGroup) {
    const raw = seeds[ag.id] || ''
    // Support comma-separated manual entry when API is unavailable
    const terms = raw.split(',').map(s => s.trim()).filter(Boolean)
    if (!terms.length) return
    const newKeywords: Keyword[] = terms
      .filter(t => !ag.keywords.find(k => k.text.toLowerCase() === t.toLowerCase()))
      .map(t => ({ text: t, match_type: 'exact' as MatchType, selected: true }))
    if (!newKeywords.length) return
    updateGroup(ag.id, { keywords: [...ag.keywords, ...newKeywords] })
    setSeeds(prev => ({ ...prev, [ag.id]: '' }))
    setKwError(prev => ({ ...prev, [ag.id]: '' }))
  }

  function removeKeyword(ag: AdGroup, text: string) {
    updateGroup(ag.id, { keywords: ag.keywords.filter(k => k.text !== text) })
  }

  function toggleKeyword(ag: AdGroup, text: string) {
    updateGroup(ag.id, {
      keywords: ag.keywords.map(k => k.text === text ? { ...k, selected: !k.selected } : k),
    })
  }

  function toggleKeywordMatch(ag: AdGroup, text: string, matchType: MatchType) {
    updateGroup(ag.id, {
      keywords: ag.keywords.map(k => k.text === text ? { ...k, match_type: matchType } : k),
    })
  }

  function addNegativeKeyword(ag: AdGroup) {
    const text = (negInput[ag.id] || '').trim()
    if (!text) return
    if (ag.negative_keywords.find(n => n.text.toLowerCase() === text.toLowerCase())) return
    const newNeg: NegativeKeyword = {
      id: crypto.randomUUID(),
      text,
      match_type: negMatchType[ag.id] ?? 'exact',
    }
    updateGroup(ag.id, { negative_keywords: [...ag.negative_keywords, newNeg] })
    setNegInput(prev => ({ ...prev, [ag.id]: '' }))
  }

  function removeNegativeKeyword(ag: AdGroup, id: string) {
    updateGroup(ag.id, {
      negative_keywords: ag.negative_keywords.filter(n => n.id !== id),
    })
  }

  function cycleNegMatchType(ag: AdGroup, id: string) {
    updateGroup(ag.id, {
      negative_keywords: ag.negative_keywords.map(n => {
        if (n.id !== id) return n
        const idx = MATCH_TYPES.indexOf(n.match_type)
        return { ...n, match_type: MATCH_TYPES[(idx + 1) % MATCH_TYPES.length] }
      }),
    })
  }

  const input = 'w-full bg-mist border border-cloud rounded-lg px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-cyan'
  const label = 'block text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-1'

  if (!filledGroups.length) {
    return (
      <p className="text-sm text-navy/50 italic">
        Add at least one product / service in the step above first.
      </p>
    )
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex flex-wrap gap-2 mb-5">
        {filledGroups.map(ag => {
          const kwCount = ag.keywords.filter(k => k.selected).length
          const hasDetails = ag.url || ag.usps.length > 0 || kwCount > 0
          return (
            <button
              key={ag.id}
              onClick={() => setActiveId(ag.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-heading font-bold transition-all flex items-center gap-1.5 ${
                activeGroup?.id === ag.id
                  ? 'bg-navy text-white'
                  : 'bg-cloud text-navy hover:bg-navy/10'
              }`}
            >
              {ag.name}
              {hasDetails && (
                <span className={`w-1.5 h-1.5 rounded-full ${activeGroup?.id === ag.id ? 'bg-cyan' : 'bg-teal'}`} />
              )}
            </button>
          )
        })}
      </div>

      {activeGroup && (
        <div className="space-y-5">
          {/* Landing page */}
          <div>
            <label className={label}>Landing Page URL <span className="text-navy/40 normal-case font-normal">(optional — leave blank to use campaign default)</span></label>
            <div className="flex gap-2">
              <input
                type="url"
                className={`${input} flex-1`}
                placeholder="https://www.example.com/this-service"
                value={activeGroup.url || ''}
                onChange={e => updateGroup(activeGroup.id, { url: e.target.value })}
              />
              <button
                onClick={() => handleScrape(activeGroup)}
                disabled={scraping[activeGroup.id] || !activeGroup.url}
                className="bg-cyan text-navy font-heading font-bold text-xs px-4 rounded-full hover:bg-cyan/80 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {scraping[activeGroup.id] ? 'Scraping...' : 'Scrape USPs'}
              </button>
            </div>
            {scrapeError[activeGroup.id] && (
              <div className="mt-1">
                <p className="text-red-500 text-xs">{scrapeError[activeGroup.id]}</p>
                {!showPaste[activeGroup.id] && (
                  <button
                    onClick={() => setShowPaste(prev => ({ ...prev, [activeGroup.id]: true }))}
                    className="text-xs text-teal underline mt-1"
                  >
                    Paste page content instead →
                  </button>
                )}
              </div>
            )}
            {scrapeSuccess[activeGroup.id] && !scrapeSuccess[activeGroup.id].startsWith('Found') && (
              <div className="mt-1">
                <p className="text-amber-600 text-xs">⚠ {scrapeSuccess[activeGroup.id]}</p>
                {!showPaste[activeGroup.id] && (
                  <button
                    onClick={() => setShowPaste(prev => ({ ...prev, [activeGroup.id]: true }))}
                    className="text-xs text-teal underline mt-1"
                  >
                    Paste page content instead →
                  </button>
                )}
              </div>
            )}
            {scrapeSuccess[activeGroup.id]?.startsWith('Found') && (
              <p className="text-emerald-600 text-xs mt-1">✓ {scrapeSuccess[activeGroup.id]}</p>
            )}
            {showPaste[activeGroup.id] && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-navy/60">Copy and paste the page text below — we'll extract the USPs automatically:</p>
                <textarea
                  rows={5}
                  className={`${input} font-mono text-xs`}
                  placeholder="Paste the page content here..."
                  value={pasteContent[activeGroup.id] || ''}
                  onChange={e => setPasteContent(prev => ({ ...prev, [activeGroup.id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExtractFromPaste(activeGroup)}
                    disabled={!pasteContent[activeGroup.id]?.trim()}
                    className="bg-teal text-white font-heading font-bold text-xs px-4 py-2 rounded-full hover:bg-teal/80 disabled:opacity-40 transition-colors"
                  >
                    Extract USPs
                  </button>
                  <button
                    onClick={() => setShowPaste(prev => ({ ...prev, [activeGroup.id]: false }))}
                    className="text-xs text-navy/40 hover:text-navy transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* USPs */}
          <div>
            <label className={label}>USPs for "{activeGroup.name}" <span className="text-navy/40 normal-case font-normal">(one per line — overrides campaign USPs)</span></label>
            <textarea
              rows={3}
              className={input}
              value={(activeGroup.usps || []).join('\n')}
              onChange={e => updateGroup(activeGroup.id, { usps: e.target.value.split('\n').filter(Boolean) })}
              placeholder={'e.g. No lock-in contracts\nCertified specialists\nFree setup'}
            />
          </div>

          {/* Positive keywords */}
          <div>
            <label className={label}>Keywords — Positive</label>
            <div className="flex gap-2 mb-2">
              <input
                className={`${input} flex-1`}
                placeholder="seed keywords, comma separated"
                value={seeds[activeGroup.id] || ''}
                onChange={e => setSeeds(prev => ({ ...prev, [activeGroup.id]: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    kwError[activeGroup.id] ? addManualKeyword(activeGroup) : handleResearchKeywords(activeGroup)
                  }
                }}
              />
              <button
                onClick={() => handleResearchKeywords(activeGroup)}
                disabled={loadingKw[activeGroup.id] || !seeds[activeGroup.id]?.trim()}
                className="bg-orange text-white font-heading font-bold text-xs px-4 rounded-full hover:bg-orange/80 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {loadingKw[activeGroup.id] ? 'Searching...' : 'Research'}
              </button>
            </div>
            {kwError[activeGroup.id] && (
              <div className="mb-2 space-y-1">
                <p className="text-amber-600 text-xs">{kwError[activeGroup.id]}</p>
                <button
                  onClick={() => addManualKeyword(activeGroup)}
                  disabled={!seeds[activeGroup.id]?.trim()}
                  className="text-xs font-heading font-bold text-white bg-teal px-3 py-1 rounded-full hover:bg-teal/80 disabled:opacity-40 transition-colors"
                >
                  + Add Manually
                </button>
              </div>
            )}
            {(activeGroup.keywords || []).length > 0 && (
              <>
                <div className="flex flex-wrap gap-2">
                  {activeGroup.keywords.map(kw => (
                    <div key={kw.text} className="flex items-center gap-1">
                      <KeywordChip
                        keyword={kw}
                        onToggleSelect={text => toggleKeyword(activeGroup, text)}
                        onToggleMatchType={(text, mt) => toggleKeywordMatch(activeGroup, text, mt)}
                      />
                      <button
                        onClick={() => removeKeyword(activeGroup, kw.text)}
                        className="text-navy/30 hover:text-red-400 transition-colors text-sm font-bold -ml-1"
                        title="Remove keyword"
                      >×</button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-teal mt-2">
                  {activeGroup.keywords.filter(k => k.selected).length} of {activeGroup.keywords.length} selected
                </p>
              </>
            )}
          </div>

          {/* Negative keywords */}
          <div>
            <label className={label}>Negative Keywords</label>
            <div className="flex gap-2 mb-2">
              <input
                className={`${input} flex-1`}
                placeholder="e.g. free, DIY, cheap"
                value={negInput[activeGroup.id] || ''}
                onChange={e => setNegInput(prev => ({ ...prev, [activeGroup.id]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addNegativeKeyword(activeGroup)}
              />
              {/* Match type selector for new negative */}
              <select
                className="bg-mist border border-cloud rounded-lg px-2 py-2 text-xs text-navy focus:outline-none focus:border-cyan"
                value={negMatchType[activeGroup.id] ?? 'exact'}
                onChange={e => setNegMatchType(prev => ({ ...prev, [activeGroup.id]: e.target.value as MatchType }))}
              >
                {MATCH_TYPES.map(mt => (
                  <option key={mt} value={mt}>{mt}</option>
                ))}
              </select>
              <button
                onClick={() => addNegativeKeyword(activeGroup)}
                disabled={!negInput[activeGroup.id]?.trim()}
                className="bg-navy text-white font-heading font-bold text-xs px-4 rounded-full hover:bg-navy/80 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                Add
              </button>
            </div>

            {(activeGroup.negative_keywords || []).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {activeGroup.negative_keywords.map(neg => (
                  <div
                    key={neg.id}
                    className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-full px-2 py-1"
                  >
                    <span className="text-red-500 text-xs font-bold">−</span>
                    <button
                      onClick={() => cycleNegMatchType(activeGroup, neg.id)}
                      className="text-[10px] font-bold text-red-400 hover:text-red-600 transition-colors uppercase"
                      title="Click to change match type"
                    >
                      [{neg.match_type.slice(0, 1)}]
                    </button>
                    <span className="text-xs text-red-700">{neg.text}</span>
                    <button
                      onClick={() => removeNegativeKeyword(activeGroup, neg.id)}
                      className="text-red-300 hover:text-red-500 transition-colors ml-0.5 text-sm font-bold leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-navy/40 italic">No negative keywords added yet. Type above and press Enter or click Add.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
