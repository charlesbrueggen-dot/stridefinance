// src/lib/netWorthHistory.js
// Reconstructs a trailing monthly net worth series. There are no stored
// historical snapshots anywhere in the schema — everything here is derived
// from data the app already has:
//   • Cash: walks backward from the current total cash position using the
//     same month-by-month income/expense buckets bucketMonthlyTotals already
//     computes elsewhere (this month's ending cash minus this month's net =
//     last month's ending cash, and so on).
//   • Investments/assets: valued as of each month-end using today's
//     price/value (there's no historical price history to do better), only
//     counted once their purchase_date has passed.
//   • Loans: compounded with calcWithInterest up to each month-end instead of
//     to today, so the trend is a real interest-accrual curve, not a flat line.
import { bucketMonthlyTotals } from './savingsRate'
import { calcWithInterest } from './loanMath'

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function monthEndDate(year, month1to12) {
  return new Date(year, month1to12, 0, 23, 59, 59) // day 0 of next month = last day of this one
}

export function netWorthHistory({
  allIncome = [], allExpenses = [], currentCash = 0,
  investments = [], assets = [], loans = [],
  months = 12, now = new Date(),
}) {
  const buckets = bucketMonthlyTotals(allIncome, allExpenses, months, now)

  // Cash: walk backward from the current position, oldest to newest output order.
  const cashByKey = {}
  let runningCash = currentCash
  for (let i = buckets.length - 1; i >= 0; i--) {
    cashByKey[buckets[i].key] = runningCash
    runningCash -= buckets[i].net
  }

  return buckets.map(b => {
    const [y, m] = b.key.split('-').map(Number)
    const asOf = monthEndDate(y, m)

    const investValue = investments.reduce((s, i) => {
      if (i.purchase_date && new Date(i.purchase_date) > asOf) return s
      const v = i.type === 'Bond' ? (i.avg_cost || 0) : (i.shares || 0) * (i.current_price || i.avg_cost || 0)
      return s + v
    }, 0)

    const assetValue = assets.reduce((s, a) => {
      if (a.purchase_date && new Date(a.purchase_date) > asOf) return s
      return s + Number(a.value || 0)
    }, 0)

    const loanNet = loans.reduce((s, l) => {
      if (l.settled) return s
      const loanStart = new Date(l.loan_date + 'T12:00:00')
      if (loanStart > asOf) return s
      const value = calcWithInterest(Number(l.amount), Number(l.interest_rate) || 0, l.loan_date, asOf)
      return s + (l.type === 'lent' ? value : -value)
    }, 0)

    const cash = cashByKey[b.key] ?? 0
    return {
      key: b.key,
      label: `${MONTH_ABBR[m - 1]} '${String(y).slice(2)}`,
      cash, investments: investValue, assets: assetValue, loans: loanNet,
      total: cash + investValue + assetValue + loanNet,
    }
  })
}
