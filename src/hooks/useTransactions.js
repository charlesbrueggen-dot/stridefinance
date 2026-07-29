// src/hooks/useTransactions.js
// Zero JSX — uses createElement so this file stays plain .js (no rename needed)
import { createContext, useContext, useState, useEffect, useCallback, createElement } from 'react'
import { supabase } from '../lib/supabase'

// ── Intelligent auto-categorizer ─────────────────────────────────────────────
// Maps description/merchant keywords → { category, subcategory, kind }
const CATEGORY_RULES = [
  // ── INCOME ──────────────────────────────────────────────────────────────
  { pattern: /payroll|direct.?dep|salary|paycheck/i,          kind: 'income',  source: 'Salary' },
  { pattern: /freelance|invoice|client.?pay/i,                kind: 'income',  source: 'Freelance' },
  { pattern: /interest.?paid|dividend|yield/i,                kind: 'income',  source: 'Investment Return' },
  { pattern: /refund|return.?credit|chargeback/i,             kind: 'income',  source: 'Refund' },
  { pattern: /cashback|cash.?reward/i,                        kind: 'income',  source: 'Cashback' },

  // ── NEEDS ────────────────────────────────────────────────────────────────
  { pattern: /rent|mortgage|lease|hoa/i,                      kind: 'expense', category: 'Needs', subcategory: 'Rent' },
  { pattern: /electric|gas.?bill|water.?bill|utility|pge|con.?ed/i, kind: 'expense', category: 'Needs', subcategory: 'Utilities' },
  { pattern: /grocery|groceries|whole.?foods|trader.?joes?|kroger|safeway|aldi|publix|heb|wegmans|food.?lion/i, kind: 'expense', category: 'Needs', subcategory: 'Groceries' },
  { pattern: /pharmacy|cvs|walgreens|rite.?aid|prescription|rx\b/i, kind: 'expense', category: 'Needs', subcategory: 'Healthcare' },
  { pattern: /doctor|hospital|clinic|dental|vision|insurance.?(health|med)/i, kind: 'expense', category: 'Needs', subcategory: 'Healthcare' },
  { pattern: /car.?insurance|auto.?ins|geico|progressive|state.?farm|allstate/i, kind: 'expense', category: 'Needs', subcategory: 'Insurance' },
  { pattern: /uber|lyft|taxi|metro|transit|bus.?fare|train|amtrak|toll|parking|gas.?station|exxon|chevron|shell|bp\b|fuel/i, kind: 'expense', category: 'Needs', subcategory: 'Transportation' },
  { pattern: /internet|comcast|xfinity|att|verizon|tmobile|sprint|phone.?bill|cell/i, kind: 'expense', category: 'Needs', subcategory: 'Utilities' },

  // ── WANTS ────────────────────────────────────────────────────────────────
  { pattern: /restaurant|cafe|coffee|starbucks|mcdonald|burger|taco|chipotle|subway|pizza|doordash|grubhub|uber.?eat|seamless|instacart.?restaurant/i, kind: 'expense', category: 'Wants', subcategory: 'Dining' },
  { pattern: /nike|adidas|zara|h&m|gap|old.?navy|nordstrom|macy|tjmaxx|marshalls|ross\b|forever.?21|uniqlo|shoe|clothing|apparel|fashion/i, kind: 'expense', category: 'Wants', subcategory: 'Shopping' },
  { pattern: /amazon|ebay|etsy|walmart|target|best.?buy|costco|home.?depot|lowes/i, kind: 'expense', category: 'Wants', subcategory: 'Shopping' },
  { pattern: /netflix|hulu|disney|spotify|apple.?(music|tv)|youtube.?premium|hbo|paramount|peacock|crunchyroll/i, kind: 'expense', category: 'Wants', subcategory: 'Subscriptions' },
  { pattern: /gym|planet.?fitness|equinox|crossfit|peloton|fitness/i, kind: 'expense', category: 'Wants', subcategory: 'Entertainment' },
  { pattern: /movie|cinema|amc|regal|concert|ticket|eventbrite|stubhub|ticketmaster/i, kind: 'expense', category: 'Wants', subcategory: 'Entertainment' },
  { pattern: /hotel|airbnb|vrbo|booking|expedia|flight|airline|delta|united|southwest|spirit|spirit.?airlines/i, kind: 'expense', category: 'Wants', subcategory: 'Travel' },
  { pattern: /bar\b|nightclub|brewery|winery|liquor|alcohol/i, kind: 'expense', category: 'Wants', subcategory: 'Dining' },

  // ── SAVINGS / TRANSFERS ───────────────────────────────────────────────────
  { pattern: /transfer.?to.?savings|move.?to.?savings|savings.?deposit/i, kind: 'expense', category: 'Savings', subcategory: 'Emergency Fund' },
  { pattern: /401k|roth.?ira|ira.?contribution|fidelity|vanguard|schwab|etrade|robinhood|brokerage/i, kind: 'expense', category: 'Savings', subcategory: 'Investment' },

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

  const load = useCallback(async () => {
    if (!userId) return
    const [{ data: txns }, { data: accs }] = await Promise.all([
      supabase
        .from('account_transactions')
        .select('*, accounts(name, type, institution, card_last4, card_type)')
        .eq('user_id', userId)
        .order('date', { ascending: false }),
      supabase
        .from('accounts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    ])
    setTransactions(txns || [])
    setAccounts(accs     || [])
    setLoading(false)
  }, [userId])

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
    accounts, loading, reload: load,
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
