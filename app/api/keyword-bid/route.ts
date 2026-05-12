import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { updateKeywordBid } from '@/lib/google-ads'
import { googleAdsErrorMessage } from '@/lib/error-utils'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { client_account_id, ad_group_id, criterion_id, cpc_bid_micros } = body

    if (!client_account_id) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })
    if (!ad_group_id)       return NextResponse.json({ error: 'ad_group_id required' },       { status: 400 })
    if (!criterion_id)      return NextResponse.json({ error: 'criterion_id required' },      { status: 400 })
    if (typeof cpc_bid_micros !== 'number' || cpc_bid_micros < 0)
      return NextResponse.json({ error: 'cpc_bid_micros must be a non-negative number' }, { status: 400 })

    await updateKeywordBid(client_account_id, ad_group_id, criterion_id, cpc_bid_micros)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: googleAdsErrorMessage(err, 'Failed to update keyword bid') },
      { status: 500 },
    )
  }
}
