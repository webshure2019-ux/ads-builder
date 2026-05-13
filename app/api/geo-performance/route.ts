import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getGeoPerformance } from '@/lib/google-ads'
import { googleAdsErrorMessage } from '@/lib/error-utils'

export const dynamic = 'force-dynamic'

// GET /api/geo-performance?client_account_id=...&campaign_id=...&start_date=...&end_date=...
export async function GET(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const clientAccountId  = searchParams.get('client_account_id') ?? ''
  const campaignId       = searchParams.get('campaign_id')        ?? ''
  const startDate        = searchParams.get('start_date')         ?? ''
  const endDate          = searchParams.get('end_date')           ?? ''

  if (!clientAccountId) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })
  if (!campaignId)      return NextResponse.json({ error: 'campaign_id required' },       { status: 400 })
  if (!startDate)       return NextResponse.json({ error: 'start_date required' },        { status: 400 })
  if (!endDate)         return NextResponse.json({ error: 'end_date required' },          { status: 400 })

  try {
    const rows = await getGeoPerformance(clientAccountId, campaignId, startDate, endDate)
    return NextResponse.json({ rows })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: googleAdsErrorMessage(err, 'Failed to fetch geo performance') },
      { status: 500 },
    )
  }
}
