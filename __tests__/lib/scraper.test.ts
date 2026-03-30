// __tests__/lib/scraper.test.ts
import { extractContent, inferTone } from '@/lib/scraper'

describe('inferTone', () => {
  it('returns urgent for urgency language', () => {
    expect(inferTone('limited time offer, act now!')).toBe('urgent')
  })

  it('returns professional for professional language', () => {
    expect(inferTone('trusted enterprise solution for professionals')).toBe('professional')
  })

  it('defaults to professional', () => {
    expect(inferTone('we sell products')).toBe('professional')
  })
})

describe('extractContent', () => {
  it('strips HTML and returns text content', () => {
    const html = '<html><body><h1>PPC Management</h1><p>We help businesses grow.</p><ul><li>No contracts</li><li>Certified Google Partner</li></ul></body></html>'
    const result = extractContent(html, 'https://example.com')
    expect(result.product).toContain('PPC Management')
    expect(result.usps).toContain('No contracts')
    expect(result.usps).toContain('Certified Google Partner')
    expect(result.raw_text).toContain('We help businesses grow')
  })

  it('uses meta description when available', () => {
    const html = '<html><head><meta name="description" content="Expert PPC for SMBs"></head><body><h1>PPC Agency</h1></body></html>'
    const result = extractContent(html, 'https://example.com')
    expect(result.audience).toBeTruthy()
  })
})
