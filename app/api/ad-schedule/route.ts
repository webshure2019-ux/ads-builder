import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  getAdSchedule,
  updateAdScheduleBid,
  addAdScheduleEntry,
  removeAdScheduleEntry,
} from '@/lib/google-ads'
import { googleAdsErrorMessage } from '@/lib/error-utils'

export const dynamic = 'force-dynamic'

// GET /api/ad-schedule?client_account_id=...&campaign_id=...
export async function GET(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const clientAccountId  = searchParams.get('client_account_id') ?? ''
  const campaignId       = searchParams.get('campaign_id')       ?? ''

  if (!clientAccountId) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })
  if (!campaignId)      return NextResponse.json({ error: 'campaign_id required' },       { status: 400 })

  try {
    const schedule = await getAdSchedule(clientAccountId, campaignId)
    return NextResponse.json({ schedule })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: googleAdsErrorMessage(err, 'Failed to fetch ad schedule') },
      { status: 500 },
    )
  }
}

// PATCH /api/ad-schedule  — update bid modifier on an existing entry
export async function PATCH(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  try {
    const { client_account_id, resource_name, bid_modifier } = await request.json()
    if (!client_account_id) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })
    if (!resource_name)     return NextResponse.json({ error: 'resource_name required' },     { status: 400 })
    if (typeof bid_modifier !== 'number')
      return NextResponse.json({ error: 'bid_modifier must be a number' }, { status: 400 })

    await updateAdScheduleBid(client_account_id, resource_name, bid_modifier)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: googleAdsErrorMessage(err, 'Failed to update bid modifier') },
      { status: 500 },
    )
  }
}

// POST /api/ad-schedule  — add a new entry
export async function POST(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  try {
    const { client_account_id, campaign_id, entry } = await request.json()
    if (!client_account_id) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })
    if (!campaign_id)       return NextResponse.json({ error: 'campaign_id required' },       { status: 400 })
    if (!entry)             return NextResponse.json({ error: 'entry required' },              { status: 400 })

    const result = await addAdScheduleEntry(client_account_id, campaign_id, entry)
    return NextResponse.json({ ok: true, criterionId: result.criterionId })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: googleAdsErrorMessage(err, 'Failed to add ad schedule entry') },
      { status: 500 },
    )
  }
}

// DELETE /api/ad-schedule  — remove an entry
export async function DELETE(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  try {
    const { client_account_id, resource_name } = await request.json()
    if (!client_account_id) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })
    if (!resource_name)     return NextResponse.json({ error: 'resource_name required' },     { status: 400 })

    await removeAdScheduleEntry(client_account_id, resource_name)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: googleAdsErrorMessage(err, 'Failed to remove ad schedule entry') },
      { status: 500 },
    )
  }
}
