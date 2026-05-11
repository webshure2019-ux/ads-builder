import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getAssets, createAndAttachAsset, updateAsset, detachAsset } from '@/lib/google-ads'
import { googleAdsErrorMessage } from '@/lib/error-utils'
import type { AssetType, AssetLevel } from '@/lib/google-ads'

const DATE_RE       = /^\d{4}-\d{2}-\d{2}$/
const ACCOUNT_ID_RE = /^\d{8,12}$/
const ID_RE         = /^\d+$/

const VALID_ASSET_TYPES: AssetType[] = [
  'SITELINK', 'CALLOUT', 'CALL', 'STRUCTURED_SNIPPET',
  'IMAGE', 'PROMOTION', 'PRICE', 'LEAD_FORM',
]

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
  if (!ID_RE.test(campaignId))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate))
    return NextResponse.json({ error: 'Invalid date — expected YYYY-MM-DD' }, { status: 400 })
  if (startDate >= endDate)
    return NextResponse.json({ error: 'start_date must be before end_date' }, { status: 400 })

  try {
    const rows = await getAssets(clientId, campaignId, startDate, endDate)
    return NextResponse.json({ rows })
  } catch (err: unknown) {
    console.error('[assets GET]', err)
    return NextResponse.json({ error: googleAdsErrorMessage(err, 'Failed to load assets') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { client_account_id, campaign_id, level, asset_type, fields } = body
  const clientId = String(client_account_id ?? '').replace(/-/g, '')

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!ID_RE.test(String(campaign_id ?? '')))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
  if (level !== 'ACCOUNT' && level !== 'CAMPAIGN')
    return NextResponse.json({ error: 'level must be ACCOUNT or CAMPAIGN' }, { status: 400 })
  if (!VALID_ASSET_TYPES.includes(asset_type))
    return NextResponse.json({ error: `asset_type must be one of: ${VALID_ASSET_TYPES.join(', ')}` }, { status: 400 })
  if (!fields || typeof fields !== 'object')
    return NextResponse.json({ error: 'fields is required' }, { status: 400 })

  try {
    const result = await createAndAttachAsset(clientId, String(campaign_id), level as AssetLevel, asset_type as AssetType, fields)
    return NextResponse.json({ ok: true, assetId: result.assetId })
  } catch (err: unknown) {
    const message = googleAdsErrorMessage(err, 'Failed to create asset')
    const status  = String(err instanceof Error ? err.message : '').toLowerCase().includes('already') ? 409 : 500
    console.error('[assets POST]', err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { client_account_id, asset_id, asset_type, fields } = body
  const clientId = String(client_account_id ?? '').replace(/-/g, '')

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!ID_RE.test(String(asset_id ?? '')))
    return NextResponse.json({ error: 'Invalid asset_id' }, { status: 400 })
  if (!VALID_ASSET_TYPES.includes(asset_type))
    return NextResponse.json({ error: 'Invalid asset_type' }, { status: 400 })
  if (!fields || typeof fields !== 'object')
    return NextResponse.json({ error: 'fields is required' }, { status: 400 })

  try {
    await updateAsset(clientId, String(asset_id), asset_type as AssetType, fields)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    console.error('[assets PATCH]', err)
    return NextResponse.json({ error: googleAdsErrorMessage(err, 'Failed to update asset') }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { client_account_id, campaign_id, asset_id, field_type, level } = body
  const clientId = String(client_account_id ?? '').replace(/-/g, '')

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!ID_RE.test(String(campaign_id ?? '')))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
  if (!ID_RE.test(String(asset_id ?? '')))
    return NextResponse.json({ error: 'Invalid asset_id' }, { status: 400 })
  if (typeof field_type !== 'number')
    return NextResponse.json({ error: 'field_type must be a number' }, { status: 400 })
  if (level !== 'ACCOUNT' && level !== 'CAMPAIGN')
    return NextResponse.json({ error: 'level must be ACCOUNT or CAMPAIGN' }, { status: 400 })

  try {
    await detachAsset(clientId, String(campaign_id), String(asset_id), field_type, level as AssetLevel)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    console.error('[assets DELETE]', err)
    return NextResponse.json({ error: googleAdsErrorMessage(err, 'Failed to remove asset') }, { status: 500 })
  }
}
