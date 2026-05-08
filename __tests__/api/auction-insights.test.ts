import { GET } from '@/app/api/auction-insights/route'
import { NextRequest } from 'next/server'

// Mock auth to always pass
jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn().mockResolvedValue(null),
}))

// Mock the Google Ads function
jest.mock('@/lib/google-ads', () => ({
  getAuctionInsights: jest.fn().mockResolvedValue([]),
}))

function makeReq(params: Record<string, string>) {
  const url = new URL('http://localhost/api/auction-insights')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url)
}

const VALID = {
  client_account_id: '1234567890',
  campaign_id:       '9876543',
  start_date:        '2026-01-01',
  end_date:          '2026-01-31',
}

describe('GET /api/auction-insights', () => {
  it('returns 400 for missing client_account_id', async () => {
    const { campaign_id, start_date, end_date } = VALID
    const res = await GET(makeReq({ campaign_id, start_date, end_date }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid client_account_id', async () => {
    const res = await GET(makeReq({ ...VALID, client_account_id: 'bad' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing campaign_id', async () => {
    const { client_account_id, start_date, end_date } = VALID
    const res = await GET(makeReq({ client_account_id, start_date, end_date }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid campaign_id', async () => {
    const res = await GET(makeReq({ ...VALID, campaign_id: 'not-a-number' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid start_date', async () => {
    const res = await GET(makeReq({ ...VALID, start_date: '01-01-2026' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for start_date >= end_date', async () => {
    const res = await GET(makeReq({ ...VALID, start_date: '2026-02-01', end_date: '2026-01-01' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with rows array on valid input', async () => {
    const res = await GET(makeReq(VALID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('rows')
    expect(Array.isArray(body.rows)).toBe(true)
  })
})
