// src/components/SetupChecklist.jsx
// Dismissible "getting started" card for the Dashboard — a completion ring
// over a short checklist, computed live from data the app already has (no
// schema change). Disappears once every step is done, or the user dismisses
// it manually; the dismissal is remembered per-user in localStorage.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, X } from 'lucide-react'

function Ring({ done, total, size = 44 }) {
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const pct = total > 0 ? done / total : 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card-border)" strokeWidth="4" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="var(--positive)" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="tnum"
        style={{ fontSize: 13, fontWeight: 800, fill: 'var(--text-primary)' }}>
        {done}/{total}
      </text>
    </svg>
  )
}

export default function SetupChecklist({ storageKey, items, title = 'Get set up', subtitle = 'A few quick steps to make Stride useful right away' }) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === '1')
  const doneCount = items.filter(i => i.done).length

  if (dismissed || doneCount === items.length) return null

  const dismiss = () => { localStorage.setItem(storageKey, '1'); setDismissed(true) }

  return (
    <div className="card p-5 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <Ring done={doneCount} total={items.length} />
          <div>
            <p className="font-black text-primary">{title}</p>
            <p className="text-muted text-xs">{subtitle}</p>
          </div>
        </div>
        <button onClick={dismiss} className="text-muted hover:text-primary flex-shrink-0" aria-label="Dismiss checklist">
          <X size={18} />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map(item => (
          <Link key={item.label} to={item.path} className="no-underline flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors hover:opacity-80"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: item.done ? 'var(--positive)' : 'transparent',
                border: item.done ? 'none' : '1.5px solid var(--card-border)',
                color: '#fff',
              }}>
              {item.done && <Check size={12} />}
            </span>
            <span className={`text-sm font-semibold ${item.done ? 'text-muted' : 'text-primary'}`}
              style={item.done ? { textDecoration: 'line-through' } : undefined}>
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
