// Compounds a loan/debt principal forward from its start date at a simple annual rate.
// Shared by Analytics (Loans tab) and the Loans page so both always agree on a given loan's
// current value. `asOf` defaults to now; net worth history (netWorthHistory.js) passes past
// month-end dates instead, to compound only up to that point in time rather than to today.
export const calcWithInterest = (principal, rate, startDate, asOf = new Date()) => {
  if (!rate || !startDate) return principal
  const years = (asOf - new Date(startDate + 'T12:00:00')) / (365.25 * 24 * 60 * 60 * 1000)
  if (years <= 0) return principal
  return principal * Math.pow(1 + rate / 100, years)
}
