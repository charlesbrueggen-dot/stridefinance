// src/components/GoalProjection.jsx
// "What if" projection panel for a single goal — sliders for extra monthly
// contribution and an assumed annual return, computing a projected reach
// date and a small growth curve. Pure client-side math (src/lib/goalProjection.js).
import { useState, useMemo } from 'react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { fmtCurrency as fmt } from '../lib/format'
import { projectGoal, addMonths } from '../lib/goalProjection'

const INVESTMENT_LIKE = ['Retirement', 'Investment']

export default function GoalProjection({ goal }) {
  const [extra, setExtra] = useState(50)
  const [returnPct, setReturnPct] = useState(INVESTMENT_LIKE.includes(goal.category) ? 6 : 0)

  const result = useMemo(() => projectGoal({
    currentAmount: Number(goal.current_amount || 0),
    targetAmount: Number(goal.target_amount),
    monthlyContribution: extra,
    annualReturnPct: returnPct,
  }), [goal.current_amount, goal.target_amount, extra, returnPct])

  const reachDate = result.monthsToReach != null ? addMonths(new Date(), result.monthsToReach) : null

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--card-border)' }}>
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted">Extra monthly contribution</span>
          <span className="font-bold text-primary tnum">{fmt(extra)}/mo</span>
        </div>
        <input type="range" min="0" max="10000" step="50" value={extra} onChange={e => setExtra(Number(e.target.value))} />
        <input type="number" min="0" step="50" value={extra} onChange={e => setExtra(Math.max(0, Number(e.target.value) || 0))}
          className="input-field mt-2 text-sm" placeholder="Or type an exact amount" />
      </div>
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted">Assumed annual return</span>
          <span className="font-bold text-primary tnum">{returnPct}%</span>
        </div>
        <input type="range" min="0" max="12" step="0.5" value={returnPct} onChange={e => setReturnPct(Number(e.target.value))} />
      </div>

      <p className="text-sm font-semibold text-primary mb-2">
        {result.reached
          ? (result.monthsToReach === 0
            ? "You've already hit this goal."
            : `Projected to hit your goal in ${result.monthsToReach} month${result.monthsToReach !== 1 ? 's' : ''} — around ${reachDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}.`)
          : "At this rate you won't reach this goal within 50 years — try a higher contribution."}
      </p>

      {result.series.length > 1 && (
        <ResponsiveContainer width="100%" height={90}>
          <LineChart data={result.series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <Line type="monotone" dataKey="value" stroke="var(--positive)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
