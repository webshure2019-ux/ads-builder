import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  getLocationTargets,
  addLocationTarget,
  removeLocationTarget,
  updateLocationBidModifier,
} from '@/lib/google-ads'
import { googleAdsErrorMessage as errorMessage } from '@/lib/error-utils'

const DATE_RE       = /^\d{4}-\d{2}-\d{2}$/
const ACCOUNT_ID_RE = /^\d{8,12}$/
const CAMPAIGN_RE   = /^\d+$/

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const { searchParams } = new URL(request.url)
  const clientId   = (searchParams.get('client_account_id') ?? '').replace(/-/g, '')
  const campaignId = searchParams.get('campaign_id') ?? ''
  const startDate  = searchParams.get('start_date')  ?? ''
  const endDate    = searchParams.get('end_date')    ?? ''

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate))
    return NextResponse.json({ error: 'Invalid date — expected YYYY-MM-DD' }, { status: 400 })
  if (startDate >= endDate)
    return NextResponse.json({ error: 'start_date must be before end_date' }, { status: 400 })
  if (!CAMPAIGN_RE.test(campaignId))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })

  try {
    const rows = await getLocationTargets(clientId, campaignId, startDate, endDate)
    return NextResponse.json({ rows })
  } catch (err: unknown) {
    const message = errorMessage(err, 'Failed to load location targets')
    console.error('[location-targets GET]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { client_account_id, campaign_id, geo_target_id, negative = false } = body
  const clientId = String(client_account_id ?? '').replace(/-/g, '')

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!CAMPAIGN_RE.test(String(campaign_id ?? '')))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
  if (!CAMPAIGN_RE.test(String(geo_target_id ?? '')))
    return NextResponse.json({ error: 'Invalid geo_target_id' }, { status: 400 })

  try {
    const result = await addLocationTarget(clientId, String(campaign_id), String(geo_target_id), Boolean(negative))
    return NextResponse.json({ ok: true, criterionId: result.criterionId })
  } catch (err: unknown) {
    const message = errorMessage(err, 'Failed to add location')
    const status = message.toLowerCase().includes('already') ? 409 : 500
    console.error('[location-targets POST]', err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { client_account_id, campaign_id, criterion_id } = body
  const clientId = String(client_account_id ?? '').replace(/-/g, '')

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!CAMPAIGN_RE.test(String(campaign_id ?? '')))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
  if (!CAMPAIGN_RE.test(String(criterion_id ?? '')))
    return NextResponse.json({ error: 'Invalid criterion_id' }, { status: 400 })

  try {
    await removeLocationTarget(clientId, String(campaign_id), String(criterion_id))
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = errorMessage(err, 'Failed to remove location')
    console.error('[location-targets DELETE]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { client_account_id, campaign_id, criterion_id, bid_modifier } = body
  const clientId = String(client_account_id ?? '').replace(/-/g, '')
  const bm = Number(bid_modifier)

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!CAMPAIGN_RE.test(String(campaign_id ?? '')))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
  if (!CAMPAIGN_RE.test(String(criterion_id ?? '')))
    return NextResponse.json({ error: 'Invalid criterion_id' }, { status: 400 })
  if (isNaN(bm) || bm < 0.1 || bm > 10)
    return NextResponse.json({ error: 'bid_modifier must be between 0.1 and 10' }, { status: 400 })

  try {
    await updateLocationBidModifier(clientId, String(campaign_id), String(criterion_id), bm)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = errorMessage(err, 'Failed to update bid modifier')
    console.error('[location-targets PATCH]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
