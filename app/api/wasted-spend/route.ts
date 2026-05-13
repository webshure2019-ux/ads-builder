import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getKeywords, getSearchTerms } from '@/lib/google-ads'
import { googleAdsErrorMessage } from '@/lib/error-utils'

export const dynamic = 'force-dynamic'

// GET /api/wasted-spend?client_account_id=...&start_date=...&end_date=...
export async function GET(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const clientAccountId  = searchParams.get('client_account_id') ?? ''
  const startDate        = searchParams.get('start_date')         ?? ''
  const endDate          = searchParams.get('end_date')           ?? ''

  if (!clientAccountId) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })
  if (!startDate)       return NextResponse.json({ error: 'start_date required' },         { status: 400 })
  if (!endDate)         return NextResponse.json({ error: 'end_date required' },            { status: 400 })

  try {
    const [keywords, searchTerms] = await Promise.all([
      getKeywords(clientAccountId, startDate, endDate),
      getSearchTerms(clientAccountId, startDate, endDate),
    ])

    // Average CPA across account for thresholding
    const totalConv  = keywords.reduce((s, k) => s + k.conversions, 0)
    const totalCost  = keywords.reduce((s, k) => s + k.cost, 0)
    const avgCpa     = totalConv > 0 ? totalCost / totalConv : 0
    const cpaThreshold = avgCpa > 0 ? avgCpa * 1.5 : 30

    // Low QS keywords spending money (QS ≤ 4 with spend > 0)
    const lowQSKeywords = keywords
      .filter(k => k.status === 'ENABLED' && k.qualityScore !== null && k.qualityScore <= 4 && k.cost > 0)
      .map(k => ({
        id:           k.criterionId,
        campaignName: k.campaignName,
        adGroupName:  k.adGroupName,
        text:         k.text,
        matchType:    k.matchType,
        qualityScore: k.qualityScore,
        cost:         k.cost,
        conversions:  k.conversions,
        clicks:       k.clicks,
      }))
      .sort((a, b) => b.cost - a.cost)

    // Zero-conversion keywords with significant spend
    const wastedKeywords = keywords
      .filter(k => k.status === 'ENABLED' && k.conversions === 0 && k.cost >= cpaThreshold)
      .map(k => ({
        id:           k.criterionId,
        campaignName: k.campaignName,
        adGroupName:  k.adGroupName,
        text:         k.text,
        matchType:    k.matchType,
        qualityScore: k.qualityScore,
        cost:         k.cost,
        clicks:       k.clicks,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 50)

    // Zero-conversion search terms eating budget
    const wastedSearchTerms = searchTerms
      .filter(t => t.status !== 'EXCLUDED' && t.conversions === 0 && t.cost >= cpaThreshold * 0.5)
      .map(t => ({
        term:         t.term,
        campaignName: t.campaignName,
        adGroupName:  t.adGroupName,
        cost:         t.cost,
        clicks:       t.clicks,
        status:       t.status,
        campaignId:   t.campaignId,
        adGroupId:    t.adGroupId,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 50)

    return NextResponse.json({
      lowQSKeywords,
      wastedKeywords,
      wastedSearchTerms,
      meta: { avgCpa, cpaThreshold, totalCost, totalConv },
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: googleAdsErrorMessage(err, 'Failed to fetch wasted spend data') },
      { status: 500 },
    )
  }
}
