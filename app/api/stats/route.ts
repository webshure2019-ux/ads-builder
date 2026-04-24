import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getClientStats } from '@/lib/google-ads'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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

  // Validate format before passing to GAQL — prevents injection
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return NextResponse.json({ error: 'Invalid date format — use YYYY-MM-DD' }, { status: 400 })
  }

  if (startDate > endDate) {
    return NextResponse.json({ error: 'start_date must be before end_date' }, { status: 400 })
  }

  // Limit range to 365 days to prevent abuse
  const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000
  if (days > 365) {
    return NextResponse.json({ error: 'Date range cannot exceed 365 days' }, { status: 400 })
  }

  try {
    const stats = await getClientStats(clientAccountId, startDate, endDate)
    return NextResponse.json(stats)
  } catch (error) {
    console.error('[/api/stats]', error)
    // Don't leak internal error details to client
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
