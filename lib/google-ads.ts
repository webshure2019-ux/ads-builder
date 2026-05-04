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
  id:                             string
  name:                           string
  status:                         string
  channel_type:                   string
  daily_budget:                   number   // ZAR / account currency
  budget_resource_name:           string   // e.g. customers/123/campaignBudgets/456
  impressions:                    number
  clicks:                         number
  cost:                           number
  conversions:                    number
  ctr:                            number
  conversion_rate:                number
  // Derived from existing totals (no extra API call needed)
  avg_cpc:                        number   // cost / clicks
  cost_per_conversion:            number   // cost / conversions
  // Extra metrics from API
  conversions_value:              number
  all_conversions:                number
  search_impression_share:        number | null  // 0–100 % or null for non-Search campaigns
  search_abs_top_is:              number | null
  search_top_is:                  number | null
  // Smart-bidding learning phase
  bidding_strategy_type:          string
  bidding_strategy_system_status: string
  start_date:                     string   // YYYY-MM-DD campaign start date
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

  // Three parallel queries — some fields are INCOMPATIBLE with segments.date in GAQL:
  //   • impression share metrics → separate unsegmented IS query
  //   • bidding_strategy_type / bidding_strategy_system_status / start_date
  //     → separate unsegmented attrs query (system-status is a current-state
  //       snapshot; it must NOT appear in a date-segmented context)
  const [results, isResults, attrsResults] = await Promise.all([
    customer.query(`
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
        metrics.conversions,
        metrics.conversions_value,
        metrics.all_conversions
      FROM campaign
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
        AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
    `) as Promise<any[]>,
    customer.query(`
      SELECT
        campaign.id,
        metrics.search_impression_share,
        metrics.search_absolute_top_impression_share,
        metrics.search_top_impression_share
      FROM campaign
      WHERE campaign.status != 'REMOVED'
    `).catch(() => [] as any[]) as Promise<any[]>,
    customer.query(`
      SELECT
        campaign.id,
        campaign.bidding_strategy_type,
        campaign.bidding_strategy_system_status,
        campaign.start_date
      FROM campaign
      WHERE campaign.status != 'REMOVED'
    `).catch(() => [] as any[]) as Promise<any[]>,
  ])

  // Impression-share lookup: campaign ID → IS values (0–100 %)
  const isMap = new Map<string, { is: number | null; abTop: number | null; top: number | null }>()
  for (const r of isResults) {
    const id = String(r.campaign?.id ?? '')
    if (!id || id === 'undefined') continue
    const is    = r.metrics?.search_impression_share
    const abTop = r.metrics?.search_absolute_top_impression_share
    const top   = r.metrics?.search_top_impression_share
    isMap.set(id, {
      is:    (is    != null && is    > 0) ? Math.round(is    * 1000) / 10 : null,
      abTop: (abTop != null && abTop > 0) ? Math.round(abTop * 1000) / 10 : null,
      top:   (top   != null && top   > 0) ? Math.round(top   * 1000) / 10 : null,
    })
  }

  // Campaign-attributes lookup: campaign ID → bidding strategy + start date
  const attrsMap = new Map<string, {
    bidding_strategy_type:          string
    bidding_strategy_system_status: string
    start_date:                     string
  }>()
  for (const r of attrsResults) {
    const id = String(r.campaign?.id ?? '')
    if (!id || id === 'undefined') continue
    attrsMap.set(id, {
      bidding_strategy_type:          String(r.campaign?.bidding_strategy_type          ?? ''),
      bidding_strategy_system_status: String(r.campaign?.bidding_strategy_system_status ?? ''),
      start_date:                     String(r.campaign?.start_date                     ?? ''),
    })
  }

  const byCampaign = new Map<string, {
    name: string; status: string; channel_type: string
    budget_resource_name: string; daily_budget_micros: number
    impressions: number; clicks: number; cost: number; conversions: number
    conversions_value: number; all_conversions: number
  }>()

  for (const r of results) {
    const id = String(r.campaign?.id ?? '')
    if (!id || id === 'undefined') continue
    const prev = byCampaign.get(id)
    if (prev) {
      prev.impressions       += r.metrics?.impressions        ?? 0
      prev.clicks            += r.metrics?.clicks             ?? 0
      prev.cost              += (r.metrics?.cost_micros ?? 0) / 1_000_000
      prev.conversions       += r.metrics?.conversions        ?? 0
      prev.conversions_value += r.metrics?.conversions_value  ?? 0
      prev.all_conversions   += r.metrics?.all_conversions    ?? 0
    } else {
      byCampaign.set(id, {
        name:                 r.campaign?.name ?? 'Unknown',
        status:               String(r.campaign?.status ?? 'UNKNOWN'),
        channel_type:         String(r.campaign?.advertising_channel_type ?? 'UNKNOWN'),
        budget_resource_name: r.campaign?.campaign_budget ?? '',
        daily_budget_micros:  r.campaign_budget?.amount_micros ?? 0,
        impressions:          r.metrics?.impressions        ?? 0,
        clicks:               r.metrics?.clicks             ?? 0,
        cost:                 (r.metrics?.cost_micros ?? 0) / 1_000_000,
        conversions:          r.metrics?.conversions        ?? 0,
        conversions_value:    r.metrics?.conversions_value  ?? 0,
        all_conversions:      r.metrics?.all_conversions    ?? 0,
      })
    }
  }

  return Array.from(byCampaign.entries())
    .map(([id, c]) => {
      const cost        = Math.round(c.cost * 100) / 100
      const conversions = Math.round(c.conversions * 100) / 100
      const is          = isMap.get(id)
      const attrs       = attrsMap.get(id)
      return {
        id,
        name:                           c.name,
        status:                         c.status,
        channel_type:                   c.channel_type,
        daily_budget:                   Math.round(c.daily_budget_micros / 1_000_000 * 100) / 100,
        budget_resource_name:           c.budget_resource_name,
        impressions:                    c.impressions,
        clicks:                         c.clicks,
        cost,
        conversions,
        ctr:                            c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0,
        conversion_rate:                c.clicks > 0 ? Math.round((conversions / c.clicks) * 10000) / 100 : 0,
        avg_cpc:                        c.clicks > 0 ? Math.round(cost / c.clicks * 100) / 100 : 0,
        cost_per_conversion:            conversions > 0 ? Math.round(cost / conversions * 100) / 100 : 0,
        conversions_value:              Math.round(c.conversions_value * 100) / 100,
        all_conversions:                Math.round(c.all_conversions * 100) / 100,
        search_impression_share:        is?.is    ?? null,
        search_abs_top_is:              is?.abTop ?? null,
        search_top_is:                  is?.top   ?? null,
        bidding_strategy_type:          attrs?.bidding_strategy_type          ?? '',
        bidding_strategy_system_status: attrs?.bidding_strategy_system_status ?? '',
        start_date:                     attrs?.start_date                     ?? '',
      }
    })
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

// ─── Ad strength: Google returns numeric enum values, normalise to string names ─
const STRENGTH_NUM_MAP: Record<string, string> = {
  '0': 'UNKNOWN',   // UNSPECIFIED — no data
  '1': 'UNKNOWN',   // UNKNOWN
  '2': 'PENDING',   // PENDING — waiting for data
  '3': 'POOR',      // NO_ADS — treated as poor
  '4': 'POOR',      // POOR
  '5': 'AVERAGE',   // AVERAGE
  '6': 'GOOD',      // GOOD
  '7': 'EXCELLENT', // EXCELLENT
}

function normalizeAdStrength(raw: any): string {
  const s = String(raw ?? '')
  return STRENGTH_NUM_MAP[s] ?? (s.toUpperCase() || 'UNKNOWN')
}
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
  endDate: string,
  adGroupId?: string
): Promise<AdData[]> {
  validateDate(startDate, 'start_date')
  validateDate(endDate, 'end_date')
  validateCampaignId(campaignId)
  if (adGroupId) validateCampaignId(adGroupId)
  if (startDate > endDate) throw new Error('start_date must be before end_date')

  const customer = getClientCustomer(clientAccountId)

  // Filter server-side by ad group when provided — avoids client-side ID comparison issues
  const adGroupFilter = adGroupId ? `\n      AND ad_group.id = ${adGroupId}` : ''

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
    WHERE campaign.id = ${campaignId}${adGroupFilter}
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
        ad_strength:   normalizeAdStrength(r.ad_group_ad?.ad_strength),
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

// ─── Asset Groups (Performance Max) ──────────────────────────────────────────
export interface AssetGroupMetrics {
  id:              string
  name:            string
  status:          string
  final_urls:      string[]
  impressions:     number
  clicks:          number
  cost:            number
  conversions:     number
  ctr:             number
  conversion_rate: number
}

export async function getAssetGroups(
  clientAccountId: string,
  campaignId: string,
  startDate: string,
  endDate: string
): Promise<AssetGroupMetrics[]> {
  validateDate(startDate, 'start_date')
  validateDate(endDate, 'end_date')
  validateCampaignId(campaignId)
  if (startDate > endDate) throw new Error('start_date must be before end_date')

  const customer = getClientCustomer(clientAccountId)

  const results = await customer.query(`
    SELECT
      asset_group.id,
      asset_group.name,
      asset_group.status,
      asset_group.final_urls,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM asset_group
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND asset_group.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `) as any[]

  const byGroup = new Map<string, {
    name: string; status: string; final_urls: string[]
    impressions: number; clicks: number; costMicros: number; conversions: number
  }>()

  for (const r of results) {
    const id = String(r.asset_group?.id ?? '')
    if (!id) continue
    const prev = byGroup.get(id)
    if (prev) {
      prev.impressions += r.metrics?.impressions ?? 0
      prev.clicks      += r.metrics?.clicks      ?? 0
      prev.costMicros  += r.metrics?.cost_micros ?? 0
      prev.conversions += r.metrics?.conversions ?? 0
    } else {
      byGroup.set(id, {
        name:        r.asset_group?.name      ?? 'Unknown',
        status:      String(r.asset_group?.status ?? 'UNKNOWN'),
        final_urls:  Array.isArray(r.asset_group?.final_urls) ? r.asset_group.final_urls : [],
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
        final_urls:      g.final_urls,
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

// ─── Asset-level performance labels ───────────────────────────────────────────
// Normalise every raw API value (string name OR numeric enum) to one of:
// BEST | GOOD | LOW | LEARNING | UNRATED
const PERF_LABEL_MAP: Record<string, string> = {
  // Numeric enum values
  '0': 'UNRATED',   // UNSPECIFIED — no data yet
  '1': 'UNRATED',   // UNKNOWN
  '2': 'LEARNING',  // PENDING — Google is still collecting data
  '3': 'LEARNING',  // LEARNING
  '4': 'GOOD',      // GOOD
  '5': 'BEST',      // BEST
  '6': 'LOW',       // LOW
  // String names the API may also return
  'UNSPECIFIED': 'UNRATED',
  'UNKNOWN':     'UNRATED',
  'PENDING':     'LEARNING',
  'LEARNING':    'LEARNING',
  'GOOD':        'GOOD',
  'BEST':        'BEST',
  'LOW':         'LOW',
}

// field_type normalisation: numeric → canonical string
const FIELD_TYPE_MAP: Record<string, string> = {
  '5': 'HEADLINE', 'HEADLINE': 'HEADLINE',
  '6': 'DESCRIPTION', 'DESCRIPTION': 'DESCRIPTION',
}

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
      ad_group_ad_asset_view.performance_label,
      asset.text_asset.text
    FROM ad_group_ad_asset_view
    WHERE ad_group_ad.resource_name = '${resourceName}'
  `) as any[]

  return results
    .map((r: any) => {
      const rawLabel = String(r.ad_group_ad_asset_view?.performance_label ?? '')
      const rawType  = String(r.ad_group_ad_asset_view?.field_type ?? '')
      return {
        text:       String(r.asset?.text_asset?.text ?? '').trim(),
        field_type: FIELD_TYPE_MAP[rawType] ?? rawType.toUpperCase(),
        label:      PERF_LABEL_MAP[rawLabel] ?? PERF_LABEL_MAP[rawLabel.toUpperCase()] ?? 'UNRATED',
      }
    })
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

// ─── Search Terms ─────────────────────────────────────────────────────────────
const SEARCH_TERM_STATUS_MAP: Record<string, string> = {
  '0': 'NONE', '1': 'NONE', '2': 'ADDED', '3': 'EXCLUDED', '4': 'ADDED_EXCLUDED', '5': 'NONE',
  'UNSPECIFIED': 'NONE', 'UNKNOWN': 'NONE',
  'ADDED': 'ADDED', 'EXCLUDED': 'EXCLUDED', 'ADDED_EXCLUDED': 'ADDED_EXCLUDED', 'NONE': 'NONE',
}

function normalizeSearchTermStatus(raw: any): string {
  const s = String(raw ?? '')
  return SEARCH_TERM_STATUS_MAP[s] ?? SEARCH_TERM_STATUS_MAP[s.toUpperCase()] ?? 'NONE'
}

export interface SearchTermRow {
  term:         string
  status:       string  // 'ADDED' | 'EXCLUDED' | 'ADDED_EXCLUDED' | 'NONE'
  campaignId:   string
  campaignName: string
  adGroupId:    string
  adGroupName:  string
  impressions:  number
  clicks:       number
  cost:         number  // account currency
  conversions:  number
  ctr:          number  // percentage (0–100)
  avgCpc:       number  // account currency
  cpa:          number  // account currency (0 if no conversions)
}

export async function getSearchTerms(
  clientAccountId: string,
  startDate: string,
  endDate: string,
  campaignId?: string
): Promise<SearchTermRow[]> {
  validateDate(startDate, 'start_date')
  validateDate(endDate,   'end_date')
  if (startDate > endDate) throw new Error('start_date must be before end_date')
  if (campaignId) validateCampaignId(campaignId)

  const customer       = getClientCustomer(clientAccountId)
  const campaignFilter = campaignId ? `\n      AND campaign.id = ${campaignId}` : ''

  const results = await customer.query(`
    SELECT
      search_term_view.search_term,
      search_term_view.status,
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_per_conversion
    FROM search_term_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
      AND metrics.impressions > 0${campaignFilter}
    ORDER BY metrics.cost_micros DESC
    LIMIT 2000
  `) as any[]

  return results
    .map(r => {
      const costMicros = Number(r.metrics?.cost_micros ?? 0)
      const cost       = Math.round(costMicros / 1_000_000 * 100) / 100
      const conv       = Math.round(Number(r.metrics?.conversions ?? 0) * 100) / 100
      const avgCpc     = Math.round(Number(r.metrics?.average_cpc ?? 0) / 1_000_000 * 100) / 100
      return {
        term:         String(r.search_term_view?.search_term ?? '').trim(),
        status:       normalizeSearchTermStatus(r.search_term_view?.status),
        campaignId:   String(r.campaign?.id   ?? ''),
        campaignName: String(r.campaign?.name ?? ''),
        adGroupId:    String(r.ad_group?.id   ?? ''),
        adGroupName:  String(r.ad_group?.name ?? ''),
        impressions:  Number(r.metrics?.impressions ?? 0),
        clicks:       Number(r.metrics?.clicks      ?? 0),
        cost,
        conversions:  conv,
        ctr:          Math.round(Number(r.metrics?.ctr ?? 0) * 10000) / 100, // 0–100 %
        avgCpc,
        cpa:          conv > 0 ? Math.round(cost / conv * 100) / 100 : 0,
      }
    })
    .filter(r => r.term)
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
