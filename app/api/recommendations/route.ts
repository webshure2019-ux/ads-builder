import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { ADS_TOOLS, executeTool } from '@/lib/claude-ads-tools'
import { extractRecommendations } from '@/lib/recommendations-utils'

const client = new Anthropic()

const buildSystemPrompt = (accountId: string, startDate: string, endDate: string) => `\
You are a Google Ads optimisation expert analysing account ${accountId} for the period ${startDate} to ${endDate}.

Your goal: fetch live account data using the available tools, then return ONLY a JSON array of prioritised recommendations. No prose, no markdown fences, no explanation — just the raw JSON array starting with [ and ending with ].

SCHEMA — each recommendation must exactly match:
{
  "id": "rec-1",
  "category": "keyword",
  "priority": 8,
  "title": "Pause 'cheap widgets' — $280 spent, 0 conversions",
  "reasoning": "This keyword spent $280 over 30 days with 218 clicks and 0 conversions. Account CVR is 3.1%.",
  "impact": "Est. saves ~$280/mo",
  "action_type": "pause_keyword",
  "action_data": { "keyword_id": "12345", "ad_group_id": "67890", "campaign_id": "11111" },
  "applicable": true
}

category must be one of: keyword | budget | ad_copy | negative | bidding | structure
action_type must be one of: pause_keyword | update_budget | add_negative | pause_campaign | manual

ACTION DATA RULES:
- pause_keyword  → action_data: { keyword_id, ad_group_id, campaign_id } — set applicable: true
- update_budget  → action_data: { campaign_id, new_daily_budget_micros } — set applicable: true
  Micros = desired daily budget in account currency × 1,000,000 (e.g. $70.00 = 70000000)
- add_negative   → action_data: { campaign_id, text, match_type } where match_type is EXACT, PHRASE, or BROAD — set applicable: true
- pause_campaign → action_data: { campaign_id } — set applicable: true
- manual         → action_data: {} — set applicable: false
  Use manual for: device bid adjustments, keyword CPC bid changes, match type changes, ad scheduling

CONSTRAINTS:
- Return at most 10 recommendations
- Only include priority >= 4
- Every reasoning field MUST contain at least one specific number from the fetched data
- Sort by priority descending (10 first)
- Start with get_campaign_stats for the overview, then drill into specific campaigns as needed`

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { client_account_id, start_date, end_date } = body
  if (!client_account_id || !start_date || !end_date) {
    return NextResponse.json(
      { error: 'client_account_id, start_date, end_date are required' },
      { status: 400 },
    )
  }

  const systemPrompt = buildSystemPrompt(client_account_id, start_date, end_date)

  const messages: Anthropic.MessageParam[] = [
    {
      role:    'user',
      content: 'Analyse this account and return the recommendations JSON array.',
    },
  ]

  let response = await client.messages.create({
    model:      'claude-opus-4-7',
    max_tokens: 4096,
    thinking:   { type: 'adaptive' },
    system:     systemPrompt,
    tools:      ADS_TOOLS,
    messages,
  })

  let iterations = 1
  while (response.stop_reason === 'tool_use' && iterations < 8) {
    iterations++
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )
    messages.push({ role: 'assistant', content: response.content })
    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async block => ({
        type:        'tool_result' as const,
        tool_use_id: block.id,
        content:     await executeTool(block.name, block.input as Record<string, unknown>),
      })),
    )
    messages.push({ role: 'user', content: toolResults })
    response = await client.messages.create({
      model:      'claude-opus-4-7',
      max_tokens: 4096,
      thinking:   { type: 'adaptive' },
      system:     systemPrompt,
      tools:      ADS_TOOLS,
      messages,
    })
  }

  if (response.stop_reason === 'max_tokens') {
    console.error('[/api/recommendations] Claude hit max_tokens mid-loop')
    return NextResponse.json(
      { error: 'Analysis exceeded token limit. Try a shorter date range.' },
      { status: 500 },
    )
  }

  const finalText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')

  try {
    const recommendations = extractRecommendations(finalText)
    return NextResponse.json({ recommendations, iterations })
  } catch (err: any) {
    console.error('[/api/recommendations] JSON parse failed:', finalText.slice(0, 500))
    return NextResponse.json(
      { error: 'Claude returned an unparseable response. Please try again.' },
      { status: 500 },
    )
  }
}
