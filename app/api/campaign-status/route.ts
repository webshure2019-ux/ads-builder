import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { setCampaignStatus, listMccClients } from '@/lib/google-ads'

const ACCOUNT_ID_RE = /^\d{8,12}$/
const CAMPAIGN_ID_RE = /^\d+$/

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const clientId   = String(body?.client_account_id ?? '').replace(/-/g, '')
  const campaignId = String(body?.campaign_id ?? '')
  const status     = String(body?.status ?? '')

  if (!ACCOUNT_ID_RE.test(clientId)) {
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  }
  if (!CAMPAIGN_ID_RE.test(campaignId)) {
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })
  }
  if (status !== 'ENABLED' && status !== 'PAUSED') {
    return NextResponse.json({ error: 'status must be ENABLED or PAUSED' }, { status: 400 })
  }

  // IDOR protection: verify this account belongs to our MCC
  try {
    const mccClients = await listMccClients()
    if (!mccClients.some(c => c.id.replace(/-/g, '') === clientId)) {
      return NextResponse.json({ error: 'Client account not found in MCC' }, { status: 403 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to verify client account' }, { status: 500 })
  }

  try {
    await setCampaignStatus(clientId, campaignId, status as 'ENABLED' | 'PAUSED')
    return NextResponse.json({ ok: true, status })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to update campaign status' }, { status: 500 })
  }
}
