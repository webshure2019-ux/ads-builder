import { NextRequest, NextResponse } from 'next/server'
import { publishSearchCampaign, publishPMaxCampaign } from '@/lib/google-ads'
import { createServerClient } from '@/lib/supabase'
import type { CampaignType, CampaignSettingsData, GeneratedAssets, Keyword } from '@/types'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    campaign_id,
    client_account_id,
    campaign_name,
    campaign_type,
    settings,
    assets,
    keywords,
  }: {
    campaign_id: string
    client_account_id: string
    campaign_name: string
    campaign_type: CampaignType
    settings: CampaignSettingsData
    assets: GeneratedAssets
    keywords: Keyword[]
  } = body

  if (!campaign_id || !client_account_id || !campaign_type || !assets) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    let googleCampaignId: string

    if (campaign_type === 'search') {
      googleCampaignId = await publishSearchCampaign(
        client_account_id, campaign_name, settings, assets, keywords
      )
    } else if (campaign_type === 'pmax') {
      googleCampaignId = await publishPMaxCampaign(
        client_account_id, campaign_name, settings, assets
      )
    } else {
      return NextResponse.json(
        { error: `Publishing ${campaign_type} campaigns not yet implemented` },
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
    await supabase
      .from('campaigns')
      .update({ status: 'failed' })
      .eq('id', campaign_id)

    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
