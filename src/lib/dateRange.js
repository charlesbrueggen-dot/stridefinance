// src/lib/dateRange.js
// Shared "This month / Last month / All" quick filter used by transaction
// lists (Accounts, Expenses) alongside their existing search boxes.
export const DATE_RANGE_OPTIONS = [
  { value: 'all',  label: 'All' },
  { value: 'this', label: 'This month' },
  { value: 'last', label: 'Last month' },
]

export function inDateRange(dateStr, range) {
  if (range === 'all' || !dateStr) return true
  const d = new Date(dateStr)
  const now = new Date()
  if (range === 'this') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  if (range === 'last') {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth()
  }
  return true
}
