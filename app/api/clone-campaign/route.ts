import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { cloneCampaign } from '@/lib/google-ads'

const ACCOUNT_ID_RE = /^\d{8,12}$/
const CAMPAIGN_RE   = /^\d+$/
const NAME_MAX      = 255

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const clientId   = String(body.client_account_id ?? '').replace(/-/g, '')
  const campaignId = String(body.campaign_id       ?? '')
  const newName    = String(body.new_name          ?? '').trim()

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!CAMPAIGN_RE.test(campaignId))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
  if (!newName || newName.length > NAME_MAX)
    return NextResponse.json({ error: 'new_name is required and must be ≤255 characters' }, { status: 400 })

  try {
    const newCampaignId = await cloneCampaign(clientId, campaignId, newName)
    return NextResponse.json({ ok: true, newCampaignId })
  } catch (err: any) {
    console.error('[clone-campaign]', err?.message ?? err)
    return NextResponse.json({ error: err.message ?? 'Failed to clone campaign' }, { status: 500 })
  }
}
