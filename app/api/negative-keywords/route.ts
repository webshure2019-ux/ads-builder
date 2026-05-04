import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getCampaignNegatives, addCampaignNegative, removeCampaignNegative } from '@/lib/google-ads'

const ACCOUNT_ID_RE = /^\d{8,12}$/
const NUMERIC_RE    = /^\d+$/
const MATCH_TYPES   = ['EXACT', 'PHRASE', 'BROAD'] as const

// GET /api/negative-keywords?client_account_id=...&campaign_id=...
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const { searchParams } = new URL(request.url)
  const clientId   = (searchParams.get('client_account_id') ?? '').replace(/-/g, '')
  const campaignId = searchParams.get('campaign_id') ?? ''

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (campaignId && !NUMERIC_RE.test(campaignId))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })

  try {
    const negatives = await getCampaignNegatives(clientId, campaignId || undefined)
    return NextResponse.json({ negatives })
  } catch (err: any) {
    console.error('[negative-keywords GET]', err?.message ?? err)
    return NextResponse.json({ error: err.message ?? 'Failed to load negative keywords' }, { status: 500 })
  }
}

// POST /api/negative-keywords  { client_account_id, campaign_id, text, match_type }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const clientId   = String(body.client_account_id ?? '').replace(/-/g, '')
  const campaignId = String(body.campaign_id   ?? '')
  const text       = String(body.text          ?? '').trim()
  const matchType  = String(body.match_type    ?? '').toUpperCase()

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!NUMERIC_RE.test(campaignId))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
  if (!text)
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  if (text.length > 80)
    return NextResponse.json({ error: 'Keyword text exceeds 80 characters' }, { status: 400 })
  if (!(MATCH_TYPES as readonly string[]).includes(matchType))
    return NextResponse.json({ error: 'match_type must be EXACT, PHRASE, or BROAD' }, { status: 400 })

  try {
    const result = await addCampaignNegative(clientId, campaignId, text, matchType as 'EXACT' | 'PHRASE' | 'BROAD')
    return NextResponse.json({ ok: true, criterionId: result.criterionId })
  } catch (err: any) {
    console.error('[negative-keywords POST]', err?.message ?? err)
    return NextResponse.json({ error: err.message ?? 'Failed to add negative keyword' }, { status: 500 })
  }
}

// DELETE /api/negative-keywords  { client_account_id, campaign_id, criterion_id }
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const clientId    = String(body.client_account_id ?? '').replace(/-/g, '')
  const campaignId  = String(body.campaign_id        ?? '')
  const criterionId = String(body.criterion_id       ?? '')

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!NUMERIC_RE.test(campaignId))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
  if (!NUMERIC_RE.test(criterionId))
    return NextResponse.json({ error: 'Invalid criterion_id' }, { status: 400 })

  try {
    await removeCampaignNegative(clientId, campaignId, criterionId)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[negative-keywords DELETE]', err?.message ?? err)
    return NextResponse.json({ error: err.message ?? 'Failed to remove negative keyword' }, { status: 500 })
  }
}
