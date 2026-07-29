// src/components/MonthFlipper.jsx
// Sleek "‹ July 2026 ›" pill for stepping between months. `value`/`onChange`
// use the same 'YYYY-MM' key already used across the app (Dashboard, Budgets,
// Analytics all slice dates with .slice(0, 7)), so no new date format to learn.
import { ChevronLeft, ChevronRight } from 'lucide-react'

export const monthKeyNow = () => new Date().toISOString().slice(0, 7)

export function shiftMonthKey(key, delta) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return d.toISOString().slice(0, 7)
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default function MonthFlipper({ value, onChange }) {
  const atMax = value >= monthKeyNow()
  return (
    <div className="inline-flex items-center gap-1 rounded-full px-1.5 py-1"
      style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
      <button
        type="button"
        onClick={() => onChange(shiftMonthKey(value, -1))}
        className="w-7 h-7 rounded-full flex items-center justify-center text-muted transition-colors hover:text-primary"
        style={{ background: 'transparent' }}
        aria-label="Previous month"
      >
        <ChevronLeft size={16} />
      </button>
      <span
        key={value}
        className="text-sm font-bold text-primary px-1 tnum"
        style={{ minWidth: 118, textAlign: 'center', display: 'inline-block', animation: 'page-fade 0.2s ease' }}
      >
        {monthLabel(value)}
      </span>
      <button
        type="button"
        onClick={() => !atMax && onChange(shiftMonthKey(value, 1))}
        disabled={atMax}
        className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
        style={{ background: 'transparent', color: atMax ? 'var(--card-border)' : 'var(--text-muted)', cursor: atMax ? 'default' : 'pointer' }}
        aria-label="Next month"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
