import { NextRequest, NextResponse } from 'next/server'
import { scrapeUrl } from '@/lib/scraper'
import { requireAuth } from '@/lib/auth'
import { assertSafeUrl } from '@/lib/ssrf'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const body = await request.json().catch(() => null)
  if (!body?.url || typeof body.url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  const { url } = body

  // Up-front DNS-resolving validation. The actual fetch re-validates at
  // socket connect time (see lib/ssrf.ts → ssrfSafeFetch) so DNS rebinding
  // between this check and the request is also blocked.
  try {
    await assertSafeUrl(url)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Invalid or disallowed URL' },
      { status: 400 },
    )
  }

  try {
    const content = await scrapeUrl(url)
    return NextResponse.json({ content })
  } catch (error) {
    console.error('[/api/scrape]', error)
    return NextResponse.json({ error: 'Failed to scrape URL' }, { status: 500 })
  }
}
