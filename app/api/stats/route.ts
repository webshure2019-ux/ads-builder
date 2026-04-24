import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getClientStats } from '@/lib/google-ads'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const { searchParams } = new URL(request.url)
  const clientAccountId = searchParams.get('client_account_id')
  const startDate       = searchParams.get('start_date')
  const endDate         = searchParams.get('end_date')

  if (!clientAccountId || !startDate || !endDate) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  try {
    const stats = await getClientStats(clientAccountId, startDate, endDate)
    return NextResponse.json(stats)
  } catch (error) {
    console.error('[/api/stats]', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
