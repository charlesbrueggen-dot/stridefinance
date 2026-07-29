// src/components/BillCalendar.jsx
// Month-grid view of everything with a known upcoming date — subscriptions,
// recurring expenses, recurring income. All from data the app already
// collects; this just aggregates and lays it out on a calendar.
import { useState, useMemo } from 'react'
import { CalendarDays } from 'lucide-react'
import MonthFlipper, { monthKeyNow } from './MonthFlipper'
import MerchantLogo from './MerchantLogo'
import { fmtCurrency as fmt } from '../lib/format'

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const KIND_COLOR = { subscription: 'var(--warning)', expense: 'var(--negative)', income: 'var(--positive)' }
const KIND_LABEL = { subscription: 'Subscriptions', expense: 'Bills', income: 'Income' }

export default function BillCalendar({ events }) {
  const [viewMonth, setViewMonth] = useState(monthKeyNow())

  const byDay = useMemo(() => {
    const map = {}
    events.forEach(e => {
      if (!e.date || e.date.slice(0, 7) !== viewMonth) return
      const day = Number(e.date.slice(8, 10))
      map[day] = map[day] || []
      map[day].push(e)
    })
    return map
  }, [events, viewMonth])

  const [y, m] = viewMonth.split('-').map(Number)
  const firstDow = new Date(y, m - 1, 1).getDay()
  const daysInMonth = new Date(y, m, 0).getDate()
  const todayKey = new Date().toISOString().slice(0, 10)

  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const monthEvents = Object.entries(byDay)
    .flatMap(([day, list]) => list.map(e => ({ ...e, day: Number(day) })))
    .sort((a, b) => a.day - b.day)

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-xs text-muted">
          {monthEvents.length} item{monthEvents.length !== 1 ? 's' : ''} this month
        </p>
        <MonthFlipper value={viewMonth} onChange={setViewMonth} />
      </div>

      <div className="grid grid-cols-7 gap-1 mb-4">
        {DOW.map((d, i) => (
          <div key={i} className="text-center text-xs font-bold text-muted py-1">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />
          const dateKey = `${viewMonth}-${String(day).padStart(2, '0')}`
          const dayEvents = byDay[day] || []
          const isToday = dateKey === todayKey
          return (
            <div key={i} className="rounded-lg flex flex-col items-center justify-start pt-1"
              style={{
                minHeight: 42,
                background: isToday ? 'var(--positive-bg)' : 'var(--input-bg)',
                border: isToday ? '1px solid var(--positive)' : '1px solid var(--card-border)',
              }}>
              <span className="text-xs font-semibold" style={{ color: isToday ? 'var(--positive)' : 'var(--text-muted)' }}>{day}</span>
              <div className="flex gap-0.5 flex-wrap justify-center mt-0.5 px-0.5">
                {dayEvents.slice(0, 4).map((e, idx) => (
                  <span key={idx} title={`${e.label} · ${fmt(e.amount)}`}
                    className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: KIND_COLOR[e.kind] }} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-4 flex-wrap mb-5 text-xs">
        {Object.entries(KIND_LABEL).map(([kind, label]) => (
          <span key={kind} className="flex items-center gap-1.5 text-muted">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: KIND_COLOR[kind] }} /> {label}
          </span>
        ))}
      </div>

      {monthEvents.length === 0 ? (
        <div className="text-center py-8 text-muted text-sm flex flex-col items-center gap-2">
          <CalendarDays size={22} className="opacity-50" />
          Nothing scheduled this month.
        </div>
      ) : (
        <div className="space-y-2">
          {monthEvents.map((e, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ border: '1px solid var(--card-border)' }}>
              <MerchantLogo name={e.label} FallbackIcon={CalendarDays} size={32}
                fallbackBg={`${KIND_COLOR[e.kind]}22`} fallbackColor={KIND_COLOR[e.kind]} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-primary text-sm truncate">{e.label}</p>
                <p className="text-xs text-muted">{KIND_LABEL[e.kind]} · {new Date(`${viewMonth}-${String(e.day).padStart(2, '0')}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
              </div>
              <p className="font-black text-sm tnum flex-shrink-0" style={{ color: e.kind === 'income' ? 'var(--positive-strong)' : 'var(--text-primary)' }}>
                {e.kind === 'income' ? '+' : ''}{fmt(e.amount)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
