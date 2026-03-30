// lib/claude.ts
import Anthropic from '@anthropic-ai/sdk'
import { Brief, CampaignType, GeneratedAssets } from '@/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export function buildPrompt(brief: Brief, campaignType: CampaignType): string {
  const selectedKeywords = brief.keywords
    .filter(k => k.selected)
    .map(k => `${k.text} (${k.match_type})`)
    .join(', ')

  return `You are an expert Google Ads copywriter. Generate campaign assets for a ${campaignType.toUpperCase()} campaign.

BRAND: ${brief.brand_name}
PRODUCT/SERVICE: ${brief.product}
TARGET AUDIENCE: ${brief.audience}
KEY USPs: ${brief.usps.join(', ')}
TONE: ${brief.tone}
CAMPAIGN GOAL: ${brief.goal}
SELECTED KEYWORDS: ${selectedKeywords}

REQUIREMENTS:
${getAssetRequirements(campaignType)}

RULES:
- Headlines: HARD LIMIT 30 characters each — count carefully
- Descriptions: HARD LIMIT 90 characters each — count carefully
- Every headline must be semantically unique
- At least 3 headlines must include the primary keyword
- At least 2 headlines must contain a clear call to action
- No pinning suggestions (do not include pin_position)
- Match the specified tone throughout all copy
- No ALL CAPS words, no excessive punctuation (Google policy)

Return ONLY valid JSON (no markdown fences, no explanation):
${getJsonSchema(campaignType)}`
}

function getAssetRequirements(type: CampaignType): string {
  const reqs: Record<CampaignType, string> = {
    search: `- 15 unique headlines (max 30 chars each)
- 4 descriptions (max 90 chars each)
- 4 sitelinks: {text, url, description1, description2}
- 4 callout extensions (max 25 chars each)
- 3 structured snippets: {header, values: [3 items]}`,
    pmax: `- 5 short headlines (max 30 chars)
- 5 long headlines (max 90 chars)
- 5 descriptions (max 90 chars)
- 4 sitelinks: {text, url, description1, description2}
- 4 callout extensions
- 25 search_themes (keyword phrases that guide the algorithm)
- 3 image_briefs (describe: dimensions, subject, style, mood)
- 3 audience_signals (describe audience characteristics)`,
    demand_gen: `- 5 headlines (max 30 chars)
- 5 long_headlines (max 90 chars)
- 5 descriptions (max 90 chars)
- 3 image_briefs (describe: dimensions, subject, style, mood)
- 2 video_briefs (describe: length, opening hook, key message, CTA)
- 3 audience_signals`,
    display: `- 5 headlines (max 30 chars)
- 5 descriptions (max 90 chars)
- 3 image_briefs (describe: dimensions, subject, style, mood)`,
    shopping: `- 3 product_groups (product category names for feed segmentation)
- 3 headlines (promotional text, max 60 chars)
- 3 descriptions (promotional copy, max 90 chars)`,
    video: `- 5 headlines (max 30 chars)
- 5 descriptions (max 90 chars)
- 3 video_briefs (describe: length, opening hook, key message, CTA)
- 3 audience_signals`,
  }
  return reqs[type]
}

function getJsonSchema(type: CampaignType): string {
  const schemas: Record<CampaignType, string> = {
    search: `{"headlines":[],"descriptions":[],"sitelinks":[{"text":"","url":"","description1":"","description2":""}],"callouts":[],"structured_snippets":[{"header":"","values":[]}]}`,
    pmax: `{"headlines":[],"long_headlines":[],"descriptions":[],"sitelinks":[{"text":"","url":"","description1":"","description2":""}],"callouts":[],"search_themes":[],"image_briefs":[],"audience_signals":[]}`,
    demand_gen: `{"headlines":[],"long_headlines":[],"descriptions":[],"image_briefs":[],"video_briefs":[],"audience_signals":[]}`,
    display: `{"headlines":[],"descriptions":[],"image_briefs":[]}`,
    shopping: `{"product_groups":[],"headlines":[],"descriptions":[]}`,
    video: `{"headlines":[],"descriptions":[],"video_briefs":[],"audience_signals":[]}`,
  }
  return schemas[type]
}

export function parseAssetsResponse(text: string): GeneratedAssets {
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Response is not a JSON object')
    }
    return parsed as GeneratedAssets
  } catch (err) {
    const preview = text.slice(0, 300) + (text.length > 300 ? '...' : '')
    throw new Error(`Claude returned invalid JSON: ${preview}`)
  }
}

export async function generateAssets(
  brief: Brief,
  campaignType: CampaignType
): Promise<GeneratedAssets> {
  const prompt = buildPrompt(brief, campaignType)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const firstContent = message.content[0]
  if (!firstContent || firstContent.type !== 'text') {
    throw new Error('Claude returned no text content')
  }
  return parseAssetsResponse(firstContent.text)
}
