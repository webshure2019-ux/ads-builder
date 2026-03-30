// __tests__/lib/ad-strength.test.ts
import { calculateAdStrength } from '@/lib/ad-strength'

const STRONG_HEADLINES = [
  'Expert PPC Management', 'Certified Google Partner', 'No Lock-In Contracts',
  'Grow Your Business Online', 'Google Ads That Convert', 'Transparent Reporting',
  'Free Campaign Audit', 'PPC Management Services', 'Maximise Your ROI Today',
  'Get More Qualified Leads', 'South Africa PPC Experts', 'Start Your Campaign Now',
  'Proven Results Guaranteed', 'Data-Driven PPC Strategy', 'Call Us For Free Quote',
]
const STRONG_DESCRIPTIONS = [
  'Webshure is a certified Google Partner offering expert PPC management with transparent reporting and no lock-in contracts.',
  'Stop wasting ad spend. Our Google Ads specialists build campaigns that drive qualified leads and measurable ROI.',
  'We manage Google Ads campaigns for businesses across South Africa. Get a free audit and start seeing results today.',
  'From Search to Performance Max, we handle every aspect of your Google Ads. No contracts. Just results.',
]

describe('calculateAdStrength', () => {
  it('returns excellent for full 15 headlines + 4 descriptions', () => {
    const result = calculateAdStrength(STRONG_HEADLINES, STRONG_DESCRIPTIONS, 'ppc management')
    expect(result.score).toBe('excellent')
    expect(result.numeric).toBeGreaterThanOrEqual(85)
  })

  it('returns poor for empty headlines', () => {
    const result = calculateAdStrength([], [], undefined)
    expect(result.score).toBe('poor')
  })

  it('returns average for 5 headlines + 2 descriptions', () => {
    const result = calculateAdStrength(STRONG_HEADLINES.slice(0, 5), STRONG_DESCRIPTIONS.slice(0, 2), undefined)
    expect(result.score).toBe('average')
  })

  it('includes a tip when keyword is missing from headlines', () => {
    const result = calculateAdStrength(
      ['Best Agency', 'Call Us Today', 'Get Results Now', 'No Contracts', 'Free Audit',
       'Grow Online', 'Expert Team', 'Proven Results', 'South Africa', 'Start Today',
       'Transparent', 'ROI Focused', 'Data Driven', 'We Deliver', 'Contact Us'],
      STRONG_DESCRIPTIONS,
      'google ads management'
    )
    expect(result.tips.some(t => t.includes('google ads management'))).toBe(true)
  })

  it('provides a positive tip when score is excellent', () => {
    const result = calculateAdStrength(STRONG_HEADLINES, STRONG_DESCRIPTIONS, 'ppc management')
    expect(result.tips.length).toBeGreaterThan(0)
  })
})
