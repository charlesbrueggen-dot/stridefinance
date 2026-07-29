// src/lib/insights.js
// Deterministic, client-side "coach nudge" rules — templated observations
// over data the app already has. No AI call involved, so these always work
// even in mock/dev mode (unlike the AI Coach chat, which needs a configured
// backend). Each insight optionally carries a `starter` — a prompt to hand
// to AI Coach for a deeper, personalized follow-up.
import { fmtCurrency as fmt } from './format'

const priorMonthKeys = (viewMonth, count) => {
  const [y, m] = viewMonth.split('-').map(Number)
  const keys = []
  for (let i = 1; i <= count; i++) keys.push(new Date(y, m - 1 - i, 1).toISOString().slice(0, 7))
  return keys
}

// Compares each category's spend this month against its trailing 3-month
// average. Ignores categories with too little history/spend to be meaningful.
export function categorySpendInsights(allExpenses, viewMonth, { minAvg = 20, thresholdPct = 25 } = {}) {
  const priorMonths = priorMonthKeys(viewMonth, 3)
  const byCategoryMonth = {}
  allExpenses.forEach(e => {
    if (!e.date) return
    const key = e.date.slice(0, 7)
    if (key !== viewMonth && !priorMonths.includes(key)) return
    const cat = e.category || 'Other'
    byCategoryMonth[cat] = byCategoryMonth[cat] || {}
    byCategoryMonth[cat][key] = (byCategoryMonth[cat][key] || 0) + Number(e.amount)
  })

  const insights = []
  Object.entries(byCategoryMonth).forEach(([cat, months]) => {
    const current  = months[viewMonth] || 0
    const priorSum = priorMonths.reduce((s, k) => s + (months[k] || 0), 0)
    const avg      = priorSum / priorMonths.length
    if (avg < minAvg || current < minAvg) return
    const pctDiff = ((current - avg) / avg) * 100
    if (pctDiff >= thresholdPct) {
      insights.push({
        id: `cat-high-${cat}`, tone: 'warning',
        text: `${cat} is ${Math.round(pctDiff)}% above your 3-month average this month (${fmt(current)} vs ${fmt(avg)} avg).`,
        starter: `My ${cat} spending is up ${Math.round(pctDiff)}% this month vs my usual average — what should I do about it?`,
      })
    } else if (pctDiff <= -thresholdPct) {
      insights.push({
        id: `cat-low-${cat}`, tone: 'positive',
        text: `${cat} spending is ${Math.round(Math.abs(pctDiff))}% below your 3-month average this month — nice.`,
        starter: null,
      })
    }
  })
  return insights
}

// Flags active goals that need meaningful monthly savings to hit their target
// date, ranked by urgency (highest required monthly contribution first).
export function goalPaceInsights(goals, now = new Date(), limit = 2) {
  return goals
    .filter(g => g.target_date && Number(g.current_amount || 0) < Number(g.target_amount))
    .map(g => {
      const target = new Date(g.target_date + 'T12:00:00')
      const monthsLeft = Math.max(1, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()))
      const remaining = Number(g.target_amount) - Number(g.current_amount || 0)
      return { g, monthsLeft, neededPerMonth: remaining / monthsLeft }
    })
    .filter(({ neededPerMonth }) => neededPerMonth > 0)
    .sort((a, b) => b.neededPerMonth - a.neededPerMonth)
    .slice(0, limit)
    .map(({ g, neededPerMonth, monthsLeft }) => ({
      id: `goal-${g.id}`, tone: 'info',
      text: `"${g.title}" needs about ${fmt(neededPerMonth)}/mo to hit your target${monthsLeft === 1 ? ' this month' : ` in ${monthsLeft} months`}.`,
      starter: `How can I save enough to hit my "${g.title}" goal on time?`,
    }))
}

// Subscriptions renewing within `withinDays` — expects the already-computed
// active tracked-subscription rows (see useSubscriptions.js).
export function subscriptionRenewalInsights(activeSubs, withinDays = 7, now = new Date()) {
  const soon = activeSubs.filter(s => {
    if (!s.next_billing_date) return false
    const days = Math.ceil((new Date(s.next_billing_date + 'T12:00:00') - now) / 86400000)
    return days >= 0 && days <= withinDays
  })
  if (soon.length === 0) return []
  const total = soon.reduce((s, sub) => s + Number(sub.amount), 0)
  return [{
    id: 'subs-renewing-soon', tone: 'info',
    text: `${soon.length} subscription${soon.length !== 1 ? 's' : ''} renewing in the next ${withinDays} days (${fmt(total)} total).`,
    starter: null,
  }]
}

// Savings rate framed as a single nudge — positive above 20%, a gentle
// warning below 10%, silent in between (nothing meaningfully "off").
export function savingsRateInsight(savingsPct) {
  const rate = parseFloat(savingsPct)
  if (Number.isNaN(rate)) return []
  if (rate >= 20) {
    return [{ id: 'savings-healthy', tone: 'positive', text: `Savings rate is a healthy ${rate}% — keep it up.`, starter: null }]
  }
  if (rate < 10) {
    return [{
      id: 'savings-low', tone: 'warning',
      text: `Savings rate is only ${rate}% right now — below the usual 20% target.`,
      starter: `My savings rate is ${rate}% — what's the fastest way to improve it?`,
    }]
  }
  return []
}

// Combines every rule, most-actionable (warning) first.
export function buildInsights({ allExpenses, viewMonth, goals, activeSubs, savingsPct }) {
  const all = [
    ...categorySpendInsights(allExpenses, viewMonth),
    ...savingsRateInsight(savingsPct),
    ...goalPaceInsights(goals),
    ...subscriptionRenewalInsights(activeSubs || []),
  ]
  const order = { warning: 0, info: 1, positive: 2 }
  return all.sort((a, b) => (order[a.tone] ?? 3) - (order[b.tone] ?? 3))
}
