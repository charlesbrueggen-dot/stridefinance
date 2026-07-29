import { describe, it, expect } from 'vitest'
import { projectGoal, addMonths } from './goalProjection'

describe('projectGoal', () => {
  it('reports already reached when current amount meets or exceeds the target', () => {
    const result = projectGoal({ currentAmount: 500, targetAmount: 500, monthlyContribution: 0, annualReturnPct: 0 })
    expect(result.reached).toBe(true)
    expect(result.monthsToReach).toBe(0)
  })

  it('computes months to reach a target with no investment return (pure contributions)', () => {
    const result = projectGoal({ currentAmount: 0, targetAmount: 1000, monthlyContribution: 100, annualReturnPct: 0 })
    expect(result.reached).toBe(true)
    expect(result.monthsToReach).toBe(10)
  })

  it('reaches the target faster with a positive assumed return than with none', () => {
    const noReturn = projectGoal({ currentAmount: 0, targetAmount: 10000, monthlyContribution: 200, annualReturnPct: 0 })
    const withReturn = projectGoal({ currentAmount: 0, targetAmount: 10000, monthlyContribution: 200, annualReturnPct: 8 })
    expect(withReturn.monthsToReach).toBeLessThanOrEqual(noReturn.monthsToReach)
  })

  it('never reaches the target with zero contribution and zero return (caps at maxMonths)', () => {
    const result = projectGoal({ currentAmount: 100, targetAmount: 1000, monthlyContribution: 0, annualReturnPct: 0, maxMonths: 24 })
    expect(result.reached).toBe(false)
    expect(result.monthsToReach).toBeNull()
    expect(result.series.length).toBe(25) // month 0 through 24 inclusive
  })
})

describe('addMonths', () => {
  it('adds the given number of months to a date', () => {
    const result = addMonths('2026-01-15', 3)
    expect(result.getMonth()).toBe(3) // April (0-indexed)
  })
})
