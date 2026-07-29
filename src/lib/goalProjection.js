// src/lib/goalProjection.js
// Pure math for the Goals page's "Project" panel — projects forward month by
// month from a goal's current savings, given an extra monthly contribution
// and an assumed annual return, until the target is reached (or maxMonths
// runs out, e.g. contribution is $0 and it'll never get there).
export function projectGoal({ currentAmount, targetAmount, monthlyContribution, annualReturnPct = 0, maxMonths = 600 }) {
  const monthlyRate = annualReturnPct / 100 / 12
  let value = Math.max(0, currentAmount)
  const series = [{ month: 0, value }]

  if (value >= targetAmount) return { monthsToReach: 0, series, reached: true }

  let month = 0
  while (value < targetAmount && month < maxMonths) {
    value = value * (1 + monthlyRate) + monthlyContribution
    month++
    series.push({ month, value })
  }
  const reached = value >= targetAmount
  return { monthsToReach: reached ? month : null, series, reached }
}

export function addMonths(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}
