// lib/auth.ts
import { NextRequest, NextResponse } from 'next/server'

/**
 * Computes a deterministic session token by signing TOOL_PASSWORD with SESSION_SECRET
 * using HMAC-SHA-256. The cookie stores this derived token, never the raw password.
 * Works in both Node.js (API routes) and Edge (middleware) runtimes.
 */
export async function computeSessionToken(): Promise<string> {
  const secret   = process.env.SESSION_SECRET
  const password = process.env.TOOL_PASSWORD

  // Hard-fail at startup if secrets are missing — no insecure fallbacks
  if (!secret)   throw new Error('SESSION_SECRET environment variable is required')
  if (!password) throw new Error('TOOL_PASSWORD environment variable is required')

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(password))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Verifies the ads-auth cookie in an API route.
 * Returns a 401 NextResponse if not authenticated, or null if authenticated.
 * Usage: const auth = await requireAuth(request); if (auth) return auth;
 */
export async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
  const cookie = request.cookies.get('ads-auth')?.value
  if (!cookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const expected = await computeSessionToken()
  if (cookie !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return null
}
