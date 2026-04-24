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

  // Only allow HTTPS — no HTTP, no file://, no data://, etc.
  if (parsed.protocol !== 'https:') return true

  const hostname = parsed.hostname.toLowerCase()

  // Loopback / localhost
  if (hostname === 'localhost') return true
  if (/^127\./.test(hostname)) return true
  if (hostname === '::1') return true

  // Catch-all / unspecified addresses (route to localhost on many systems)
  if (hostname === '0.0.0.0') return true
  if (hostname === '0') return true

  // Private IP ranges (RFC 1918)
  if (/^10\./.test(hostname)) return true
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)) return true
  if (/^192\.168\./.test(hostname)) return true

  // Link-local — AWS/GCP metadata endpoint lives here
  if (/^169\.254\./.test(hostname)) return true

  // IPv6 private / link-local
  if (/^fc00:/i.test(hostname)) return true
  if (/^fe80:/i.test(hostname)) return true

  // IPv6-mapped IPv4 addresses (::ffff:127.0.0.1 etc.)
  if (/^::ffff:/i.test(hostname)) return true

  // Internal hostnames
  if (hostname.endsWith('.local')) return true
  if (hostname.endsWith('.internal')) return true
  if (hostname.endsWith('.localhost')) return true

  return false
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const body = await request.json().catch(() => null)
  if (!body?.url || typeof body.url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  const { url } = body

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
