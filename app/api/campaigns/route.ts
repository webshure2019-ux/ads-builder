import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { client_id, name, type, settings, brief } = body

  const supabase = createServerClient()

  const { data: campaign, error: campError } = await supabase
    .from('campaigns')
    .insert({ client_id, name, type, status: 'draft', settings })
    .select()
    .single()

  if (campError) return NextResponse.json({ error: campError.message }, { status: 500 })

  await supabase.from('briefs').insert({
    campaign_id: campaign.id,
    url: brief.url,
    scraped_content: brief.scraped_content,
    product: brief.product,
    audience: brief.audience,
    usps: brief.usps,
    tone: brief.tone,
    goal: brief.goal,
    brand_name: brief.brand_name,
    keywords: brief.keywords,
  })

  return NextResponse.json({ id: campaign.id })
}

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaigns: data })
}
