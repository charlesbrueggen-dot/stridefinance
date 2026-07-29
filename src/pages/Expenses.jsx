// src/pages/Expenses.jsx
// ─────────────────────────────────────────────────────────────────────────────
//  Expenses — unified view of:
//   1. Legacy manual expenses (expenses table — unchanged)
//   2. Account transactions tagged kind='expense' (account_transactions table)
//  Both sources rendered together, sorted by date.
//  Account transactions show a credit-card badge and link to the account.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo } from 'react'
import {
  CreditCard, Home, ShoppingCart, Zap, Car, Stethoscope, Clock,
  Receipt, Repeat, Pencil, Trash2, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import { useTransactions } from '../hooks/useTransactions'
import { fmtCurrency as fmt } from '../lib/format'
import { PageHeader, StatCard, EmptyState, PageSkeleton, SegTabs } from '../components/ui'
import MerchantLogo from '../components/MerchantLogo'
import { DATE_RANGE_OPTIONS, inDateRange } from '../lib/dateRange'
import SwipeableRow from '../components/SwipeableRow'

const today = () => new Date().toISOString().split('T')[0]
const QUICK_AMOUNTS = [1, 5, 10, 50, 100, 500]

const QUICK_CATS = [
  { label: 'Rent/Mortgage',   Icon: Home, category: 'Needs', sub: 'Rent' },
  { label: 'Groceries',       Icon: ShoppingCart, category: 'Needs', sub: 'Groceries' },
  { label: 'Utilities',       Icon: Zap, category: 'Needs', sub: 'Utilities' },
  { label: 'Transportation',  Icon: Car, category: 'Needs', sub: 'Transportation' },
  { label: 'Healthcare',      Icon: Stethoscope, category: 'Needs', sub: 'Healthcare' },
]

const CATEGORIES    = ['Needs', 'Wants', 'Savings']
const SUBCATEGORIES = {
  Needs:   ['Rent', 'Groceries', 'Utilities', 'Transportation', 'Healthcare', 'Insurance', 'Other'],
  Wants:   ['Dining', 'Entertainment', 'Shopping', 'Travel', 'Subscriptions', 'Other'],
  Savings: ['Emergency Fund', 'Retirement', 'Investment', 'Vacation', 'Other'],
}
const FILTER_TABS = ['All', 'Needs', 'Wants', 'Savings']

const FREQUENCY_OPTIONS = [
  { value: 'none',     label: 'One-Time',  icon: '1x'  },
  { value: 'weekly',   label: 'Weekly',    icon: '7d'  },
  { value: 'biweekly', label: 'Bi-Weekly', icon: '14d' },
  { value: 'monthly',  label: 'Monthly',   icon: '30d' },
]

const frequencyLabel = f => ({ none: 'One-Time', weekly: 'Weekly', biweekly: 'Bi-Weekly', monthly: 'Monthly' }[f] || 'One-Time')

const calcNextDue = (startDate, frequency) => {
  if (!startDate || frequency === 'none') return ''
  const d = new Date(startDate)
  if (isNaN(d)) return ''
  if (frequency === 'weekly')   d.setDate(d.getDate() + 7)
  if (frequency === 'biweekly') d.setDate(d.getDate() + 14)
  if (frequency === 'monthly')  d.setMonth(d.getMonth() + 1)
  return d.toISOString().split('T')[0]
}

export default function Expenses() {
  const { user }                                   = useAuth()
  const { expenseTxns, accounts, reload: reloadTxns } = useTransactions()

  // Legacy expenses table
  const [legacyExpenses, setLegacyExpenses] = useState([])
  const [loading,        setLoading]        = useState(true)

  const [search,   setSearch]   = useState('')
  const [tab,      setTab]      = useState('All')
  const [dateRange, setDateRange] = useState('all')
  const [step,     setStep]     = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [form,     setForm]     = useState({
    description: '', amount: '', category: 'Needs', subcategory: 'Other',
    date: today(), notes: '', frequency: 'none', next_due: '',
  })
  const [saving, setSaving] = useState(false)

  // Which source are we editing: 'legacy' | 'account_txn'
  const [editSource, setEditSource] = useState('legacy')

  const loadLegacy = async () => {
    const { data } = await supabase.from('expenses').select('*').eq('user_id', user.id).order('date', { ascending: false })
    setLegacyExpenses(data || [])
    setLoading(false)
  }
  useEffect(() => { loadLegacy() }, [user.id])

  // ── Merge both sources ──────────────────────────────────────────────────────
  const allExpenses = useMemo(() => {
    const legacy = legacyExpenses.map(e => ({ ...e, _source: 'legacy' }))
    const accTxns = expenseTxns.map(t => ({
      id:          t.id,
      description: t.description,
      amount:      t.amount,
      category:    t.category || 'Wants',
      subcategory: t.subcategory || 'Other',
      date:        t.date,
      notes:       t.notes || '',
      frequency:   'none',
      next_due:    null,
      recurring:   false,
      label:       t.label,
      merchant:    t.merchant,
      card_last4:  t.card_last4,
      account_id:  t.account_id,
      _source:     'account_txn',
      _account:    accounts.find(a => a.id === t.account_id),
    }))
    return [...legacy, ...accTxns].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [legacyExpenses, expenseTxns, accounts])

  // ── CRUD — legacy ──────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditItem(null); setEditSource('legacy')
    setForm({ description: '', amount: '', category: 'Needs', subcategory: 'Other', date: today(), notes: '', frequency: 'none', next_due: '' })
    setStep('quick')
  }

  // Deep link from the Dashboard's "+ Add" menu: /expenses?add=1 opens the form immediately
  useEffect(() => {
    if (!loading && new URLSearchParams(window.location.search).get('add') === '1') openAdd()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const openEdit = item => {
    setEditItem(item)
    setEditSource(item._source)
    setForm({
      description: item.description, amount: item.amount,
      category:    item.category,    subcategory: item.subcategory || 'Other',
      date:        item.date,        notes: item.notes || '',
      frequency:   item.frequency || 'none', next_due: item.next_due || '',
    })
    setStep('form')
  }

  const selectQuickCat = qc => {
    setForm(f => ({ ...f, description: qc.label, category: qc.category, subcategory: qc.sub }))
    setStep('form')
  }

  const handleSave = async e => {
    e.preventDefault()
    if (!form.description.trim() || !form.amount) return
    setSaving(true)

    if (editSource === 'account_txn' && editItem) {
      // Update in account_transactions
      await supabase.from('account_transactions').update({
        description: form.description.trim(),
        amount:      parseFloat(form.amount),
        category:    form.category,
        subcategory: form.subcategory,
        date:        form.date,
        notes:       form.notes,
      }).eq('id', editItem.id).eq('user_id', user.id)
      await reloadTxns()
    } else {
      // Legacy expenses table
      const payload = {
        description: form.description.trim(), amount: parseFloat(form.amount),
        category:    form.category,           subcategory: form.subcategory,
        date:        form.date,               notes: form.notes,
        frequency:   form.frequency,
        next_due:    form.frequency !== 'none' ? (form.next_due || calcNextDue(form.date, form.frequency) || null) : null,
        recurring:   form.frequency !== 'none',
        user_id:     user.id,
      }
      if (editItem) await supabase.from('expenses').update(payload).eq('id', editItem.id).eq('user_id', user.id)
      else          await supabase.from('expenses').insert(payload)
      await loadLegacy()
    }

    setSaving(false); setStep(null)
  }

  const handleDelete = async item => {
    if (item._source === 'account_txn') {
      await supabase.from('account_transactions').delete().eq('id', item.id).eq('user_id', user.id)
      reloadTxns()
    } else {
      await supabase.from('expenses').delete().eq('id', item.id).eq('user_id', user.id)
      loadLegacy()
    }
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalExpenses = allExpenses.reduce((s, e) => s + parseFloat(e.amount), 0)
  const needs         = allExpenses.filter(e => e.category === 'Needs').reduce((s, e) => s + parseFloat(e.amount), 0)
  const wants         = allExpenses.filter(e => e.category === 'Wants').reduce((s, e) => s + parseFloat(e.amount), 0)
  const savings       = allExpenses.filter(e => e.category === 'Savings').reduce((s, e) => s + parseFloat(e.amount), 0)

  const filtered = allExpenses.filter(e => {
    const matchTab    = tab === 'All' || e.category === tab
    const matchSearch = !search || e.description.toLowerCase().includes(search.toLowerCase())
    const matchDate   = inDateRange(e.date, dateRange)
    return matchTab && matchSearch && matchDate
  })

  const upcoming = legacyExpenses
    .filter(e => e.frequency && e.frequency !== 'none' && e.next_due)
    .sort((a, b) => new Date(a.next_due) - new Date(b.next_due))
    .slice(0, 5)

  if (loading) return <PageSkeleton stats={4} hero={false} />

  return (
    <div>
      <PageHeader title="Expenses" subtitle="All spending — manual entries & account transactions">
        <button onClick={openAdd} className="btn-primary text-sm">+ Add Expense</button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Expenses" value={fmt(totalExpenses)} sub={`${allExpenses.length} entries`} />
        <StatCard label="Needs" value={fmt(needs)} tone="#10b981" />
        <StatCard label="Wants" value={fmt(wants)} tone="#f59e0b" />
        <StatCard label="Savings" value={fmt(savings)} tone="#3b82f6" />
      </div>

      {/* Upcoming recurring */}
      {upcoming.length > 0 && (
        <div className="card p-4 mb-6">
          <p className="font-bold text-primary text-sm mb-3 flex items-center gap-1.5"><Clock size={14} /> Upcoming Recurring</p>
          <div className="space-y-2">
            {upcoming.map(e => (
              <div key={e.id} className="flex justify-between text-sm">
                <span className="text-muted">{e.description}</span>
                <div className="flex items-center gap-2">
                  <span className="text-primary font-medium">{fmt(e.amount)}</span>
                  <span className="text-muted text-xs">due {e.next_due}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source legend */}
      {expenseTxns.length > 0 && (
        <div className="flex gap-3 mb-4 text-xs">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#ef4444' }} /> Manual entry
          </span>
          <span className="flex items-center gap-1.5 text-muted">
            <span className="text-blue-500 inline-flex"><CreditCard size={13} /></span> From account
          </span>
        </div>
      )}

      {/* Filter tabs + search */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <SegTabs tabs={FILTER_TABS} active={tab} onChange={setTab} />
        <input className="input-field flex-1 text-sm min-w-32" style={{ maxWidth: 280 }} placeholder="Search…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="mb-4">
        <SegTabs small tabs={DATE_RANGE_OPTIONS} active={dateRange} onChange={setDateRange} />
      </div>

      {/* Expense list */}
      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState Icon={Receipt} title="No expenses yet" sub="Start tracking your spending.">
            <button onClick={openAdd} className="btn-primary">+ Add Expense</button>
          </EmptyState>
        </div>
      ) : (
        <div className="card px-4 py-1">
          {filtered.map((item, idx) => {
            const isRecurring = item.frequency && item.frequency !== 'none'
            const isAccTxn    = item._source === 'account_txn'
            return (
              <SwipeableRow key={`${item._source}-${item.id}`} isLast={idx === filtered.length - 1}
                onEdit={() => openEdit(item)} onDelete={() => handleDelete(item)}>
              <div className="list-row">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <MerchantLogo name={item.merchant || item.description} FallbackIcon={isAccTxn ? CreditCard : Receipt} size={36} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-bold text-primary text-sm truncate">{item.description}</p>
                      {isRecurring && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                          style={{ background: 'var(--positive-bg)', color: 'var(--positive)' }}>
                          <Repeat size={11} className="inline mr-0.5" /> {frequencyLabel(item.frequency)}
                        </span>
                      )}
                      {isAccTxn && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                          style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>
                          <CreditCard size={11} className="inline mr-0.5" /> {item._account?.name || 'Account'}
                          {item.card_last4 ? ` ··${item.card_last4}` : ''}
                        </span>
                      )}
                      {item.label && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                          style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                          {item.label}
                        </span>
                      )}
                    </div>
                    <p className="text-muted text-xs mt-0.5 truncate">
                      {item.category} · {item.subcategory} · {item.date}
                      {isRecurring && item.next_due && <span> · Next: {item.next_due}</span>}
                      {item.notes && <span> · {item.notes}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className="font-black text-sm tnum" style={{ color: 'var(--negative-strong)' }}>-{fmt(item.amount)}</p>
                  <button onClick={() => openEdit(item)} className="text-muted hover:text-primary transition-colors p-1"><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(item)} className="transition-colors p-1" style={{ color: 'var(--negative-strong)' }}><Trash2 size={14} /></button>
                </div>
              </div>
              </SwipeableRow>
            )
          })}
        </div>
      )}

      {/* ── Quick Category Modal ── */}
      {step === 'quick' && (
        <div className="modal-overlay" onClick={() => setStep(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 accent-text font-semibold"><span>$</span><span>Add Expense</span></div>
              <button onClick={() => setStep(null)} className="text-muted hover:text-primary"><X size={20} /></button>
            </div>
            <p className="font-bold text-primary text-lg mb-4">Quick Select Category</p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {QUICK_CATS.map(qc => (
                <button key={qc.label} onClick={() => selectQuickCat(qc)}
                  className="flex flex-col items-center gap-2 p-4 border rounded-xl transition-colors text-primary"
                  style={{ borderColor: 'var(--card-border)', background: 'var(--input-bg)' }}>
                  <qc.Icon size={26} />
                  <span className="text-xs font-medium text-primary text-center">{qc.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setStep('form')} className="w-full text-muted text-sm hover:text-primary transition-colors py-2">Or fill manually</button>
          </div>
        </div>
      )}

      {/* ── Full Form Modal ── */}
      {step === 'form' && (
        <div className="modal-overlay" onClick={() => setStep(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 accent-text font-semibold">
                <span>$</span><span>{editItem ? 'Edit Expense' : 'Add Expense'}</span>
                {editSource === 'account_txn' && <span className="text-xs ml-1 inline-flex items-center gap-1" style={{ color: '#93c5fd' }}><CreditCard size={12} /> Account Txn</span>}
              </div>
              <button onClick={() => setStep(null)} className="text-muted hover:text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="mb-4">
                <label className="label">Description</label>
                <input className="input-field" placeholder="What did you spend on?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
              </div>
              <div className="mb-4">
                <label className="label">Amount (USD)</label>
                <input className="input-field" type="number" step="0.01" min="0" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
              </div>
              <div className="mb-4">
                <label className="label">Quick Add Amount</label>
                <div className="flex flex-wrap gap-2">
                  {QUICK_AMOUNTS.map(a => (
                    <button key={a} type="button" onClick={() => setForm(f => ({ ...f, amount: String((parseFloat(f.amount) || 0) + a) }))}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors text-primary"
                      style={{ borderColor: 'var(--card-border)', background: 'var(--input-bg)' }}>
                      + ${a}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="label">Category</label>
                  <select className="input-field" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value, subcategory: SUBCATEGORIES[e.target.value][0] }))}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Subcategory</label>
                  <select className="input-field" value={form.subcategory} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))}>
                    {SUBCATEGORIES[form.category].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Hide frequency for account_txn edits */}
              {editSource !== 'account_txn' && (
                <div className="mb-4">
                  <label className="label">Frequency</label>
                  <div className="grid grid-cols-4 gap-2">
                    {FREQUENCY_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => { const next = opt.value !== 'none' ? calcNextDue(form.date, opt.value) : ''; setForm(f => ({ ...f, frequency: opt.value, next_due: next })) }}
                        className="flex flex-col items-center gap-1 p-2 rounded-xl border text-xs font-semibold transition-all"
                        style={{
                          borderColor: form.frequency === opt.value ? 'var(--positive)' : 'var(--card-border)',
                          background:  form.frequency === opt.value ? 'var(--positive-bg)' : undefined,
                          color:       form.frequency === opt.value ? 'var(--positive)' : 'var(--text-muted)',
                        }}>
                        <span className="font-bold">{opt.icon}</span>
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="label">Date</label>
                <input className="input-field" type="date" value={form.date}
                  onChange={e => { const next = form.frequency !== 'none' ? calcNextDue(e.target.value, form.frequency) : ''; setForm(f => ({ ...f, date: e.target.value, next_due: next || f.next_due })) }} required />
              </div>

              {form.frequency !== 'none' && editSource !== 'account_txn' && (
                <div className="mb-4">
                  <label className="label">Next Due Date</label>
                  <input className="input-field" type="date" value={form.next_due} onChange={e => setForm(f => ({ ...f, next_due: e.target.value }))} />
                </div>
              )}

              <div className="mb-4">
                <label className="label">Notes (optional)</label>
                <textarea className="input-field resize-none" rows={2} placeholder="Any extra details…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setStep(null)} className="btn-secondary justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary justify-center">{saving ? 'Saving…' : editItem ? 'Save Changes' : 'Add Expense'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
