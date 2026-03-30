// __tests__/api/generate.test.ts
import { POST } from '@/app/api/generate/route'
import { NextRequest } from 'next/server'

// Mock Claude so tests don't hit the real API
jest.mock('@/lib/claude', () => ({
  generateAssets: jest.fn().mockResolvedValue({
    headlines: Array(15).fill('Test Headline Here'),
    descriptions: Array(4).fill('This is a test description for the campaign ad copy.'),
    sitelinks: [],
    callouts: [],
  }),
}))

describe('POST /api/generate', () => {
  it('returns 400 when brief is missing', async () => {
    const req = new NextRequest('http://localhost/api/generate', {
      method: 'POST',
      body: JSON.stringify({ campaign_type: 'search' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns generated assets for valid input', async () => {
    const req = new NextRequest('http://localhost/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        campaign_type: 'search',
        brief: {
          product: 'PPC Management',
          audience: 'Small businesses',
          usps: ['No contracts'],
          tone: 'professional',
          goal: 'lead_gen',
          brand_name: 'Webshure',
          keywords: [{ text: 'ppc', match_type: 'exact', selected: true }],
        },
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.assets.headlines).toHaveLength(15)
  })
})
