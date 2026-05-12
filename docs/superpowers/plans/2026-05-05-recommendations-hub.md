# Optimisation Recommendations Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Recommendations" section to the client dashboard where Claude analyses live Google Ads data and returns a ranked, actionable list of optimisation changes the account manager can apply in one click.

**Architecture:** A new `POST /api/recommendations` route runs a Claude tool-use loop with a structured-JSON system prompt, returning `Recommendation[]`. A second route `POST /api/apply-recommendation` dispatches apply actions to existing Google Ads API functions. The `RecommendationsSection` component manages all UI states (empty → loading → cards → done). Shared Claude tool definitions are extracted to `lib/claude-ads-tools.ts` so both `/api/ai-analyse` and `/api/recommendations` import from one place.

**Tech Stack:** Next.js 14 App Router, TypeScript, `@anthropic-ai/sdk`, `google-ads-api` v23, Tailwind CSS, Jest + node test environment.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `types/index.ts` | Modify | Add `ActionType` and `Recommendation` types |
| `lib/claude-ads-tools.ts` | Create | Shared `ADS_TOOLS` array and `executeTool` function |
| `lib/recommendations-utils.ts` | Create | `extractRecommendations` — parses Claude's JSON response |
| `__tests__/lib/recommendations-utils.test.ts` | Create | Unit tests for `extractRecommendations` |
| `app/api/ai-analyse/route.ts` | Modify | Import tools from `lib/claude-ads-tools.ts` instead of inline |
| `app/api/recommendations/route.ts` | Create | Claude tool-use loop with JSON system prompt |
| `app/api/apply-recommendation/route.ts` | Create | Dispatch table → Google Ads API functions |
| `components/dashboard/RecommendationsSection.tsx` | Create | Full UI component |
| `components/dashboard/ClientDashboard.tsx` | Modify | Import + render `<RecommendationsSection>` |
| `CLAUDE.md` | Modify | Document new routes and component |

---

## Task 1: Add shared types to `types/index.ts`

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add `ActionType` and `Recommendation` to the end of `types/index.ts`**

Open `types/index.ts` and append after the last export:

```typescript
// ─── Recommendations Hub ───────────────────────────────────────────────────────
export type ActionType =
  | 'pause_keyword'
  | 'update_budget'
  | 'add_negative'
  | 'pause_campaign'
  | 'manual'

export type RecCategory =
  | 'keyword'
  | 'budget'
  | 'ad_copy'
  | 'negative'
  | 'bidding'
  | 'structure'

export interface Recommendation {
  id:          string
  category:    RecCategory
  priority:    number   // 1–10, Claude-assigned; 10 = highest impact
  title:       string   // Specific action with numbers, e.g. "Pause 'cheap widgets' — $280 spent, 0 conversions"
  reasoning:   string   // 1–2 sentences with real numbers from the data
  impact:      string   // Short estimate, e.g. "Est. saves ~$280/mo"
  action_type: ActionType
  action_data: Record<string, string | number>  // Parameters the apply route needs
  applicable:  boolean  // true = Apply button; false = Manual in Google Ads tag
  status:      'pending' | 'applied' | 'dismissed'  // Frontend state only
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd "/Users/miguelslabbert/Documents/Claude Course - Ads Builder/Ads Builder" && npx tsc --noEmit
```

Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: add Recommendation and ActionType shared types"
```

---

## Task 2: Extract shared Claude tools to `lib/claude-ads-tools.ts`

The `ADS_TOOLS` array and `executeTool` function currently live only in `app/api/ai-analyse/route.ts`. Both the ai-analyse and the new recommendations route need them — extract to a shared lib file.

**Files:**
- Create: `lib/claude-ads-tools.ts`
- Modify: `app/api/ai-analyse/route.ts`

- [ ] **Step 1: Create `lib/claude-ads-tools.ts`**

```typescript
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
  input: Record<string, string>,
): Promise<string> {
  try {
    switch (name) {
      case 'get_campaign_stats': {
        const campaigns = await getClientCampaigns(
          input.client_account_id,
          input.start_date,
          input.end_date,
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
        })))
      }
      case 'get_account_stats': {
        const stats = await getClientStats(
          input.client_account_id,
          input.start_date,
          input.end_date,
        )
        return JSON.stringify({ currency: stats.currency, totals: stats.totals, daily: stats.daily })
      }
      case 'get_search_terms': {
        return JSON.stringify(await getSearchTerms(
          input.client_account_id,
          input.campaign_id,
          input.start_date,
          input.end_date,
        ))
      }
      case 'get_keywords': {
        return JSON.stringify(await getKeywords(
          input.client_account_id,
          input.campaign_id,
          input.start_date,
          input.end_date,
        ))
      }
      case 'get_device_performance': {
        return JSON.stringify(await getDevicePerformance(
          input.client_account_id,
          input.start_date,
          input.end_date,
        ))
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  } catch (err: any) {
    return JSON.stringify({ error: err.message ?? 'Tool execution failed' })
  }
}
```

- [ ] **Step 2: Update `app/api/ai-analyse/route.ts` to import from the shared lib**

Replace the entire file with this (identical behaviour, imports moved):

```typescript
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
        content:     await executeTool(block.name, block.input as Record<string, string>),
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
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add lib/claude-ads-tools.ts app/api/ai-analyse/route.ts
git commit -m "refactor: extract shared Claude tool definitions to lib/claude-ads-tools"
```

---

## Task 3: Build `lib/recommendations-utils.ts` + unit tests

`extractRecommendations` is the only pure function in this feature — everything else requires network calls. Test it thoroughly.

**Files:**
- Create: `lib/recommendations-utils.ts`
- Create: `__tests__/lib/recommendations-utils.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `__tests__/lib/recommendations-utils.test.ts`:

```typescript
// __tests__/lib/recommendations-utils.test.ts
import { extractRecommendations } from '@/lib/recommendations-utils'
import type { Recommendation } from '@/types'

const VALID_REC: Omit<Recommendation, 'status'> = {
  id:          'rec-1',
  category:    'keyword',
  priority:    8,
  title:       "Pause 'cheap widgets' — $280 spent, 0 conversions",
  reasoning:   'This keyword spent $280 with 0 conversions.',
  impact:      'Est. saves ~$280/mo',
  action_type: 'pause_keyword',
  action_data: { keyword_id: '123', ad_group_id: '456', campaign_id: '789' },
  applicable:  true,
}

describe('extractRecommendations', () => {
  it('parses a valid JSON array and adds status: pending to each item', () => {
    const text = JSON.stringify([VALID_REC])
    const result = extractRecommendations(text)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('pending')
    expect(result[0].title).toBe(VALID_REC.title)
  })

  it('extracts JSON when wrapped in prose', () => {
    const text = `Here are the recommendations:\n[\n${JSON.stringify(VALID_REC)}\n]\nEnd.`
    const result = extractRecommendations(text)
    expect(result).toHaveLength(1)
    expect(result[0].priority).toBe(8)
  })

  it('assigns fallback id when rec has no id', () => {
    const noId = { ...VALID_REC, id: undefined }
    const text = JSON.stringify([noId])
    const result = extractRecommendations(text)
    expect(result[0].id).toBe('rec-0')
  })

  it('handles multiple recommendations sorted as returned', () => {
    const recs = [
      { ...VALID_REC, id: 'rec-1', priority: 8 },
      { ...VALID_REC, id: 'rec-2', priority: 5 },
    ]
    const result = extractRecommendations(JSON.stringify(recs))
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('rec-1')
  })

  it('throws when no JSON array is found', () => {
    expect(() => extractRecommendations('No array here')).toThrow('No JSON array')
  })

  it('throws when JSON is malformed', () => {
    expect(() => extractRecommendations('[{bad json}')).toThrow()
  })

  it('throws when [ appears after ]', () => {
    expect(() => extractRecommendations('] then [stuff')).toThrow('No JSON array')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern="recommendations-utils" --no-coverage 2>&1 | tail -20
```

Expected: `FAIL __tests__/lib/recommendations-utils.test.ts` with `Cannot find module '@/lib/recommendations-utils'`.

- [ ] **Step 3: Create `lib/recommendations-utils.ts`**

```typescript
import type { Recommendation } from '@/types'

/**
 * Extracts a Recommendation[] from Claude's text response.
 * Claude is prompted to return only a JSON array, but may occasionally
 * include leading/trailing prose. We find the first [ and last ] to be safe.
 */
export function extractRecommendations(text: string): Recommendation[] {
  const start = text.indexOf('[')
  const end   = text.lastIndexOf(']')

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON array found in Claude response')
  }

  const parsed = JSON.parse(text.slice(start, end + 1)) as Omit<Recommendation, 'status'>[]

  return parsed.map((r, i) => ({
    ...r,
    id:     r.id ?? `rec-${i}`,
    status: 'pending' as const,
  }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern="recommendations-utils" --no-coverage 2>&1 | tail -20
```

Expected: `PASS __tests__/lib/recommendations-utils.test.ts` with 7 passing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/recommendations-utils.ts __tests__/lib/recommendations-utils.test.ts
git commit -m "feat: add extractRecommendations utility with tests"
```

---

## Task 4: Build `app/api/recommendations/route.ts`

**Files:**
- Create: `app/api/recommendations/route.ts`

- [ ] **Step 1: Create the directory and route file**

```bash
mkdir -p "/Users/miguelslabbert/Documents/Claude Course - Ads Builder/Ads Builder/app/api/recommendations"
```

Create `app/api/recommendations/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { ADS_TOOLS, executeTool } from '@/lib/claude-ads-tools'
import { extractRecommendations } from '@/lib/recommendations-utils'

const client = new Anthropic()

const SYSTEM_PROMPT = (accountId: string, startDate: string, endDate: string) => `\
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

  const messages: Anthropic.MessageParam[] = [
    {
      role:    'user',
      content: SYSTEM_PROMPT(client_account_id, start_date, end_date),
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
        content:     await executeTool(block.name, block.input as Record<string, string>),
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
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/api/recommendations/route.ts
git commit -m "feat: add POST /api/recommendations — Claude tool-use loop returning ranked actions"
```

---

## Task 5: Build `app/api/apply-recommendation/route.ts`

**Files:**
- Create: `app/api/apply-recommendation/route.ts`

- [ ] **Step 1: Create the directory and route file**

```bash
mkdir -p "/Users/miguelslabbert/Documents/Claude Course - Ads Builder/Ads Builder/app/api/apply-recommendation"
```

Create `app/api/apply-recommendation/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  setKeywordStatus,
  setCampaignBudget,
  addCampaignNegative,
  setCampaignStatus,
} from '@/lib/google-ads'
import type { ActionType } from '@/types'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { action_type, action_data, client_account_id } = body

  if (!action_type || !action_data || !client_account_id) {
    return NextResponse.json(
      { error: 'action_type, action_data, client_account_id are required' },
      { status: 400 },
    )
  }

  try {
    switch (action_type as ActionType) {
      case 'pause_keyword':
        await setKeywordStatus(
          client_account_id,
          String(action_data.keyword_id),
          String(action_data.ad_group_id),
          'PAUSED',
        )
        break

      case 'update_budget':
        await setCampaignBudget(
          client_account_id,
          String(action_data.campaign_id),
          Number(action_data.new_daily_budget_micros),
        )
        break

      case 'add_negative':
        await addCampaignNegative(
          client_account_id,
          String(action_data.campaign_id),
          String(action_data.text),
          String(action_data.match_type) as 'EXACT' | 'PHRASE' | 'BROAD',
        )
        break

      case 'pause_campaign':
        await setCampaignStatus(
          client_account_id,
          String(action_data.campaign_id),
          'PAUSED',
        )
        break

      default:
        return NextResponse.json(
          { error: `Cannot apply action_type: ${action_type}` },
          { status: 400 },
        )
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[/api/apply-recommendation]', action_type, err)
    return NextResponse.json(
      { ok: false, error: err.message ?? 'Apply failed' },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/api/apply-recommendation/route.ts
git commit -m "feat: add POST /api/apply-recommendation — dispatch apply actions to Google Ads API"
```

---

## Task 6: Build `RecommendationsSection.tsx` — structure and states

**Files:**
- Create: `components/dashboard/RecommendationsSection.tsx`

- [ ] **Step 1: Create the component file with all UI states except cards**

Create `components/dashboard/RecommendationsSection.tsx`:

```typescript
'use client'
import { useState } from 'react'
import type { Recommendation, RecCategory } from '@/types'

// ── Category display config ────────────────────────────────────────────────────
const CAT_META: Record<RecCategory, { label: string; cls: string }> = {
  keyword:   { label: 'Keyword',   cls: 'bg-blue-50 text-blue-600' },
  budget:    { label: 'Budget',    cls: 'bg-emerald-50 text-emerald-600' },
  ad_copy:   { label: 'Ad Copy',   cls: 'bg-purple-50 text-purple-600' },
  negative:  { label: 'Negative',  cls: 'bg-red-50 text-red-600' },
  bidding:   { label: 'Bidding',   cls: 'bg-amber-50 text-amber-600' },
  structure: { label: 'Structure', cls: 'bg-sky-50 text-sky-600' },
}

function priorityCls(p: number): string {
  if (p >= 8) return 'bg-red-50 text-red-600'
  if (p >= 5) return 'bg-amber-50 text-amber-600'
  return 'bg-emerald-50 text-emerald-600'
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface Props {
  clientAccountId: string
  startDate:       string
  endDate:         string
  currency:        string
}

// ── Recommendation card — defined in Task 7 ───────────────────────────────────
// Placeholder so the file compiles before Task 7 adds the full card
function RecCard(_props: {
  rec:        Recommendation
  onApply:    (rec: Recommendation) => void
  onDismiss:  (id: string) => void
  applying:   boolean
  applyError: string | null
}) { return null }

// ── Main component ─────────────────────────────────────────────────────────────
export function RecommendationsSection({ clientAccountId, startDate, endDate }: Props) {
  const [recs,        setRecs]        = useState<Recommendation[]>([])
  const [filter,      setFilter]      = useState('all')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [iterations,  setIterations]  = useState(0)
  const [applying,    setApplying]    = useState<string | null>(null)
  const [applyErrors, setApplyErrors] = useState<Record<string, string>>({})
  const [showDone,    setShowDone]    = useState(false)

  const pending    = recs.filter(r => r.status === 'pending')
  const done       = recs.filter(r => r.status !== 'pending')
  const categories = Array.from(new Set(pending.map(r => r.category)))
  const filtered   = filter === 'all' ? pending : pending.filter(r => r.category === filter)

  async function generate() {
    setLoading(true)
    setError(null)
    setRecs([])
    setFilter('all')
    setApplyErrors({})
    setShowDone(false)

    try {
      const res = await fetch('/api/recommendations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          client_account_id: clientAccountId,
          start_date:        startDate,
          end_date:          endDate,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setRecs(data.recommendations ?? [])
      setIterations(data.iterations ?? 0)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleApply(rec: Recommendation) {
    setApplying(rec.id)
    setApplyErrors(prev => { const n = { ...prev }; delete n[rec.id]; return n })

    try {
      const res = await fetch('/api/apply-recommendation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action_type:       rec.action_type,
          action_data:       rec.action_data,
          client_account_id: clientAccountId,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Apply failed')
      setRecs(prev => prev.map(r => r.id === rec.id ? { ...r, status: 'applied' as const } : r))
    } catch (e: any) {
      setApplyErrors(prev => ({ ...prev, [rec.id]: e.message }))
    } finally {
      setApplying(null)
    }
  }

  function handleDismiss(id: string) {
    setRecs(prev => prev.map(r => r.id === id ? { ...r, status: 'dismissed' as const } : r))
  }

  // ── Section wrapper ──────────────────────────────────────────────────────────
  return (
    <div className="border border-cloud rounded-3xl overflow-hidden bg-white">

      {/* Header */}
      <div className="px-6 py-4 border-b border-cloud flex items-center justify-between">
        <div>
          <p className="font-heading font-bold text-navy text-sm">
            ⚡ Optimisation Recommendations
            {!loading && recs.length > 0 && (
              <span className="ml-2 text-[10px] font-bold bg-cyan text-white px-2 py-0.5 rounded-full">
                {pending.length}
              </span>
            )}
          </p>
          <p className="text-[10px] text-navy/50 mt-0.5">
            {recs.length > 0
              ? `Ranked by estimated impact · ${iterations} data call${iterations !== 1 ? 's' : ''}`
              : 'Claude analyses campaigns, keywords, search terms & devices'}
          </p>
        </div>
        {recs.length > 0 && !loading ? (
          <button
            onClick={generate}
            className="text-[11px] font-medium px-3 py-1.5 rounded-xl bg-cloud text-navy/60 hover:bg-cloud/70 transition-colors"
          >
            ↺ Refresh
          </button>
        ) : (
          !loading && (
            <button
              onClick={generate}
              className="bg-teal text-white font-heading font-bold text-xs px-4 py-2 rounded-xl hover:opacity-90 transition-all"
            >
              ⚡ Generate Recommendations
            </button>
          )
        )}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="px-6 py-12 flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-teal border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-teal">Claude is analysing your account…</p>
          <p className="text-[11px] text-navy/40">Fetching live data across campaigns, keywords & devices</p>
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div className="px-6 py-6">
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3">
            <span className="text-red-400 flex-shrink-0 mt-0.5">⚠</span>
            <div>
              <p className="text-sm font-medium text-red-700 mb-0.5">Analysis failed</p>
              <p className="text-[11px] text-red-500">{error}</p>
              <button
                onClick={generate}
                className="mt-3 text-[11px] font-bold text-red-600 hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Empty state (initial) ── */}
      {!loading && !error && recs.length === 0 && (
        <div className="px-6 py-12 text-center">
          <p className="text-2xl mb-2">🎯</p>
          <p className="text-sm font-medium text-navy mb-1">Ready to analyse</p>
          <p className="text-[11px] text-navy/40">
            Surface the highest-impact actions across all categories
          </p>
        </div>
      )}

      {/* ── All done ── */}
      {!loading && !error && recs.length > 0 && pending.length === 0 && (
        <div className="px-6 py-8 text-center">
          <p className="text-xl mb-2">✅</p>
          <p className="text-sm font-medium text-navy mb-1">All recommendations reviewed</p>
          <button
            onClick={generate}
            className="mt-3 text-[11px] font-bold text-teal hover:underline"
          >
            ↺ Run a fresh analysis
          </button>
        </div>
      )}

      {/* ── Populated state (filter chips + cards) — filled in Task 7 ── */}
      {!loading && !error && pending.length > 0 && (
        <div>
          {/* Filter chips */}
          <div className="px-6 py-3 border-b border-cloud flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-navy/40 font-semibold uppercase tracking-wider mr-1">Filter</span>
            <button
              onClick={() => setFilter('all')}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                filter === 'all'
                  ? 'bg-navy text-cyan border-navy'
                  : 'border-cloud text-navy/50 hover:bg-cloud/70'
              }`}
            >
              All ({pending.length})
            </button>
            {categories.map(cat => {
              const meta  = CAT_META[cat] ?? { label: cat, cls: '' }
              const count = pending.filter(r => r.category === cat).length
              return (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    filter === cat
                      ? 'bg-navy text-cyan border-navy'
                      : 'border-cloud text-navy/50 hover:bg-cloud/70'
                  }`}
                >
                  {meta.label} ({count})
                </button>
              )
            })}
          </div>

          {/* Cards */}
          <div className="px-6 py-4 space-y-3">
            {filtered.map(rec => (
              <RecCard
                key={rec.id}
                rec={rec}
                onApply={handleApply}
                onDismiss={handleDismiss}
                applying={applying === rec.id}
                applyError={applyErrors[rec.id] ?? null}
              />
            ))}
          </div>

          {/* Done collapse */}
          {done.length > 0 && (
            <div className="px-6 pb-4 border-t border-cloud pt-3">
              <button
                onClick={() => setShowDone(v => !v)}
                className="text-[10px] font-semibold uppercase tracking-wider text-navy/35 hover:text-navy/60 transition-colors flex items-center gap-1"
              >
                {showDone ? '▾' : '▸'} {done.length} applied / dismissed
              </button>
              {showDone && (
                <div className="mt-3 space-y-2 opacity-50">
                  {done.map(rec => (
                    <div key={rec.id} className="border border-dashed border-cloud rounded-xl px-4 py-2 flex items-center justify-between gap-3">
                      <p className="text-[11px] text-navy/50 truncate">{rec.title}</p>
                      <span className="text-[9px] font-bold uppercase tracking-wider flex-shrink-0 text-navy/30">
                        {rec.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/RecommendationsSection.tsx
git commit -m "feat: add RecommendationsSection component with all UI states"
```

---

## Task 7: Implement the `RecCard` sub-component

Replace the `RecCard` placeholder from Task 6 with the real implementation.

**Files:**
- Modify: `components/dashboard/RecommendationsSection.tsx`

- [ ] **Step 1: Replace the `RecCard` placeholder function**

Find and replace the placeholder `RecCard` function (lines that begin `// Placeholder so the file compiles` and the `function RecCard` block returning `null`) with:

```typescript
function RecCard({
  rec,
  onApply,
  onDismiss,
  applying,
  applyError,
}: {
  rec:        Recommendation
  onApply:    (rec: Recommendation) => void
  onDismiss:  (id: string) => void
  applying:   boolean
  applyError: string | null
}) {
  const cat = CAT_META[rec.category] ?? { label: rec.category, cls: 'bg-cloud text-navy/50' }

  return (
    <div className="border border-cloud rounded-2xl p-4 bg-white hover:border-cyan/30 transition-all">
      {/* Top row: priority + title + actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {/* Priority badge */}
          <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold mt-0.5 ${priorityCls(rec.priority)}`}>
            {rec.priority}
          </div>

          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-navy leading-snug">{rec.title}</p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cat.cls}`}>
                {cat.label}
              </span>
              <span className="text-[9px] text-navy/40 bg-cloud px-2 py-0.5 rounded-full">
                {rec.impact}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onDismiss(rec.id)}
            className="text-[10px] font-medium px-2.5 py-1.5 rounded-lg bg-cloud text-navy/50 hover:bg-cloud/70 transition-colors"
          >
            Dismiss
          </button>
          {rec.applicable ? (
            <button
              onClick={() => onApply(rec)}
              disabled={applying}
              className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-teal text-white hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {applying ? '…' : '✓ Apply'}
            </button>
          ) : (
            <span className="text-[9px] font-medium px-2.5 py-1.5 rounded-lg bg-mist text-navy/35 border border-dashed border-cloud whitespace-nowrap">
              Manual in Google Ads
            </span>
          )}
        </div>
      </div>

      {/* Reasoning */}
      <p className="text-[11px] text-navy/55 leading-relaxed mt-3 pt-3 border-t border-cloud">
        {rec.reasoning}
      </p>

      {/* Inline apply error */}
      {applyError && (
        <p className="text-[10px] text-red-600 mt-2 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
          Failed: {applyError}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/RecommendationsSection.tsx
git commit -m "feat: implement RecCard with apply/dismiss and inline error handling"
```

---

## Task 8: Wire `RecommendationsSection` into `ClientDashboard.tsx`

**Files:**
- Modify: `components/dashboard/ClientDashboard.tsx`

- [ ] **Step 1: Add the import**

In `ClientDashboard.tsx`, find the line:

```typescript
import { ClientReportSection }     from '@/components/dashboard/ClientReportSection'
```

Add the new import directly after it:

```typescript
import { RecommendationsSection }  from '@/components/dashboard/RecommendationsSection'
```

- [ ] **Step 2: Add the section to the dashboard JSX**

Find the existing comment and section:

```typescript
          {/* ── Client Report ── */}
          <div className="mt-2">
            <ClientReportSection
```

Insert the new block immediately before it:

```typescript
          {/* ── Optimisation Recommendations ── */}
          <div className="mt-2">
            <RecommendationsSection
              clientAccountId={clientId}
              startDate={rs}
              endDate={re}
              currency={stats.currency}
            />
          </div>

          {/* ── Client Report ── */}
          <div className="mt-2">
            <ClientReportSection
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Run all tests to confirm nothing broke**

```bash
npm test -- --no-coverage 2>&1 | tail -15
```

Expected: all test suites pass.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/ClientDashboard.tsx
git commit -m "feat: add RecommendationsSection to client dashboard"
```

---

## Task 9: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the two new routes to the Campaign Builder table in §8**

Find this row in the Campaign Builder routes table:

```markdown
| `POST /api/ai-analyse` | POST | AI-powered account analysis using Claude tool use. ...
```

Add two rows after it:

```markdown
| `POST /api/recommendations` | POST | Claude tool-use loop returning a ranked `Recommendation[]` JSON array. Body: `{ client_account_id, start_date, end_date }`. Claude fetches campaign stats, keywords, search terms & device data, then returns up to 10 prioritised actions. Response: `{ recommendations, iterations }`. |
| `POST /api/apply-recommendation` | POST | Executes a recommendation returned by `/api/recommendations`. Body: `{ action_type, action_data, client_account_id }`. Dispatches to existing Google Ads functions: `setKeywordStatus`, `setCampaignBudget`, `addCampaignNegative`, `setCampaignStatus`. Returns `{ ok, error? }`. |
```

- [ ] **Step 2: Add `RecommendationsSection` to the Dashboard Components section (§10)**

Find:

```markdown
### `AIAnalystSection.tsx`
```

Add the new component documentation before it:

```markdown
### `RecommendationsSection.tsx`

Collects a ranked list of Claude-generated optimisation recommendations for the current client and date range. Account manager clicks "⚡ Generate Recommendations" → POST to `/api/recommendations` → Claude fetches live data and returns `Recommendation[]` sorted by priority. Each card shows: colour-coded priority badge (1–10), category badge, impact estimate, reasoning with real numbers, and either an **Apply** button (for applicable actions) or a **Manual in Google Ads** tag (for advisory-only). Applying calls `POST /api/apply-recommendation` and optimistically moves the card to the Done list. Dismissing moves the card to Done without an API call. Done cards collapse into a summary row at the bottom. Positioned above `ClientReportSection`.

### `AIAnalystSection.tsx`
```

- [ ] **Step 3: Add shared lib files to §9**

Find the description of `lib/google-ads.ts` block and add after it:

```markdown
### `lib/claude-ads-tools.ts`

Exports `ADS_TOOLS: Anthropic.Tool[]` and `executeTool(name, input)` shared between `/api/ai-analyse` and `/api/recommendations`. Adding a new tool for Claude to call only requires a change in this one file.

### `lib/recommendations-utils.ts`

Exports `extractRecommendations(text: string): Recommendation[]`. Finds the first `[` and last `]` in Claude's text response and parses the JSON array, adding `status: 'pending'` to each item. Tested in `__tests__/lib/recommendations-utils.test.ts`.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Recommendations Hub — routes, component, shared libs"
```

---

## Done

All tasks complete. The Recommendations Hub is live. To verify end-to-end:

1. `npm run dev`
2. Open the app, select any client account
3. Scroll to **Optimisation Recommendations** (above Client Report)
4. Click **⚡ Generate Recommendations**
5. Wait ~15–30 seconds — Claude fetches data and returns ranked cards
6. Click **✓ Apply** on a pause_keyword card — keyword pauses in Google Ads immediately
7. Click **Dismiss** on any card — it moves to the Done list
8. Click **↺ Refresh** to re-run the analysis
