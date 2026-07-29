import { describe, it, expect } from 'vitest'
import { autoCategorize, applyUserRules } from './useTransactions'

describe('autoCategorize', () => {
  it('categorizes rent paid through a payment app as Needs/Rent, not a payment-app income transfer', () => {
    const result = autoCategorize('Rent Payment - Zelle')
    expect(result.kind).toBe('expense')
    expect(result.category).toBe('Needs')
    expect(result.subcategory).toBe('Rent')
  })

  it('still categorizes a generic payment-app transfer as income when nothing more specific matches', () => {
    const result = autoCategorize('Zelle from John Smith')
    expect(result.kind).toBe('income')
    expect(result.source).toBe('Transfer In')
  })

  it('categorizes payroll as income', () => {
    const result = autoCategorize('Payroll Direct Deposit - Acme Corp')
    expect(result.kind).toBe('income')
    expect(result.source).toBe('Salary')
  })

  it('categorizes groceries as Needs even when paid via a payment app', () => {
    const result = autoCategorize('Whole Foods Market - Venmo')
    expect(result.kind).toBe('expense')
    expect(result.category).toBe('Needs')
    expect(result.subcategory).toBe('Groceries')
  })

  it('falls back to expense/Wants/Other for anything unrecognized', () => {
    const result = autoCategorize('XYZ Unknown Merchant 12345')
    expect(result).toEqual({ kind: 'expense', category: 'Wants', subcategory: 'Other', source: null, auto: false })
  })

  it('prefers a matching user rule over the built-in keyword rules', () => {
    const rules = [{ match_field: 'description', match_value: 'acme corp', set_kind: 'expense', set_category: 'Needs', set_subcategory: 'Utilities', priority: 0 }]
    // Would normally match the built-in "Payroll" -> income rule, but the user's own rule wins.
    const result = autoCategorize('Payroll Direct Deposit - Acme Corp', '', rules)
    expect(result.kind).toBe('expense')
    expect(result.subcategory).toBe('Utilities')
    expect(result.fromRule).toBe(true)
  })

  it('falls back to the built-in rules when no user rule matches', () => {
    const rules = [{ match_field: 'description', match_value: 'totally unrelated text', set_kind: 'income', priority: 5 }]
    const result = autoCategorize('Payroll Direct Deposit', '', rules)
    expect(result.kind).toBe('income')
    expect(result.source).toBe('Salary')
  })
})

describe('applyUserRules', () => {
  it('returns null when no rules are given', () => {
    expect(applyUserRules([], 'anything')).toBeNull()
  })

  it('matches against the merchant field when match_field is "merchant"', () => {
    const rules = [{ match_field: 'merchant', match_value: 'joe', set_category: 'Wants', set_subcategory: 'Dining', priority: 0 }]
    const result = applyUserRules(rules, 'Card purchase', "Joe's Coffee Shop")
    expect(result.category).toBe('Wants')
    expect(result.subcategory).toBe('Dining')
  })

  it('picks the highest-priority rule when more than one matches', () => {
    const rules = [
      { match_field: 'description', match_value: 'coffee', set_subcategory: 'Other', priority: 0 },
      { match_field: 'description', match_value: 'coffee', set_subcategory: 'Dining', priority: 10 },
    ]
    const result = applyUserRules(rules, 'Coffee shop purchase')
    expect(result.subcategory).toBe('Dining')
  })
})
