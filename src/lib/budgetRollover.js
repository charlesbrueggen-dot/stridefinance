// src/lib/budgetRollover.js
// Envelope-style rollover for a single budget row: carries unspent (or
// overspent) amounts from prior months into this month's effective limit.
// No separate ledger table — computed on the fly from the same expense
// history Budgets.jsx already has, capped at a trailing window so a
// long-lived budget doesn't require scanning unbounded history.
export function computeRolloverCarry(budget, allExpenses, viewMonth, monthsBack = 12) {
  if (!budget.rollover) return 0
  const createdMonth = budget.created_at ? budget.created_at.slice(0, 7) : null
  const [y0, m0] = viewMonth.split('-').map(Number)

  let carry = 0
  for (let i = monthsBack; i >= 1; i--) {
    const d = new Date(y0, m0 - 1 - i, 1)
    const key = d.toISOString().slice(0, 7)
    if (createdMonth && key < createdMonth) continue // budget didn't exist yet that month
    const spent = allExpenses
      .filter(e => e.date && e.date.slice(0, 7) === key && e.category === budget.category && (e.subcategory || 'Other') === budget.subcategory)
      .reduce((s, e) => s + Number(e.amount), 0)
    carry += Number(budget.monthly_limit) - spent
  }
  return carry
}
