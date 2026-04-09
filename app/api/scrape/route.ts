import { NextRequest, NextResponse } from 'next/server'
import { scrapeUrl } from '@/lib/scraper'
import { requireAuth } from '@/lib/auth'

// Block requests to private/internal network addresses (SSRF prevention)
function isBlockedUrl(urlString: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    return true
  }

  if (parsed.protocol !== 'https:') return true

  const hostname = parsed.hostname.toLowerCase()

  // Loopback, localhost
  if (hostname === 'localhost') return true
  if (/^127\./.test(hostname)) return true
  if (/^::1$/.test(hostname)) return true

  // Private IP ranges (RFC 1918)
  if (/^10\./.test(hostname)) return true
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)) return true
  if (/^192\.168\./.test(hostname)) return true

  // Link-local (AWS metadata endpoint lives here)
  if (/^169\.254\./.test(hostname)) return true

  // IPv6 private
  if (/^fc00:/i.test(hostname)) return true
  if (/^fe80:/i.test(hostname)) return true

  // Internal hostnames
  if (hostname.endsWith('.local')) return true
  if (hostname.endsWith('.internal')) return true

  return false
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const { url } = await request.json()
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  if (isBlockedUrl(url)) {
    return NextResponse.json({ error: 'Invalid or disallowed URL' }, { status: 400 })
  }

  try {
    const content = await scrapeUrl(url)
    return NextResponse.json({ content })
  } catch (error) {
    console.error('[/api/scrape]', error)
    return NextResponse.json({ error: 'Failed to scrape URL' }, { status: 500 })
  }
}
