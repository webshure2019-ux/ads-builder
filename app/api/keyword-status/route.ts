import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { setKeywordStatus } from '@/lib/google-ads'

const NUMERIC_RE    = /^\d+$/
const ACCOUNT_ID_RE = /^\d{8,12}$/

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const clientId    = String(body.client_account_id ?? '').replace(/-/g, '')
  const adGroupId   = String(body.ad_group_id        ?? '')
  const criterionId = String(body.criterion_id       ?? '')
  const status      = String(body.status             ?? '')

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!NUMERIC_RE.test(adGroupId))
    return NextResponse.json({ error: 'Invalid ad_group_id' }, { status: 400 })
  if (!NUMERIC_RE.test(criterionId))
    return NextResponse.json({ error: 'Invalid criterion_id' }, { status: 400 })
  if (status !== 'ENABLED' && status !== 'PAUSED')
    return NextResponse.json({ error: 'status must be ENABLED or PAUSED' }, { status: 400 })

  try {
    await setKeywordStatus(clientId, adGroupId, criterionId, status as 'ENABLED' | 'PAUSED')
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[keyword-status] error:', err?.message ?? err)
    return NextResponse.json({ error: err.message ?? 'Failed to update keyword status' }, { status: 500 })
  }
}
