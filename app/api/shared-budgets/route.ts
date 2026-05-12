import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSharedBudgets, updateSharedBudget } from '@/lib/google-ads'
import { googleAdsErrorMessage } from '@/lib/error-utils'

export const dynamic = 'force-dynamic'

// GET /api/shared-budgets?client_account_id=...
export async function GET(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const clientAccountId  = searchParams.get('client_account_id') ?? ''

  if (!clientAccountId) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })

  try {
    const budgets = await getSharedBudgets(clientAccountId)
    return NextResponse.json({ budgets })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: googleAdsErrorMessage(err, 'Failed to fetch shared budgets') },
      { status: 500 },
    )
  }
}

// PATCH /api/shared-budgets — update budget amount
export async function PATCH(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  try {
    const { client_account_id, resource_name, amount_micros } = await request.json()
    if (!client_account_id) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })
    if (!resource_name)     return NextResponse.json({ error: 'resource_name required' },     { status: 400 })
    if (typeof amount_micros !== 'number' || amount_micros < 0)
      return NextResponse.json({ error: 'amount_micros must be a non-negative number' }, { status: 400 })

    await updateSharedBudget(client_account_id, resource_name, amount_micros)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: googleAdsErrorMessage(err, 'Failed to update shared budget') },
      { status: 500 },
    )
  }
}
