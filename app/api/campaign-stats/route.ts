import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getClientCampaigns } from '@/lib/google-ads'

const DATE_RE       = /^\d{4}-\d{2}-\d{2}$/
const ACCOUNT_ID_RE = /^\d{8,12}$/

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const { searchParams } = new URL(request.url)
  const clientId  = (searchParams.get('client_account_id') ?? '').replace(/-/g, '')
  const startDate = searchParams.get('start_date') ?? ''
  const endDate   = searchParams.get('end_date')   ?? ''

  if (!ACCOUNT_ID_RE.test(clientId)) {
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  }
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return NextResponse.json({ error: 'Invalid date — expected YYYY-MM-DD' }, { status: 400 })
  }
  if (startDate >= endDate) {
    return NextResponse.json({ error: 'start_date must be before end_date' }, { status: 400 })
  }
  const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000
  if (days > 365) {
    return NextResponse.json({ error: 'Date range cannot exceed 365 days' }, { status: 400 })
  }

  try {
    const campaigns = await getClientCampaigns(clientId, startDate, endDate)
    return NextResponse.json({ campaigns })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to load campaigns' }, { status: 500 })
  }
}
