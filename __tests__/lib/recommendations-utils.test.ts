import { extractRecommendations } from '@/lib/recommendations-utils'
import type { Recommendation } from '@/types'

const VALID_REC: Omit<Recommendation, 'status'> = {
  id:          'rec-1',
  category:    'keyword',
  priority:    8,
  title:       "Pause 'cheap widgets' — $280 spent, 0 conversions",
  reasoning:   'This keyword spent $280 with 0 conversions.',
  impact:      'Est. saves ~$280/mo',
  action_type: 'pause_keyword',
  action_data: { keyword_id: '123', ad_group_id: '456', campaign_id: '789' },
  applicable:  true,
}

describe('extractRecommendations', () => {
  it('parses a valid JSON array and adds status: pending to each item', () => {
    const text = JSON.stringify([VALID_REC])
    const result = extractRecommendations(text)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('pending')
    expect(result[0].title).toBe(VALID_REC.title)
  })

  it('extracts JSON when wrapped in prose', () => {
    const text = `Here are the recommendations:\n[\n${JSON.stringify(VALID_REC)}\n]\nEnd.`
    const result = extractRecommendations(text)
    expect(result).toHaveLength(1)
    expect(result[0].priority).toBe(8)
  })

  it('assigns fallback id when rec has no id', () => {
    const noId = { ...VALID_REC, id: undefined }
    const text = JSON.stringify([noId])
    const result = extractRecommendations(text)
    expect(result[0].id).toBe('rec-0')
  })

  it('handles multiple recommendations sorted as returned', () => {
    const recs = [
      { ...VALID_REC, id: 'rec-1', priority: 8 },
      { ...VALID_REC, id: 'rec-2', priority: 5 },
    ]
    const result = extractRecommendations(JSON.stringify(recs))
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('rec-1')
  })

  it('throws when no JSON array is found', () => {
    expect(() => extractRecommendations('No array here')).toThrow('No JSON array')
  })

  it('throws when JSON is malformed', () => {
    expect(() => extractRecommendations('[{bad json}')).toThrow()
  })

  it('throws when [ appears after ]', () => {
    expect(() => extractRecommendations('] then [stuff')).toThrow('No JSON array')
  })
})
