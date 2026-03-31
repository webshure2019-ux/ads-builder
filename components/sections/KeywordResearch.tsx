'use client'
import { useState } from 'react'
import { Keyword, MatchType } from '@/types'
import { KeywordChip } from '@/components/ui/KeywordChip'

interface Props {
  keywords: Keyword[]
  onChange: (keywords: Keyword[]) => void
}

export function KeywordResearch({ keywords, onChange }: Props) {
  const [seeds, setSeeds] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleResearch() {
    const seedList = seeds.split(',').map(s => s.trim()).filter(Boolean)
    if (!seedList.length) return
    setLoading(true)
    setError('')
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
      onChange([...keywords, ...newKeywords.filter(n => !keywords.find(k => k.text === n.text))])
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  function toggleSelect(text: string) {
    onChange(keywords.map(k => k.text === text ? { ...k, selected: !k.selected } : k))
  }

  function toggleMatchType(text: string, matchType: MatchType) {
    onChange(keywords.map(k => k.text === text ? { ...k, match_type: matchType } : k))
  }

  const input = 'w-full bg-mist border border-cloud rounded-lg px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-cyan'
  const label = 'block text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-1'

  return (
    <div className="space-y-4">
      <div>
        <label className={label}>Seed Keywords (comma separated)</label>
        <div className="flex gap-2">
          <input
            className={`${input} flex-1`}
            placeholder="ppc management, google ads agency, paid search"
            value={seeds}
            onChange={e => setSeeds(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleResearch()}
          />
          <button
            onClick={handleResearch}
            disabled={loading || !seeds.trim()}
            className="bg-orange text-white font-heading font-bold text-xs px-4 rounded-full hover:bg-orange/80 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {loading ? 'Searching...' : 'Research'}
          </button>
        </div>
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      </div>

      {keywords.length > 0 && (
        <div>
          <label className={label}>
            Keywords — click to select/deselect · click match type badge to toggle
          </label>
          <div className="flex flex-wrap gap-2 mt-2">
            {keywords.map(kw => (
              <KeywordChip
                key={kw.text}
                keyword={kw}
                onToggleSelect={toggleSelect}
                onToggleMatchType={toggleMatchType}
              />
            ))}
          </div>
          <p className="text-xs text-teal mt-2">
            {keywords.filter(k => k.selected).length} of {keywords.length} selected
            · <span className="text-[#007EA8]">[e]</span> exact &nbsp;
            · <span className="text-orange">&quot;p&quot;</span> phrase &nbsp;
            · <span>b</span> broad
          </p>
        </div>
      )}
    </div>
  )
}
