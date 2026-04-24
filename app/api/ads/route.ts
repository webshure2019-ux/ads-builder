import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getAds } from '@/lib/google-ads'

const DATE_RE        = /^\d{4}-\d{2}-\d{2}$/
const ACCOUNT_ID_RE  = /^\d{8,12}$/
const CAMPAIGN_ID_RE = /^\d+$/

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const { searchParams } = new URL(request.url)
  const clientId   = (searchParams.get('client_account_id') ?? '').replace(/-/g, '')
  const campaignId = searchParams.get('campaign_id')   ?? ''
  const startDate  = searchParams.get('start_date')    ?? ''
  const endDate    = searchParams.get('end_date')      ?? ''

  if (!ACCOUNT_ID_RE.test(clientId))    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!CAMPAIGN_ID_RE.test(campaignId)) return NextResponse.json({ error: 'Invalid campaign_id' },      { status: 400 })
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate))
    return NextResponse.json({ error: 'Invalid date — expected YYYY-MM-DD' }, { status: 400 })
  if (startDate >= endDate) return NextResponse.json({ error: 'start_date must be before end_date' }, { status: 400 })
  if ((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000 > 365)
    return NextResponse.json({ error: 'Date range cannot exceed 365 days' }, { status: 400 })

  try {
    const ads = await getAds(clientId, campaignId, startDate, endDate)
    return NextResponse.json({ ads })
  } catch (err: any) {
    const msg = err?.message || err?.errors?.[0]?.message || JSON.stringify(err)
    console.error('[ads]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
