import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { setAdGroupStatus, listMccClients } from '@/lib/google-ads'

const ACCOUNT_ID_RE  = /^\d{8,12}$/
const ENTITY_ID_RE   = /^\d+$/

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const clientId   = String(body?.client_account_id ?? '').replace(/-/g, '')
  const adGroupId  = String(body?.ad_group_id ?? '')
  const status     = String(body?.status ?? '')

  if (!ACCOUNT_ID_RE.test(clientId))  return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!ENTITY_ID_RE.test(adGroupId))  return NextResponse.json({ error: 'Invalid ad_group_id' },       { status: 400 })
  if (status !== 'ENABLED' && status !== 'PAUSED')
    return NextResponse.json({ error: 'status must be ENABLED or PAUSED' }, { status: 400 })

  try {
    const clients = await listMccClients()
    if (!clients.some(c => c.id.replace(/-/g, '') === clientId))
      return NextResponse.json({ error: 'Client account not found in MCC' }, { status: 403 })
  } catch {
    return NextResponse.json({ error: 'Failed to verify client account' }, { status: 500 })
  }

  try {
    await setAdGroupStatus(clientId, adGroupId, status as 'ENABLED' | 'PAUSED')
    return NextResponse.json({ ok: true, status })
  } catch (err: any) {
    const msg = err?.message || JSON.stringify(err)
    console.error('[ad-group-status]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
