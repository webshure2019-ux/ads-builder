// lib/ad-strength.ts
import { AdStrength, AdStrengthResult } from '@/types'

export function calculateAdStrength(
  headlines: string[],
  descriptions: string[],
  primaryKeyword: string | undefined
): AdStrengthResult {
  const tips: string[] = []
  let score = 0

  // 1. Headline count — 30 points
  const hCount = headlines.filter(h => h.trim().length > 0).length
  if (hCount >= 15) score += 30
  else if (hCount >= 10) score += 20
  else if (hCount >= 5) score += 10
  if (hCount < 15) tips.push(`Add more headlines — you have ${hCount}/15.`)

  // 2. Description count — 20 points
  const dCount = descriptions.filter(d => d.trim().length > 0).length
  if (dCount >= 4) score += 20
  else if (dCount >= 2) score += 10
  if (dCount < 4) tips.push(`Add more descriptions — you have ${dCount}/4.`)

  // 3. Headline uniqueness — 20 points
  const unique = new Set(headlines.map(h => h.toLowerCase().trim()))
  const ratio = unique.size / Math.max(hCount, 1)
  if (ratio >= 0.9) score += 20
  else if (ratio >= 0.7) score += 10
  else tips.push('Several headlines are too similar. Make each headline unique.')

  // 4. Character utilisation — 15 points
  const avgLen = hCount > 0
    ? headlines.reduce((s, h) => s + h.length, 0) / hCount
    : 0
  if (avgLen >= 24) score += 15
  else if (avgLen >= 15) score += 8
  else tips.push('Headlines are too short. Aim for 24–30 characters each.')

  // 5. Keyword inclusion — 15 points
  if (primaryKeyword) {
    const kw = primaryKeyword.toLowerCase()
    const withKw = headlines.filter(h => h.toLowerCase().includes(kw)).length
    if (withKw >= 3) score += 15
    else if (withKw >= 1) score += 8
    else tips.push(`Include the keyword "${primaryKeyword}" in at least 3 headlines.`)
  } else {
    score += 15
  }

  const grade: AdStrength =
    score >= 85 ? 'excellent' :
    score >= 65 ? 'good' :
    score >= 40 ? 'average' : 'poor'

  if (tips.length === 0) tips.push('Excellent! Your ad assets are well-optimised.')

  return { score: grade, numeric: score, tips }
}
