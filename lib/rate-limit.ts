// lib/rate-limit.ts
//
// Best-effort in-memory sliding-window rate limiter, keyed by client IP.
//
// Caveat: Vercel serverless functions are stateless and horizontally scaled,
// so this map is per-instance, not global. It is NOT a substitute for a
// shared store (Vercel KV / Upstash) under a determined distributed attack —
// but it meaningfully raises the cost of the common case (a single attacker
// hammering the login from one IP hitting a warm instance) and adds a hard
// per-attempt delay that slows brute force regardless of instance affinity.

interface Bucket {
  hits:      number[]   // timestamps (ms) within the window
  blockedUntil: number  // epoch ms; 0 = not blocked
}

const buckets = new Map<string, Bucket>()

// Periodic cleanup so the map can't grow unbounded on a long-lived instance.
const SWEEP_EVERY_MS = 10 * 60_000
let lastSweep = Date.now()

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < SWEEP_EVERY_MS) return
  lastSweep = now
  for (const [key, b] of Array.from(buckets.entries())) {
    const fresh = b.hits.filter((t: number) => now - t < windowMs)
    if (fresh.length === 0 && b.blockedUntil < now) buckets.delete(key)
    else b.hits = fresh
  }
}

export interface RateLimitResult {
  allowed:    boolean
  retryAfter: number   // seconds the caller should wait (0 when allowed)
  remaining:  number
}

/**
 * Sliding-window limiter.
 * @param key        Stable identifier (e.g. client IP).
 * @param limit      Max attempts permitted within `windowMs`.
 * @param windowMs   Window length in milliseconds.
 * @param blockMs    How long to hard-block once the limit is exceeded.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  blockMs: number,
): RateLimitResult {
  const now = Date.now()
  sweep(now, windowMs)

  const b = buckets.get(key) ?? { hits: [], blockedUntil: 0 }

  // Currently in a hard block?
  if (b.blockedUntil > now) {
    buckets.set(key, b)
    return { allowed: false, retryAfter: Math.ceil((b.blockedUntil - now) / 1000), remaining: 0 }
  }

  // Drop timestamps outside the window
  b.hits = b.hits.filter((t: number) => now - t < windowMs)

  if (b.hits.length >= limit) {
    b.blockedUntil = now + blockMs
    buckets.set(key, b)
    return { allowed: false, retryAfter: Math.ceil(blockMs / 1000), remaining: 0 }
  }

  b.hits.push(now)
  buckets.set(key, b)
  return { allowed: true, retryAfter: 0, remaining: Math.max(0, limit - b.hits.length) }
}

/** Clear a key's failure history (call on a successful login). */
export function rateLimitReset(key: string) {
  buckets.delete(key)
}

/** Pull the best-guess client IP from a request's forwarding headers. */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return headers.get('x-real-ip')?.trim() || 'unknown'
}
