import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

const MAX_SCRAPED_CONTENT = 5000
const MAX_STRING_FIELD    = 500

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { client_id, name, type, settings, brief } = body

  if (!name?.trim() || !type) {
    return NextResponse.json({ error: 'name and type are required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: campaign, error: campError } = await supabase
    .from('campaigns')
    .insert({ client_id, name: String(name).slice(0, 200), type, status: 'draft', settings })
    .select()
    .single()

  if (campError || !campaign) {
    console.error('[/api/campaigns POST]', campError)
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }

  // Insert brief with field length caps
  const { error: briefError } = await supabase.from('briefs').insert({
    campaign_id:     campaign.id,
    url:             brief?.url     ? String(brief.url).slice(0, 2000)              : null,
    scraped_content: brief?.scraped_content ? String(brief.scraped_content).slice(0, MAX_SCRAPED_CONTENT) : null,
    product:         brief?.product ? String(brief.product).slice(0, MAX_STRING_FIELD) : null,
    audience:        brief?.audience ? String(brief.audience).slice(0, MAX_STRING_FIELD) : null,
    usps:            Array.isArray(brief?.usps) ? brief.usps.slice(0, 20) : [],
    tone:            brief?.tone   ?? null,
    goal:            brief?.goal   ?? null,
    brand_name:      brief?.brand_name ? String(brief.brand_name).slice(0, 200) : null,
    keywords:        Array.isArray(brief?.keywords) ? brief.keywords.slice(0, 100) : [],
  })

  if (briefError) {
    console.error('[/api/campaigns POST brief]', briefError)
    // Campaign was created — return ID even if brief insert fails
  }

  return NextResponse.json({ id: campaign.id })
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[/api/campaigns GET]', error)
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
  }
  return NextResponse.json({ campaigns: data })
}
