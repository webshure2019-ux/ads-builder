import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getAdAssetPerformance } from '@/lib/google-ads'
import { updateRSA } from '@/lib/google-ads'

const ACCOUNT_ID_RE = /^\d{8,12}$/
const ENTITY_ID_RE  = /^\d+$/

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  const { searchParams } = new URL(request.url)
  const clientId  = (searchParams.get('client_account_id') ?? '').replace(/-/g, '')
  const adGroupId = searchParams.get('ad_group_id') ?? ''
  const adId      = searchParams.get('ad_id')       ?? ''

  if (!ACCOUNT_ID_RE.test(clientId)) return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!ENTITY_ID_RE.test(adGroupId)) return NextResponse.json({ error: 'Invalid ad_group_id' },       { status: 400 })
  if (!ENTITY_ID_RE.test(adId))      return NextResponse.json({ error: 'Invalid ad_id' },              { status: 400 })

  try {
    const assets = await getAdAssetPerformance(clientId, adGroupId, adId)
    return NextResponse.json({ assets })
  } catch (err: any) {
    const msg = err?.message || JSON.stringify(err)
    console.error('[ad-assets GET]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth) return auth

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const clientId     = String(body?.client_account_id ?? '').replace(/-/g, '')
  const adGroupId    = String(body?.ad_group_id ?? '')
  const adId         = String(body?.ad_id ?? '')
  const headlines    = body?.headlines
  const descriptions = body?.descriptions

  if (!ACCOUNT_ID_RE.test(clientId)) return NextResponse.json({ error: 'Invalid client_account_id' }, { status: 400 })
  if (!ENTITY_ID_RE.test(adGroupId)) return NextResponse.json({ error: 'Invalid ad_group_id' },       { status: 400 })
  if (!ENTITY_ID_RE.test(adId))      return NextResponse.json({ error: 'Invalid ad_id' },              { status: 400 })
  if (!Array.isArray(headlines) || !Array.isArray(descriptions))
    return NextResponse.json({ error: 'headlines and descriptions must be arrays' }, { status: 400 })

  const hArr = headlines.map(String).map(s => s.trim()).filter(Boolean)
  const dArr = descriptions.map(String).map(s => s.trim()).filter(Boolean)

  if (hArr.length < 3 || hArr.length > 15)   return NextResponse.json({ error: 'Must have 3–15 headlines' },    { status: 400 })
  if (dArr.length < 2 || dArr.length > 4)     return NextResponse.json({ error: 'Must have 2–4 descriptions' }, { status: 400 })
  if (hArr.some(h => h.length > 30))          return NextResponse.json({ error: 'A headline exceeds 30 characters' }, { status: 400 })
  if (dArr.some(d => d.length > 90))          return NextResponse.json({ error: 'A description exceeds 90 characters' }, { status: 400 })

  try {
    await updateRSA(clientId, adGroupId, adId, hArr, dArr)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    const msg = err?.message || JSON.stringify(err)
    console.error('[ad-assets PATCH]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
