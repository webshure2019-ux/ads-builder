import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { renameCampaign } from '@/lib/google-ads'
import { googleAdsErrorMessage } from '@/lib/error-utils'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  try {
    const { client_account_id, campaign_id, name } = await request.json()
    if (!client_account_id) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })
    if (!campaign_id)       return NextResponse.json({ error: 'campaign_id required' },       { status: 400 })
    if (!name?.trim())      return NextResponse.json({ error: 'name required' },               { status: 400 })

    await renameCampaign(client_account_id, campaign_id, name)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: googleAdsErrorMessage(err, 'Failed to rename campaign') },
      { status: 500 },
    )
  }
}
