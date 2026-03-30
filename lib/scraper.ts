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

export function extractContent(html: string, url: string): ScrapedContent {
  const $ = cheerio.load(html)

  $('script, style, nav, footer, noscript, iframe').remove()

  const title = $('title').text().split(/[|\-–]/)[0].trim()
  const metaDescription = $('meta[name="description"]').attr('content') || ''
  const headings = $('h1, h2, h3').map((_, el) => $(el).text().trim()).get().filter(Boolean)
  const paragraphs = $('p').map((_, el) => $(el).text().trim()).get()
    .filter(t => t.length > 10)
    .slice(0, 8)
  const listItems = $('li').map((_, el) => $(el).text().trim()).get()
    .filter(t => t.length > 5 && t.length < 120)
    .slice(0, 8)

  const raw_text = [...headings, ...paragraphs].join('\n').slice(0, 3000)

  const audience = inferAudience(raw_text + ' ' + metaDescription)

  return {
    product: title || headings[0] || 'Product/Service',
    audience,
    usps: listItems.slice(0, 6),
    tone: inferTone(raw_text),
    raw_text,
  }
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
  })
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  const html = await response.text()
  return extractContent(html, url)
}
