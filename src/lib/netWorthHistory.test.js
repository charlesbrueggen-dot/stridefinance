import { describe, it, expect } from 'vitest'
import { netWorthHistory } from './netWorthHistory'

const FIXED_NOW = new Date(2026, 5, 15) // June 15, 2026

describe('netWorthHistory', () => {
  it('the most recent bucket equals the current cash position when there is no other net worth data', () => {
    const series = netWorthHistory({ currentCash: 5000, months: 3, now: FIXED_NOW })
    expect(series).toHaveLength(3)
    expect(series[series.length - 1].cash).toBe(5000)
    expect(series[series.length - 1].total).toBe(5000)
  })

  it('walks cash backward using each month\'s net income minus expenses', () => {
    const allIncome   = [{ date: '2026-06-01', amount: 1000 }]
    const allExpenses = [{ date: '2026-06-01', amount: 400 }]
    // June net = +600. Current cash (as of now) is 5000, so May-end cash should be 5000 - 600 = 4400.
    const series = netWorthHistory({ allIncome, allExpenses, currentCash: 5000, months: 2, now: FIXED_NOW })
    const june = series.find(s => s.key === '2026-06')
    const may  = series.find(s => s.key === '2026-05')
    expect(june.cash).toBe(5000)
    expect(may.cash).toBe(4400)
  })

  it('only counts an investment once its purchase date has passed', () => {
    const investments = [{ type: 'Stock', shares: 10, avg_cost: 100, current_price: 120, purchase_date: '2026-06-01' }]
    const series = netWorthHistory({ investments, months: 3, now: FIXED_NOW })
    const april = series.find(s => s.key === '2026-04')
    const june  = series.find(s => s.key === '2026-06')
    expect(april.investments).toBe(0)
    expect(june.investments).toBe(1200)
  })

  it('counts an investment with no purchase_date at every month (assumed always owned)', () => {
    const investments = [{ type: 'Stock', shares: 5, avg_cost: 50, current_price: 60 }]
    const series = netWorthHistory({ investments, months: 2, now: FIXED_NOW })
    expect(series.every(s => s.investments === 300)).toBe(true)
  })

  it('treats a settled loan as contributing nothing', () => {
    const loans = [{ type: 'lent', amount: 1000, interest_rate: 0, loan_date: '2026-01-01', settled: true }]
    const series = netWorthHistory({ loans, months: 2, now: FIXED_NOW })
    expect(series.every(s => s.loans === 0)).toBe(true)
  })

  it('excludes a loan from months before it existed', () => {
    const loans = [{ type: 'borrowed', amount: 500, interest_rate: 0, loan_date: '2026-06-01', settled: false }]
    const series = netWorthHistory({ loans, months: 3, now: FIXED_NOW })
    const april = series.find(s => s.key === '2026-04')
    const june  = series.find(s => s.key === '2026-06')
    expect(april.loans).toBe(0)
    expect(june.loans).toBe(-500)
  })
})
