import { GET } from '@/app/api/geo-target-search/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/google-ads', () => ({
  searchGeoTargets: jest.fn().mockResolvedValue([]),
}))

function makeReq(params: Record<string, string>) {
  const url = new URL('http://localhost/api/geo-target-search')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url)
}

describe('GET /api/geo-target-search', () => {
  it('returns 400 for missing q', async () => {
    const res = await GET(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 for q shorter than 2 chars', async () => {
    const res = await GET(makeReq({ q: 'a' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with results array on valid q', async () => {
    const res = await GET(makeReq({ q: 'Cape Town' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('results')
    expect(Array.isArray(body.results)).toBe(true)
  })

  it('returns 500 when searchGeoTargets throws', async () => {
    const { searchGeoTargets } = require('@/lib/google-ads')
    searchGeoTargets.mockRejectedValueOnce(new Error('GAQL error'))
    const res = await GET(makeReq({ q: 'Cape Town' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})
