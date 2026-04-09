import { NextRequest, NextResponse } from 'next/server'
import { getKeywordSuggestions } from '@/lib/google-ads'
import { requireAuth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const { seed_keywords } = await request.json()
  if (!seed_keywords?.length) {
    return NextResponse.json({ error: 'seed_keywords array is required' }, { status: 400 })
  }

  try {
    const suggestions = await getKeywordSuggestions(seed_keywords)
    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('[/api/keywords]', error)
    return NextResponse.json({ error: 'Failed to fetch keyword suggestions' }, { status: 500 })
  }
}
