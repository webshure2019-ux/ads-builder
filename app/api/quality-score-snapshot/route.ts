import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getKeywords } from '@/lib/google-ads'
import { createServerClient } from '@/lib/supabase'
import { googleAdsErrorMessage } from '@/lib/error-utils'

export const dynamic = 'force-dynamic'

// Run-once Supabase setup. Surfaced to the UI when the table is missing so
// the user can copy/paste it into the Supabase SQL editor without leaving
// the app.
const SETUP_SQL = `create table if not exists keyword_qs_snapshots (
  id                uuid primary key default gen_random_uuid(),
  client_account_id text    not null,
  campaign_id       text    not null,
  keyword_id        text    not null,
  keyword_text      text    not null,
  quality_score     integer,
  created_at        timestamptz not null default now()
);

create index if not exists keyword_qs_snapshots_client_created_idx
  on keyword_qs_snapshots (client_account_id, created_at desc);

-- (Optional but recommended) lock the table down with RLS:
alter table keyword_qs_snapshots enable row level security;`

/** Detect the PostgREST schema-cache miss thrown when the table doesn't exist yet. */
function isMissingTable(msg: string): boolean {
  return /Could not find the table.*keyword_qs_snapshots/i.test(msg)
      || /relation .*keyword_qs_snapshots.* does not exist/i.test(msg)
      || /PGRST20[12]/.test(msg)
}

// GET /api/quality-score-snapshot?client_account_id=...
// Returns snapshot history (list of { date, distribution, avgQs })
export async function GET(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const clientAccountId  = searchParams.get('client_account_id') ?? ''
  if (!clientAccountId) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })

  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('keyword_qs_snapshots')
      .select('id, created_at, quality_score, keyword_text, campaign_id')
      .eq('client_account_id', clientAccountId)
      .order('created_at', { ascending: false })
      .limit(5000)

    if (error) throw new Error(error.message)

    // Group into snapshots by date (YYYY-MM-DD)
    const byDate = new Map<string, { scores: number[]; keywords: { text: string; qs: number | null; campaignId: string }[] }>()
    for (const row of (data ?? [])) {
      const date = (row.created_at as string).split('T')[0]
      const prev = byDate.get(date) ?? { scores: [], keywords: [] }
      if (row.quality_score !== null && row.quality_score !== undefined) prev.scores.push(row.quality_score)
      prev.keywords.push({ text: row.keyword_text, qs: row.quality_score, campaignId: row.campaign_id })
      byDate.set(date, prev)
    }

    const snapshots = Array.from(byDate.entries())
      .map(([date, { scores, keywords }]) => {
        const avg = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : null
        const dist = { low: 0, mid: 0, high: 0 }
        for (const s of scores) {
          if (s <= 3) dist.low++
          else if (s <= 6) dist.mid++
          else dist.high++
        }
        return { date, avgQs: avg !== null ? Math.round(avg * 10) / 10 : null, dist, total: scores.length, keywords }
      })
      .sort((a, b) => b.date.localeCompare(a.date))

    return NextResponse.json({ snapshots })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (isMissingTable(msg)) {
      return NextResponse.json({ snapshots: [], needsSetup: true, setupSql: SETUP_SQL })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/quality-score-snapshot
// Reads current keyword QS from Google Ads API and saves a snapshot to Supabase
export async function POST(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  try {
    const { client_account_id, start_date, end_date } = await request.json()
    if (!client_account_id) return NextResponse.json({ error: 'client_account_id required' }, { status: 400 })

    // Use last 30 days if no range provided
    const end   = end_date   || new Date().toISOString().split('T')[0]
    const start = start_date || (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] })()

    const keywords = await getKeywords(client_account_id, start, end)

    const rows = keywords
      .filter(k => k.status === 'ENABLED')
      .map(k => ({
        client_account_id,
        campaign_id:   k.campaignId,
        keyword_id:    k.criterionId,
        keyword_text:  k.text,
        quality_score: k.qualityScore,
      }))

    if (rows.length === 0) return NextResponse.json({ ok: true, saved: 0 })

    const supabase = createServerClient()
    const { error } = await supabase
      .from('keyword_qs_snapshots')
      .insert(rows)

    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true, saved: rows.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (isMissingTable(msg)) {
      return NextResponse.json(
        { error: 'Quality Score Tracker storage table is missing. Run the setup SQL shown in the panel first.', needsSetup: true, setupSql: SETUP_SQL },
        { status: 503 },
      )
    }
    return NextResponse.json(
      { error: googleAdsErrorMessage(err, 'Failed to save QS snapshot') },
      { status: 500 },
    )
  }
}
