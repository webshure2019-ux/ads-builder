import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getHourlyPerformance } from '@/lib/google-ads'

const DATE_RE       = /^\d{4}-\d{2}-\d{2}$/
const ACCOUNT_ID_RE = /^\d{8,12}$/
const CAMPAIGN_RE   = /^\d+$/

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const { searchParams } = new URL(request.url)
  const clientId   = (searchParams.get('client_account_id') ?? '').replace(/-/g, '')
  const startDate  = searchParams.get('start_date')  ?? ''
  const endDate    = searchParams.get('end_date')    ?? ''
  const campaignId = searchParams.get('campaign_id') ?? ''

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate))
    return NextResponse.json({ error: 'Invalid date — expected YYYY-MM-DD' }, { status: 400 })
  if (startDate >= endDate)
    return NextResponse.json({ error: 'start_date must be before end_date' }, { status: 400 })
  if (campaignId && !CAMPAIGN_RE.test(campaignId))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })

  try {
    const rows = await getHourlyPerformance(clientId, startDate, endDate, campaignId || undefined)
    return NextResponse.json({ rows })
  } catch (err: any) {
    console.error('[hourly-performance]', err?.message ?? err)
    return NextResponse.json({ error: err.message ?? 'Failed to load hourly performance' }, { status: 500 })
  }
}
