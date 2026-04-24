// lib/scraper.ts
import * as cheerio from 'cheerio'
import { ScrapedContent, ToneType } from '@/types'

export function inferTone(text: string): ToneType {
  const lower = text.toLowerCase()
  if (lower.includes('limited time') || lower.includes('act now') || lower.includes('hurry')) return 'urgent'
  if (lower.includes('enterprise') || lower.includes('trusted') || lower.includes('professional')) return 'professional'
  if (lower.includes('easy') || lower.includes('simple') || lower.includes('friendly')) return 'friendly'
  if (lower.includes('expert') || lower.includes('certified') || lower.includes('authority')) return 'authoritative'
  return 'professional'
}

// Patterns that indicate a line is NOT a useful USP
const NOISE_PATTERNS = [
  /^(our|we|the|a|an|is|are|it|this|that|these|those|my|your)$/i, // single stop words
  /^(our|we)\s*$/i,
  /cookie/i, /privacy/i, /terms/i, /copyright/i, /all rights/i,
  /click here/i, /read more/i, /learn more/i, /find out/i,
  /^\d+$/, // just a number
  /^[^a-zA-Z]*$/, // no letters at all
]

function isGoodUsp(text: string): boolean {
  if (text.length < 10) return false          // too short to be meaningful
  if (text.length > 110) return false         // too long
  if (!text.includes(' ')) return false       // single word
  if (NOISE_PATTERNS.some(p => p.test(text))) return false
  // Must contain at least 2 words
  if (text.trim().split(/\s+/).length < 2) return false
  return true
}

export function extractContent(html: string, _url: string): ScrapedContent {
  const $ = cheerio.load(html)

  $('script, style, nav, footer, noscript, iframe, header').remove()

  const title = $('title').text().split(/[|\-–]/)[0].trim()
  const metaDescription = $('meta[name="description"]').attr('content') || ''
  const headings = $('h1, h2, h3').map((_, el) => $(el).text().trim()).get().filter(Boolean)
  const paragraphs = $('p').map((_, el) => $(el).text().trim()).get()
    .filter(t => t.length > 10)
    .slice(0, 8)

  // Strategy 1: <li> items — highest signal, most sites put benefits in lists
  const listItems = $('li').map((_, el) => $(el).text().trim()).get()
    .filter(isGoodUsp)

  // Strategy 2: <h2>/<h3> subheadings — section headings often describe benefits
  const subheadings = $('h2, h3').map((_, el) => $(el).text().trim()).get()
    .filter(isGoodUsp)

  // Strategy 3: Short standalone <p> tags — punchy benefit statements
  const shortParas = $('p').map((_, el) => $(el).text().trim()).get()
    .filter(t => isGoodUsp(t) && t.length < 90)

  // Strategy 4: Meta description as last resort (always a human-written benefit summary)
  const metaUsps = metaDescription.length > 15 ? [metaDescription] : []

  // Pick the best source — prefer li items if we have enough, otherwise blend
  let uspCandidates: string[]
  if (listItems.length >= 3) {
    uspCandidates = listItems
  } else if (subheadings.length >= 3) {
    uspCandidates = [...listItems, ...subheadings]
  } else {
    uspCandidates = [...listItems, ...subheadings, ...shortParas, ...metaUsps]
  }

  const usps = dedupe(uspCandidates).slice(0, 6)

  const raw_text = [...headings, ...paragraphs].join('\n').slice(0, 3000)
  const audience = inferAudience(raw_text + ' ' + metaDescription)

  return {
    product: title || headings[0] || 'Product/Service',
    audience,
    usps,
    tone: inferTone(raw_text),
    raw_text,
  }
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>()
  return items.filter(item => {
    const key = item.toLowerCase().trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function inferAudience(text: string): string {
  const lower = text.toLowerCase()
  if (lower.includes('small business') || lower.includes(' smb')) return 'Small to medium businesses'
  if (lower.includes('enterprise') || lower.includes('corporate')) return 'Enterprise businesses'
  if (lower.includes('homeowner') || lower.includes('residential')) return 'Homeowners'
  if (lower.includes('ecommerce') || lower.includes('online store')) return 'eCommerce businesses'
  return 'Businesses looking for professional services'
}

export async function scrapeUrl(url: string): Promise<ScrapedContent> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebshureAdsBot/1.0)' },
    signal: AbortSignal.timeout(10000),
    redirect: 'error', // prevent redirect-based SSRF (DNS rebinding, open redirectors)
  })
  if (!response.ok) throw new Error(`Failed to fetch page: HTTP ${response.status}`)
  const html = await response.text()
  return extractContent(html, url)
}
