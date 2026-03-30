import { NextRequest, NextResponse } from 'next/server'
import { scrapeUrl } from '@/lib/scraper'

export async function POST(request: NextRequest) {
  const { url } = await request.json()
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  try {
    const content = await scrapeUrl(url)
    return NextResponse.json({ content })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
