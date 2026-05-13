import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getBidStrategy, updateBidStrategy } from '@/lib/google-ads'
import { googleAdsErrorMessage } from '@/lib/error-utils'

export const dynamic = 'force-dynamic'

// GET /api/bid-strategy?client_account_id=...&campaign_id=...
export async function GET(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  const { searchParams }  = new URL(request.url)
  const clientAccountId   = searchParams.get('client_account_id') ?? ''
  const campaignId        = searchParams.get('campaign_id')        ?? ''

  if (!clientAccountId) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })
  if (!campaignId)      return NextResponse.json({ error: 'campaign_id required' },       { status: 400 })

  try {
    const strategy = await getBidStrategy(clientAccountId, campaignId)
    return NextResponse.json({ strategy })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: googleAdsErrorMessage(err, 'Failed to fetch bid strategy') },
      { status: 500 },
    )
  }
}

// PATCH /api/bid-strategy — update bid strategy
export async function PATCH(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  try {
    const { client_account_id, campaign_id, strategy_type, target_cpa_micros, target_roas, ecpc_enabled } = await request.json()
    if (!client_account_id) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })
    if (!campaign_id)       return NextResponse.json({ error: 'campaign_id required' },       { status: 400 })
    if (!strategy_type)     return NextResponse.json({ error: 'strategy_type required' },     { status: 400 })

    await updateBidStrategy(client_account_id, campaign_id, strategy_type, {
      targetCpaMicros: target_cpa_micros,
      targetRoas:      target_roas,
      eCpcEnabled:     ecpc_enabled,
    })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: googleAdsErrorMessage(err, 'Failed to update bid strategy') },
      { status: 500 },
    )
  }
}
