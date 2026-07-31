// src/hooks/useTransactions.js
// Zero JSX — uses createElement so this file stays plain .js (no rename needed)
import { createContext, useContext, useState, useEffect, useCallback, createElement } from 'react'
import { supabase } from '../lib/supabase'
import { useHousehold } from './useHousehold'

// ── Intelligent auto-categorizer ─────────────────────────────────────────────
// Maps description/merchant keywords → { category, subcategory, kind }
const CATEGORY_RULES = [
  // ── INCOME ──────────────────────────────────────────────────────────────
  { pattern: /payroll|direct.?dep|salary|paycheck|biweekly.?pay/i, kind: 'income',  source: 'Salary' },
  { pattern: /freelance|invoice|client.?pay|upwork|fiverr|contractor.?pay/i, kind: 'income',  source: 'Freelance' },
  { pattern: /interest.?paid|dividend|yield|capital.?gain/i,  kind: 'income',  source: 'Investment Return' },
  { pattern: /refund|return.?credit|chargeback|tax.?refund|irs.?treas/i, kind: 'income',  source: 'Refund' },
  { pattern: /cashback|cash.?reward|rewards.?redemption/i,    kind: 'income',  source: 'Cashback' },
  { pattern: /unemployment|social.?security|ssa\b|stimulus|benefits.?payment/i, kind: 'income', source: 'Salary' },
  { pattern: /uber.?driver|lyft.?driver|doordash.?pay|instacart.?shopper|rental.?income|airbnb.?payout/i, kind: 'income', source: 'Freelance' },

  // ── NEEDS ────────────────────────────────────────────────────────────────
  { pattern: /rent|mortgage|lease|hoa|property.?mgmt|apartment|landlord/i, kind: 'expense', category: 'Needs', subcategory: 'Rent' },
  { pattern: /electric|gas.?bill|water.?bill|sewer|trash|waste.?mgmt|utility|pge|con.?ed|duke.?energy|national.?grid|xcel.?energy/i, kind: 'expense', category: 'Needs', subcategory: 'Utilities' },
  { pattern: /grocery|groceries|whole.?foods|trader.?joes?|kroger|safeway|aldi|publix|heb\b|wegmans|food.?lion|sprouts|harris.?teeter|giant.?food|stop.?.?shop|sam'?s.?club|meijer|winn.?dixie|king.?soopers|fred.?meyer|market.?basket|fresh.?market/i, kind: 'expense', category: 'Needs', subcategory: 'Groceries' },
  { pattern: /pharmacy|\bcvs\b|walgreens|rite.?aid|prescription|rx\b/i, kind: 'expense', category: 'Needs', subcategory: 'Healthcare' },
  { pattern: /doctor|hospital|clinic|dental|dentist|orthodont|vision|optometrist|therapy|therapist|counseling|urgent.?care|copay|kaiser|anthem|blue.?cross|insurance.?(health|med)/i, kind: 'expense', category: 'Needs', subcategory: 'Healthcare' },
  { pattern: /car.?insurance|auto.?ins|geico|progressive|state.?farm|allstate|liberty.?mutual|nationwide.?insurance|farmers.?insurance|usaa|life.?insurance|renters.?insurance|home.?insurance/i, kind: 'expense', category: 'Needs', subcategory: 'Insurance' },
  { pattern: /uber(?!.?eat)|lyft|taxi|metro|transit|bus.?fare|train|amtrak|toll|parking|gas.?station|exxon|chevron|shell\b|bp\b|fuel|car.?payment|auto.?loan|dmv\b|registration.?fee|car.?wash|oil.?change|jiffy.?lube|valvoline|\baaa\b|ez.?pass|sunpass/i, kind: 'expense', category: 'Needs', subcategory: 'Transportation' },
  { pattern: /internet|comcast|xfinity|\bat.?t\b|verizon|tmobile|t-mobile|sprint|phone.?bill|cell.?phone/i, kind: 'expense', category: 'Needs', subcategory: 'Utilities' },
  { pattern: /daycare|preschool|childcare|babysit|tuition|student.?loan|\bschool\b|university|college/i, kind: 'expense', category: 'Needs', subcategory: 'Other' },

  // ── WANTS ────────────────────────────────────────────────────────────────
  { pattern: /restaurant|cafe|coffee|starbucks|dunkin|mcdonald|burger|taco|chipotle|subway|pizza|wendy'?s|kfc\b|popeyes|panda.?express|chick.?fil.?a|five.?guys|in.?n.?out|domino'?s|papa.?john|jimmy.?john|sonic.?drive|dairy.?queen|panera|deli\b|bakery|brunch|food.?truck|doordash|grubhub|uber.?eat|seamless|postmates/i, kind: 'expense', category: 'Wants', subcategory: 'Dining' },
  { pattern: /nike|adidas|zara|h&m|gap\b|old.?navy|nordstrom|macy|tjmaxx|marshalls|ross\b|forever.?21|uniqlo|shoe|clothing|apparel|fashion|sephora|ulta|bath.?.?body.?works|salon|barber|haircut|\bspa\b|nail.?salon|massage/i, kind: 'expense', category: 'Wants', subcategory: 'Shopping' },
  { pattern: /amazon|ebay|etsy|walmart|\btarget\b|best.?buy|costco|home.?depot|lowes|ikea|wayfair|gamestop|barnes.?.?noble|dick'?s.?sporting|michaels|hobby.?lobby|petco|petsmart|staples|office.?depot/i, kind: 'expense', category: 'Wants', subcategory: 'Shopping' },
  { pattern: /netflix|hulu|disney|spotify|apple.?(music|tv|icloud)|icloud|youtube.?premium|hbo|paramount|peacock|crunchyroll|dropbox|google.?one|xbox.?game.?pass|playstation.?plus|ps.?plus|audible|kindle.?unlimited|patreon|twitch.?sub/i, kind: 'expense', category: 'Wants', subcategory: 'Subscriptions' },
  { pattern: /\bgym\b|planet.?fitness|equinox|crossfit|peloton|fitness/i, kind: 'expense', category: 'Wants', subcategory: 'Entertainment' },
  { pattern: /movie|cinema|amc\b|regal\b|concert|ticket|eventbrite|stubhub|ticketmaster|steam\b|playstation.?store|nintendo.?eshop|bowling|arcade|escape.?room|\bzoo\b|museum|aquarium|\bgolf\b/i, kind: 'expense', category: 'Wants', subcategory: 'Entertainment' },
  { pattern: /hotel|airbnb|vrbo|booking\.com|expedia|flight|airline|delta\b|united\b|southwest|spirit.?airlines|jetblue|alaska.?air|frontier.?air|allegiant|marriott|hilton|hyatt|rental.?car|hertz|avis\b|enterprise.?rent|greyhound|cruise|carnival.?cruise|royal.?caribbean/i, kind: 'expense', category: 'Wants', subcategory: 'Travel' },
  { pattern: /bar\b|nightclub|brewery|winery|liquor|alcohol/i, kind: 'expense', category: 'Wants', subcategory: 'Dining' },

  // ── SAVINGS / TRANSFERS ───────────────────────────────────────────────────
  { pattern: /transfer.?to.?savings|move.?to.?savings|savings.?deposit/i, kind: 'expense', category: 'Savings', subcategory: 'Emergency Fund' },
  { pattern: /401k|roth.?ira|ira.?contribution|fidelity|vanguard|schwab|etrade|robinhood|brokerage|m1.?finance|wealthfront|betterment|acorns|sofi.?invest|coinbase|crypto|bitcoin/i, kind: 'expense', category: 'Savings', subcategory: 'Investment' },
  { pattern: /vacation.?fund|trip.?savings/i,                 kind: 'expense', category: 'Savings', subcategory: 'Vacation' },

  // Payment apps (Venmo/PayPal/Zelle/Cash App) move money both ways, so this only catches
  // transfers whose description doesn't already match something more specific above — e.g.
  // "Rent Payment - Zelle" now matches the Rent rule first instead of being misread as income
  // (which used to make it fall back to a generic Wants/Other category).
  { pattern: /venmo|paypal|zelle|cash.?app.*\+/i,             kind: 'income',  source: 'Transfer In' },
]

// Checks the user's own custom rules (see useTransactionRules.js) before falling back to the
// built-in keyword rules below. Highest `priority` wins; first match on a tie.
export function applyUserRules(rules, description = '', merchant = '') {
  if (!rules || rules.length === 0) return null
  const sorted = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0))
  for (const rule of sorted) {
    const haystack = (rule.match_field === 'merchant' ? merchant : description || '').toLowerCase()
    if (haystack && haystack.includes(rule.match_value.toLowerCase())) {
      return {
        kind: rule.set_kind || 'expense',
        category: rule.set_category || null,
        subcategory: rule.set_subcategory || null,
        source: null,
        label: rule.set_label || null,
        auto: true,
        fromRule: true,
      }
    }
  }
  return null
}

export function autoCategorize(description = '', merchant = '', userRules = []) {
  const userMatch = applyUserRules(userRules, description, merchant)
  if (userMatch) return userMatch

  const text = `${description} ${merchant}`.trim()
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) {
      return {
        kind:        rule.kind,
        category:    rule.category    || null,
        subcategory: rule.subcategory || null,
        source:      rule.source      || null,
        auto:        true,
      }
    }
  }
  // Default fallback
  return { kind: 'expense', category: 'Wants', subcategory: 'Other', source: null, auto: false }
}

// ── Context ───────────────────────────────────────────────────────────────────
const TxnContext = createContext(null)

export function TransactionProvider({ userId, children }) {
  const [transactions, setTransactions] = useState([])
  const [accounts,     setAccounts]     = useState([])
  const [loading,      setLoading]      = useState(true)
  // Surfaced app-wide (see the banner in Layout.jsx) instead of silently
  // rendering as if the user simply has no data — Supabase's client resolves
  // successfully even on a backend error (data: null, error: {...}), so
  // without this check a broken query looked exactly like an empty account.
  const [error, setError] = useState(null)
  // Accounts + transactions are the shared-scope data that's actually wired up to read
  // household-wide (see src/hooks/useHousehold.js) — householdUserIds falls back to
  // [userId] alone when there's no household, so solo users see identical behavior.
  const { householdUserIds } = useHousehold(userId)

  const load = useCallback(async () => {
    if (!userId || householdUserIds.length === 0) return
    const [txnRes, accRes] = await Promise.all([
      supabase
        .from('account_transactions')
        .select('*, accounts(name, type, institution, card_last4, card_type)')
        .in('user_id', householdUserIds)
        .order('date', { ascending: false }),
      supabase
        .from('accounts')
        .select('*')
        .in('user_id', householdUserIds)
        .order('created_at', { ascending: false }),
    ])
    const loadError = txnRes.error || accRes.error
    if (loadError) {
      console.error('TransactionProvider: failed to load accounts/transactions:', loadError)
      setError(loadError)
    } else {
      setError(null)
      setTransactions(txnRes.data || [])
      setAccounts(accRes.data || [])
    }
    setLoading(false)
  }, [userId, householdUserIds])

  useEffect(() => { load() }, [load])

  // ── Derived slices used by all pages ──────────────────────────────────────
  const expenseTxns = transactions.filter(t => t.kind === 'expense')
  const incomeTxns  = transactions.filter(t => t.kind === 'income')

  const addTransaction = async (payload) => {
    const { error } = await supabase.from('account_transactions').insert({ ...payload, user_id: userId })
    if (!error) await load()
    return { error }
  }

  const updateTransaction = async (id, payload) => {
    const { error } = await supabase.from('account_transactions').update(payload).eq('id', id).eq('user_id', userId)
    if (!error) await load()
    return { error }
  }

  const deleteTransaction = async (id) => {
    const { error } = await supabase.from('account_transactions').delete().eq('id', id).eq('user_id', userId)
    if (!error) await load()
    return { error }
  }

  const value = {
    transactions, expenseTxns, incomeTxns,
    accounts, loading, error, reload: load,
    addTransaction, updateTransaction, deleteTransaction,
  }

  // createElement instead of JSX — keeps this file valid as plain .js
  return createElement(TxnContext.Provider, { value }, children)
}

export function useTransactions() {
  const ctx = useContext(TxnContext)
  if (!ctx) throw new Error('useTransactions must be used inside <TransactionProvider>')
  return ctx
}
