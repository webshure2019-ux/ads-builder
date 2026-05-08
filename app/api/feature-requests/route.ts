import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'

export interface FeatureRequest {
  id:           string
  title:        string
  description:  string | null
  submitted_at: string
}

export async function GET(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('feature_requests')
      .select('id, title, description, submitted_at')
      .order('submitted_at', { ascending: false })

    if (error) throw new Error(error.message)
    return NextResponse.json({ requests: data as FeatureRequest[] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth(request)
  if (authError) return authError

  let body: { title?: string; description?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const title = (body.title ?? '').trim()
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('feature_requests')
      .insert({ title, description: body.description?.trim() || null })
      .select('id, title, description, submitted_at')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, request: data as FeatureRequest })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
