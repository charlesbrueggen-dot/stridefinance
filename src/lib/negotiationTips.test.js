import { describe, it, expect } from 'vitest'
import { negotiationTips, negotiationCoachPrompt } from './negotiationTips'

describe('negotiationTips', () => {
  it('leads with the price-increase talking point when the price rose', () => {
    const tips = negotiationTips({ name: 'Netflix', amount: 17.99, previous_amount: 15.99 })
    expect(tips[0]).toMatch(/\$15\.99/)
    expect(tips[0]).toMatch(/\$17\.99/)
  })

  it('omits the price-increase tip when there was no price change on file', () => {
    const tips = negotiationTips({ name: 'Netflix', amount: 15.99, previous_amount: null })
    expect(tips.every(t => !t.includes('went from'))).toBe(true)
  })

  it('always includes general negotiation tactics', () => {
    const tips = negotiationTips({ name: 'Netflix', amount: 15.99, previous_amount: null })
    expect(tips.length).toBeGreaterThan(2)
  })
})

describe('negotiationCoachPrompt', () => {
  it('references the price change when one exists', () => {
    const prompt = negotiationCoachPrompt({ name: 'Spotify', amount: 12, previous_amount: 10, frequency: 'monthly' })
    expect(prompt).toMatch(/Spotify/)
    expect(prompt).toMatch(/\$10\.00/)
    expect(prompt).toMatch(/\$12\.00/)
  })

  it('falls back to the current price and frequency with no price change', () => {
    const prompt = negotiationCoachPrompt({ name: 'Spotify', amount: 12, previous_amount: null, frequency: 'monthly' })
    expect(prompt).toMatch(/\$12\.00\/monthly/)
  })
})
