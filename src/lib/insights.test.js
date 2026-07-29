import { describe, it, expect } from 'vitest'
import { categorySpendInsights, goalPaceInsights, subscriptionRenewalInsights, savingsRateInsight } from './insights'

describe('categorySpendInsights', () => {
  it('flags a category spending significantly above its 3-month average', () => {
    const expenses = [
      { date: '2026-03-01', category: 'Dining', amount: 100 },
      { date: '2026-04-01', category: 'Dining', amount: 100 },
      { date: '2026-05-01', category: 'Dining', amount: 100 },
      { date: '2026-06-01', category: 'Dining', amount: 200 }, // 100% above avg
    ]
    const insights = categorySpendInsights(expenses, '2026-06')
    expect(insights).toHaveLength(1)
    expect(insights[0].tone).toBe('warning')
    expect(insights[0].text).toMatch(/Dining/)
  })

  it('ignores categories below the minimum average threshold (avoids noise on tiny amounts)', () => {
    const expenses = [
      { date: '2026-05-01', category: 'Misc', amount: 5 },
      { date: '2026-06-01', category: 'Misc', amount: 15 },
    ]
    expect(categorySpendInsights(expenses, '2026-06')).toHaveLength(0)
  })

  it('flags a category spending significantly below its average as positive', () => {
    const expenses = [
      { date: '2026-03-01', category: 'Shopping', amount: 200 },
      { date: '2026-04-01', category: 'Shopping', amount: 200 },
      { date: '2026-05-01', category: 'Shopping', amount: 200 },
      { date: '2026-06-01', category: 'Shopping', amount: 50 },
    ]
    const insights = categorySpendInsights(expenses, '2026-06')
    expect(insights[0].tone).toBe('positive')
  })
})

describe('goalPaceInsights', () => {
  const now = new Date(2026, 5, 15) // June 15, 2026

  it('computes required monthly savings for an incomplete goal with a future target date', () => {
    const goals = [{ id: '1', title: 'Vacation', target_amount: 1200, current_amount: 0, target_date: '2026-12-15' }]
    const insights = goalPaceInsights(goals, now)
    expect(insights).toHaveLength(1)
    expect(insights[0].text).toMatch(/Vacation/)
    expect(insights[0].text).toMatch(/\$200/) // 1200 / 6 months remaining
  })

  it('skips goals that are already fully funded', () => {
    const goals = [{ id: '1', title: 'Done', target_amount: 100, current_amount: 100, target_date: '2026-12-15' }]
    expect(goalPaceInsights(goals, now)).toHaveLength(0)
  })

  it('skips goals with no target date', () => {
    const goals = [{ id: '1', title: 'No date', target_amount: 100, current_amount: 0, target_date: null }]
    expect(goalPaceInsights(goals, now)).toHaveLength(0)
  })
})

describe('subscriptionRenewalInsights', () => {
  const now = new Date(2026, 5, 15)

  it('summarizes subscriptions renewing within the window', () => {
    const subs = [
      { name: 'Netflix', amount: 15, next_billing_date: '2026-06-18' },
      { name: 'Spotify', amount: 10, next_billing_date: '2026-07-20' }, // outside window
    ]
    const insights = subscriptionRenewalInsights(subs, 7, now)
    expect(insights).toHaveLength(1)
    expect(insights[0].text).toMatch(/1 subscription/)
  })

  it('returns nothing when none are renewing soon', () => {
    const subs = [{ name: 'Netflix', amount: 15, next_billing_date: '2026-08-01' }]
    expect(subscriptionRenewalInsights(subs, 7, now)).toHaveLength(0)
  })
})

describe('savingsRateInsight', () => {
  it('praises a healthy savings rate', () => {
    expect(savingsRateInsight('25.0')[0].tone).toBe('positive')
  })
  it('warns on a low savings rate', () => {
    expect(savingsRateInsight('5.0')[0].tone).toBe('warning')
  })
  it('says nothing in the unremarkable middle range', () => {
    expect(savingsRateInsight('15.0')).toHaveLength(0)
  })
})
