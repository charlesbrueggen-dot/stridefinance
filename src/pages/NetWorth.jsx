// src/pages/NetWorth.jsx
// ─────────────────────────────────────────────────────────────────────────────
//  Net Worth — now includes:
//   • Account balances (assets table debit accounts + credit card debt)
//   • account_transactions income/expense impact on cash position
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo } from 'react'
import {
  Home, Car, Laptop, Gem, Landmark, Banknote, Package,
  CreditCard, TrendingUp, HandCoins, ArrowUpRight, ArrowDownRight,
  Pencil, Trash2, X,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import { useTransactions } from '../hooks/useTransactions'
import { fmtCurrency as fmt, fmtCompact } from '../lib/format'
import { netWorthHistory } from '../lib/netWorthHistory'
import { useDarkMode } from '../hooks/useDarkMode'
import { PageHeader, EmptyState, PageSkeleton } from '../components/ui'

const today = () => new Date().toISOString().split('T')[0]
const CATEGORIES = ['Real Estate', 'Vehicle', 'Electronics', 'Jewelry', 'Savings', 'Cash', 'Other']
const CAT_ICONS  = { 'Real Estate': Home, Vehicle: Car, Electronics: Laptop, Jewelry: Gem, Savings: Landmark, Cash: Banknote, Other: Package }

export default function NetWorth() {
  const { user }                             = useAuth()
  const { accounts, expenseTxns, incomeTxns } = useTransactions()
  const dark = useDarkMode()

  const [assets,      setAssets]      = useState([])
  const [investments, setInvestments] = useState([])
  const [income,      setIncome]      = useState([])
  const [expenses,    setExpenses]    = useState([])
  const [loans,       setLoans]       = useState([])
  const [loading,     setLoading]     = useState(true)

  const [showModal, setShowModal] = useState(false)
  const [editItem,  setEditItem]  = useState(null)
  const [form,      setForm]      = useState({ name: '', value: '', category: 'Other', purchase_date: today(), notes: '' })
  const [saving,    setSaving]    = useState(false)

  const load = async () => {
    const [{ data: a }, { data: inv }, { data: inc }, { data: ln }, { data: exp }] = await Promise.all([
      supabase.from('assets').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('investments').select('*').eq('user_id', user.id),
      supabase.from('income').select('amount, date').eq('user_id', user.id),
      supabase.from('loans').select('*').eq('user_id', user.id),
      supabase.from('expenses').select('amount, recurring, date').eq('user_id', user.id),
    ])
    setAssets(a || []); setInvestments(inv || []); setIncome(inc || [])
    setLoans(ln || []); setExpenses(exp || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [user.id])

  const openAdd  = () => { setEditItem(null);  setForm({ name: '', value: '', category: 'Other', purchase_date: today(), notes: '' }); setShowModal(true) }
  const openEdit = item => { setEditItem(item); setForm({ name: item.name, value: item.value, category: item.category, purchase_date: item.purchase_date, notes: item.notes || '' }); setShowModal(true) }

  const handleSave = async e => {
    e.preventDefault(); setSaving(true)
    const payload = { name: form.name.trim(), value: parseFloat(form.value), category: form.category, purchase_date: form.purchase_date, notes: form.notes, user_id: user.id }
    if (editItem) await supabase.from('assets').update(payload).eq('id', editItem.id).eq('user_id', user.id)
    else          await supabase.from('assets').insert(payload)
    setSaving(false); setShowModal(false); load()
  }

  const handleDelete = async id => {
    await supabase.from('assets').delete().eq('id', id).eq('user_id', user.id)
    load()
  }

  // ── Net Worth Calculation ─────────────────────────────────────────────────
  // Account balances
  const acctAssets          = accounts.filter(a => a.type !== 'Credit Card').reduce((s, a) => s + parseFloat(a.balance || 0), 0)
  const acctDebt            = accounts.filter(a => a.type === 'Credit Card').reduce((s, a) => s + parseFloat(a.balance || 0), 0)

  const physicalAssets      = assets.reduce((s, a) => s + a.value, 0)
  const portValue           = investments.reduce((s, i) => s + (i.shares * (i.current_price || i.avg_cost)), 0)
  const moneyLent           = loans.filter(l => l.type === 'lent'     && !l.settled).reduce((s, l) => s + l.amount, 0)
  const moneyOwed           = loans.filter(l => l.type === 'borrowed' && !l.settled).reduce((s, l) => s + l.amount, 0)

  // Cash comes only from real account balances — never a spending-derived estimate. Credit
  // card overspending already shows up as that account's own debt (acctDebt below), so folding
  // income-minus-expenses in here too would double-count the same signal. No accounts set up
  // yet means $0 cash, not a guess.
  const cashPosition = acctAssets
  const netWorth     = cashPosition + physicalAssets + portValue + moneyLent - moneyOwed - acctDebt

  // ── Net worth over time ─────────────────────────────────────────────────
  // No historical snapshots exist — reconstructed from data already on hand
  // (see src/lib/netWorthHistory.js for the approach/caveats). The walk-back
  // has to use whichever income/expense source actually explains cashPosition
  // above — real account transactions when using account balances, or the
  // legacy income/expenses tables when falling back to that estimate — or the
  // backward math wouldn't reconcile with today's real cash figure.
  const usingRealCash = acctAssets > 0
  const cashFlowIncome   = useMemo(
    () => usingRealCash ? incomeTxns.map(t => ({ amount: t.amount, date: t.date })) : income,
    [usingRealCash, incomeTxns, income]
  )
  const cashFlowExpenses = useMemo(
    () => usingRealCash ? expenseTxns.map(t => ({ amount: t.amount, date: t.date })) : expenses.filter(e => !e.recurring),
    [usingRealCash, expenseTxns, expenses]
  )
  const history = useMemo(() => netWorthHistory({
    allIncome: cashFlowIncome, allExpenses: cashFlowExpenses, currentCash: cashPosition - acctDebt,
    investments, assets, loans, months: 12,
  }), [cashFlowIncome, cashFlowExpenses, cashPosition, acctDebt, investments, assets, loans])

  const breakdown = [
    { label: 'Bank Accounts',     value: acctAssets,     Icon: Landmark,   show: acctAssets > 0 },
    { label: 'Credit Card Debt',  value: -acctDebt,      Icon: CreditCard, show: acctDebt > 0, negative: true },
    { label: 'Investments',       value: portValue,      Icon: TrendingUp, show: true },
    { label: 'Physical Assets',   value: physicalAssets, Icon: Package,    show: true },
    { label: 'Money Lent Out',    value: moneyLent,      Icon: HandCoins,  show: true },
    { label: 'Money You Owe',     value: -moneyOwed,     Icon: HandCoins,  show: true, negative: true },
  ].filter(b => b.show)

  if (loading) return <PageSkeleton stats={4} />

  return (
    <div>
      <PageHeader title="Net Worth" subtitle="Total financial position including accounts & transactions">
        <button onClick={openAdd} className="btn-primary text-sm">+ Add Asset</button>
      </PageHeader>

      {/* Net Worth Hero */}
      <div className="card p-6 mb-4 flex items-center justify-between">
        <div>
          <p className="text-muted text-sm mb-1">Total Net Worth</p>
          <p className="text-4xl sm:text-5xl font-black tnum" style={{ color: netWorth >= 0 ? 'var(--text-primary)' : 'var(--negative-strong)' }}>{fmt(netWorth)}</p>
          {accounts.length > 0 && (
            <p className="text-xs text-muted mt-2">Includes {accounts.length} connected account{accounts.length !== 1 ? 's' : ''}</p>
          )}
        </div>
        <span className="text-muted opacity-40">{netWorth >= 0 ? <ArrowUpRight size={44} /> : <ArrowDownRight size={44} />}</span>
      </div>

      {/* Net Worth Over Time — reconstructed, not a stored snapshot; see netWorthHistory.js */}
      <div className="card p-5 mb-4">
        <p className="font-bold text-primary text-sm mb-1">Net Worth Over Time</p>
        <p className="text-muted text-xs mb-3">Trailing 12 months · estimated from your transaction history</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={history} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={dark ? '#10b981' : '#1a5a94'} stopOpacity={0.3} />
                <stop offset="95%" stopColor={dark ? '#10b981' : '#1a5a94'} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtCompact} />
            <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--modal-bg)', border: '1px solid var(--card-border)', borderRadius: 10, fontSize: 13 }} />
            <Area type="monotone" dataKey="total" name="Net Worth" stroke={dark ? '#10b981' : '#1a5a94'} fill="url(#colorNetWorth)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdown Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {breakdown.map(item => (
          <div key={item.label} className="card p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-muted text-xs mb-1 font-semibold">{item.label}</p>
                <p className={`text-xl font-black tnum ${item.negative ? '' : 'text-primary'}`}
                  style={item.negative ? { color: 'var(--negative-strong)' } : undefined}>
                  {item.negative ? '-' : ''}{fmt(Math.abs(item.value))}
                </p>
              </div>
              <span className="opacity-30 flex-shrink-0"><item.Icon size={24} /></span>
            </div>
          </div>
        ))}
      </div>

      {/* Connected accounts section */}
      {accounts.length > 0 && (
        <div className="card p-5 mb-6">
          <p className="font-bold text-primary text-sm mb-3">Connected Accounts</p>
          <div className="space-y-2">
            {accounts.map(acc => (
              <div key={acc.id} className="flex justify-between items-center py-2 border-b last:border-b-0" style={{ borderColor: 'var(--card-border)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-primary">{acc.type === 'Credit Card' ? <CreditCard size={16} /> : <Landmark size={16} />}</span>
                  <div>
                    <p className="text-sm font-medium text-primary">{acc.name}</p>
                    <p className="text-xs text-muted">{acc.type}{acc.institution ? ` · ${acc.institution}` : ''}</p>
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

      {/* Physical Asset Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {assets.length === 0 && (
          <div className="col-span-full card">
            <EmptyState Icon={Package} title="No physical assets yet" sub="Add things you own — house, car, electronics — to complete your net worth.">
              <button onClick={openAdd} className="btn-primary">+ Add Asset</button>
            </EmptyState>
          </div>
        )}
        {assets.map(item => (
          <div key={item.id} className="card p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-primary" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
                  {(() => { const CatIcon = CAT_ICONS[item.category] || Package; return <CatIcon size={18} /> })()}
                </div>
                <div>
                  <p className="font-semibold text-primary">{item.name}</p>
                  <p className="text-muted text-xs">{item.category}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(item)} className="text-muted hover:text-primary"><Pencil size={14} /></button>
                <button onClick={() => handleDelete(item.id)} className="text-muted hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
            <p className="text-2xl font-bold text-primary">{fmt(item.value)}</p>
            <p className="text-muted text-sm mt-1">Purchased: {item.purchase_date}</p>
          </div>
        ))}
      </div>

      {/* Asset Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <p className="accent-text font-semibold text-lg">{editItem ? 'Edit Asset' : 'Add Asset'}</p>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="mb-4"><label className="label">Asset Name</label><input className="input-field" placeholder="e.g., House, Car, Jewelry" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div className="mb-4"><label className="label">Current Value</label><input className="input-field" type="number" step="0.01" min="0" placeholder="0.00" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} required /></div>
              <div className="mb-4"><label className="label">Category</label><select className="input-field" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
              <div className="mb-4"><label className="label">Purchase Date</label><input className="input-field" type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} /></div>
              <div className="mb-6"><label className="label">Notes (Optional)</label><textarea className="input-field resize-none" rows={2} placeholder="Additional information" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary justify-center">{saving ? 'Saving…' : editItem ? 'Save Changes' : 'Add Asset'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
