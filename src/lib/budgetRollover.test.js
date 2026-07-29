import { describe, it, expect } from 'vitest'
import { computeRolloverCarry } from './budgetRollover'

describe('computeRolloverCarry', () => {
  it('returns 0 when rollover is disabled, regardless of history', () => {
    const budget = { rollover: false, category: 'Needs', subcategory: 'Groceries', monthly_limit: 300 }
    const expenses = [{ date: '2026-05-01', category: 'Needs', subcategory: 'Groceries', amount: 100 }]
    expect(computeRolloverCarry(budget, expenses, '2026-06')).toBe(0)
  })

  it('carries an unspent surplus forward as a positive carry', () => {
    const budget = { rollover: true, category: 'Needs', subcategory: 'Groceries', monthly_limit: 300, created_at: '2026-01-01' }
    // Spent only 200 of a 300 limit in May -> +100 surplus carried into June.
    const expenses = [{ date: '2026-05-15', category: 'Needs', subcategory: 'Groceries', amount: 200 }]
    expect(computeRolloverCarry(budget, expenses, '2026-06', 1)).toBe(100)
  })

  it('carries an overspend forward as a negative carry', () => {
    const budget = { rollover: true, category: 'Needs', subcategory: 'Groceries', monthly_limit: 300, created_at: '2026-01-01' }
    const expenses = [{ date: '2026-05-15', category: 'Needs', subcategory: 'Groceries', amount: 400 }]
    expect(computeRolloverCarry(budget, expenses, '2026-06', 1)).toBe(-100)
  })

  it('ignores months before the budget existed', () => {
    const budget = { rollover: true, category: 'Wants', subcategory: 'Dining', monthly_limit: 100, created_at: '2026-06-01' }
    const expenses = [{ date: '2026-05-01', category: 'Wants', subcategory: 'Dining', amount: 1000 }] // huge overspend, but before creation
    expect(computeRolloverCarry(budget, expenses, '2026-06', 3)).toBe(0)
  })

  it('ignores expenses from a different category/subcategory', () => {
    const budget = { rollover: true, category: 'Needs', subcategory: 'Groceries', monthly_limit: 300, created_at: '2026-01-01' }
    const expenses = [{ date: '2026-05-15', category: 'Wants', subcategory: 'Dining', amount: 5000 }]
    expect(computeRolloverCarry(budget, expenses, '2026-06', 1)).toBe(300) // full unspent limit carried, unaffected by unrelated category
  })
})
