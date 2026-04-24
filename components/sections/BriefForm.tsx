'use client'
import { useState } from 'react'
import { Brief, ToneType, GoalType, CopywritingStyle, COPYWRITING_STYLES } from '@/types'

interface Props {
  brief: Partial<Brief>
  onChange: (updates: Partial<Brief>) => void
  searchMode?: boolean  // Search campaigns: only show shared fields (brand, audience, tone, goal)
}

const TONES: ToneType[] = ['professional', 'friendly', 'urgent', 'authoritative', 'conversational']
const GOALS: { value: GoalType; label: string }[] = [
  { value: 'lead_gen', label: 'Lead Generation' },
  { value: 'sales', label: 'Sales / eCommerce' },
  { value: 'awareness', label: 'Brand Awareness' },
]

const STYLE_OPTIONS: { value: CopywritingStyle; label: string; tagline: string; emoji: string }[] = [
  ...Object.entries(COPYWRITING_STYLES).map(([key, cfg]) => ({
    value: key as CopywritingStyle,
    label: cfg.label,
    tagline: cfg.tagline,
    emoji: cfg.emoji,
  })),
  { value: 'other', label: 'Other', tagline: 'Describe your own style', emoji: '✏️' },
]

interface StyleSelectorProps {
  style: CopywritingStyle | undefined
  customStyle: string | undefined
  onChange: (updates: Partial<Brief>) => void
  labelClass: string
  inputClass: string
}

function StyleSelector({ style, customStyle, onChange, labelClass, inputClass }: StyleSelectorProps) {
  return (
    <div>
      <label className={labelClass}>Copywriting Style</label>
      <p className="text-[10px] text-navy/40 mb-2">Choose the voice and style for your ad copy</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {STYLE_OPTIONS.map(opt => {
          const isSelected = style === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ copywriting_style: opt.value })}
              className={`text-left rounded-lg border px-3 py-2.5 transition-all ${
                isSelected
                  ? 'border-cyan bg-cyan/10 text-navy'
                  : 'border-cloud bg-mist text-navy/60 hover:border-cyan/50 hover:text-navy'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-base leading-none">{opt.emoji}</span>
                <span className="text-[11px] font-heading font-bold">{opt.label}</span>
              </div>
              <p className="text-[9px] text-navy/50">{opt.tagline}</p>
            </button>
          )
        })}
      </div>
      {style === 'other' && (
        <div className="mt-2">
          <textarea
            rows={2}
            className={`${inputClass} mt-1`}
            value={customStyle || ''}
            onChange={e => onChange({ copywriting_style_custom: e.target.value })}
            placeholder="Describe the style you want. e.g. 'Punchy and minimal, like Apple ads — short sentences, powerful verbs, lots of white space.'"
          />
        </div>
      )}
    </div>
  )
}

export function BriefForm({ brief, onChange, searchMode = false }: Props) {
  const [scraping, setScraping] = useState(false)
  const [scrapeError, setScrapeError] = useState('')

  async function handleScrape() {
    if (!brief.url) return
    setScraping(true)
    setScrapeError('')
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: brief.url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onChange({
        product: data.content.product,
        audience: data.content.audience,
        usps: data.content.usps,
        tone: data.content.tone,
        scraped_content: data.content.raw_text,
      })
    } catch (err) {
      setScrapeError(String(err))
    } finally {
      setScraping(false)
    }
  }

  const input = 'w-full bg-mist border border-cloud rounded-lg px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-cyan'
  const label = 'block text-[10px] font-heading font-bold uppercase tracking-wider text-teal mb-1'

  // Search mode: only brand name, audience, tone, goal are shared
  // URL / product / USPs live per ad group in AdGroupDetails
  if (searchMode) {
    return (
      <div className="space-y-4">
        <p className="text-xs text-navy/50 italic bg-cloud/60 border border-cloud rounded-lg px-3 py-2">
          These fields apply to the whole campaign. Landing page URL, USPs, and keywords are set per product in the step above.
        </p>
        <div>
          <label className={label}>Brand Name</label>
          <input
            className={input}
            value={brief.brand_name || ''}
            onChange={e => onChange({ brand_name: e.target.value })}
            placeholder="e.g. Webshure"
          />
        </div>
        <div>
          <label className={label}>Target Audience</label>
          <input
            className={input}
            value={brief.audience || ''}
            onChange={e => onChange({ audience: e.target.value })}
            placeholder="e.g. Small-to-medium businesses looking to grow online"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Campaign Goal</label>
            <select className={input} value={brief.goal || ''} onChange={e => onChange({ goal: e.target.value as GoalType })}>
              <option value="">Select goal...</option>
              {GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Tone</label>
            <select className={input} value={brief.tone || ''} onChange={e => onChange({ tone: e.target.value as ToneType })}>
              <option value="">Select tone...</option>
              {TONES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
        </div>

        <StyleSelector
          style={brief.copywriting_style}
          customStyle={brief.copywriting_style_custom}
          onChange={onChange}
          labelClass={label}
          inputClass={input}
        />
      </div>
    )
  }

  // Full brief mode for non-Search campaigns
  return (
    <div className="space-y-4">
      <div>
        <label className={label}>Landing Page URL</label>
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="https://www.example.com/services/ppc"
            value={brief.url || ''}
            onChange={e => onChange({ url: e.target.value })}
            className={`${input} flex-1`}
          />
          <button
            onClick={handleScrape}
            disabled={scraping || !brief.url}
            className="bg-cyan text-navy font-heading font-bold text-xs px-4 rounded-full hover:bg-cyan/80 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {scraping ? 'Scraping...' : 'Scrape'}
          </button>
        </div>
        {scrapeError && <p className="text-red-500 text-xs mt-1">{scrapeError}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Product / Service</label>
          <input className={input} value={brief.product || ''} onChange={e => onChange({ product: e.target.value })} placeholder="e.g. PPC Management Services" />
        </div>
        <div>
          <label className={label}>Brand Name</label>
          <input className={input} value={brief.brand_name || ''} onChange={e => onChange({ brand_name: e.target.value })} placeholder="e.g. Webshure" />
        </div>
      </div>

      <div>
        <label className={label}>Target Audience</label>
        <input className={input} value={brief.audience || ''} onChange={e => onChange({ audience: e.target.value })} placeholder="e.g. Small-to-medium businesses looking to grow online" />
      </div>

      <div>
        <label className={label}>Key USPs (one per line)</label>
        <textarea
          rows={3}
          className={input}
          value={(brief.usps || []).join('\n')}
          onChange={e => onChange({ usps: e.target.value.split('\n').filter(Boolean) })}
          placeholder={'Certified Google Partner\nNo lock-in contracts\nTransparent reporting'}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Campaign Goal</label>
          <select className={input} value={brief.goal || ''} onChange={e => onChange({ goal: e.target.value as GoalType })}>
            <option value="">Select goal...</option>
            {GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Tone</label>
          <select className={input} value={brief.tone || ''} onChange={e => onChange({ tone: e.target.value as ToneType })}>
            <option value="">Select tone...</option>
            {TONES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <StyleSelector
        style={brief.copywriting_style}
        customStyle={brief.copywriting_style_custom}
        onChange={onChange}
        labelClass={label}
        inputClass={input}
      />
    </div>
  )
}
