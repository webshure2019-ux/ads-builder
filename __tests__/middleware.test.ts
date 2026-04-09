// Tests for auth token logic
// The cookie stores an HMAC-SHA-256 derived token, not the raw password.
// We test the derivation logic to ensure it's consistent and non-trivial.

async function computeToken(password: string, secret: string): Promise<string> {
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

describe('session token derivation', () => {
  it('token does not equal the raw password', async () => {
    const token = await computeToken('testpass', 'mysecret')
    expect(token).not.toBe('testpass')
  })

  it('produces a 64-character hex string (SHA-256)', async () => {
    const token = await computeToken('testpass', 'mysecret')
    expect(token).toHaveLength(64)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('same inputs always produce the same token (deterministic)', async () => {
    const a = await computeToken('testpass', 'mysecret')
    const b = await computeToken('testpass', 'mysecret')
    expect(a).toBe(b)
  })

  it('different passwords produce different tokens', async () => {
    const a = await computeToken('testpass', 'mysecret')
    const b = await computeToken('otherpass', 'mysecret')
    expect(a).not.toBe(b)
  })

  it('different secrets produce different tokens', async () => {
    const a = await computeToken('testpass', 'secret1')
    const b = await computeToken('testpass', 'secret2')
    expect(a).not.toBe(b)
  })
})
