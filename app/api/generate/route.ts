import { NextRequest, NextResponse } from 'next/server'
import { generateAssets } from '@/lib/claude'
import { requireAuth } from '@/lib/auth'
import type { Brief, CampaignType } from '@/types'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const body = await request.json()
  const { brief, campaign_type }: { brief: Brief; campaign_type: CampaignType } = body

  if (!brief || !campaign_type) {
    return NextResponse.json({ error: 'brief and campaign_type are required' }, { status: 400 })
  }

  try {
    const assets = await generateAssets(brief, campaign_type)
    return NextResponse.json({ assets })
  } catch (error) {
    console.error('[/api/generate]', error)
    return NextResponse.json({ error: 'Failed to generate assets' }, { status: 500 })
  }
}
