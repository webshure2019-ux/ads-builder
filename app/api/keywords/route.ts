import { NextRequest, NextResponse } from 'next/server'
import { getKeywordSuggestions } from '@/lib/google-ads'

export async function POST(request: NextRequest) {
  const { seed_keywords } = await request.json()
  if (!seed_keywords?.length) {
    return NextResponse.json({ error: 'seed_keywords array is required' }, { status: 400 })
  }

  try {
    const suggestions = await getKeywordSuggestions(seed_keywords)
    return NextResponse.json({ suggestions })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
