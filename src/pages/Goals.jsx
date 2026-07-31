import { useState, useEffect } from 'react'
import {
  Shield, Plane, Car, Home, GraduationCap, PiggyBank, TrendingUp, Target,
  Trash2, Clock, DollarSign, X, Wallet, LineChart as LineChartIcon,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import { fmtCurrency as fmt } from '../lib/format'
import Budgets from './Budgets'
import { PageHeader, EmptyState, PageSkeleton, SegTabs } from '../components/ui'
import GoalProjection from '../components/GoalProjection'

const CATEGORIES = ['Emergency Fund', 'Vacation', 'Car', 'Home', 'Education', 'Retirement', 'Investment', 'Other']
const PRIORITIES = ['low', 'medium', 'high']
const PRIO_COLORS = { low: 'var(--positive)', medium: 'var(--warning)', high: 'var(--negative)' }
const PRIO_BG     = { low: 'var(--positive-bg)', medium: 'var(--warning-bg)', high: 'var(--negative-bg)' }
const CATEGORY_ICONS = {
  'Emergency Fund': Shield,
  'Vacation': Plane,
  'Car': Car,
  'Home': Home,
  'Education': GraduationCap,
  'Retirement': PiggyBank,
  'Investment': TrendingUp,
  'Other': Target,
}

export default function Goals() {
  const { user } = useAuth()
  const [tab, setTab] = useState('goals') // 'goals' | 'budgets'
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showProgress, setShowProgress] = useState(null)
  const [progressAmt, setProgressAmt] = useState('')
  const [projectOpen, setProjectOpen] = useState(null)
  const [form, setForm] = useState({ title: '', target_amount: '', target_date: '', category: 'Other', priority: 'medium' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('goals').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setGoals(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [user.id])

  const openAdd = () => { setForm({ title: '', target_amount: '', target_date: '', category: 'Other', priority: 'medium' }); setShowModal(true) }

  // Deep link from the Dashboard's "+ Add" menu: /goals?add=1 opens the form immediately
  useEffect(() => {
    if (!loading && new URLSearchParams(window.location.search).get('add') === '1') openAdd()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const handleSave = async e => {
    e.preventDefault()
    setSaving(true)
    const payload = { title: form.title.trim(), target_amount: parseFloat(form.target_amount), current_amount: 0, target_date: form.target_date, category: form.category, priority: form.priority, user_id: user.id }
    await supabase.from('goals').insert(payload)
    setSaving(false); setShowModal(false); load()
  }

  const handleDelete = async id => {
    await supabase.from('goals').delete().eq('id', id).eq('user_id', user.id)
    load()
  }

  const handleAddProgress = async goalId => {
    const amt = parseFloat(progressAmt)
    if (!amt || amt <= 0) return
    const goal = goals.find(g => g.id === goalId)
    const newAmt = (goal.current_amount || 0) + amt
    await supabase.from('goals').update({ current_amount: newAmt }).eq('id', goalId).eq('user_id', user.id)
    setShowProgress(null); setProgressAmt(''); load()
  }

  const daysLeft = date => {
    if (!date) return null
    const diff = (new Date(date + 'T12:00:00') - new Date()) / (1000 * 60 * 60 * 24)
    return Math.ceil(diff)
  }

  if (loading) return <PageSkeleton stats={2} hero={false} />

  return (
    <div>
      <PageHeader title="Goals & Budgets" subtitle="Set savings targets and monthly spending limits">
        {tab === 'goals' && <button onClick={openAdd} className="btn-primary text-sm">+ New Goal</button>}
      </PageHeader>

      {/* Tabs */}
      <div className="mb-5">
        <SegTabs
          tabs={[{ value: 'goals', label: 'Goals', Icon: Target }, { value: 'budgets', label: 'Budgets', Icon: Wallet }]}
          active={tab} onChange={setTab}
        />
      </div>

      {tab === 'budgets' && <Budgets />}

      {tab === 'goals' && (
      <>
      {goals.length === 0 ? (
        <div className="card">
          <EmptyState Icon={Target} title="No goals yet" sub="Set your first financial goal to start tracking progress.">
            <button onClick={openAdd} className="btn-primary">+ New Goal</button>
          </EmptyState>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.map(goal => {
            const pct = goal.target_amount > 0 ? Math.min(100, (goal.current_amount / goal.target_amount) * 100) : 0
            const dl = daysLeft(goal.target_date)
            const CatIcon = CATEGORY_ICONS[goal.category] || CATEGORY_ICONS['Other']

            return (
              <div key={goal.id} className="card p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-primary" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
                      <CatIcon size={22} />
                    </div>
                    <div>
                      <p className="font-bold text-primary">{goal.title}</p>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: PRIO_BG[goal.priority], color: PRIO_COLORS[goal.priority] }}>
                        {goal.priority}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleDelete(goal.id)} className="text-muted hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                </div>

                {/* Progress */}
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted">Progress</span>
                  <span className="font-bold text-primary">{pct.toFixed(1)}%</span>
                </div>
                <div className="progress-bar mb-2">
                  <div className="progress-fill" style={{ width: `${pct}%`, background: pct >= 100 ? '#10b981' : 'var(--accent)' }}></div>
                </div>
                <div className="flex justify-between text-sm mb-3">
                  <span className="text-muted">{fmt(goal.current_amount)}</span>
                  <span className="text-muted">{fmt(goal.target_amount)}</span>
                </div>

                {/* Days remaining */}
                {dl !== null && (
                  <div className="flex items-center gap-1.5 text-muted text-xs mb-3">
                    <Clock size={13} />
                    <span>{dl < 0 ? `${Math.abs(dl)} days overdue` : `${dl} days remaining`}</span>
                  </div>
                )}
                {goal.target_date && (
                  <p className="text-muted text-xs mb-3">Target: {new Date(goal.target_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                )}

                {/* Add Progress */}
                {showProgress === goal.id ? (
                  <div className="flex gap-2">
                    <input className="input-field flex-1" type="number" step="0.01" min="0" placeholder="Amount to add" value={progressAmt} onChange={e => setProgressAmt(e.target.value)} autoFocus />
                    <button onClick={() => handleAddProgress(goal.id)} className="btn-primary px-3 text-sm">Add</button>
                    <button onClick={() => { setShowProgress(null); setProgressAmt('') }} className="btn-secondary px-3 text-sm"><X size={16} /></button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setShowProgress(goal.id)} className="py-2.5 rounded-xl border text-sm font-semibold text-primary flex items-center justify-center gap-2 transition-colors" style={{ borderColor: 'var(--card-border)', background: 'var(--input-bg)' }}>
                      <DollarSign size={16} /> Add Progress
                    </button>
                    <button onClick={() => setProjectOpen(projectOpen === goal.id ? null : goal.id)} className="py-2.5 rounded-xl border text-sm font-semibold text-primary flex items-center justify-center gap-2 transition-colors" style={{ borderColor: 'var(--card-border)', background: projectOpen === goal.id ? 'var(--positive-bg)' : 'var(--input-bg)', color: projectOpen === goal.id ? 'var(--positive)' : undefined }}>
                      <LineChartIcon size={16} /> Project
                    </button>
                  </div>
                )}

                {projectOpen === goal.id && <GoalProjection goal={goal} />}
              </div>
            )
          })}
        </div>
      )}
      </>
      )}

      {/* Create Goal Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 accent-text font-semibold"><Target size={18} /><span>Create New Goal</span></div>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="mb-4">
                <label className="label">Goal Title</label>
                <input className="input-field" placeholder="e.g., Emergency Fund, Vacation, New Car" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
              </div>
              <div className="mb-4">
                <label className="label">Target Amount</label>
                <input className="input-field" type="number" step="0.01" min="0" placeholder="0.00" value={form.target_amount} onChange={e => setForm(f => ({ ...f, target_amount: e.target.value }))} required />
              </div>
              <div className="mb-4">
                <label className="label">Target Date</label>
                <input className="input-field" type="date" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div>
                  <label className="label">Category</label>
                  <div className="flex items-center gap-2">
                    {(() => { const FormCatIcon = CATEGORY_ICONS[form.category] || CATEGORY_ICONS['Other']; return <FormCatIcon size={24} className="text-primary flex-shrink-0" /> })()}
                    <select className="input-field flex-1" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Priority</label>
                  <select className="input-field" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                    {PRIORITIES.map(p => <option key={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary justify-center">{saving ? 'Creating...' : 'Create Goal'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
