// __tests__/lib/claude.test.ts
import { buildPrompt, parseAssetsResponse } from '@/lib/claude'
import type { Brief } from '@/types'

const mockBrief: Brief = {
  product: 'PPC Management',
  audience: 'Small businesses',
  usps: ['Certified Google Partner', 'No contracts', 'Transparent reporting'],
  tone: 'professional',
  goal: 'lead_gen',
  brand_name: 'Webshure',
  keywords: [
    { text: 'ppc management', match_type: 'exact', selected: true },
    { text: 'google ads agency', match_type: 'phrase', selected: true },
    { text: 'paid search', match_type: 'broad', selected: false },
  ],
}

describe('buildPrompt', () => {
  it('includes brand name in prompt', () => {
    const prompt = buildPrompt(mockBrief, 'search')
    expect(prompt).toContain('Webshure')
  })

  it('includes selected keywords only', () => {
    const prompt = buildPrompt(mockBrief, 'search')
    expect(prompt).toContain('ppc management')
    expect(prompt).toContain('google ads agency')
    expect(prompt).not.toContain('paid search (broad)')
  })

  it('requests 15 headlines for search campaigns', () => {
    const prompt = buildPrompt(mockBrief, 'search')
    expect(prompt).toContain('15')
  })

  it('requests search_themes for pmax campaigns', () => {
    const prompt = buildPrompt(mockBrief, 'pmax')
    expect(prompt).toContain('search_themes')
  })
})

describe('parseAssetsResponse', () => {
  it('parses valid JSON response', () => {
    const json = JSON.stringify({
      headlines: ['Headline One', 'Headline Two'],
      descriptions: ['Description one here with more text to fill the space out nicely.'],
    })
    const result = parseAssetsResponse(json)
    expect(result.headlines).toHaveLength(2)
    expect(result.descriptions).toHaveLength(1)
  })

  it('throws on invalid JSON', () => {
    expect(() => parseAssetsResponse('not json')).toThrow()
  })
})
