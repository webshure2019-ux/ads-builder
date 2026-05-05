import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { addAdGroupKeyword } from '@/lib/google-ads'

const ACCOUNT_ID_RE = /^\d{8,12}$/
const NUMERIC_RE    = /^\d+$/
const MATCH_TYPES   = ['EXACT', 'PHRASE', 'BROAD'] as const

// POST /api/add-keyword  { client_account_id, ad_group_id, text, match_type, cpc_bid_micros? }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const clientId     = String(body.client_account_id ?? '').replace(/-/g, '')
  const adGroupId    = String(body.ad_group_id        ?? '')
  const text         = String(body.text               ?? '').trim()
  const matchType    = String(body.match_type         ?? '').toUpperCase()
  const cpcBidMicros = body.cpc_bid_micros ? Number(body.cpc_bid_micros) : undefined

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!NUMERIC_RE.test(adGroupId))
    return NextResponse.json({ error: 'Invalid ad_group_id' }, { status: 400 })
  if (!text)
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  if (text.length > 80)
    return NextResponse.json({ error: 'Keyword text exceeds 80 characters' }, { status: 400 })
  if (!(MATCH_TYPES as readonly string[]).includes(matchType))
    return NextResponse.json({ error: 'match_type must be EXACT, PHRASE, or BROAD' }, { status: 400 })

  try {
    const result = await addAdGroupKeyword(
      clientId, adGroupId, text,
      matchType as 'EXACT' | 'PHRASE' | 'BROAD',
      cpcBidMicros,
    )
    return NextResponse.json({ ok: true, criterionId: result.criterionId })
  } catch (err: any) {
    console.error('[add-keyword POST]', err?.message ?? err)
    return NextResponse.json({ error: err.message ?? 'Failed to add keyword' }, { status: 500 })
  }
}
