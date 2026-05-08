import { GET, POST, DELETE, PATCH } from '@/app/api/location-targets/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/google-ads', () => ({
  getLocationTargets:        jest.fn().mockResolvedValue([]),
  addLocationTarget:         jest.fn().mockResolvedValue({ criterionId: '999' }),
  removeLocationTarget:      jest.fn().mockResolvedValue(undefined),
  updateLocationBidModifier: jest.fn().mockResolvedValue(undefined),
}))

function makeGetReq(params: Record<string, string>) {
  const url = new URL('http://localhost/api/location-targets')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url)
}

function makeBodyReq(method: string, body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/location-targets', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const VALID_GET = {
  client_account_id: '1234567890',
  campaign_id: '9876543',
  start_date: '2026-01-01',
  end_date: '2026-01-31',
}

const VALID_POST = {
  client_account_id: '1234567890',
  campaign_id: '9876543',
  geo_target_id: '1007801',
}

const VALID_DELETE = {
  client_account_id: '1234567890',
  campaign_id: '9876543',
  criterion_id: '111222',
}

const VALID_PATCH = {
  client_account_id: '1234567890',
  campaign_id: '9876543',
  criterion_id: '111222',
  bid_modifier: 1.2,
}

describe('GET /api/location-targets', () => {
  it('returns 400 for missing client_account_id', async () => {
    const { campaign_id, start_date, end_date } = VALID_GET
    const res = await GET(makeGetReq({ campaign_id, start_date, end_date }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid client_account_id', async () => {
    const res = await GET(makeGetReq({ ...VALID_GET, client_account_id: 'bad' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid start_date', async () => {
    const res = await GET(makeGetReq({ ...VALID_GET, start_date: '01-01-2026' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for start_date >= end_date', async () => {
    const res = await GET(makeGetReq({ ...VALID_GET, start_date: '2026-02-01', end_date: '2026-01-01' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing campaign_id', async () => {
    const { client_account_id, start_date, end_date } = VALID_GET
    const res = await GET(makeGetReq({ client_account_id, start_date, end_date }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with rows array on valid input', async () => {
    const res = await GET(makeGetReq(VALID_GET))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('rows')
    expect(Array.isArray(body.rows)).toBe(true)
  })
})

describe('POST /api/location-targets', () => {
  it('returns 400 for missing client_account_id', async () => {
    const { campaign_id, geo_target_id } = VALID_POST
    const res = await POST(makeBodyReq('POST', { campaign_id, geo_target_id }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing geo_target_id', async () => {
    const res = await POST(makeBodyReq('POST', { client_account_id: '1234567890', campaign_id: '9876543' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with ok and criterionId on valid input', async () => {
    const res = await POST(makeBodyReq('POST', VALID_POST))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body).toHaveProperty('criterionId')
  })
})

describe('DELETE /api/location-targets', () => {
  it('returns 400 for missing criterion_id', async () => {
    const res = await DELETE(makeBodyReq('DELETE', { client_account_id: '1234567890', campaign_id: '9876543' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with ok on valid input', async () => {
    const res = await DELETE(makeBodyReq('DELETE', VALID_DELETE))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})

describe('PATCH /api/location-targets', () => {
  it('returns 400 for bid_modifier out of range', async () => {
    const res = await PATCH(makeBodyReq('PATCH', { ...VALID_PATCH, bid_modifier: 0.05 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-numeric bid_modifier', async () => {
    const res = await PATCH(makeBodyReq('PATCH', { ...VALID_PATCH, bid_modifier: 'high' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with ok on valid input', async () => {
    const res = await PATCH(makeBodyReq('PATCH', VALID_PATCH))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
