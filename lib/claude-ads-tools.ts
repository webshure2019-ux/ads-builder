import Anthropic from '@anthropic-ai/sdk'
import {
  getClientCampaigns,
  getClientStats,
  getSearchTerms,
  getKeywords,
  getDevicePerformance,
} from '@/lib/google-ads'

// ── Shared tool definitions for Claude ads analysis routes ────────────────────
export const ADS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_campaign_stats',
    description:
      'Fetch performance metrics (spend, clicks, impressions, CTR, conversions, ' +
      'impression share, rank-lost IS, budget-lost IS, daily_budget) for all campaigns ' +
      'in a client account over a date range. Use this first to get an overview.',
    input_schema: {
      type:       'object' as const,
      properties: {
        client_account_id: {
          type:        'string',
          description: 'The Google Ads client account ID (digits only)',
        },
        start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
        end_date:   { type: 'string', description: 'End date YYYY-MM-DD' },
      },
      required: ['client_account_id', 'start_date', 'end_date'],
    },
  },
  {
    name: 'get_account_stats',
    description:
      'Fetch account-level daily time-series metrics (clicks, cost, impressions, ' +
      'CTR, conversions) and period totals. Use to analyse trends over time.',
    input_schema: {
      type:       'object' as const,
      properties: {
        client_account_id: { type: 'string' },
        start_date:        { type: 'string' },
        end_date:          { type: 'string' },
      },
      required: ['client_account_id', 'start_date', 'end_date'],
    },
  },
  {
    name: 'get_search_terms',
    description:
      'Fetch the search terms report for a specific campaign. Shows what user queries ' +
      'triggered ads, with impressions, clicks, cost, and conversions per term. ' +
      'Use to find wasted spend or high-performing terms not yet added as keywords.',
    input_schema: {
      type:       'object' as const,
      properties: {
        client_account_id: { type: 'string' },
        campaign_id:       { type: 'string', description: 'Numeric campaign ID' },
        start_date:        { type: 'string' },
        end_date:          { type: 'string' },
      },
      required: ['client_account_id', 'campaign_id', 'start_date', 'end_date'],
    },
  },
  {
    name: 'get_keywords',
    description:
      'Fetch all keywords for a campaign with Quality Score (1–10), match type, ' +
      'CPC bid, and performance metrics. Use to find low-QS keywords or high-spend ' +
      'low-convert terms.',
    input_schema: {
      type:       'object' as const,
      properties: {
        client_account_id: { type: 'string' },
        campaign_id:       { type: 'string' },
        start_date:        { type: 'string' },
        end_date:          { type: 'string' },
      },
      required: ['client_account_id', 'campaign_id', 'start_date', 'end_date'],
    },
  },
  {
    name: 'get_device_performance',
    description:
      'Fetch performance split by device (DESKTOP, MOBILE, TABLET): clicks, spend, ' +
      'CTR, conversion rate, CPA, avg CPC. Use to identify devices that are over- or ' +
      'under-invested relative to results.',
    input_schema: {
      type:       'object' as const,
      properties: {
        client_account_id: { type: 'string' },
        start_date:        { type: 'string' },
        end_date:          { type: 'string' },
      },
      required: ['client_account_id', 'start_date', 'end_date'],
    },
  },
]

// ── Execute a tool call requested by Claude ───────────────────────────────────
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    switch (name) {
      case 'get_campaign_stats': {
        const campaigns = await getClientCampaigns(
          String(input.client_account_id),
          String(input.start_date),
          String(input.end_date),
        )
        return JSON.stringify(campaigns.map(c => ({
          id:                      c.id,
          name:                    c.name,
          status:                  c.status,
          channel_type:            c.channel_type,
          cost:                    c.cost,
          clicks:                  c.clicks,
          impressions:             c.impressions,
          ctr:                     c.ctr,
          conversions:             c.conversions,
          conversion_rate:         c.conversion_rate,
          conversions_value:       c.conversions_value,
          avg_cpc:                 c.avg_cpc,
          cost_per_conversion:     c.cost_per_conversion,
          search_impression_share: c.search_impression_share,
          search_rank_lost_is:     c.search_rank_lost_is,
          search_budget_lost_is:   c.search_budget_lost_is,
          daily_budget:            c.daily_budget,
          budget_resource_name:    c.budget_resource_name,
        })))
      }
      case 'get_account_stats': {
        const stats = await getClientStats(
          String(input.client_account_id),
          String(input.start_date),
          String(input.end_date),
        )
        return JSON.stringify({ currency: stats.currency, totals: stats.totals, daily: stats.daily })
      }
      case 'get_search_terms': {
        return JSON.stringify(await getSearchTerms(
          String(input.client_account_id),
          String(input.campaign_id),
          String(input.start_date),
          String(input.end_date),
        ))
      }
      case 'get_keywords': {
        return JSON.stringify(await getKeywords(
          String(input.client_account_id),
          String(input.campaign_id),
          String(input.start_date),
          String(input.end_date),
        ))
      }
      case 'get_device_performance': {
        return JSON.stringify(await getDevicePerformance(
          String(input.client_account_id),
          String(input.start_date),
          String(input.end_date),
        ))
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  } catch (err: any) {
    return JSON.stringify({ error: err.message ?? 'Tool execution failed' })
  }
}
