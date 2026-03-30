// lib/google-ads.ts
import { GoogleAdsApi, services } from 'google-ads-api'
import { Keyword, CampaignSettingsData, GeneratedAssets, KeywordSuggestion } from '@/types'

function makeClient() {
  return new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  })
}

function cleanId(id: string) {
  return id.replace(/-/g, '')
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
  assets: GeneratedAssets,
  keywords: Keyword[]
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

  const adGroupResp = await customer.adGroups.create([{
    name: `${name} Ad Group 1`,
    campaign: campaign.resource_name,
    status: 2, // ENABLED
    type: 2, // SEARCH_STANDARD
  }]) as any
  const adGroup = adGroupResp.results[0]

  await customer.adGroupAds.create([{
    ad_group: adGroup.resource_name,
    status: 2,
    ad: {
      responsive_search_ad: {
        headlines: assets.headlines!.map(text => ({ text })),
        descriptions: assets.descriptions.map(text => ({ text })),
      },
    },
  }])

  // Sitelinks
  if (assets.sitelinks?.length) {
    await customer.campaignAssets.create(
      assets.sitelinks.map(sl => ({
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

  // Keywords
  const selectedKws = keywords.filter(k => k.selected)
  if (selectedKws.length > 0) {
    await customer.adGroupCriteria.create(
      selectedKws.map(kw => ({
        ad_group: adGroup.resource_name,
        keyword: {
          text: kw.text,
          match_type: MATCH_TYPE[kw.match_type],
        },
        status: 2,
      }))
    )
  }

  return campaign.resource_name.split('/').pop() || ''
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
    final_urls: [settings.audience_signals?.[0] || 'https://example.com'],
  }] as any)

  return campaign.resource_name.split('/').pop() || ''
}
