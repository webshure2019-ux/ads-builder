import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { searchGeoTargets } from '@/lib/google-ads'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  if (q.length < 2)
    return NextResponse.json({ error: 'q must be at least 2 characters' }, { status: 400 })

  try {
    const results = await searchGeoTargets(q)
    return NextResponse.json({ results })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to search locations'
    console.error('[geo-target-search]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
