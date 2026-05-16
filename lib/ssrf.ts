// lib/ssrf.ts
//
// SSRF defence for the landing-page scraper. The previous guard only
// inspected the URL's hostname *string*, which is bypassable three ways:
//   1. A normal domain whose DNS A-record points at a private IP
//      (e.g. 169.254.169.254 — cloud metadata).
//   2. Numeric IPv4 encodings: https://2130706433/ , 0x7f000001 , 0177.0.0.1
//   3. DNS rebinding — host resolves public during the check, private at
//      connection time (TOCTOU).
//
// This module closes all three: it normalises numeric IP literals, resolves
// DNS up-front and validates every address, and — crucially — installs an
// undici connect-time `lookup` hook so the address the socket actually
// connects to is re-validated, defeating rebinding.

import dns from 'node:dns/promises'
import { isIP } from 'node:net'
import { Agent } from 'undici'

// ── IP range checks ───────────────────────────────────────────────────────
function isPrivateIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true // malformed → block
  const [a, b] = p
  if (a === 0)   return true                       // 0.0.0.0/8
  if (a === 10)  return true                       // 10.0.0.0/8
  if (a === 127) return true                       // loopback
  if (a === 169 && b === 254) return true          // link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true          // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true// CGNAT 100.64.0.0/10
  if (a >= 224)  return true                       // multicast / reserved
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique-local fc00::/7
  if (lower.startsWith('fe80')) return true                          // link-local
  // IPv4-mapped / -compatible (::ffff:a.b.c.d  /  ::a.b.c.d)
  const m = lower.match(/(?:::ffff:|::)((?:\d{1,3}\.){3}\d{1,3})$/)
  if (m) return isPrivateIPv4(m[1]!)
  return false
}

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) return isPrivateIPv4(ip)
  if (v === 6) return isPrivateIPv6(ip)
  return true // not a parseable IP → treat as unsafe
}

// ── Hostname normalisation (catch numeric IPv4 encodings) ─────────────────
// Returns a dotted-quad string if the hostname is *any* IPv4 literal
// encoding, else null (it's a real domain name).
function normaliseNumericIPv4(host: string): string | null {
  const h = host.trim()
  if (isIP(h) === 4) return h

  // Single decimal / hex / octal integer  → 32-bit IPv4
  if (/^(0x[0-9a-f]+|0[0-7]*|\d+)$/i.test(h)) {
    let n: number
    if (/^0x/i.test(h))      n = parseInt(h, 16)
    else if (/^0[0-7]+$/.test(h)) n = parseInt(h, 8)
    else                     n = parseInt(h, 10)
    if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) return null
    return [ (n>>>24)&255, (n>>>16)&255, (n>>>8)&255, n&255 ].join('.')
  }
  // Dotted with hex/octal parts (e.g. 0x7f.0.0.1 , 0177.0.0.1)
  const parts = h.split('.')
  if (parts.length >= 2 && parts.length <= 4 &&
      parts.every(x => /^(0x[0-9a-f]+|0[0-7]*|\d+)$/i.test(x))) {
    const nums = parts.map(x =>
      /^0x/i.test(x) ? parseInt(x, 16) : /^0[0-7]+$/.test(x) ? parseInt(x, 8) : parseInt(x, 10))
    if (nums.some(x => !Number.isFinite(x) || x < 0 || x > 255)) return null
    while (nums.length < 4) nums.splice(nums.length - 1, 0, 0)
    return nums.slice(0, 4).join('.')
  }
  return null
}

/**
 * Throws if `urlString` is not a plain https URL pointing at a public host.
 * Resolves DNS and validates every returned address.
 */
export async function assertSafeUrl(urlString: string): Promise<void> {
  let url: URL
  try { url = new URL(urlString) } catch { throw new Error('Invalid URL') }

  if (url.protocol !== 'https:') throw new Error('Only https:// URLs are allowed')
  if (url.username || url.password) throw new Error('URLs with credentials are not allowed')

  let host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')

  // Internal-looking hostnames
  if (host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Disallowed host')
  }

  // Numeric IPv4 encodings → normalise then range-check
  const numeric = normaliseNumericIPv4(host)
  if (numeric) host = numeric

  // Literal IP? validate directly, no DNS needed.
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Disallowed host (private address)')
    return
  }

  // Real domain — resolve and validate EVERY address.
  let addrs: { address: string }[]
  try {
    addrs = await dns.lookup(host, { all: true })
  } catch {
    throw new Error('Could not resolve host')
  }
  if (addrs.length === 0) throw new Error('Could not resolve host')
  for (const { address } of addrs) {
    if (isPrivateIp(address)) throw new Error('Disallowed host (resolves to a private address)')
  }
}

/**
 * fetch() with a connect-time guard. undici resolves DNS itself when it
 * opens the socket; the custom `lookup` re-validates that exact address,
 * so even if DNS rebinds between assertSafeUrl() and the request the
 * connection is refused.
 */
// undici's connect `lookup` hook. We re-resolve and reject private addresses
// at socket-connect time, which defeats DNS rebinding (TOCTOU) between the
// route's assertSafeUrl() and the actual request.
const guardedLookup = (
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, address: string, family: number) => void,
) => {
  dns.lookup(hostname, { all: true })
    .then(addrs => {
      const bad = addrs.find(a => isPrivateIp(a.address))
      if (bad) return cb(new Error(`Blocked private address ${bad.address}`), '', 0)
      const first = addrs[0]
      if (!first) return cb(new Error('Could not resolve host'), '', 0)
      cb(null, first.address, first.family)
    })
    .catch(err => cb(err instanceof Error ? err : new Error('DNS error'), '', 0))
}

export function ssrfSafeFetch(url: string, init?: RequestInit): Promise<Response> {
  const dispatcher = new Agent({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connect: { lookup: guardedLookup as any },
  })
  // `dispatcher` is a valid Node fetch (undici) option not yet in lib.dom types
  return fetch(url, { ...init, dispatcher } as RequestInit & { dispatcher: unknown })
}
