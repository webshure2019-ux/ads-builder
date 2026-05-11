import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getPMaxAssets, createAndAttachPMaxAsset, detachPMaxAsset } from '@/lib/google-ads'
import { googleAdsErrorMessage } from '@/lib/error-utils'

const ACCOUNT_ID_RE = /^\d{8,12}$/
const ID_RE         = /^\d+$/

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const { searchParams } = new URL(request.url)
  const clientId   = (searchParams.get('client_account_id') ?? '').replace(/-/g, '')
  const campaignId = searchParams.get('campaign_id') ?? ''

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!ID_RE.test(campaignId))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })

  try {
    const rows = await getPMaxAssets(clientId, campaignId)
    return NextResponse.json({ rows })
  } catch (err: unknown) {
    console.error('[assets/pmax GET]', err)
    return NextResponse.json({ error: googleAdsErrorMessage(err, 'Failed to load PMax assets') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { client_account_id, asset_group_id, field_type, fields } = body
  const clientId = String(client_account_id ?? '').replace(/-/g, '')

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!ID_RE.test(String(asset_group_id ?? '')))
    return NextResponse.json({ error: 'Invalid asset_group_id' }, { status: 400 })
  if (!field_type)
    return NextResponse.json({ error: 'field_type is required' }, { status: 400 })
  if (!fields || typeof fields !== 'object')
    return NextResponse.json({ error: 'fields is required' }, { status: 400 })

  try {
    const result = await createAndAttachPMaxAsset(clientId, String(asset_group_id), String(field_type), fields)
    return NextResponse.json({ ok: true, assetId: result.assetId })
  } catch (err: unknown) {
    console.error('[assets/pmax POST]', err)
    return NextResponse.json({ error: googleAdsErrorMessage(err, 'Failed to create PMax asset') }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { client_account_id, asset_group_id, asset_id, field_type } = body
  const clientId = String(client_account_id ?? '').replace(/-/g, '')

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!ID_RE.test(String(asset_group_id ?? '')))
    return NextResponse.json({ error: 'Invalid asset_group_id' }, { status: 400 })
  if (!ID_RE.test(String(asset_id ?? '')))
    return NextResponse.json({ error: 'Invalid asset_id' }, { status: 400 })
  if (!field_type)
    return NextResponse.json({ error: 'field_type is required' }, { status: 400 })

  try {
    await detachPMaxAsset(clientId, String(asset_group_id), String(asset_id), String(field_type))
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    console.error('[assets/pmax DELETE]', err)
    return NextResponse.json({ error: googleAdsErrorMessage(err, 'Failed to remove PMax asset') }, { status: 500 })
  }
}
