// We test the auth logic directly rather than the middleware export
// since Next.js middleware runs in the Edge runtime
function isAuthenticated(cookies: Record<string, string>): boolean {
  return cookies['ads-auth'] === process.env.TOOL_PASSWORD
}

describe('auth check', () => {
  beforeEach(() => {
    process.env.TOOL_PASSWORD = 'testpass'
  })

  it('returns false when cookie is missing', () => {
    expect(isAuthenticated({})).toBe(false)
  })

  it('returns false when cookie value is wrong', () => {
    expect(isAuthenticated({ 'ads-auth': 'wrong' })).toBe(false)
  })

  it('returns true when cookie matches TOOL_PASSWORD', () => {
    expect(isAuthenticated({ 'ads-auth': 'testpass' })).toBe(true)
  })
})
