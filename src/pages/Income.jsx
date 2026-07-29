import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { PieChart as PieChartIcon, Landmark, Repeat, DollarSign, Banknote, X, Pencil, Trash2 } from 'lucide-react'
import { pieStrokeProps, PIE_COLORS_LIGHT, PIE_COLORS_DARK, renderActivePieSector, pieCellOpacity, sortByValueDesc } from '../lib/chartTheme'
import { fmtCurrency as fmt } from '../lib/format'
import { detectBankIncomeFrequencies } from '../lib/incomeFrequency'
import { useDarkMode } from '../hooks/useDarkMode'
import { PageHeader, StatCard, EmptyState, PageSkeleton } from '../components/ui'

const QUICK_AMOUNTS = [1, 5, 10, 50, 100, 500]
const today = () => new Date().toISOString().split('T')[0]

const FREQUENCY_OPTIONS = [
  { value: 'one-time',  label: 'One-Time',  icon: '1×' },
  { value: 'weekly',    label: 'Weekly',    icon: '7d' },
  { value: 'biweekly',  label: 'Bi-Weekly', icon: '14d' },
  { value: 'monthly',   label: 'Monthly',   icon: '30d' },
]

const frequencyLabel = f => FREQUENCY_OPTIONS.find(o => o.value === f)?.label || 'One-Time'
const frequencyIcon  = f => FREQUENCY_OPTIONS.find(o => o.value === f)?.icon  || '1×'

export default function Income() {
  const { user } = useAuth()
  const [income, setIncome]         = useState([])   // manual income table
  const [bankIncome, setBankIncome] = useState([]) // from account_transactions (Plaid-synced + manual)
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)
  const [editItem, setEditItem]     = useState(null)
  const [form, setForm] = useState({ source: '', amount: '', date: today(), frequency: 'one-time', next_date: '' })
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const dark = useDarkMode()
  const [pieActiveIndex, setPieActiveIndex] = useState(null)
  const [search, setSearch] = useState('')

  const load = async () => {
    const [{ data: manualData }, { data: bankData }] = await Promise.all([
      supabase.from('income').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('account_transactions').select('*').eq('user_id', user.id).eq('kind', 'income').order('date', { ascending: false }),
    ])
    setIncome(manualData || [])
    setBankIncome(bankData || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [user.id])

  const openAdd = () => {
    setEditItem(null)
    setForm({ source: '', amount: '', date: today(), frequency: 'one-time', next_date: '' })
    setError('')
    setShowModal(true)
  }

  // Deep link from the Dashboard's "+ Add" menu: /income?add=1 opens the form immediately
  useEffect(() => {
    if (!loading && new URLSearchParams(window.location.search).get('add') === '1') openAdd()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const openEdit = item => {
    setEditItem(item)
    setForm({
      source: item.source,
      amount: item.amount,
      date: item.date,
      frequency: item.frequency || 'one-time',
      next_date: item.next_date || '',
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async e => {
    e.preventDefault()
    if (!form.source.trim() || !form.amount) { setError('Please fill in all fields'); return }
    setSaving(true)
    const payload = {
      source:    form.source.trim(),
      amount:    parseFloat(form.amount),
      date:      form.date,
      frequency: form.frequency,
      next_date: form.frequency !== 'one-time' ? (form.next_date || null) : null,
      user_id:   user.id,
    }
    if (editItem) await supabase.from('income').update(payload).eq('id', editItem.id).eq('user_id', user.id)
    else          await supabase.from('income').insert(payload)
    setSaving(false); setShowModal(false); load()
  }

  const handleDelete = async id => {
    await supabase.from('income').delete().eq('id', id).eq('user_id', user.id)
    load()
  }

  // Combine both sources for totals and pie chart
  const manualTotal = income.reduce((s, i) => s + Number(i.amount), 0)
  const bankTotal   = bankIncome.reduce((s, i) => s + Number(i.amount), 0)
  const totalIncome = manualTotal + bankTotal

  const recurring = income.filter(i => i.frequency && i.frequency !== 'one-time')
  const oneTime   = income.filter(i => !i.frequency || i.frequency === 'one-time')

  // Search only narrows which rows are *shown* — totals/pie chart above stay
  // computed from the full data, same as the Accounts/Expenses search boxes.
  const matchesSearch = s => !search || (s || '').toLowerCase().includes(search.toLowerCase())
  const shownBankIncome = bankIncome.filter(i => matchesSearch(i.source || i.description))
  const shownRecurring  = recurring.filter(i => matchesSearch(i.source))
  const shownOneTime    = oneTime.filter(i => matchesSearch(i.source))
  const noSearchResults = search && shownBankIncome.length === 0 && shownRecurring.length === 0 && shownOneTime.length === 0
    && (bankIncome.length > 0 || income.length > 0)

  // Bank-synced transactions have no declared frequency (they're individual deposits, not
  // recurring definitions like manual entries), so a repeating paycheck has to be inferred from
  // how often the same source shows up.
  const bankFrequencyTotals = detectBankIncomeFrequencies(bankIncome)

  // Pie: merge manual sources + bank-synced sources
  const normalizeSource = source => {
    if (!source) return 'Other'
    return source.trim().toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }
  const srcMap = {}
  income.forEach(i => { const key = normalizeSource(i.source); srcMap[key] = (srcMap[key] || 0) + Number(i.amount) })
  bankIncome.forEach(i => { const key = normalizeSource(i.source || i.description || 'Bank Income'); srcMap[key] = (srcMap[key] || 0) + Number(i.amount) })
  const pieData   = sortByValueDesc(Object.entries(srcMap).map(([name, value]) => ({ name, value })))
  const pieColors = dark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT

  if (loading) return <PageSkeleton stats={3} />

  return (
    <div>
      <PageHeader title="Income" subtitle="Track all your income streams — recurring and one-time">
        <button onClick={openAdd} className="btn-primary text-sm">+ Add Income</button>
      </PageHeader>

      {/* Hero + frequency stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-6">
          <div className="icon-chip mb-4" style={{ borderRadius: 99 }}>
            <DollarSign size={20} />
          </div>
          <p className="text-muted text-sm mb-1">Total Income</p>
          <p className="text-4xl font-black text-primary tnum">{fmt(totalIncome)}</p>
          <p className="text-muted text-sm mt-2">
            {recurring.length} recurring · {oneTime.length} one-time
            {bankIncome.length > 0 && <span> · {bankIncome.length} from bank</span>}
          </p>
        </div>
        <div className="grid grid-cols-3 lg:grid-cols-1 gap-3">
          {['weekly','biweekly','monthly'].map(freq => {
            const total = recurring.filter(i => i.frequency === freq).reduce((s, i) => s + Number(i.amount), 0) + bankFrequencyTotals[freq]
            return (
              <div key={freq} className="card p-4 lg:flex lg:items-center lg:justify-between">
                <p className="text-muted text-xs mb-1 lg:mb-0 font-semibold">{frequencyLabel(freq)}</p>
                <p className="font-black text-primary text-sm tnum">{fmt(total)}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pie */}
      <div className="card p-5 mb-6">
        <div className="flex items-center gap-2 mb-4 font-bold text-primary">
          <PieChartIcon size={16} /><span>Income Sources Breakdown</span>
        </div>
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={52} outerRadius={85} {...pieStrokeProps(dark)}
                activeIndex={pieActiveIndex} activeShape={renderActivePieSector(dark)}
                onMouseEnter={(_, i) => setPieActiveIndex(i)}
                onMouseLeave={() => setPieActiveIndex(null)}
                onClick={(_, i) => setPieActiveIndex(prev => (prev === i ? null : i))}
                style={{ cursor: 'pointer' }}>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={pieColors[i % pieColors.length]} fillOpacity={pieCellOpacity(pieActiveIndex, i)} />
                ))}
              </Pie>
              <Tooltip formatter={v => fmt(v)} contentStyle={{ background: dark ? '#111' : '#fff', border: '1px solid var(--card-border)', borderRadius: 10, color: 'var(--positive)', fontSize: 13 }} itemStyle={{ color: 'var(--positive)' }} labelStyle={{ color: 'var(--positive)' }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState Icon={PieChartIcon} title="No income data yet" sub="Add an entry above to see your source breakdown." />
        )}
      </div>

      {/* Search — narrows the lists below without touching totals/pie above */}
      {(income.length > 0 || bankIncome.length > 0) && (
        <input className="input-field text-sm mb-4" placeholder="Search income…"
          value={search} onChange={e => setSearch(e.target.value)} />
      )}

      {noSearchResults && (
        <div className="card mb-4">
          <EmptyState Icon={Banknote} title="No matches" sub={`Nothing matches "${search}".`} />
        </div>
      )}

      {/* Bank-synced income */}
      {shownBankIncome.length > 0 && (
        <div className="mb-4">
          <h2 className="font-bold text-primary mb-3 text-sm uppercase tracking-wider flex items-center gap-1.5"><Landmark size={14} /> Bank Income</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shownBankIncome.map(item => (
              <div key={item.id} className="card p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold"
                      style={{ background: 'var(--positive-bg)', border: '1px solid var(--positive)', color: 'var(--positive)' }}>
                      <Landmark size={18} />
                    </div>
                    <div>
                      <p className="font-bold text-primary">{item.source || item.description}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: 'var(--positive-bg)', color: 'var(--positive)' }}>
                        Auto-synced
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-2xl font-black text-primary">{fmt(item.amount)}</p>
                <p className="text-muted text-sm mt-1">{item.date}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recurring manual */}
      {shownRecurring.length > 0 && (
        <div className="mb-4">
          <h2 className="font-bold text-primary mb-3 text-sm uppercase tracking-wider flex items-center gap-1.5"><Repeat size={14} /> Recurring Income</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shownRecurring.map(item => <IncomeCard key={item.id} item={item} onEdit={openEdit} onDelete={handleDelete} />)}
          </div>
        </div>
      )}

      {/* One-time manual */}
      {shownOneTime.length > 0 && (
        <div className="mb-4">
          <h2 className="font-bold text-primary mb-3 text-sm uppercase tracking-wider flex items-center gap-1.5"><Banknote size={14} /> One-Time Income</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shownOneTime.map(item => <IncomeCard key={item.id} item={item} onEdit={openEdit} onDelete={handleDelete} />)}
          </div>
        </div>
      )}

      {income.length === 0 && bankIncome.length === 0 && (
        <div className="card">
          <EmptyState Icon={Banknote} title="No income entries yet" sub="Add your first income source to start tracking.">
            <button onClick={openAdd} className="btn-primary">+ Add Income</button>
          </EmptyState>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 font-bold text-primary">
                <span>$</span><span>{editItem ? 'Edit Income' : 'Add Income'}</span>
              </div>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave}>

              <div className="mb-4">
                <label className="label">Frequency</label>
                <div className="grid grid-cols-4 gap-2">
                  {FREQUENCY_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setForm(f => ({ ...f, frequency: opt.value, next_date: '' }))}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-sm font-semibold transition-all ${
                        form.frequency === opt.value ? '' : 'text-muted'
                      }`}
                      style={{
                        borderColor: form.frequency === opt.value ? 'var(--positive)' : 'var(--card-border)',
                        background:  form.frequency === opt.value ? 'var(--positive-bg)' : undefined,
                        color:       form.frequency === opt.value ? 'var(--positive)' : undefined,
                      }}>
                      <span className="text-xs font-bold" style={{ color: form.frequency === opt.value ? 'var(--positive)' : 'inherit' }}>{opt.icon}</span>
                      <span className="text-xs">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="label">Income Source</label>
                <input className="input-field" placeholder="e.g., Salary, Freelance, Side Hustle"
                  value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} required />
              </div>

              <div className="mb-4">
                <label className="label">Amount (USD){form.frequency !== 'one-time' && <span className="text-muted font-normal ml-1">per {frequencyLabel(form.frequency).toLowerCase().replace('bi-','bi').replace('ly','')}</span>}</label>
                <input className="input-field" type="number" step="0.01" min="0" placeholder="0.00"
                  value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
              </div>

              <div className="mb-4">
                <label className="label">Quick Add</label>
                <div className="flex flex-wrap gap-2">
                  {QUICK_AMOUNTS.map(a => (
                    <button key={a} type="button" onClick={() => setForm(f => ({ ...f, amount: String((parseFloat(f.amount) || 0) + a) }))}
                      className="px-3 py-1.5 rounded-lg text-sm font-bold text-primary transition-colors"
                      style={{ border: '1px solid var(--card-border)', background: 'var(--input-bg)' }}>
                      +${a}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="label">{form.frequency === 'one-time' ? 'Date Received' : 'Start Date'}</label>
                <input className="input-field" type="date" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </div>

              {form.frequency !== 'one-time' && (
                <div className="mb-4">
                  <label className="label">Next Payment Date <span className="text-muted font-normal">(optional)</span></label>
                  <input className="input-field" type="date" value={form.next_date}
                    onChange={e => setForm(f => ({ ...f, next_date: e.target.value }))} />
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 rounded-xl text-sm"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary justify-center">
                  {saving ? 'Saving...' : editItem ? 'Save Changes' : 'Add Income'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function IncomeCard({ item, onEdit, onDelete }) {
  const isRecurring = item.frequency && item.frequency !== 'one-time'
  const frequencyLabel = f => ({ 'one-time': 'One-Time', weekly: 'Weekly', biweekly: 'Bi-Weekly', monthly: 'Monthly' }[f] || 'One-Time')
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-primary"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
            {isRecurring ? <Repeat size={18} /> : <DollarSign size={18} />}
          </div>
          <div>
            <p className="font-bold text-primary">{item.source}</p>
            {isRecurring && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: 'var(--positive-bg)', color: 'var(--positive)' }}>
                {frequencyLabel(item.frequency)}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onEdit(item)} className="text-muted hover:text-primary transition-colors"><Pencil size={14} /></button>
          <button onClick={() => onDelete(item.id)} className="transition-colors" style={{ color: 'var(--negative-strong)' }}><Trash2 size={14} /></button>
        </div>
      </div>
      <p className="text-2xl font-black text-primary">{fmt(item.amount)}</p>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <p className="text-muted text-sm">{item.date}</p>
        {isRecurring && item.next_date && <p className="text-xs text-muted">· Next: {item.next_date}</p>}
      </div>
    </div>
  )
}
