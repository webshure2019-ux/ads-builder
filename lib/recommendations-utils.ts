import type { Recommendation } from '@/types'

/**
 * Extracts a Recommendation[] from Claude's text response.
 * Claude is prompted to return only a JSON array, but may occasionally
 * include leading/trailing prose. We find the first [ and last ] to be safe.
 */
export function extractRecommendations(text: string): Recommendation[] {
  const start = text.indexOf('[')
  const end   = text.lastIndexOf(']')

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON array found in Claude response')
  }

  const parsed = JSON.parse(text.slice(start, end + 1))

  // Guard: JSON.parse succeeded but result is not an array
  // (e.g. Claude returned a JSON object like {"error":"..."} that happened
  // to have brackets in it — unlikely but possible)
  if (!Array.isArray(parsed)) {
    throw new Error('Claude response parsed but is not a JSON array')
  }

  return (parsed as Omit<Recommendation, 'status'>[]).map((r, i) => ({
    ...r,
    id:     r.id ?? `rec-${i}`,
    status: 'pending' as const,
  }))
}
