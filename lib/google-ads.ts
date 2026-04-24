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

export interface CampaignMetrics {
  id:                   string
  name:                 string
  status:               string
  channel_type:         string
  daily_budget:         number   // ZAR / account currency
  budget_resource_name: string   // e.g. customers/123/campaignBudgets/456
  impressions:          number
  clicks:               number
  cost:                 number
  conversions:          number
  ctr:                  number
  conversion_rate:      number
}

export async function getClientCampaigns(
  clientAccountId: string,
  startDate: string,
  endDate: string
): Promise<CampaignMetrics[]> {
  validateDate(startDate, 'start_date')
  validateDate(endDate, 'end_date')
  if (startDate > endDate) throw new Error('start_date must be before end_date')

  const customer = getClientCustomer(clientAccountId)

  const results = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.campaign_budget,
      campaign_budget.amount_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `) as any[]

  const byCampaign = new Map<string, {
    name: string; status: string; channel_type: string
    budget_resource_name: string; daily_budget_micros: number
    impressions: number; clicks: number; cost: number; conversions: number
  }>()

  for (const r of results) {
    const id = String(r.campaign?.id ?? '')
    if (!id || id === 'undefined') continue
    const prev = byCampaign.get(id)
    if (prev) {
      prev.impressions += r.metrics?.impressions ?? 0
      prev.clicks      += r.metrics?.clicks      ?? 0
      prev.cost        += (r.metrics?.cost_micros ?? 0) / 1_000_000
      prev.conversions += r.metrics?.conversions  ?? 0
    } else {
      byCampaign.set(id, {
        name:                 r.campaign?.name ?? 'Unknown',
        status:               String(r.campaign?.status ?? 'UNKNOWN'),
        channel_type:         String(r.campaign?.advertising_channel_type ?? 'UNKNOWN'),
        budget_resource_name: r.campaign?.campaign_budget ?? '',
        daily_budget_micros:  r.campaign_budget?.amount_micros ?? 0,
        impressions:          r.metrics?.impressions ?? 0,
        clicks:               r.metrics?.clicks      ?? 0,
        cost:                 (r.metrics?.cost_micros ?? 0) / 1_000_000,
        conversions:          r.metrics?.conversions  ?? 0,
      })
    }
  }

  return Array.from(byCampaign.entries())
    .map(([id, c]) => ({
      id,
      name:                 c.name,
      status:               c.status,
      channel_type:         c.channel_type,
      daily_budget:         Math.round(c.daily_budget_micros / 1_000_000 * 100) / 100,
      budget_resource_name: c.budget_resource_name,
      impressions:          c.impressions,
      clicks:               c.clicks,
      cost:                 Math.round(c.cost * 100) / 100,
      conversions:          Math.round(c.conversions * 100) / 100,
      ctr:                  c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0,
      conversion_rate:      c.clicks > 0 ? Math.round((c.conversions / c.clicks) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.cost - a.cost)
}

export interface ConversionAction {
  name:     string
  category: string
  count:    number
  value:    number
}

export async function getConversionBreakdown(
  clientAccountId: string,
  startDate: string,
  endDate: string
): Promise<ConversionAction[]> {
  validateDate(startDate, 'start_date')
  validateDate(endDate,   'end_date')
  if (startDate > endDate) throw new Error('start_date must be before end_date')

  const customer = getClientCustomer(clientAccountId)

  // Query FROM campaign segmented by conversion action — this is the correct
  // way to get date-ranged conversion breakdown. FROM conversion_action does
  // not support date segmentation in GAQL.
  const results = await customer.query(`
    SELECT
      segments.conversion_action_name,
      segments.conversion_action_category,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
      AND metrics.conversions > 0
  `) as any[]

  // Aggregate rows by conversion action name (multiple rows per date segment)
  const byAction = new Map<string, { category: string; count: number; value: number }>()

  for (const r of results) {
    const name = String(r.segments?.conversion_action_name ?? '').trim()
    if (!name) continue
    const prev = byAction.get(name)
    if (prev) {
      prev.count += r.metrics?.conversions       ?? 0
      prev.value += r.metrics?.conversions_value ?? 0
    } else {
      byAction.set(name, {
        category: String(r.segments?.conversion_action_category ?? 'DEFAULT'),
        count:    r.metrics?.conversions       ?? 0,
        value:    r.metrics?.conversions_value ?? 0,
      })
    }
  }

  return Array.from(byAction.entries())
    .map(([name, d]) => ({
      name,
      category: d.category,
      count:    Math.round(d.count * 100) / 100,
      value:    Math.round(d.value * 100) / 100,
    }))
    .sort((a, b) => b.count - a.count)
}

// ─── Campaign ID validator (numeric-only, used in GAQL WHERE without quotes) ──
const CAMPAIGN_ID_RE = /^\d+$/
function validateCampaignId(id: string): void {
  if (!CAMPAIGN_ID_RE.test(id)) throw new Error(`Invalid campaign ID: ${id}`)
}

// ─── Ad Groups ────────────────────────────────────────────────────────────────
export interface AdGroupMetrics {
  id:              string
  name:            string
  status:          string
  impressions:     number
  clicks:          number
  cost:            number
  conversions:     number
  ctr:             number
  conversion_rate: number
}

export async function getAdGroups(
  clientAccountId: string,
  campaignId: string,
  startDate: string,
  endDate: string
): Promise<AdGroupMetrics[]> {
  validateDate(startDate, 'start_date')
  validateDate(endDate, 'end_date')
  validateCampaignId(campaignId)
  if (startDate > endDate) throw new Error('start_date must be before end_date')

  const customer = getClientCustomer(clientAccountId)

  const results = await customer.query(`
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM ad_group
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND ad_group.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `) as any[]

  const byGroup = new Map<string, {
    name: string; status: string
    impressions: number; clicks: number; costMicros: number; conversions: number
  }>()

  for (const r of results) {
    const id = String(r.ad_group?.id ?? '')
    if (!id) continue
    const prev = byGroup.get(id)
    if (prev) {
      prev.impressions += r.metrics?.impressions ?? 0
      prev.clicks      += r.metrics?.clicks      ?? 0
      prev.costMicros  += r.metrics?.cost_micros ?? 0
      prev.conversions += r.metrics?.conversions ?? 0
    } else {
      byGroup.set(id, {
        name:        r.ad_group?.name   ?? 'Unknown',
        status:      String(r.ad_group?.status ?? 'UNKNOWN'),
        impressions: r.metrics?.impressions ?? 0,
        clicks:      r.metrics?.clicks      ?? 0,
        costMicros:  r.metrics?.cost_micros ?? 0,
        conversions: r.metrics?.conversions ?? 0,
      })
    }
  }

  return Array.from(byGroup.entries())
    .map(([id, g]) => {
      const cost = Math.round(g.costMicros / 1_000_000 * 100) / 100
      return {
        id,
        name:            g.name,
        status:          g.status,
        impressions:     g.impressions,
        clicks:          g.clicks,
        cost,
        conversions:     Math.round(g.conversions * 100) / 100,
        ctr:             g.impressions > 0 ? Math.round((g.clicks / g.impressions) * 10000) / 100 : 0,
        conversion_rate: g.clicks > 0 ? Math.round((g.conversions / g.clicks) * 10000) / 100 : 0,
      }
    })
    .sort((a, b) => b.cost - a.cost)
}

// ─── Ads ──────────────────────────────────────────────────────────────────────
export interface AdData {
  id:            string
  ad_group_id:   string
  ad_group_name: string
  type:          string
  status:        string
  ad_strength:   string  // 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'POOR' | 'PENDING' | 'UNKNOWN'
  headlines:     string[]
  descriptions:  string[]
  final_url:     string
  impressions:   number
  clicks:        number
  cost:          number
  ctr:           number
}

export interface AssetPerformance {
  text:       string
  field_type: string  // 'HEADLINE' | 'DESCRIPTION'
  label:      string  // 'BEST' | 'GOOD' | 'LOW' | 'LEARNING' | 'UNRATED'
}

export async function getAds(
  clientAccountId: string,
  campaignId: string,
  startDate: string,
  endDate: string
): Promise<AdData[]> {
  validateDate(startDate, 'start_date')
  validateDate(endDate, 'end_date')
  validateCampaignId(campaignId)
  if (startDate > endDate) throw new Error('start_date must be before end_date')

  const customer = getClientCustomer(clientAccountId)

  const results = await customer.query(`
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.type,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group_ad.ad_strength,
      ad_group_ad.status,
      ad_group.id,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros
    FROM ad_group_ad
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND ad_group_ad.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `) as any[]

  const byAd = new Map<string, {
    ad_group_id: string; ad_group_name: string; type: string; status: string
    ad_strength: string; headlines: string[]; descriptions: string[]; final_url: string
    impressions: number; clicks: number; costMicros: number
  }>()

  for (const r of results) {
    const id = String(r.ad_group_ad?.ad?.id ?? '')
    if (!id) continue
    const prev = byAd.get(id)
    if (prev) {
      prev.impressions += r.metrics?.impressions ?? 0
      prev.clicks      += r.metrics?.clicks      ?? 0
      prev.costMicros  += r.metrics?.cost_micros ?? 0
    } else {
      const rsaHeadlines    = (r.ad_group_ad?.ad?.responsive_search_ad?.headlines    ?? [])
        .map((h: any) => h.text ?? '').filter(Boolean)
      const rsaDescriptions = (r.ad_group_ad?.ad?.responsive_search_ad?.descriptions ?? [])
        .map((d: any) => d.text ?? '').filter(Boolean)

      byAd.set(id, {
        ad_group_id:   String(r.ad_group?.id   ?? ''),
        ad_group_name: r.ad_group?.name         ?? 'Unknown',
        type:          String(r.ad_group_ad?.ad?.type       ?? 'UNKNOWN'),
        status:        String(r.ad_group_ad?.status          ?? 'UNKNOWN'),
        ad_strength:   String(r.ad_group_ad?.ad_strength     ?? 'UNKNOWN'),
        headlines:     rsaHeadlines,
        descriptions:  rsaDescriptions,
        final_url:     (r.ad_group_ad?.ad?.final_urls ?? [])[0] ?? '',
        impressions:   r.metrics?.impressions ?? 0,
        clicks:        r.metrics?.clicks      ?? 0,
        costMicros:    r.metrics?.cost_micros ?? 0,
      })
    }
  }

  return Array.from(byAd.entries())
    .map(([id, a]) => ({
      id,
      ad_group_id:   a.ad_group_id,
      ad_group_name: a.ad_group_name,
      type:          a.type,
      status:        a.status,
      ad_strength:   a.ad_strength,
      headlines:     a.headlines,
      descriptions:  a.descriptions,
      final_url:     a.final_url,
      impressions:   a.impressions,
      clicks:        a.clicks,
      cost:          Math.round(a.costMicros / 1_000_000 * 100) / 100,
      ctr:           a.impressions > 0 ? Math.round((a.clicks / a.impressions) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.cost - a.cost)
}

// ─── Asset-level performance labels ───────────────────────────────────────────
export async function getAdAssetPerformance(
  clientAccountId: string,
  adGroupId: string,
  adId: string
): Promise<AssetPerformance[]> {
  if (!CAMPAIGN_ID_RE.test(adGroupId)) throw new Error('Invalid ad group ID')
  if (!CAMPAIGN_ID_RE.test(adId))      throw new Error('Invalid ad ID')

  const cleanedClientId = cleanId(clientAccountId)
  const customer        = getClientCustomer(cleanedClientId)
  // Resource name constructed from validated numeric IDs only
  const resourceName = `customers/${cleanedClientId}/adGroupAds/${adGroupId}~${adId}`

  const results = await customer.query(`
    SELECT
      ad_group_ad_asset_view.field_type,
      ad_group_ad_asset_view.asset_performance_label,
      asset.text_asset.text
    FROM ad_group_ad_asset_view
    WHERE ad_group_ad.resource_name = '${resourceName}'
  `) as any[]

  return results
    .map((r: any) => ({
      text:       String(r.asset?.text_asset?.text ?? '').trim(),
      field_type: String(r.ad_group_ad_asset_view?.field_type ?? '').toUpperCase(),
      label:      String(r.ad_group_ad_asset_view?.asset_performance_label ?? 'UNRATED').toUpperCase(),
    }))
    .filter(a => a.text)
}

// ─── Update RSA headlines / descriptions ──────────────────────────────────────
export async function updateRSA(
  clientAccountId: string,
  adGroupId: string,
  adId: string,
  headlines: string[],
  descriptions: string[]
): Promise<void> {
  if (!CAMPAIGN_ID_RE.test(adGroupId)) throw new Error('Invalid ad group ID')
  if (!CAMPAIGN_ID_RE.test(adId))      throw new Error('Invalid ad ID')
  if (headlines.length < 3 || headlines.length > 15)   throw new Error('RSA must have 3–15 headlines')
  if (descriptions.length < 2 || descriptions.length > 4) throw new Error('RSA must have 2–4 descriptions')
  for (const h of headlines)    if (h.length > 30) throw new Error(`Headline exceeds 30 chars: "${h.slice(0,20)}…"`)
  for (const d of descriptions) if (d.length > 90) throw new Error(`Description exceeds 90 chars: "${d.slice(0,20)}…"`)

  const cleanedClientId = cleanId(clientAccountId)
  const customer        = getClientCustomer(cleanedClientId)
  const resourceName    = `customers/${cleanedClientId}/adGroupAds/${adGroupId}~${adId}`

  await (customer.adGroupAds as any).update([{
    resource_name: resourceName,
    ad: {
      responsive_search_ad: {
        headlines:    headlines.map(text    => ({ text })),
        descriptions: descriptions.map(text => ({ text })),
      },
    },
  }])
}

// ─── Update campaign daily budget ─────────────────────────────────────────────
export async function setCampaignBudget(
  clientAccountId: string,
  budgetResourceName: string,
  dailyBudgetAmount: number
): Promise<void> {
  // Validate resource name is in the expected format (constructed server-side only)
  if (!/^customers\/\d+\/campaignBudgets\/\d+$/.test(budgetResourceName)) {
    throw new Error('Invalid budget resource name')
  }
  if (!Number.isFinite(dailyBudgetAmount) || dailyBudgetAmount <= 0) {
    throw new Error('Budget must be a positive number')
  }
  const customer = getClientCustomer(clientAccountId)
  await (customer.campaignBudgets as any).update([{
    resource_name:  budgetResourceName,
    amount_micros:  Math.round(dailyBudgetAmount * 1_000_000),
  }])
}

// ─── Set ad-group status ──────────────────────────────────────────────────────
const AD_GROUP_STATUS_MAP = { ENABLED: 2, PAUSED: 3 } as const

export async function setAdGroupStatus(
  clientAccountId: string,
  adGroupId: string,
  status: 'ENABLED' | 'PAUSED'
): Promise<void> {
  if (!CAMPAIGN_ID_RE.test(adGroupId)) throw new Error('Invalid ad group ID')
  const cleanedClientId = cleanId(clientAccountId)
  const customer        = getClientCustomer(cleanedClientId)
  await (customer.adGroups as any).update([{
    resource_name: `customers/${cleanedClientId}/adGroups/${adGroupId}`,
    status:        AD_GROUP_STATUS_MAP[status],
  }])
}

// ─── Set ad (adGroupAd) status ────────────────────────────────────────────────
const AD_STATUS_MAP = { ENABLED: 2, PAUSED: 3 } as const

export async function setAdStatus(
  clientAccountId: string,
  adGroupId: string,
  adId: string,
  status: 'ENABLED' | 'PAUSED'
): Promise<void> {
  if (!CAMPAIGN_ID_RE.test(adGroupId)) throw new Error('Invalid ad group ID')
  if (!CAMPAIGN_ID_RE.test(adId))      throw new Error('Invalid ad ID')
  const cleanedClientId = cleanId(clientAccountId)
  const customer        = getClientCustomer(cleanedClientId)
  await (customer.adGroupAds as any).update([{
    resource_name: `customers/${cleanedClientId}/adGroupAds/${adGroupId}~${adId}`,
    status:        AD_STATUS_MAP[status],
  }])
}

// Campaign status enum values used by the Google Ads API
const CAMPAIGN_STATUS = { ENABLED: 2, PAUSED: 3 } as const
type CampaignStatusAction = 'ENABLED' | 'PAUSED'

/**
 * Pause or resume a campaign by resource name.
 * campaignId is the numeric ID (e.g. "12345678").
 */
export async function setCampaignStatus(
  clientAccountId: string,
  campaignId: string,
  status: CampaignStatusAction
): Promise<void> {
  const cleanedClientId = cleanId(clientAccountId)
  // Validate that campaignId is a plain integer — never interpolated into GAQL
  if (!/^\d+$/.test(campaignId)) throw new Error(`Invalid campaign ID: ${campaignId}`)

  const customer = getClientCustomer(cleanedClientId)
  const resourceName = `customers/${cleanedClientId}/campaigns/${campaignId}`

  await customer.campaigns.update([{
    resource_name: resourceName,
    status: CAMPAIGN_STATUS[status],
  }])
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
