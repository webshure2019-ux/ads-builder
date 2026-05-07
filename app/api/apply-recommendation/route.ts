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
      case 'pause_keyword': {
        if (!action_data.keyword_id || !action_data.ad_group_id) {
          return NextResponse.json(
            { error: 'pause_keyword requires keyword_id and ad_group_id' },
            { status: 400 },
          )
        }
        // setKeywordStatus(clientAccountId, adGroupId, criterionId, status)
        await setKeywordStatus(
          client_account_id,
          String(action_data.ad_group_id),
          String(action_data.keyword_id),
          'PAUSED',
        )
        break
      }

      case 'update_budget': {
        if (!action_data.budget_resource_name) {
          return NextResponse.json(
            { error: 'update_budget requires budget_resource_name' },
            { status: 400 },
          )
        }
        const newBudget = Number(action_data.new_daily_budget)
        if (!Number.isFinite(newBudget) || newBudget <= 0) {
          return NextResponse.json(
            { error: 'update_budget requires new_daily_budget > 0' },
            { status: 400 },
          )
        }
        // setCampaignBudget(clientAccountId, budgetResourceName, dailyBudgetAmount)
        // action_data must include budget_resource_name (e.g. "customers/123/campaignBudgets/456")
        await setCampaignBudget(
          client_account_id,
          String(action_data.budget_resource_name),
          newBudget,
        )
        break
      }

      case 'add_negative': {
        if (!action_data.campaign_id || !action_data.text) {
          return NextResponse.json(
            { error: 'add_negative requires campaign_id and text' },
            { status: 400 },
          )
        }
        const validMatchTypes = ['EXACT', 'PHRASE', 'BROAD']
        const matchType = String(action_data.match_type ?? '')
        if (!validMatchTypes.includes(matchType)) {
          return NextResponse.json(
            { error: `Invalid match_type: must be EXACT, PHRASE, or BROAD` },
            { status: 400 },
          )
        }
        await addCampaignNegative(
          client_account_id,
          String(action_data.campaign_id),
          String(action_data.text),
          matchType as 'EXACT' | 'PHRASE' | 'BROAD',
        )
        break
      }

      case 'pause_campaign': {
        if (!action_data.campaign_id) {
          return NextResponse.json(
            { error: 'pause_campaign requires campaign_id' },
            { status: 400 },
          )
        }
        await setCampaignStatus(
          client_account_id,
          String(action_data.campaign_id),
          'PAUSED',
        )
        break
      }

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
