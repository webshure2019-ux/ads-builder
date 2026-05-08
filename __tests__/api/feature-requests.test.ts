import { GET, POST } from '@/app/api/feature-requests/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn().mockResolvedValue(null),
}))

// Shared result that each test can override
let mockResult: { data: unknown; error: unknown } = { data: [], error: null }

jest.mock('@/lib/supabase', () => ({
  createServerClient: jest.fn(() => ({
    from: () => ({
      select: () => ({
        order: () => Promise.resolve(mockResult),
      }),
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve(mockResult),
        }),
      }),
    }),
  })),
}))

function makeGET() {
  return new NextRequest(new URL('http://localhost/api/feature-requests'))
}

function makePOST(body: object) {
  return new NextRequest(new URL('http://localhost/api/feature-requests'), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('GET /api/feature-requests', () => {
  it('returns 200 with requests array', async () => {
    mockResult = { data: [], error: null }
    const res = await GET(makeGET())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.requests)).toBe(true)
  })

  it('returns 500 when Supabase returns an error', async () => {
    mockResult = { data: null, error: { message: 'DB error' } }
    const res = await GET(makeGET())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})

describe('POST /api/feature-requests', () => {
  it('returns 400 when title is missing', async () => {
    const res = await POST(makePOST({ description: 'no title here' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when title is empty string', async () => {
    const res = await POST(makePOST({ title: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with ok and request on valid submission', async () => {
    const newRequest = {
      id: 'uuid-1',
      title: 'Dark mode',
      description: null,
      submitted_at: '2026-05-08T00:00:00Z',
    }
    mockResult = { data: newRequest, error: null }
    const res = await POST(makePOST({ title: 'Dark mode' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.request).toHaveProperty('title', 'Dark mode')
  })

  it('returns 500 when Supabase insert fails', async () => {
    mockResult = { data: null, error: { message: 'insert failed' } }
    const res = await POST(makePOST({ title: 'Dark mode' }))
    expect(res.status).toBe(500)
  })
})
