// src/pages/Accounts.jsx
// Full Plaid integration — connects real banks, auto-syncs transactions
// Manual accounts still supported alongside Plaid-connected ones
import { useState, useMemo } from 'react'
import {
  Landmark, PiggyBank, CreditCard, TrendingUp, Banknote,
  ArrowUpRight, ArrowDownRight, ArrowLeftRight, Sparkle, Zap, Link2,
  FlaskConical, AlertTriangle, RefreshCw, Check, Pencil, Trash2, X,
  ClipboardList, Hourglass, Download, ListFilter,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import { useTransactions, autoCategorize } from '../hooks/useTransactions'
import { usePlaid } from '../hooks/usePlaid'
import { useTransactionRules, MATCH_FIELDS } from '../hooks/useTransactionRules'
import { fmtCurrency as fmt } from '../lib/format'
import Import from './Import'
import ProGate from '../components/ProGate'
import { PageHeader, StatCard, EmptyState, PageSkeleton, SegTabs } from '../components/ui'
import { useIsPro } from '../hooks/useIsPro'
import MerchantLogo from '../components/MerchantLogo'
import { DATE_RANGE_OPTIONS, inDateRange } from '../lib/dateRange'
import SwipeableRow from '../components/SwipeableRow'

const today = () => new Date().toISOString().split('T')[0]

const ACCOUNT_TYPES  = ['Checking', 'Savings', 'Credit Card', 'Investment', 'Cash', 'Other']
const CARD_TYPES     = ['Visa', 'Mastercard', 'Amex', 'Discover', 'Other']
const CARD_COLORS    = ['#1a1a2e', '#16213e', '#0f3460', '#533483', '#2b2d42', '#8d99ae', '#2a9d8f', '#e9c46a']
const TXN_KINDS      = ['expense', 'income', 'transfer']

const CATEGORIES = {
  expense: {
    Needs:   ['Rent', 'Groceries', 'Utilities', 'Transportation', 'Healthcare', 'Insurance', 'Other'],
    Wants:   ['Dining', 'Entertainment', 'Shopping', 'Travel', 'Subscriptions', 'Other'],
    Savings: ['Emergency Fund', 'Retirement', 'Investment', 'Vacation', 'Other'],
  },
}
const INCOME_SOURCES = ['Salary', 'Freelance', 'Investment Return', 'Refund', 'Cashback', 'Transfer In', 'Other']

const TYPE_ICONS = {
  Checking: Landmark, Savings: PiggyBank, 'Credit Card': CreditCard,
  Investment: TrendingUp, Cash: Banknote, Other: Landmark,
}

// Balances below this on a non-credit-card account get a "Low balance" badge —
// credit cards are excluded since a low/zero balance there is good, not risky.
const LOW_BALANCE_THRESHOLD = 100
function balanceStatus(acc) {
  if (acc.type === 'Credit Card') return null
  const bal = parseFloat(acc.balance) || 0
  if (bal < 0) return { label: 'Negative balance', tone: 'negative' }
  if (bal < LOW_BALANCE_THRESHOLD) return { label: 'Low balance', tone: 'warning' }
  return null
}

function BalanceBadge({ acc }) {
  const status = balanceStatus(acc)
  if (!status) return null
  const color = status.tone === 'negative' ? 'var(--negative)' : 'var(--warning)'
  const bg    = status.tone === 'negative' ? 'var(--negative-bg)' : 'var(--warning-bg)'
  return (
    <span className="text-xs px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-1 flex-shrink-0"
      style={{ background: bg, color }}>
      <AlertTriangle size={11} /> {status.label}
    </span>
  )
}

const KIND_COLOR  = { expense: 'var(--negative)', income: 'var(--positive)', transfer: 'var(--warning)' }
const KIND_STRONG = { expense: 'var(--negative-strong)', income: 'var(--positive-strong)', transfer: 'var(--warning-strong)' }
const KIND_BG     = { expense: 'var(--negative-bg)', income: 'var(--positive-bg)', transfer: 'var(--warning-bg)' }
const KIND_ICON   = { expense: ArrowDownRight, income: ArrowUpRight, transfer: ArrowLeftRight }

// Renders the icon for an account type (falls back to Landmark for unknown types)
function TypeIcon({ type, size = 20 }) {
  const Icon = TYPE_ICONS[type] || Landmark
  return <Icon size={size} />
}

const blankAccount = () => ({
  name: '', type: 'Checking', balance: '',
  institution: '', card_last4: '', card_type: 'Visa',
  color: CARD_COLORS[0], notes: '',
})

const blankTxn = () => ({
  description: '', amount: '', kind: 'expense',
  category: 'Wants', subcategory: 'Other', source: 'Other',
  date: today(), label: '', notes: '',
  merchant: '', card_last4: '', account_id: '',
})

const blankRule = () => ({
  match_field: 'description', match_value: '',
  set_kind: 'expense', set_category: 'Wants', set_subcategory: 'Other', set_label: '',
})


function CardVisual({ account }) {
  const isCard = account.type === 'Credit Card'
  const bg     = account.color || '#1a1a2e'
  return (
    <div
      className="relative rounded-2xl p-5 overflow-hidden flex-shrink-0"
      style={{ background: `linear-gradient(135deg, ${bg} 0%, ${bg}cc 100%)`, width: 240, height: 145 }}
    >
      <div className="absolute inset-0 opacity-10"
        style={{ background: 'linear-gradient(135deg, #fff 0%, transparent 60%)' }} />
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-white text-xs opacity-70 font-medium">{account.institution || 'Bank'}</p>
          <p className="text-white text-sm font-bold mt-0.5">{account.name}</p>
        </div>
        <span className="text-white opacity-80"><TypeIcon type={account.type} size={22} /></span>
      </div>
      {isCard && account.card_last4 && (
        <p className="text-white text-sm tracking-widest opacity-80 mb-3">
          •••• •••• •••• {account.card_last4}
        </p>
      )}
      <div className="absolute bottom-4 left-5 right-5 flex justify-between items-end">
        <div>
          <p className="text-white text-xs opacity-60">{account.type === 'Credit Card' ? 'Balance Owed' : 'Balance'}</p>
          <p className="text-white font-black text-lg">{fmt(account.balance)}</p>
        </div>
        {isCard && (
          <p className="text-white text-sm font-bold opacity-80">{account.card_type || 'Card'}</p>
        )}
      </div>
    </div>
  )
}

export default function Accounts() {
  const { user } = useAuth()
  const { transactions, accounts, loading, reload, addTransaction } = useTransactions()
  const {
    connectedItems, syncing, connecting, syncResult, error: plaidError,
    mockMode, canSync, cooldownSecondsLeft, connectBank, syncTransactions, disconnectBank,
  } = usePlaid(user?.id)
  const { rules, addRule, deleteRule } = useTransactionRules(user?.id)

  const [showRuleForm, setShowRuleForm] = useState(false)
  const [ruleForm, setRuleForm] = useState(blankRule())
  const [savingRule, setSavingRule] = useState(false)
  const [applyingRules, setApplyingRules] = useState(false)
  const [applyResult, setApplyResult] = useState(null)

  const [showAccModal, setShowAccModal] = useState(false)
  const [editAcc,      setEditAcc]      = useState(null)
  const [accForm,      setAccForm]      = useState(blankAccount())
  const [savingAcc,    setSavingAcc]    = useState(false)

  const [showTxnModal, setShowTxnModal] = useState(false)
  const [editTxn,      setEditTxn]      = useState(null)
  const [txnForm,      setTxnForm]      = useState(blankTxn())
  const [savingTxn,    setSavingTxn]    = useState(false)
  const [autoSuggest,  setAutoSuggest]  = useState(null)

  const [selectedAcc, setSelectedAcc] = useState(null)
  const [txnFilter,   setTxnFilter]   = useState('all')
  const [search,      setSearch]      = useState('')
  const [dateRange,   setDateRange]   = useState('all')
  const [tab,         setTab]         = useState('accounts') // 'accounts' | 'connect' | 'import'

  const { isPro, proLoading } = useIsPro(user.id)

  // ── Account CRUD ──────────────────────────────────────────────────────────
  const openAddAcc  = () => { setEditAcc(null); setAccForm(blankAccount()); setShowAccModal(true) }
  const openEditAcc = a  => {
    setEditAcc(a)
    setAccForm({
      name: a.name, type: a.type, balance: a.balance,
      institution: a.institution || '', card_last4: a.card_last4 || '',
      card_type: a.card_type || 'Visa', color: a.color || CARD_COLORS[0], notes: a.notes || '',
    })
    setShowAccModal(true)
  }

  const handleSaveAcc = async e => {
    e.preventDefault(); setSavingAcc(true)
    const payload = {
      name:        accForm.name.trim(),
      type:        accForm.type,
      balance:     parseFloat(accForm.balance) || 0,
      institution: accForm.institution.trim(),
      card_last4:  accForm.card_last4.replace(/\D/g, '').slice(-4) || null,
      card_type:   accForm.type === 'Credit Card' ? accForm.card_type : null,
      color:       accForm.color || null,
      notes:       accForm.notes,
      user_id:     user.id,
    }
    if (editAcc) await supabase.from('accounts').update(payload).eq('id', editAcc.id).eq('user_id', user.id)
    else         await supabase.from('accounts').insert(payload)
    setSavingAcc(false); setShowAccModal(false); reload()
  }

  const handleDeleteAcc = async id => {
    if (!confirm('Delete this account? Its transactions will be kept but unlinked.')) return
    await supabase.from('accounts').delete().eq('id', id).eq('user_id', user.id)
    if (selectedAcc === id) setSelectedAcc(null)
    reload()
  }

  // ── Transaction CRUD ──────────────────────────────────────────────────────
  const openAddTxn = (accountId = '') => {
    setEditTxn(null); setAutoSuggest(null)
    setTxnForm({ ...blankTxn(), account_id: accountId })
    setShowTxnModal(true)
  }

  const openEditTxn = t => {
    setEditTxn(t); setAutoSuggest(null)
    setTxnForm({
      description: t.description, amount: t.amount, kind: t.kind,
      category: t.category || 'Wants', subcategory: t.subcategory || 'Other',
      source: t.source || 'Other', date: t.date, label: t.label || '',
      notes: t.notes || '', merchant: t.merchant || '',
      card_last4: t.card_last4 || '', account_id: t.account_id || '',
    })
    setShowTxnModal(true)
  }

  const handleDescChange = val => {
    setTxnForm(f => ({ ...f, description: val }))
    if (val.length >= 3) setAutoSuggest(autoCategorize(val, txnForm.merchant, rules))
    else setAutoSuggest(null)
  }

  const applyAutoSuggest = () => {
    if (!autoSuggest) return
    setTxnForm(f => ({
      ...f,
      kind:        autoSuggest.kind,
      category:    autoSuggest.category    || f.category,
      subcategory: autoSuggest.subcategory || f.subcategory,
      source:      autoSuggest.source      || f.source,
      label:       autoSuggest.label       || f.label,
    }))
    setAutoSuggest(null)
  }

  const handleSaveTxn = async e => {
    e.preventDefault(); setSavingTxn(true)

    let finalCat = { category: txnForm.category, subcategory: txnForm.subcategory, source: txnForm.source, auto_categorized: false }
    if (!editTxn && autoSuggest) {
      finalCat = {
        category:         autoSuggest.category    || txnForm.category,
        subcategory:      autoSuggest.subcategory || txnForm.subcategory,
        source:           autoSuggest.source      || txnForm.source,
        auto_categorized: autoSuggest.auto,
      }
    }

    const linkedAcc = accounts.find(a => a.id === txnForm.account_id)
    const card_last4 = txnForm.card_last4 || linkedAcc?.card_last4 || null

    const payload = {
      description:      txnForm.description.trim(),
      amount:           parseFloat(txnForm.amount),
      kind:             txnForm.kind,
      category:         txnForm.kind === 'expense' ? finalCat.category    : null,
      subcategory:      txnForm.kind === 'expense' ? finalCat.subcategory : null,
      source:           txnForm.kind === 'income'  ? txnForm.source       : null,
      date:             txnForm.date,
      label:            txnForm.label.trim() || null,
      notes:            txnForm.notes || null,
      merchant:         txnForm.merchant.trim() || null,
      card_last4,
      card_type:        linkedAcc?.card_type || null,
      account_id:       txnForm.account_id || null,
      auto_categorized: finalCat.auto_categorized,
      source_type:      'manual',
      user_id:          user.id,
    }

    if (editTxn) {
      await supabase.from('account_transactions').update(payload).eq('id', editTxn.id).eq('user_id', user.id)
    } else {
      await addTransaction(payload)
      if (linkedAcc) {
        const delta = txnForm.kind === 'expense' ? -payload.amount : txnForm.kind === 'income' ? payload.amount : 0
        await supabase.from('accounts').update({ balance: linkedAcc.balance + delta }).eq('id', linkedAcc.id).eq('user_id', user.id)
      }
    }

    setSavingTxn(false); setShowTxnModal(false); reload()
  }

  const handleDeleteTxn = async id => {
    await supabase.from('account_transactions').delete().eq('id', id).eq('user_id', user.id)
    reload()
  }

  // ── Sync and reload ───────────────────────────────────────────────────────
  const handleSync = async () => {
    await syncTransactions()
    reload()
  }

  // ── Rules CRUD ─────────────────────────────────────────────────────────────
  const openAddRule = () => { setRuleForm(blankRule()); setShowRuleForm(true) }

  const handleSaveRule = async e => {
    e.preventDefault(); setSavingRule(true)
    await addRule({
      match_field: ruleForm.match_field,
      match_value: ruleForm.match_value.trim(),
      set_kind: ruleForm.set_kind,
      set_category: ruleForm.set_kind === 'expense' ? ruleForm.set_category : null,
      set_subcategory: ruleForm.set_kind === 'expense' ? ruleForm.set_subcategory : null,
      set_label: ruleForm.set_label.trim() || null,
    })
    setSavingRule(false); setShowRuleForm(false)
  }

  // Re-applies every rule to existing transactions — only the ones a rule actually matches,
  // in small concurrent batches so a large transaction history doesn't fire thousands of
  // requests at once.
  const handleApplyRules = async () => {
    if (rules.length === 0) return
    setApplyingRules(true); setApplyResult(null)
    const toUpdate = transactions
      .map(t => ({ t, match: autoCategorize(t.description, t.merchant, rules) }))
      .filter(({ match }) => match.fromRule)
      .filter(({ t, match }) =>
        t.kind !== match.kind || t.category !== match.category ||
        t.subcategory !== match.subcategory || (match.label && t.label !== match.label)
      )

    const BATCH = 15
    let applied = 0
    for (let i = 0; i < toUpdate.length; i += BATCH) {
      const batch = toUpdate.slice(i, i + BATCH)
      await Promise.all(batch.map(({ t, match }) =>
        supabase.from('account_transactions').update({
          kind: match.kind, category: match.category, subcategory: match.subcategory,
          label: match.label || t.label, auto_categorized: true,
        }).eq('id', t.id).eq('user_id', user.id)
      ))
      applied += batch.length
    }
    setApplyResult(applied)
    setApplyingRules(false)
    reload()
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const totalAssets = accounts.filter(a => a.type !== 'Credit Card').reduce((s, a) => s + a.balance, 0)
  const totalDebt   = accounts.filter(a => a.type === 'Credit Card').reduce((s, a) => s + a.balance, 0)
  const plaidAccounts  = accounts.filter(a => a.plaid_account_id)
  const manualAccounts = accounts.filter(a => !a.plaid_account_id)

  const visibleTxns = useMemo(() => {
    return transactions.filter(t => {
      const matchAcc    = !selectedAcc || t.account_id === selectedAcc
      const matchFilter = txnFilter === 'all' || t.kind === txnFilter
      const matchSearch = !search || t.description.toLowerCase().includes(search.toLowerCase()) || (t.merchant || '').toLowerCase().includes(search.toLowerCase())
      const matchDate   = inDateRange(t.date, dateRange)
      return matchAcc && matchFilter && matchSearch && matchDate
    })
  }, [transactions, selectedAcc, txnFilter, search, dateRange])

  if (proLoading || loading) return <PageSkeleton stats={2} hero={false} />

  return (
    <div>
      <PageHeader title="Accounts & Cards" subtitle="Connect your bank or track accounts manually" />

      {/* Summary Bar */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          <StatCard label="Total Assets" value={fmt(totalAssets)} tone="#10b981"
            sub={`${accounts.filter(a => a.type !== 'Credit Card').length} accounts`} />
          <StatCard label="Total Debt" value={fmt(totalDebt)} tone="#ef4444"
            valueStyle={{ color: 'var(--negative-strong)' }}
            sub={`${accounts.filter(a => a.type === 'Credit Card').length} cards`} />
        </div>
      )}

      {/* Tabs — sized to always fit on one line, even on small phones */}
      <div className="flex flex-wrap gap-1 mb-5">
        {[['accounts', Landmark, 'Accounts'], ['connect', Link2, 'Connect Bank'], ['import', Download, 'Import'], ['rules', ListFilter, 'Rules']].map(([t, Icon, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`seg-tab ${tab === t ? 'seg-tab-active' : ''}`}
            style={{ padding: '6px 9px', fontSize: 12, gap: 4 }}>
            <Icon size={13} /> {label}
            {t === 'connect' && connectedItems.length > 0 && (
              <span className="text-xs px-1.5 rounded-full font-bold"
                style={{ background: '#10b981', color: '#000' }}>
                {connectedItems.length}
              </span>
            )}
            {t === 'connect' && connectedItems.length === 0 && !isPro && (
              <span className="text-xs px-1.5 rounded-full font-bold"
                style={{ background: 'var(--positive-bg)', color: 'var(--positive)', fontSize: 10 }}>
                PRO
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════ CONNECT BANK TAB ══════════════════ */}
      {tab === 'connect' && !isPro && (
        <ProGate
          feature="Automatic Bank Sync"
          Icon={Link2}
          description="Connect your real bank accounts automatically and let transactions sync and categorize themselves — no manual entry required."
          userId={user.id}
        />
      )}

      {tab === 'connect' && isPro && (
        <div>
          {/* Bank connect card */}
          <div className="card p-6 mb-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--positive-bg)', border: '1px solid var(--positive)', color: 'var(--positive)' }}>
                <Landmark size={24} />
              </div>
              <div>
                <p className="font-black text-primary">Connect Real Bank</p>
                <p className="text-muted text-xs">Powered by Plaid · bank-level security</p>
              </div>
            </div>

            <p className="text-muted text-sm mb-4">
              Connect Chase, Bank of America, Wells Fargo, and more. Your transactions will sync automatically and be categorized intelligently.
            </p>

            {mockMode && (
              <div className="mb-4 p-3 rounded-xl text-xs font-medium flex items-start gap-1.5"
                style={{ background: 'var(--info-bg)', border: '1px solid var(--info)', color: 'var(--info)' }}>
                <FlaskConical size={14} className="flex-shrink-0 mt-0.5" /> Demo mode — Plaid credentials not configured yet, so connecting adds a sample bank with realistic test data.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              {['Chase', 'Bank of America', 'Wells Fargo', 'Capital One', 'Citi', 'US Bank'].map(bank => (
                <div key={bank} className="flex items-center gap-2 text-xs text-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0"></span>
                  {bank}
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs text-muted col-span-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0"></span>
                + thousands more institutions
              </div>
            </div>

            {plaidError && (
              <div className="mb-4 p-3 rounded-xl text-xs font-medium flex items-center gap-1.5"
                style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative)', color: 'var(--negative)' }}>
                <AlertTriangle size={14} className="flex-shrink-0" /> {plaidError}
              </div>
            )}

            <button
              onClick={connectBank}
              disabled={connecting}
              className="btn-primary w-full justify-center"
            >
              {connecting ? <><RefreshCw size={16} className="animate-spin" /> Opening bank connection…</> : '+ Connect a Bank Account'}
            </button>
          </div>

          {/* Connected institutions */}
          {connectedItems.length > 0 && (
            <div className="card p-5 mb-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-black text-primary">Connected Banks</p>
                <button
                  onClick={handleSync}
                  disabled={syncing || !canSync}
                  className="btn-secondary text-xs px-3 py-1.5"
                  title={!canSync && !syncing ? `Rate-limit safeguard — available again in ${cooldownSecondsLeft}s` : undefined}
                >
                  {syncing ? <><RefreshCw size={13} className="animate-spin" /> Syncing…</> : !canSync ? <><Hourglass size={13} /> Wait {cooldownSecondsLeft}s</> : <><RefreshCw size={13} /> Sync All</>}
                </button>
              </div>

              {syncResult && (
                <div className="mb-3 p-3 rounded-xl text-xs font-medium flex items-center gap-1.5"
                  style={{ background: 'var(--positive-bg)', border: '1px solid var(--positive)', color: 'var(--positive)' }}>
                  <Check size={14} /> Synced {syncResult.synced} transaction{syncResult.synced !== 1 ? 's' : ''}
                </div>
              )}

              <div className="space-y-3">
                {connectedItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-xl"
                    style={{ border: '1px solid var(--card-border)' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: 'var(--positive-bg)', color: 'var(--positive)' }}>
                        <Landmark size={18} />
                      </div>
                      <div>
                        <p className="font-semibold text-primary text-sm">{item.institution_name || 'Bank'}</p>
                        <p className="text-xs text-muted">
                          {item.last_synced_at
                            ? `Last synced ${new Date(item.last_synced_at).toLocaleDateString()}`
                            : 'Never synced'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.status === 'disconnected' ? (
                        <span className="text-xs px-2 py-1 rounded-full font-medium inline-flex items-center gap-1"
                          style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                          <AlertTriangle size={12} /> Reconnect needed
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full font-medium inline-flex items-center gap-1"
                          style={{ background: 'var(--positive-bg)', color: 'var(--positive)' }}>
                          <Check size={12} /> Connected
                        </span>
                      )}
                      <button
                        onClick={() => disconnectBank(item.id)}
                        className="text-xs text-muted hover:text-red-400 transition-colors px-2 py-1 rounded"
                        style={{ border: '1px solid var(--card-border)' }}>
                        Disconnect
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plaid accounts breakdown */}
          {plaidAccounts.length > 0 && (
            <div className="card p-5">
              <p className="font-bold text-primary text-sm mb-3">Synced Accounts ({plaidAccounts.length})</p>
              <div className="space-y-2">
                {plaidAccounts.map(acc => (
                  <div key={acc.id} className="flex justify-between items-center py-2 border-b last:border-b-0"
                    style={{ borderColor: 'var(--card-border)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-primary"><TypeIcon type={acc.type} size={18} /></span>
                      <div>
                        <p className="text-sm font-medium text-primary">{acc.name}</p>
                        <p className="text-xs text-muted">{acc.type}{acc.card_last4 ? ` · ••${acc.card_last4}` : ''}</p>
                      </div>
                    </div>
                    <p className={`font-bold text-sm ${acc.type === 'Credit Card' ? '' : 'text-primary'}`}
                      style={acc.type === 'Credit Card' ? { color: 'var(--negative-strong)' } : undefined}>
                      {acc.type === 'Credit Card' ? '-' : ''}{fmt(acc.balance)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {connectedItems.length === 0 && (
            <div className="card p-8 text-center" style={{ border: '2px dashed var(--card-border)' }}>
              <div className="flex justify-center mb-2 text-muted"><Link2 size={30} /></div>
              <p className="font-bold text-primary mb-1">No banks connected yet</p>
              <p className="text-muted text-sm">Connect your bank above to start syncing real transactions automatically.</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════ ACCOUNTS TAB ══════════════════ */}
      {tab === 'accounts' && (
        <>
          <div className="flex gap-3 mb-5">
            <button onClick={openAddAcc} className="btn-primary flex-1 justify-center">+ Add Manual Account</button>
            <button onClick={() => openAddTxn(selectedAcc || '')} className="btn-secondary flex-1 justify-center">+ Log Transaction</button>
          </div>

          {/* Plaid-synced accounts */}
          {plaidAccounts.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1"><Link2 size={12} /> Bank Synced</p>
                <button onClick={handleSync} disabled={syncing || !canSync}
                  className="text-xs text-muted hover:text-primary transition-colors inline-flex items-center gap-1"
                  title={!canSync && !syncing ? `Rate-limit safeguard — available again in ${cooldownSecondsLeft}s` : undefined}>
                  {syncing ? <><RefreshCw size={12} className="animate-spin" /> Syncing…</> : !canSync ? <><Hourglass size={12} /> Wait {cooldownSecondsLeft}s</> : <><RefreshCw size={12} /> Sync Now</>}
                </button>
              </div>
              <div className="space-y-2">
                {plaidAccounts.map(acc => (
                  <div key={acc.id}
                    className="card p-4 flex items-center justify-between cursor-pointer"
                    onClick={() => setSelectedAcc(acc.id === selectedAcc ? null : acc.id)}
                    style={{ borderColor: selectedAcc === acc.id ? 'var(--positive)' : undefined }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-primary"
                        style={{ background: acc.color || 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
                        <TypeIcon type={acc.type} size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-primary text-sm">{acc.name}</p>
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                            style={{ background: 'var(--positive-bg)', color: 'var(--positive)' }}>
                            auto
                          </span>
                          <BalanceBadge acc={acc} />
                        </div>
                        <p className="text-xs text-muted">{acc.type}{acc.institution ? ` · ${acc.institution}` : ''}{acc.card_last4 ? ` · ••${acc.card_last4}` : ''}</p>
                      </div>
                    </div>
                    <p className={`font-black ${acc.type === 'Credit Card' ? '' : 'text-primary'}`}
                      style={acc.type === 'Credit Card' ? { color: 'var(--negative-strong)' } : undefined}>
                      {acc.type === 'Credit Card' ? '-' : ''}{fmt(acc.balance)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual accounts */}
          {manualAccounts.length > 0 && (
            <div className="mb-4">
              {plaidAccounts.length > 0 && (
                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2 flex items-center gap-1"><Pencil size={12} /> Manual</p>
              )}
              <div className="space-y-2">
                {manualAccounts.map(acc => (
                  <div key={acc.id}
                    className="card p-4 flex items-center justify-between cursor-pointer"
                    onClick={() => setSelectedAcc(acc.id === selectedAcc ? null : acc.id)}
                    style={{ borderColor: selectedAcc === acc.id ? 'var(--text-primary)' : undefined }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-primary"
                        style={{ background: acc.color || 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
                        <TypeIcon type={acc.type} size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-primary text-sm">{acc.name}</p>
                          <BalanceBadge acc={acc} />
                        </div>
                        <p className="text-xs text-muted">{acc.type}{acc.institution ? ` · ${acc.institution}` : ''}{acc.card_last4 ? ` · ••${acc.card_last4}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className={`font-black ${acc.type === 'Credit Card' ? '' : 'text-primary'}`}
                        style={acc.type === 'Credit Card' ? { color: 'var(--negative-strong)' } : undefined}>
                        {acc.type === 'Credit Card' ? '-' : ''}{fmt(acc.balance)}
                      </p>
                      {selectedAcc === acc.id && (
                        acc.user_id === user.id ? (
                          <div className="flex gap-1">
                            <button onClick={e => { e.stopPropagation(); openEditAcc(acc) }}
                              className="text-xs text-muted hover:text-primary px-2 py-1 rounded border"
                              style={{ borderColor: 'var(--card-border)' }}>Edit</button>
                            <button onClick={e => { e.stopPropagation(); handleDeleteAcc(acc.id) }}
                              className="text-xs text-muted hover:text-red-500 px-2 py-1 rounded border"
                              style={{ borderColor: 'var(--card-border)' }}>Delete</button>
                          </div>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded border text-muted" style={{ borderColor: 'var(--card-border)' }}>household</span>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {accounts.length === 0 && (
            <div className="card mb-5" style={{ border: '2px dashed var(--card-border)' }}>
              <EmptyState Icon={Landmark} title="No accounts yet" sub="Connect your bank automatically or add accounts manually.">
                <button onClick={() => setTab('connect')} className="btn-primary"><Link2 size={15} /> Connect Bank</button>
                <button onClick={openAddAcc} className="btn-secondary">+ Add Manually</button>
              </EmptyState>
            </div>
          )}

          {/* Transaction Log */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-black text-primary">
                Transactions
                {selectedAcc && <span className="text-muted font-normal text-sm ml-2">· {accounts.find(a => a.id === selectedAcc)?.name}</span>}
              </h2>
              <span className="text-xs text-muted">{visibleTxns.length} entries</span>
            </div>

            <div className="flex gap-2 mb-3">
              <input className="input-field flex-1 text-sm" placeholder="Search transactions…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="mb-3">
              <SegTabs small tabs={DATE_RANGE_OPTIONS} active={dateRange} onChange={setDateRange} />
            </div>
            {/* Active pill uses the standard seg-tab colors — the old version painted
                "All" white-on-white in light mode (white bg + white text). */}
            <div className="flex flex-wrap gap-2 mb-4">
              {['all', 'expense', 'income', 'transfer'].map(k => (
                <button key={k} onClick={() => setTxnFilter(k)}
                  className={`seg-tab capitalize ${txnFilter === k ? 'seg-tab-active' : ''}`}
                  style={{ padding: '5px 12px', fontSize: 12 }}>
                  {k === 'all' ? `All (${transactions.length})` : k}
                </button>
              ))}
            </div>

            {visibleTxns.length === 0 ? (
              <div className="card" style={{ border: '2px dashed var(--card-border)' }}>
                <EmptyState Icon={ClipboardList} title="No transactions yet" sub="Connect a bank to auto-sync, or log one manually.">
                  <button onClick={() => openAddTxn(selectedAcc || '')} className="btn-primary">+ Log Transaction</button>
                </EmptyState>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleTxns.map(txn => {
                  const acc = accounts.find(a => a.id === txn.account_id)
                  const isOwn = txn.user_id === user.id
                  return (
                    <SwipeableRow key={txn.id} onEdit={isOwn ? () => openEditTxn(txn) : undefined} onDelete={isOwn ? () => handleDeleteTxn(txn.id) : undefined}>
                    <div className="card p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <MerchantLogo name={txn.merchant || txn.description} FallbackIcon={KIND_ICON[txn.kind]}
                          fallbackBg={KIND_BG[txn.kind]} fallbackColor={KIND_COLOR[txn.kind]} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <p className="font-semibold text-sm text-primary truncate flex-1 min-w-0">{txn.description}</p>
                            {txn.source_type === 'plaid' && (
                              <span className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 inline-flex items-center gap-1"
                                style={{ background: 'var(--positive-bg)', color: 'var(--positive)' }}>
                                <Link2 size={11} /> Synced
                              </span>
                            )}
                            {txn.status === 'pending' && (
                              <span className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                                style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                                pending
                              </span>
                            )}
                            {txn.auto_categorized && (
                              <span className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 inline-flex items-center gap-1"
                                style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>
                                <Sparkle size={11} /> auto
                              </span>
                            )}
                            {!isOwn && (
                              <span className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                                style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                                household
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted">
                            {txn.kind === 'expense'
                              ? `${txn.category || ''} · ${txn.subcategory || ''}`
                              : txn.kind === 'income' ? txn.source || 'Income' : 'Transfer'}
                            {' · '}{txn.date}
                            {acc ? ` · ${acc.name}` : ''}
                            {txn.card_last4 ? ` ··${txn.card_last4}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className="font-black text-sm" style={{ color: KIND_STRONG[txn.kind] }}>
                          {txn.kind === 'expense' ? '-' : txn.kind === 'income' ? '+' : ''}{fmt(txn.amount)}
                        </p>
                        {/* Hidden below lg — swiping the row reveals the same actions there (see SwipeableRow) */}
                        {isOwn && <>
                          <button onClick={() => openEditTxn(txn)} className="hidden lg:inline-flex text-muted hover:text-primary"><Pencil size={14} /></button>
                          <button onClick={() => handleDeleteTxn(txn.id)} className="hidden lg:inline-flex text-muted hover:text-red-500"><Trash2 size={14} /></button>
                        </>}
                      </div>
                    </div>
                    </SwipeableRow>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════ IMPORT TAB ══════════════════ */}
      {tab === 'import' && <Import />}

      {/* ══════════════════ RULES TAB ══════════════════ */}
      {tab === 'rules' && (
        <div>
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <button onClick={openAddRule} className="btn-primary flex-1 justify-center">+ New Rule</button>
            <button onClick={handleApplyRules} disabled={applyingRules || rules.length === 0} className="btn-secondary flex-1 justify-center">
              {applyingRules ? <><RefreshCw size={15} className="animate-spin" /> Applying…</> : 'Re-run rules on existing transactions'}
            </button>
          </div>

          {applyResult !== null && (
            <div className="mb-4 p-3 rounded-xl text-xs font-medium flex items-center gap-1.5"
              style={{ background: 'var(--positive-bg)', border: '1px solid var(--positive)', color: 'var(--positive)' }}>
              <Check size={14} /> Updated {applyResult} transaction{applyResult !== 1 ? 's' : ''} to match your rules.
            </div>
          )}

          {rules.length === 0 ? (
            <div className="card" style={{ border: '2px dashed var(--card-border)' }}>
              <EmptyState Icon={ListFilter} title="No rules yet"
                sub="Create a rule to auto-categorize transactions whose description or merchant matches text you choose — e.g. always file 'Acme Corp' as a Utilities expense.">
                <button onClick={openAddRule} className="btn-primary">+ New Rule</button>
              </EmptyState>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map(r => (
                <div key={r.id} className="card p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-primary text-sm truncate">
                      {MATCH_FIELDS.find(f => f.value === r.match_field)?.label || r.match_field} "{r.match_value}"
                    </p>
                    <p className="text-xs text-muted truncate">
                      → {r.set_kind}{r.set_category ? ` · ${r.set_category} › ${r.set_subcategory}` : ''}{r.set_label ? ` · label: ${r.set_label}` : ''}
                    </p>
                  </div>
                  <button onClick={() => deleteRule(r.id)} className="text-muted hover:text-red-500 flex-shrink-0"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════ ACCOUNT MODAL ══════════════════ */}
      {showAccModal && (
        <div className="modal-overlay" onClick={() => setShowAccModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <p className="accent-text font-black text-lg">{editAcc ? 'Edit Account' : 'Add Manual Account'}</p>
              <button onClick={() => setShowAccModal(false)} className="text-muted hover:text-primary"><X size={20} /></button>
            </div>

            <form onSubmit={handleSaveAcc}>
              <div className="mb-4">
                <label className="label">Account Name</label>
                <input className="input-field" placeholder="e.g., Chase Checking" value={accForm.name} onChange={e => setAccForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="mb-4">
                <label className="label">Account Type</label>
                <select className="input-field" value={accForm.type} onChange={e => setAccForm(f => ({ ...f, type: e.target.value }))}>
                  {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="mb-4">
                <label className="label">Current Balance ($)</label>
                <input className="input-field" type="number" step="0.01" placeholder="0.00" value={accForm.balance} onChange={e => setAccForm(f => ({ ...f, balance: e.target.value }))} required />
              </div>
              <div className="mb-4">
                <label className="label">Institution (optional)</label>
                <input className="input-field" placeholder="e.g., Chase, Bank of America" value={accForm.institution} onChange={e => setAccForm(f => ({ ...f, institution: e.target.value }))} />
              </div>
              {accForm.type === 'Credit Card' && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="label">Last 4 Digits</label>
                    <input className="input-field" placeholder="1234" maxLength={4} value={accForm.card_last4} onChange={e => setAccForm(f => ({ ...f, card_last4: e.target.value.replace(/\D/g, '') }))} />
                  </div>
                  <div>
                    <label className="label">Card Network</label>
                    <select className="input-field" value={accForm.card_type} onChange={e => setAccForm(f => ({ ...f, card_type: e.target.value }))}>
                      {CARD_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div className="mb-6">
                <label className="label">Card Color</label>
                <div className="flex gap-2 flex-wrap">
                  {CARD_COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setAccForm(f => ({ ...f, color: c }))}
                      className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ background: c, borderColor: accForm.color === c ? '#fff' : 'transparent' }} />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setShowAccModal(false)} className="btn-secondary justify-center">Cancel</button>
                <button type="submit" disabled={savingAcc} className="btn-primary justify-center">{savingAcc ? 'Saving…' : editAcc ? 'Save Changes' : 'Add Account'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════ TRANSACTION MODAL ══════════════════ */}
      {showTxnModal && (
        <div className="modal-overlay" onClick={() => setShowTxnModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <p className="accent-text font-black text-lg">{editTxn ? 'Edit Transaction' : 'Log Transaction'}</p>
              <button onClick={() => setShowTxnModal(false)} className="text-muted hover:text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveTxn}>
              <div className="mb-4">
                <label className="label">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {TXN_KINDS.map(k => {
                    const KIcon = KIND_ICON[k]
                    return (
                      <button key={k} type="button" onClick={() => setTxnForm(f => ({ ...f, kind: k }))}
                        className="py-2 rounded-xl text-sm font-bold capitalize transition-all inline-flex items-center justify-center gap-1"
                        style={{
                          background: txnForm.kind === k ? KIND_COLOR[k] : 'var(--input-bg)',
                          color:      txnForm.kind === k ? '#fff' : 'var(--text-muted)',
                          border:     '1px solid var(--card-border)',
                        }}>
                        <KIcon size={14} /> {k}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mb-4">
                <label className="label">Description</label>
                <input className="input-field" placeholder="e.g., Nike shoes, Netflix, Salary deposit"
                  value={txnForm.description} onChange={e => handleDescChange(e.target.value)} required />
                {autoSuggest && (
                  <div className="mt-2 flex items-center justify-between rounded-xl px-3 py-2"
                    style={{ background: 'var(--info-bg)', border: '1px solid var(--info)' }}>
                    <p className="text-xs flex items-center gap-1" style={{ color: 'var(--info)' }}>
                      <Sparkle size={12} /> Suggested: <strong>{autoSuggest.kind}</strong>
                      {autoSuggest.category ? ` · ${autoSuggest.category} › ${autoSuggest.subcategory}` : ''}
                    </p>
                    <button type="button" onClick={applyAutoSuggest}
                      className="text-xs font-bold ml-3 px-2 py-1 rounded"
                      style={{ background: 'var(--info)', color: '#fff' }}>Apply</button>
                  </div>
                )}
              </div>

              <div className="mb-4">
                <label className="label">Amount ($)</label>
                <input className="input-field" type="number" step="0.01" min="0" placeholder="0.00"
                  value={txnForm.amount} onChange={e => setTxnForm(f => ({ ...f, amount: e.target.value }))} required />
              </div>

              {txnForm.kind === 'expense' && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="label">Category</label>
                    <select className="input-field" value={txnForm.category}
                      onChange={e => setTxnForm(f => ({ ...f, category: e.target.value, subcategory: CATEGORIES.expense[e.target.value]?.[0] || 'Other' }))}>
                      {Object.keys(CATEGORIES.expense).map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Subcategory</label>
                    <select className="input-field" value={txnForm.subcategory}
                      onChange={e => setTxnForm(f => ({ ...f, subcategory: e.target.value }))}>
                      {(CATEGORIES.expense[txnForm.category] || ['Other']).map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {txnForm.kind === 'income' && (
                <div className="mb-4">
                  <label className="label">Income Source</label>
                  <select className="input-field" value={txnForm.source} onChange={e => setTxnForm(f => ({ ...f, source: e.target.value }))}>
                    {INCOME_SOURCES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              )}

              <div className="mb-4">
                <label className="label">Account (optional)</label>
                <select className="input-field" value={txnForm.account_id} onChange={e => setTxnForm(f => ({ ...f, account_id: e.target.value }))}>
                  <option value="">No account</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.card_last4 ? ` ··${a.card_last4}` : ''}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="label">Date</label>
                  <input className="input-field" type="date" value={txnForm.date} onChange={e => setTxnForm(f => ({ ...f, date: e.target.value }))} required />
                </div>
                <div>
                  <label className="label">Label (optional)</label>
                  <input className="input-field" placeholder="e.g., work trip" value={txnForm.label} onChange={e => setTxnForm(f => ({ ...f, label: e.target.value }))} />
                </div>
              </div>

              <div className="mb-6">
                <label className="label">Notes (optional)</label>
                <textarea className="input-field resize-none" rows={2} placeholder="Any details…"
                  value={txnForm.notes} onChange={e => setTxnForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setShowTxnModal(false)} className="btn-secondary justify-center">Cancel</button>
                <button type="submit" disabled={savingTxn} className="btn-primary justify-center">{savingTxn ? 'Saving…' : editTxn ? 'Save Changes' : 'Log Transaction'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════ NEW RULE MODAL ══════════════════ */}
      {showRuleForm && (
        <div className="modal-overlay" onClick={() => setShowRuleForm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <p className="accent-text font-black text-lg">New Rule</p>
              <button onClick={() => setShowRuleForm(false)} className="text-muted hover:text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveRule}>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="label">Match field</label>
                  <select className="input-field" value={ruleForm.match_field} onChange={e => setRuleForm(f => ({ ...f, match_field: e.target.value }))}>
                    {MATCH_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Text to match</label>
                  <input className="input-field" placeholder="e.g., acme corp" value={ruleForm.match_value}
                    onChange={e => setRuleForm(f => ({ ...f, match_value: e.target.value }))} required />
                </div>
              </div>

              <div className="mb-4">
                <label className="label">Set type</label>
                <div className="grid grid-cols-3 gap-2">
                  {TXN_KINDS.map(k => (
                    <button key={k} type="button" onClick={() => setRuleForm(f => ({ ...f, set_kind: k }))}
                      className="py-2 rounded-xl text-sm font-bold capitalize transition-all"
                      style={{
                        background: ruleForm.set_kind === k ? KIND_COLOR[k] : 'var(--input-bg)',
                        color:      ruleForm.set_kind === k ? '#fff' : 'var(--text-muted)',
                        border:     '1px solid var(--card-border)',
                      }}>
                      {k}
                    </button>
                  ))}
                </div>
              </div>

              {ruleForm.set_kind === 'expense' && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="label">Category</label>
                    <select className="input-field" value={ruleForm.set_category}
                      onChange={e => setRuleForm(f => ({ ...f, set_category: e.target.value, set_subcategory: CATEGORIES.expense[e.target.value]?.[0] || 'Other' }))}>
                      {Object.keys(CATEGORIES.expense).map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Subcategory</label>
                    <select className="input-field" value={ruleForm.set_subcategory}
                      onChange={e => setRuleForm(f => ({ ...f, set_subcategory: e.target.value }))}>
                      {(CATEGORIES.expense[ruleForm.set_category] || ['Other']).map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <label className="label">Label (optional)</label>
                <input className="input-field" placeholder="e.g., work trip" value={ruleForm.set_label}
                  onChange={e => setRuleForm(f => ({ ...f, set_label: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setShowRuleForm(false)} className="btn-secondary justify-center">Cancel</button>
                <button type="submit" disabled={savingRule} className="btn-primary justify-center">{savingRule ? 'Saving…' : 'Create Rule'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
