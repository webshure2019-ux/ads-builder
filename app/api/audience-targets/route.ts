import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getAudienceTargets, updateAudienceTargetBid } from '@/lib/google-ads'
import { googleAdsErrorMessage } from '@/lib/error-utils'

export const dynamic = 'force-dynamic'

// GET /api/audience-targets?client_account_id=...&campaign_id=...
export async function GET(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const clientAccountId  = searchParams.get('client_account_id') ?? ''
  const campaignId       = searchParams.get('campaign_id')       ?? ''

  if (!clientAccountId) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })
  if (!campaignId)      return NextResponse.json({ error: 'campaign_id required' },       { status: 400 })

  try {
    const audiences = await getAudienceTargets(clientAccountId, campaignId)
    return NextResponse.json({ audiences })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: googleAdsErrorMessage(err, 'Failed to fetch audience targets') },
      { status: 500 },
    )
  }
}

// PATCH /api/audience-targets — update bid modifier
export async function PATCH(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  try {
    const { client_account_id, resource_name, bid_modifier } = await request.json()
    if (!client_account_id) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })
    if (!resource_name)     return NextResponse.json({ error: 'resource_name required' },     { status: 400 })
    if (typeof bid_modifier !== 'number')
      return NextResponse.json({ error: 'bid_modifier must be a number' }, { status: 400 })

    await updateAudienceTargetBid(client_account_id, resource_name, bid_modifier)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: googleAdsErrorMessage(err, 'Failed to update audience bid modifier') },
      { status: 500 },
    )
  }
}
