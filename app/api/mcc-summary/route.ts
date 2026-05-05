import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { listMccClients, getClientStats, getClientCampaigns } from '@/lib/google-ads'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date') ?? ''
  const endDate   = searchParams.get('end_date')   ?? ''

  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate))
    return NextResponse.json({ error: 'Invalid date — expected YYYY-MM-DD' }, { status: 400 })
  if (startDate >= endDate)
    return NextResponse.json({ error: 'start_date must be before end_date' }, { status: 400 })

  try {
    const clients = await listMccClients()

    // Fan out to all clients in parallel (cap at 10 to avoid rate limits)
    const slice   = clients.slice(0, 10)
    const results = await Promise.allSettled(
      slice.map(async client => {
        const [stats, campaigns] = await Promise.all([
          getClientStats(client.id, startDate, endDate),
          getClientCampaigns(client.id, startDate, endDate),
        ])
        const enabledCampaigns = campaigns.filter(
          c => c.status === 'ENABLED' || c.status === '2'
        )
        const searchCampaigns = campaigns.filter(
          c => c.search_impression_share !== null &&
               (c.status === 'ENABLED' || c.status === '2')
        )
        const avgIS = searchCampaigns.length > 0
          ? searchCampaigns.reduce((s, c) => s + (c.search_impression_share ?? 0), 0) / searchCampaigns.length
          : null

        return {
          id:              client.id,
          name:            client.name,
          currency:        stats.currency,
          clicks:          stats.totals.clicks,
          cost:            stats.totals.cost,
          impressions:     stats.totals.impressions,
          conversions:     stats.totals.conversions,
          ctr:             stats.totals.ctr,
          conversion_rate: stats.totals.conversion_rate,
          activeCampaigns: enabledCampaigns.length,
          totalCampaigns:  campaigns.length,
          avgImpressionShare: avgIS !== null ? Math.round(avgIS * 10) / 10 : null,
        }
      })
    )

    const accounts = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value)

    const failed = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .length

    return NextResponse.json({ accounts, failed, total: slice.length })
  } catch (err: any) {
    console.error('[mcc-summary]', err?.message ?? err)
    return NextResponse.json({ error: err.message ?? 'Failed to load MCC summary' }, { status: 500 })
  }
}
