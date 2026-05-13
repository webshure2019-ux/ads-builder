import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getAuctionInsights } from '@/lib/google-ads'

const DATE_RE       = /^\d{4}-\d{2}-\d{2}$/
const ACCOUNT_ID_RE = /^\d{8,12}$/
const CAMPAIGN_RE   = /^\d+$/

/** Detect the closed-allowlist 403 from Google Ads. */
function isAuctionInsightsAccessDenied(err: any): boolean {
  const msg = String(err?.message ?? err?.details ?? '')
  return /developer doesn't have access to metrics/i.test(msg)
      || /auction[_ ]insight/i.test(msg) && /not.*access/i.test(msg)
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const { searchParams } = new URL(request.url)
  const clientId   = (searchParams.get('client_account_id') ?? '').replace(/-/g, '')
  const campaignId = searchParams.get('campaign_id') ?? ''
  const startDate  = searchParams.get('start_date')  ?? ''
  const endDate    = searchParams.get('end_date')    ?? ''

  if (!ACCOUNT_ID_RE.test(clientId))
    return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate))
    return NextResponse.json({ error: 'Invalid date — expected YYYY-MM-DD' }, { status: 400 })
  if (startDate >= endDate)
    return NextResponse.json({ error: 'start_date must be before end_date' }, { status: 400 })
  if (!CAMPAIGN_RE.test(campaignId))
    return NextResponse.json({ error: 'Invalid campaign_id' }, { status: 400 })

  try {
    const rows = await getAuctionInsights(clientId, campaignId, startDate, endDate)
    return NextResponse.json({ rows })
  } catch (err: any) {
    // Auction-insight metrics live behind a Google allowlist that is currently
    // closed to new applicants (see Google adwords-api forum). Degrade gracefully
    // so the tab shows an empty state instead of a red error — and don't 500.
    if (isAuctionInsightsAccessDenied(err)) {
      return NextResponse.json({
        rows: [],
        accessDenied: true,
        message:
          'Auction Insights metrics require a Google Ads developer-token allowlist that ' +
          'is currently closed. Contact your Google Ads representative to request access. ' +
          'You can still view Auction Insights in the Google Ads UI.',
      })
    }
    console.error('[auction-insights]', err?.message ?? err)
    return NextResponse.json({ error: err?.message ?? 'Failed to load auction insights' }, { status: 500 })
  }
}
