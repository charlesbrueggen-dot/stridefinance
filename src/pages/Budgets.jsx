// src/pages/Budgets.jsx
// Monthly $ limits per subcategory, tracked against this calendar month's spending
// (legacy `expenses` table + account_transactions expenses, same merge Expenses.jsx uses).
import { useState, useEffect, useMemo } from 'react'
import { Wallet, Plus, Pencil, Trash2, X, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import { useTransactions } from '../hooks/useTransactions'
import { fmtCurrency as fmt } from '../lib/format'
import { EmptyState, PageSkeleton } from '../components/ui'
import MonthFlipper, { monthKeyNow, monthLabel } from '../components/MonthFlipper'

const CATEGORIES    = ['Needs', 'Wants', 'Savings']
const SUBCATEGORIES = {
  Needs:   ['Rent', 'Groceries', 'Utilities', 'Transportation', 'Healthcare', 'Insurance', 'Other'],
  Wants:   ['Dining', 'Entertainment', 'Shopping', 'Travel', 'Subscriptions', 'Other'],
  Savings: ['Emergency Fund', 'Retirement', 'Investment', 'Vacation', 'Other'],
}

const blankForm = () => ({ category: 'Needs', subcategory: SUBCATEGORIES.Needs[0], monthly_limit: '' })

export default function Budgets() {
  const { user } = useAuth()
  const { expenseTxns } = useTransactions()

  const [legacyExpenses, setLegacyExpenses] = useState([])
  const [budgets, setBudgets]               = useState([])
  const [loading, setLoading]               = useState(true)
  const [showModal, setShowModal]           = useState(false)
  const [editItem, setEditItem]             = useState(null)
  const [form, setForm]                     = useState(blankForm())
  const [saving, setSaving]                 = useState(false)
  const [saveError, setSaveError]           = useState('')
  const [viewMonth, setViewMonth]           = useState(monthKeyNow())
  const isCurrentMonth = viewMonth === monthKeyNow()

  const load = async () => {
    const [{ data: exp }, { data: bud }] = await Promise.all([
      supabase.from('expenses').select('*').eq('user_id', user.id),
      supabase.from('budgets').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
    ])
    setLegacyExpenses(exp || [])
    setBudgets(bud || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [user.id])

  // Same merge Expenses.jsx uses — legacy manual entries + account-synced transactions.
  const allExpenses = useMemo(() => [
    ...legacyExpenses,
    ...expenseTxns.map(t => ({ amount: t.amount, category: t.category || 'Wants', subcategory: t.subcategory || 'Other', date: t.date })),
  ], [legacyExpenses, expenseTxns])

  // Selected calendar month's spend, bucketed by category+subcategory.
  const spentMap = useMemo(() => {
    const map = {}
    allExpenses.forEach(e => {
      if (!e.date || e.date.slice(0, 7) !== viewMonth) return
      const key = `${e.category}|${e.subcategory || 'Other'}`
      map[key] = (map[key] || 0) + Number(e.amount)
    })
    return map
  }, [allExpenses, viewMonth])

  const rows = budgets.map(b => {
    const spent = spentMap[`${b.category}|${b.subcategory}`] || 0
    const pct   = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0
    return { ...b, spent, pct, remaining: b.monthly_limit - spent, over: spent > b.monthly_limit }
  })

  const totalLimit = budgets.reduce((s, b) => s + Number(b.monthly_limit), 0)
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0)
  const totalLeft  = totalLimit - totalSpent

  const budgetedKeys = new Set(budgets.map(b => `${b.category}|${b.subcategory}`))

  const openAdd = () => {
    setEditItem(null)
    setForm(blankForm())
    setSaveError('')
    setShowModal(true)
  }

  const openEdit = b => {
    setEditItem(b)
    setForm({ category: b.category, subcategory: b.subcategory, monthly_limit: String(b.monthly_limit) })
    setSaveError('')
    setShowModal(true)
  }

  const handleSave = async e => {
    e.preventDefault()
    const limit = parseFloat(form.monthly_limit)
    if (!limit || limit <= 0) { setSaveError('Enter a monthly limit greater than $0.'); return }

    // Editing keeps its own (category, subcategory); adding blocks a duplicate on a pair that
    // already has a budget (the table's unique constraint would reject it anyway, but this
    // gives an immediate, specific message instead of a raw DB error).
    if (!editItem && budgetedKeys.has(`${form.category}|${form.subcategory}`)) {
      setSaveError(`${form.subcategory} already has a budget — edit it instead of adding a new one.`)
      return
    }

    setSaving(true)
    const payload = {
      user_id: user.id,
      category: form.category,
      subcategory: form.subcategory,
      monthly_limit: limit,
    }
    const { error } = editItem
      ? await supabase.from('budgets').update(payload).eq('id', editItem.id).eq('user_id', user.id)
      : await supabase.from('budgets').insert(payload)
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setShowModal(false)
    load()
  }

  const handleDelete = async id => {
    await supabase.from('budgets').delete().eq('id', id).eq('user_id', user.id)
    load()
  }

  if (loading) return <PageSkeleton stats={2} hero={false} />

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <button onClick={openAdd} className="btn-primary"><Plus size={16} /> Add Budget</button>
        <MonthFlipper value={viewMonth} onChange={setViewMonth} />
      </div>

      {budgets.length > 0 && (
        <div className="card p-6 mb-6 flex items-center gap-5">
          <div className="icon-chip flex-shrink-0" style={{ width: 52, height: 52, borderRadius: 99 }}>
            <Wallet size={24} />
          </div>
          <div>
            <p className="text-muted text-sm mb-1">Left to Spend {isCurrentMonth ? 'This Month' : `in ${monthLabel(viewMonth)}`}</p>
            <p className="text-4xl font-black tnum" style={{ color: totalLeft >= 0 ? 'var(--text-primary)' : 'var(--negative-strong)' }}>{fmt(totalLeft)}</p>
            <p className="text-muted text-sm mt-1">{fmt(totalSpent)} spent of {fmt(totalLimit)} budgeted</p>
          </div>
        </div>
      )}

      {budgets.length === 0 ? (
        <div className="card">
          <EmptyState Icon={Wallet} title="No Budgets Yet" sub="Set a monthly limit for a category to start tracking it here.">
            <button onClick={openAdd} className="btn-primary"><Plus size={16} /> Add Your First Budget</button>
          </EmptyState>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rows.map(r => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-primary">{r.subcategory}</p>
                  <p className="text-muted text-xs">{r.category}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1"
                    style={{ background: r.over ? 'var(--negative-bg)' : 'var(--positive-bg)', color: r.over ? 'var(--negative)' : 'var(--positive)' }}>
                    {r.over ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                    {r.over ? 'Over budget' : `${fmt(Math.max(0, r.remaining))} left`}
                  </span>
                  <button onClick={() => openEdit(r)} className="text-muted hover:text-primary"><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(r.id)} className="hover:opacity-75" style={{ color: 'var(--negative-strong)' }}><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="progress-bar mb-1">
                <div className="progress-fill" style={{ width: `${Math.min(100, r.pct)}%`, background: r.over ? 'var(--negative)' : 'var(--accent)' }}></div>
              </div>
              <p className="text-xs text-muted">{fmt(r.spent)} of {fmt(r.monthly_limit)} spent {isCurrentMonth ? 'this month' : `in ${monthLabel(viewMonth)}`}</p>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <p className="font-semibold text-lg text-primary">{editItem ? 'Edit Budget' : 'Add Budget'}</p>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label">Category</label>
                  <select className="input-field" value={form.category} disabled={!!editItem}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value, subcategory: SUBCATEGORIES[e.target.value][0] }))}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Subcategory</label>
                  <select className="input-field" value={form.subcategory} disabled={!!editItem}
                    onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))}>
                    {SUBCATEGORIES[form.category].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="mb-4">
                <label className="label">Monthly Limit ($)</label>
                <input className="input-field" type="number" step="0.01" min="0" placeholder="300.00"
                  value={form.monthly_limit} onChange={e => setForm(f => ({ ...f, monthly_limit: e.target.value }))} required autoFocus />
              </div>

              {saveError && (
                <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative)', color: 'var(--negative)' }}>
                  {saveError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary justify-center">{saving ? 'Saving…' : editItem ? 'Save Changes' : 'Add Budget'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
