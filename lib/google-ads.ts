// lib/google-ads.ts
import { GoogleAdsApi, services } from 'google-ads-api'
import { Keyword, CampaignSettingsData, GeneratedAssets, KeywordSuggestion, AdGroup } from '@/types'

function makeClient() {
  return new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  })
}

// ─── Input validators ─────────────────────────────────────────────────────────
const ACCOUNT_ID_RE = /^\d{8,12}$/
const DATE_RE       = /^\d{4}-\d{2}-\d{2}$/

function cleanId(id: string): string {
  const cleaned = id.replace(/-/g, '')
  if (!ACCOUNT_ID_RE.test(cleaned)) throw new Error(`Invalid Google Ads account ID: ${id}`)
  return cleaned
}

function validateDate(date: string, label: string): void {
  if (!DATE_RE.test(date)) throw new Error(`Invalid ${label} — expected YYYY-MM-DD`)
}

function getMccCustomer() {
  return makeClient().Customer({
    customer_id: cleanId(process.env.GOOGLE_ADS_MCC_CUSTOMER_ID!),
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    login_customer_id: cleanId(process.env.GOOGLE_ADS_MCC_CUSTOMER_ID!),
  })
}

function getClientCustomer(clientAccountId: string) {
  return makeClient().Customer({
    customer_id: cleanId(clientAccountId),
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    login_customer_id: cleanId(process.env.GOOGLE_ADS_MCC_CUSTOMER_ID!),
  })
}

export async function listMccClients(): Promise<{ id: string; name: string }[]> {
  const customer = getMccCustomer()
  const results = await customer.query(`
    SELECT
      customer_client.id,
      customer_client.descriptive_name,
      customer_client.status
    FROM customer_client
    WHERE customer_client.level <= 1
      AND customer_client.status = 'ENABLED'
      AND customer_client.id != ${cleanId(process.env.GOOGLE_ADS_MCC_CUSTOMER_ID!)}
  `)
  return results.map((r: any) => ({
    id: String(r.customer_client.id),
    name: r.customer_client.descriptive_name || `Account ${r.customer_client.id}`,
  }))
}

export async function getKeywordSuggestions(
  seedKeywords: string[]
): Promise<KeywordSuggestion[]> {
  const customer = getMccCustomer()
  const ideas = await customer.keywordPlanIdeas.generateKeywordIdeas(
    new services.GenerateKeywordIdeasRequest({
      customer_id: cleanId(process.env.GOOGLE_ADS_MCC_CUSTOMER_ID!),
      language: 'languageConstants/1000',
      geo_target_constants: ['geoTargetConstants/2710'],
      include_adult_keywords: false,
      keyword_seed: { keywords: seedKeywords },
    })
  )

  const results = (ideas as any)?.results || []
  return results.slice(0, 50).map((idea: any) => ({
    text: idea.text,
    volume: idea.keyword_idea_metrics?.avg_monthly_searches || 0,
    competition: idea.keyword_idea_metrics?.competition || 'UNSPECIFIED',
    suggested_bid: idea.keyword_idea_metrics?.average_cpc_micros
      ? idea.keyword_idea_metrics.average_cpc_micros / 1_000_000
      : 0,
  }))
}

// Match type enum values for Google Ads API
const MATCH_TYPE = { exact: 4, phrase: 3, broad: 5 }

// Bidding strategy builder
function buildBiddingStrategy(settings: CampaignSettingsData) {
  switch (settings.bidding_strategy) {
    case 'maximize_conversions':
      return { maximize_conversions: {} }
    case 'target_cpa':
      return { target_cpa: { target_cpa_micros: (settings.target_cpa || 0) * 1_000_000 } }
    case 'target_roas':
      return { target_roas: { target_roas: settings.target_roas || 1 } }
    case 'maximize_clicks':
      return { maximize_clicks: {} }
    default:
      return { maximize_conversions: {} }
  }
}

export async function publishSearchCampaign(
  clientAccountId: string,
  name: string,
  settings: CampaignSettingsData,
  adGroups: AdGroup[]
): Promise<string> {
  const customer = getClientCustomer(clientAccountId)

  const budgetResp = await customer.campaignBudgets.create([{
    name: `${name} Budget`,
    amount_micros: settings.budget_daily * 1_000_000,
    delivery_method: 2, // STANDARD
  }]) as any
  const budget = budgetResp.results[0]

  const campaignResp = await customer.campaigns.create([{
    name,
    advertising_channel_type: 2, // SEARCH
    status: 3, // PAUSED
    campaign_budget: budget.resource_name,
    ...buildBiddingStrategy(settings),
  }]) as any
  const campaign = campaignResp.results[0]

  // Create one ad group per product/service
  for (const ag of adGroups) {
    if (!ag.name.trim() || !ag.assets) continue

    const adGroupResp = await customer.adGroups.create([{
      name: ag.name,
      campaign: campaign.resource_name,
      status: 2, // ENABLED
      type: 2,   // SEARCH_STANDARD
    }]) as any
    const createdAdGroup = adGroupResp.results[0]

    // Responsive Search Ad
    await customer.adGroupAds.create([{
      ad_group: createdAdGroup.resource_name,
      status: 2,
      ad: {
        responsive_search_ad: {
          headlines: ag.assets.headlines!.map(text => ({ text })),
          descriptions: ag.assets.descriptions.map(text => ({ text })),
        },
      },
    }])

    // Per-ad-group positive keywords
    const positiveKws = (ag.keywords ?? []).filter(k => k.selected)
    if (positiveKws.length > 0) {
      await customer.adGroupCriteria.create(
        positiveKws.map(kw => ({
          ad_group: createdAdGroup.resource_name,
          keyword: { text: kw.text, match_type: MATCH_TYPE[kw.match_type] },
          status: 2,
        }))
      )
    }

    // Per-ad-group negative keywords
    const negativeKws = ag.negative_keywords ?? []
    if (negativeKws.length > 0) {
      await customer.adGroupCriteria.create(
        negativeKws.map(nk => ({
          ad_group: createdAdGroup.resource_name,
          keyword: { text: nk.text, match_type: MATCH_TYPE[nk.match_type] },
          negative: true,
          status: 2,
        }))
      )
    }

    // Sitelinks at campaign level from first ad group
    if (ag === adGroups[0] && ag.assets.sitelinks?.length) {
      await customer.campaignAssets.create(
        ag.assets.sitelinks.map(sl => ({
          campaign: campaign.resource_name,
          asset: {
            sitelink_asset: {
              link_text: sl.text,
              final_urls: [sl.url],
              description1: sl.description1,
              description2: sl.description2,
            },
          },
          field_type: 6, // SITELINK
        })) as any
      )
    }
  }

  return campaign.resource_name.split('/').pop() || ''
}

export interface DailyMetrics {
  date: string
  clicks: number
  cost: number
  impressions: number
  conversions: number
  conversion_rate: number
  ctr: number
}

export interface AccountStats {
  daily: DailyMetrics[]
  totals: Omit<DailyMetrics, 'date'>
  currency: string
}

export async function getClientStats(
  clientAccountId: string,
  startDate: string,
  endDate: string
): Promise<AccountStats> {
  // Strict validation before interpolating into GAQL
  validateDate(startDate, 'start_date')
  validateDate(endDate, 'end_date')
  if (startDate > endDate) throw new Error('start_date must be before end_date')

  const customer = getClientCustomer(clientAccountId)

  const results = await customer.query(`
    SELECT
      segments.date,
      metrics.clicks,
      metrics.cost_micros,
      metrics.impressions,
      metrics.conversions,
      customer.currency_code
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date ASC
  `) as any[]

  const byDate = new Map<string, { clicks: number; cost: number; impressions: number; conversions: number }>()
  let currency = 'ZAR'

  for (const r of results) {
    const date: string = r.segments?.date
    if (!date) continue
    if (r.customer?.currency_code) currency = r.customer.currency_code
    const prev = byDate.get(date) ?? { clicks: 0, cost: 0, impressions: 0, conversions: 0 }
    byDate.set(date, {
      clicks:      prev.clicks      + (r.metrics?.clicks      ?? 0),
      cost:        prev.cost        + (r.metrics?.cost_micros ?? 0) / 1_000_000,
      impressions: prev.impressions + (r.metrics?.impressions ?? 0),
      conversions: prev.conversions + (r.metrics?.conversions ?? 0),
    })
  }

  const daily: DailyMetrics[] = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      clicks:          d.clicks,
      cost:            Math.round(d.cost * 100) / 100,
      impressions:     d.impressions,
      conversions:     Math.round(d.conversions * 100) / 100,
      conversion_rate: d.clicks > 0 ? Math.round((d.conversions / d.clicks) * 10000) / 100 : 0,
      ctr:             d.impressions > 0 ? Math.round((d.clicks / d.impressions) * 10000) / 100 : 0,
    }))

  const sums = daily.reduce(
    (acc, d) => ({
      clicks:          acc.clicks      + d.clicks,
      cost:            acc.cost        + d.cost,
      impressions:     acc.impressions + d.impressions,
      conversions:     acc.conversions + d.conversions,
      conversion_rate: 0,
      ctr:             0,
    }),
    { clicks: 0, cost: 0, impressions: 0, conversions: 0, conversion_rate: 0, ctr: 0 }
  )

  sums.cost            = Math.round(sums.cost * 100) / 100
  sums.conversion_rate = sums.clicks > 0
    ? Math.round((sums.conversions / sums.clicks) * 10000) / 100 : 0
  sums.ctr             = sums.impressions > 0
    ? Math.round((sums.clicks / sums.impressions) * 10000) / 100 : 0

  return { daily, totals: sums, currency }
}

export async function publishPMaxCampaign(
  clientAccountId: string,
  name: string,
  settings: CampaignSettingsData,
  assets: GeneratedAssets
): Promise<string> {
  const customer = getClientCustomer(clientAccountId)

  const budgetResp = await customer.campaignBudgets.create([{
    name: `${name} Budget`,
    amount_micros: settings.budget_daily * 1_000_000,
    delivery_method: 2,
  }]) as any
  const budget = budgetResp.results[0]

  const campaignResp = await customer.campaigns.create([{
    name,
    advertising_channel_type: 9, // PERFORMANCE_MAX
    status: 3, // PAUSED
    campaign_budget: budget.resource_name,
    ...buildBiddingStrategy(settings),
  }]) as any
  const campaign = campaignResp.results[0]

  // Asset group
  await customer.assetGroups.create([{
    name: `${name} Asset Group 1`,
    campaign: campaign.resource_name,
    status: 2,
    headlines: assets.headlines!.map(text => ({ text })),
    long_headlines: (assets.long_headlines || []).map(text => ({ text })),
    descriptions: assets.descriptions.map(text => ({ text })),
    final_urls: [settings.final_url || ''],
  }] as any)

  return campaign.resource_name.split('/').pop() || ''
}
