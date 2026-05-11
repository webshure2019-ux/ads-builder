/**
 * Shared error helpers for API routes that call the Google Ads API.
 *
 * Google Ads throws gRPC status objects that are NOT instanceof Error, so a
 * plain `err.message` check silently falls through to the fallback string.
 * Use `googleAdsErrorMessage()` everywhere instead.
 */

/**
 * Extracts a human-readable message from any thrown value and translates
 * known Google Ads auth failures into actionable instructions.
 */
export function googleAdsErrorMessage(err: unknown, fallback: string): string {
  const raw = extractRaw(err)

  // Expired / revoked OAuth2 refresh token — most common production breakage.
  if (raw.toLowerCase().includes('invalid_grant')) {
    return (
      'Google Ads token expired — go to Vercel → Project Settings → ' +
      'Environment Variables, update GOOGLE_ADS_REFRESH_TOKEN with a fresh ' +
      'token, then redeploy.'
    )
  }

  return raw || fallback
}

/** Raw string from any thrown value — Error, gRPC status object, or primitive. */
function extractRaw(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
    if (typeof obj.details === 'string') return obj.details
    try { return JSON.stringify(err) } catch { /* ignore */ }
  }
  return String(err)
}
