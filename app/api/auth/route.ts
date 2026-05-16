import { NextRequest, NextResponse } from 'next/server'
import { computeSessionToken } from '@/lib/auth'
import { rateLimit, rateLimitReset, clientIp } from '@/lib/rate-limit'

// The whole tool sits behind ONE shared password, so /api/auth is the only
// brute-forceable surface. Throttle aggressively per-IP, add a fixed delay
// on every attempt, and use a constant-time password comparison.
const MAX_ATTEMPTS     = 5            // failed attempts allowed…
const WINDOW_MS        = 15 * 60_000  // …within this rolling window
const BLOCK_MS         = 15 * 60_000  // …then hard-block this long
const ATTEMPT_DELAY_MS = 400          // fixed per-attempt delay (slows rapid-fire)

function timingSafeEqual(a: string, b: string): boolean {
  // Length is intentionally leaked (negligible) but the content comparison is
  // constant-time: always walk the full length, never early-return.
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers)

  const rl = rateLimit(`auth:${ip}`, MAX_ATTEMPTS, WINDOW_MS, BLOCK_MS)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  // Fixed delay on every attempt — makes high-rate guessing impractical even
  // before the limiter trips, and evens out response timing.
  await new Promise(r => setTimeout(r, ATTEMPT_DELAY_MS))

  let password = ''
  try {
    const body = await request.json()
    password = typeof body?.password === 'string' ? body.password : ''
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const expected = process.env.TOOL_PASSWORD
  if (!expected) {
    return NextResponse.json({ error: 'Server is not configured' }, { status: 500 })
  }

  if (!timingSafeEqual(password, expected)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  // Success — clear this IP's failure history so a legitimate user who
  // fat-fingered a few times isn't left throttled.
  rateLimitReset(`auth:${ip}`)

  const token = await computeSessionToken()
  const response = NextResponse.json({ ok: true })
  response.cookies.set('ads-auth', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 8, // 8 hours
    path: '/',
  })
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set('ads-auth', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  })
  return response
}
