'use client'
import { useState } from 'react'
import { Brief, ToneType, GoalType } from '@/types'

interface Props {
  brief: Partial<Brief>
  onChange: (updates: Partial<Brief>) => void
}

const TONES: ToneType[] = ['professional', 'friendly', 'urgent', 'authoritative', 'conversational']
const GOALS: { value: GoalType; label: string }[] = [
  { value: 'lead_gen', label: 'Lead Generation' },
  { value: 'sales', label: 'Sales / eCommerce' },
  { value: 'awareness', label: 'Brand Awareness' },
]

export function BriefForm({ brief, onChange }: Props) {
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
    </div>
  )
}
