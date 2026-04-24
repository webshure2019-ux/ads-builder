import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { setCampaignBudget, listMccClients } from '@/lib/google-ads'

const ACCOUNT_ID_RE = /^\d{8,12}$/

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const clientId            = String(body?.client_account_id ?? '').replace(/-/g, '')
  const budgetResourceName  = String(body?.budget_resource_name ?? '')
  const dailyBudget         = Number(body?.daily_budget)

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!/^customers\/\d+\/campaignBudgets\/\d+$/.test(budgetResourceName))
    return NextResponse.json({ error: 'Invalid budget_resource_name' }, { status: 400 })
  if (!Number.isFinite(dailyBudget) || dailyBudget <= 0)
    return NextResponse.json({ error: 'daily_budget must be a positive number' }, { status: 400 })

  // IDOR: verify account belongs to MCC
  try {
    const clients = await listMccClients()
    if (!clients.some(c => c.id.replace(/-/g, '') === clientId))
      return NextResponse.json({ error: 'Client account not found in MCC' }, { status: 403 })
  } catch {
    return NextResponse.json({ error: 'Failed to verify client account' }, { status: 500 })
  }

  try {
    await setCampaignBudget(clientId, budgetResourceName, dailyBudget)
    return NextResponse.json({ ok: true, daily_budget: dailyBudget })
  } catch (err: any) {
    const msg = err?.message || JSON.stringify(err)
    console.error('[campaign-budget]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
