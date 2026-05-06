import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { ADS_TOOLS, executeTool } from '@/lib/claude-ads-tools'

const client = new Anthropic()

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { question, client_account_id, start_date, end_date } = body

  if (!question || !client_account_id || !start_date || !end_date) {
    return NextResponse.json(
      { error: 'question, client_account_id, start_date, end_date are required' },
      { status: 400 },
    )
  }

  const messages: Anthropic.MessageParam[] = [
    {
      role:    'user',
      content:
        `You are an expert Google Ads analyst. The account ID is ${client_account_id}. ` +
        `The date range to analyse is ${start_date} to ${end_date}.\n\n` +
        `Use the available tools to fetch real data before answering — never guess at numbers. ` +
        `Start with get_campaign_stats to get an overview, then drill into specific campaigns ` +
        `as needed. Back every recommendation with specific numbers from the data.\n\n` +
        `Format your answer in clear sections with bullet points. Be specific and actionable.\n\n` +
        `Question: ${question}`,
    },
  ]

  let response = await client.messages.create({
    model:      'claude-opus-4-7',
    max_tokens: 4096,
    thinking:   { type: 'adaptive' },
    tools:      ADS_TOOLS,
    messages,
  })

  let iterations = 0
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
      tools:      ADS_TOOLS,
      messages,
    })
  }

  const answer = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')

  return NextResponse.json({ answer, iterations })
}
