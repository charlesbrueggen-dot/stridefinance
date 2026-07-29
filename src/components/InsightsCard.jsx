// src/components/InsightsCard.jsx
// Renders the templated observations from src/lib/insights.js on the
// Dashboard. Purely presentational — the rules engine does all the work.
import { Link } from 'react-router-dom'
import { Sparkle, TrendingUp, AlertTriangle, Info } from 'lucide-react'

const TONE = {
  warning:  { Icon: AlertTriangle, color: 'var(--warning)',  bg: 'var(--warning-bg)' },
  positive: { Icon: TrendingUp,    color: 'var(--positive)', bg: 'var(--positive-bg)' },
  info:     { Icon: Info,          color: 'var(--info)',     bg: 'var(--info-bg)' },
}

export default function InsightsCard({ insights }) {
  if (!insights || insights.length === 0) return null
  return (
    <div className="card p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkle size={16} className="text-primary" />
        <p className="font-black text-primary">Insights</p>
      </div>
      <div className="space-y-2">
        {insights.slice(0, 4).map(insight => {
          const { Icon, color, bg } = TONE[insight.tone] || TONE.info
          return (
            <div key={insight.id} className="flex items-start gap-3 p-3 rounded-xl"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: bg, color }}>
                <Icon size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-primary">{insight.text}</p>
                {insight.starter && (
                  <Link to={`/coach?ask=${encodeURIComponent(insight.starter)}`}
                    className="text-xs font-semibold no-underline mt-1 inline-block hover:opacity-80"
                    style={{ color: 'var(--positive)' }}>
                    Ask Coach →
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
