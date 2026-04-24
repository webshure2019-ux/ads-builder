import { NextRequest, NextResponse } from 'next/server'
import { publishSearchCampaign, publishPMaxCampaign, listMccClients } from '@/lib/google-ads'
import { createServerClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import type { CampaignType, CampaignSettingsData, GeneratedAssets, AdGroup } from '@/types'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const body = await request.json()
  const {
    campaign_id,
    client_account_id,
    campaign_name,
    campaign_type,
    settings,
    assets,
    ad_groups,
  }: {
    campaign_id: string
    client_account_id: string
    campaign_name: string
    campaign_type: CampaignType
    settings: CampaignSettingsData
    assets?: GeneratedAssets
    ad_groups?: AdGroup[]
  } = body

  // ── Basic presence checks ──────────────────────────────────
  if (!campaign_id || !client_account_id || !campaign_type || !campaign_name?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!settings?.budget_daily || settings.budget_daily <= 0 || !isFinite(settings.budget_daily)) {
    return NextResponse.json({ error: 'budget_daily must be a positive number' }, { status: 400 })
  }

  // ── IDOR guard: verify client_account_id belongs to this MCC ──
  try {
    const mccClients = await listMccClients()
    const isAllowed = mccClients.some(c => c.id === client_account_id.replace(/-/g, ''))
    if (!isAllowed) {
      console.warn('[/api/publish] Attempt to publish to non-MCC account:', client_account_id)
      return NextResponse.json({ error: 'Account not found under MCC' }, { status: 403 })
    }
  } catch (err) {
    console.error('[/api/publish] MCC verification failed', err)
    return NextResponse.json({ error: 'Could not verify client account' }, { status: 500 })
  }

  const supabase = createServerClient()

  try {
    let googleCampaignId: string

    if (campaign_type === 'search') {
      if (!ad_groups?.length) {
        return NextResponse.json({ error: 'ad_groups required for Search campaigns' }, { status: 400 })
      }
      googleCampaignId = await publishSearchCampaign(
        client_account_id, campaign_name, settings, ad_groups
      )
    } else if (campaign_type === 'pmax') {
      if (!assets) return NextResponse.json({ error: 'assets required for PMax campaigns' }, { status: 400 })
      googleCampaignId = await publishPMaxCampaign(
        client_account_id, campaign_name, settings, assets
      )
    } else {
      return NextResponse.json(
        { error: `Publishing ${campaign_type} campaigns is not yet supported` },
        { status: 501 }
      )
    }

    await supabase
      .from('campaigns')
      .update({
        status: 'published',
        google_campaign_id: googleCampaignId,
        published_at: new Date().toISOString(),
      })
      .eq('id', campaign_id)

    return NextResponse.json({ google_campaign_id: googleCampaignId })
  } catch (error) {
    console.error('[/api/publish]', error)
    await supabase
      .from('campaigns')
      .update({ status: 'failed' })
      .eq('id', campaign_id)

    return NextResponse.json({ error: 'Failed to publish campaign' }, { status: 500 })
  }
}
