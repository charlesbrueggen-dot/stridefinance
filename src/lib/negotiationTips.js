// src/lib/negotiationTips.js
// There's no way to actually call a provider and negotiate a subscription
// price down (no such API/partnership exists here, unlike Rocket Money's
// human retention-negotiation service) — so instead of pretending to, this
// generates a short, always-available talking-points script the user can use
// themselves, plus a starter prompt for a more personalized AI Coach follow-up.
import { fmtCurrency as fmt } from './format'

export function negotiationTips(sub) {
  const priceRose = sub.previous_amount != null
  const tips = []
  if (priceRose) {
    tips.push(`Mention the price went from ${fmt(sub.previous_amount)} to ${fmt(sub.amount)} and ask if they can honor your old rate.`)
  }
  tips.push('Ask specifically for the "retention" or "loyalty" team — they often have discounts regular support reps can\'t offer.')
  tips.push("Say you're considering canceling and ask about a lower-tier plan or a promotional rate.")
  tips.push('Mention how long you\'ve been a subscriber — tenure often qualifies you for a loyalty discount.')
  tips.push('Check whether paying annually instead of monthly works out cheaper, if you\'re confident you\'ll keep using it.')
  return tips
}

export function negotiationCoachPrompt(sub) {
  const priceRose = sub.previous_amount != null
  return `Help me negotiate a better price for my ${sub.name} subscription${
    priceRose ? `, which just went up from ${fmt(sub.previous_amount)} to ${fmt(sub.amount)}` : ` (currently ${fmt(sub.amount)}/${sub.frequency})`
  }.`
}
