import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import {
  BarChart3, Plus, Sparkle, ArrowRight, Download, Target, TrendingUp,
  ArrowUpRight, ArrowDownRight, Wallet, PiggyBank, Repeat, HandCoins,
} from 'lucide-react'
import { pieStrokeProps, PIE_COLORS_LIGHT, PIE_COLORS_DARK, renderActivePieSector, pieCellOpacity, sortByValueDesc } from '../lib/chartTheme'
import { fmtCurrency as fmt } from '../lib/format'
import { useDarkMode } from '../hooks/useDarkMode'
import { useTransactions } from '../hooks/useTransactions'
import { bucketMonthlyTotals, computeSavingsRate } from '../lib/savingsRate'
import { PageHeader, StatCard, EmptyState, PageSkeleton, SectionTitle } from '../components/ui'
import MerchantLogo from '../components/MerchantLogo'
import MonthFlipper, { monthKeyNow, monthLabel } from '../components/MonthFlipper'
import SetupChecklist from '../components/SetupChecklist'

const SAVINGS_RATE_MONTHS = 6

// Everything the "+ Add" menu can create. Each entry deep-links to its page with
// ?add=1, which the target page reads on arrival to open its add form immediately.
const ADD_MENU = [
  { label: 'Income',      Icon: ArrowUpRight,   path: '/income?add=1' },
  { label: 'Expense',     Icon: ArrowDownRight, path: '/expenses?add=1' },
  { label: 'Goal',        Icon: Target,         path: '/goals?add=1' },
  { label: 'Subscription', Icon: Repeat,        path: '/subscriptions?add=1' },
  { label: 'Investment',  Icon: TrendingUp,     path: '/investments?add=1' },
  { label: 'Loan / Debt', Icon: HandCoins,      path: '/loans?add=1' },
]

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const [income,   setIncome]   = useState([])
  const [expenses, setExpenses] = useState([])
  const [goals,    setGoals]    = useState([])
  const [budgets,  setBudgets]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const dark = useDarkMode()
  const [pieActiveIndex, setPieActiveIndex] = useState(null)
  const [spendActiveIndex, setSpendActiveIndex] = useState(null)
  const { expenseTxns, incomeTxns, accounts } = useTransactions()
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addMenuRef = useRef(null)
  const [viewMonth, setViewMonth] = useState(monthKeyNow())
  const isCurrentMonth = viewMonth === monthKeyNow()

  // Close the Add menu on any outside click
  useEffect(() => {
    if (!addMenuOpen) return
    const close = e => { if (!addMenuRef.current?.contains(e.target)) setAddMenuOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [addMenuOpen])

  useEffect(() => {
    const load = async () => {
      const [{ data: inc }, { data: exp }, { data: gls }, { data: bud }] = await Promise.all([
        supabase.from('income').select('*').eq('user_id', user.id),
        supabase.from('expenses').select('*').eq('user_id', user.id),
        supabase.from('goals').select('*').eq('user_id', user.id),
        supabase.from('budgets').select('*').eq('user_id', user.id),
      ])
      setIncome(inc || [])
      setExpenses(exp || [])
      setGoals(gls || [])
      setBudgets(bud || [])
      setLoading(false)
    }
    load()
  }, [user.id])

  // Merge manual entries with synced/imported account transactions — matches how
  // Analytics/Income/Expenses compute totals, so the numbers agree across pages instead of
  // Dashboard only reflecting whatever was entered manually.
  const allIncome = useMemo(() => [
    ...income,
    ...incomeTxns.map(t => ({ id: t.id, amount: t.amount, date: t.date, source: t.source || t.description || 'Account', created_at: t.created_at })),
  ], [income, incomeTxns])

  const allExpenses = useMemo(() => [
    ...expenses,
    ...expenseTxns.map(t => ({ id: t.id, amount: t.amount, date: t.date, description: t.description, category: t.category || 'Wants', created_at: t.created_at })),
  ], [expenses, expenseTxns])

  const totalIncome   = allIncome.reduce((s, i) => s + parseFloat(i.amount), 0)
  const totalExpenses = allExpenses.reduce((s, e) => s + parseFloat(e.amount), 0)
  const monthExp      = allExpenses.filter(e => e.date?.slice(0, 7) === viewMonth).reduce((s, e) => s + parseFloat(e.amount), 0)
  const monthInc      = allIncome.filter(i => i.date?.slice(0, 7) === viewMonth).reduce((s, i) => s + parseFloat(i.amount), 0)
  const monthNet      = monthInc - monthExp

  // ── Spending Plan bar (Simplifi-style) ─────────────────────────────────────
  // One bar, three segments of the month's income: spent so far, budgeted-but-
  // not-yet-spent (from Goals & Budgets), and whatever's left unassigned.
  const totalBudgeted     = budgets.reduce((s, b) => s + Number(b.monthly_limit || 0), 0)
  const planBase          = monthInc > 0 ? monthInc : Math.max(monthExp, totalBudgeted, 1)
  const planOverspent      = monthInc > 0 && monthExp > monthInc
  const remainingBudgeted = Math.max(0, totalBudgeted - monthExp)
  const planSpentPct      = Math.min(100, (monthExp / planBase) * 100)
  const planBudgetedPct   = Math.min(100 - planSpentPct, (remainingBudgeted / planBase) * 100)
  const planLeftoverPct   = Math.max(0, 100 - planSpentPct - planBudgetedPct)
  const planLeftoverAmt   = Math.max(0, monthInc - monthExp - remainingBudgeted)

  // Trailing-6-month average savings rate — the same shared calculation Analytics uses by
  // default, so both pages agree instead of Dashboard's old all-time/manual-only figure
  // (which could go wildly negative once real spending outpaced a handful of manually-
  // entered income rows).
  const monthlyTotals = useMemo(
    () => bucketMonthlyTotals(allIncome, allExpenses, SAVINGS_RATE_MONTHS),
    [allIncome, allExpenses]
  )
  const { rate: savingsPct } = computeSavingsRate(monthlyTotals)

  const srcMap = {}
  allIncome.forEach(i => { srcMap[i.source] = (srcMap[i.source] || 0) + parseFloat(i.amount) })
  const pieData   = sortByValueDesc(Object.entries(srcMap).map(([name, value]) => ({ name, value })))
  const pieColors = dark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT

  const catMap   = {}
  allExpenses.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + parseFloat(e.amount) })
  const sorted   = Object.entries(catMap).sort((a, b) => b[1] - a[1])
  const spendPieData = sortByValueDesc(Object.entries(catMap).map(([name, value]) => ({ name, value })))

  const recentActivity = [
    ...allIncome.map(i => ({ ...i, kind: 'income' })),
    ...allExpenses.map(e => ({ ...e, kind: 'expense' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6)

  const surplus = totalIncome - totalExpenses

  const pieTooltip = (
    <Tooltip formatter={v => fmt(v)} contentStyle={{ background: dark ? '#111' : '#fff', border: '1px solid var(--card-border)', borderRadius: 10, color: 'var(--positive)', fontSize: 13 }} itemStyle={{ color: 'var(--positive)' }} labelStyle={{ color: 'var(--positive)' }} />
  )

  if (loading) return <PageSkeleton />

  return (
    <div>
      <PageHeader
        title={greeting()}
        subtitle={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      >
        <div className="relative" ref={addMenuRef}>
          <button className="btn-primary text-sm" onClick={() => setAddMenuOpen(o => !o)}>
            <Plus size={15} /> Add
          </button>
          {addMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-2xl p-2 z-50"
              style={{ background: 'var(--modal-bg)', border: '1px solid var(--card-border)', boxShadow: '0 16px 48px rgba(0,0,0,0.35)', animation: 'modal-pop 0.18s ease' }}>
              {ADD_MENU.map(item => (
                <button key={item.path}
                  onClick={() => { setAddMenuOpen(false); navigate(item.path) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-primary transition-colors hover:opacity-80 text-left"
                  style={{ background: 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--input-bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <item.Icon size={15} className="text-muted" /> {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </PageHeader>

      {/* ── AI COACH BANNER ── */}
      <Link to="/coach" className="no-underline block mb-5">
        <div
          className="rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-transform hover:-translate-y-0.5"
          style={{
            background: dark
              ? 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)'
              : 'linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.12) 100%)',
            border: dark ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.4)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-black flex-shrink-0"
              style={{ background: dark ? '#10b981' : 'rgba(255,255,255,0.9)', color: dark ? '#000' : '#1a5a94' }}>
              <Sparkle size={18} />
            </div>
            <div>
              <p className="font-black text-sm" style={{ color: dark ? '#10b981' : '#fff' }}>Stride Coach</p>
              <p className="text-xs" style={{ color: dark ? '#34d399' : 'rgba(255,255,255,0.75)' }}>
                Your AI finance coach is ready · ask it anything
              </p>
            </div>
          </div>
          <ArrowRight size={18} style={{ color: dark ? '#10b981' : 'rgba(255,255,255,0.8)' }} />
        </div>
      </Link>

      {/* ── GET SET UP CHECKLIST ── */}
      <SetupChecklist
        storageKey={`stride-checklist-dismissed-${user.id}`}
        items={[
          { label: 'Connect or add an account', done: accounts.length > 0, path: '/accounts' },
          { label: 'Log income or an expense', done: allIncome.length > 0 || allExpenses.length > 0, path: '/expenses' },
          { label: 'Set a savings goal', done: goals.length > 0, path: '/goals' },
          { label: 'Create a budget', done: budgets.length > 0, path: '/goals' },
        ]}
      />

      {/* ── MONTH AT A GLANCE ── */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <p className="text-xs font-extrabold text-muted uppercase tracking-widest">
          {isCurrentMonth ? 'This month' : monthLabel(viewMonth)} at a glance
        </p>
        <MonthFlipper value={viewMonth} onChange={setViewMonth} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label={isCurrentMonth ? 'Income this month' : 'Income'} value={fmt(monthInc)} Icon={ArrowUpRight}
          sub={`${fmt(totalIncome)} all time`} onClick={() => navigate('/income')} />
        <StatCard label={isCurrentMonth ? 'Spent this month' : 'Spent'} value={fmt(monthExp)} Icon={ArrowDownRight}
          sub={`${fmt(totalExpenses)} all time`} onClick={() => navigate('/expenses')} />
        <StatCard label={isCurrentMonth ? 'Net this month' : 'Net'} value={`${monthNet >= 0 ? '+' : '−'}${fmt(Math.abs(monthNet))}`} Icon={Wallet}
          valueStyle={monthNet < 0 ? { color: 'var(--negative-strong)' } : undefined}
          sub={monthNet >= 0 ? 'Cash positive' : 'Spending exceeds income'} />
        <StatCard label="Savings rate" value={`${savingsPct}%`} Icon={PiggyBank}
          sub={`Avg. last ${SAVINGS_RATE_MONTHS} months`} onClick={() => navigate('/analytics')} />
      </div>

      {/* ── SPENDING PLAN BAR ── */}
      {monthInc > 0 && (
        <div className="card p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-black text-primary">Spending Plan</p>
            <p className="text-xs text-muted">{fmt(monthInc)} income {isCurrentMonth ? 'this month' : `in ${monthLabel(viewMonth)}`}</p>
          </div>
          {planOverspent ? (
            <>
              <div className="w-full rounded-full overflow-hidden" style={{ height: 14, background: 'var(--negative)' }} />
              <p className="text-xs mt-2" style={{ color: 'var(--negative-strong)' }}>
                Spent {fmt(monthExp)} — {fmt(monthExp - monthInc)} over this month's income.
              </p>
            </>
          ) : (
            <>
              <div className="w-full flex rounded-full overflow-hidden" style={{ height: 14, background: 'var(--input-bg)' }}>
                {planSpentPct > 0 && <div style={{ width: `${planSpentPct}%`, background: 'var(--negative)' }} title={`Spent: ${fmt(monthExp)}`} />}
                {planBudgetedPct > 0 && <div style={{ width: `${planBudgetedPct}%`, background: 'var(--warning)' }} title={`Budgeted, unspent: ${fmt(remainingBudgeted)}`} />}
                {planLeftoverPct > 0 && <div style={{ width: `${planLeftoverPct}%`, background: 'var(--positive)' }} title={`Unassigned: ${fmt(planLeftoverAmt)}`} />}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs">
                <span className="flex items-center gap-1.5 text-muted"><span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--negative)' }} /> Spent · {fmt(monthExp)}</span>
                {remainingBudgeted > 0 && (
                  <span className="flex items-center gap-1.5 text-muted"><span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--warning)' }} /> Budgeted, unspent · {fmt(remainingBudgeted)}</span>
                )}
                <span className="flex items-center gap-1.5 text-muted"><span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--positive)' }} /> Unassigned · {fmt(planLeftoverAmt)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── CHARTS ROW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Spending by category */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="font-black text-primary">Spending Breakdown</p>
            <Link to="/analytics" className="text-xs text-muted no-underline hover:text-primary">Details →</Link>
          </div>
          <p className="text-muted text-xs mb-2">{fmt(totalExpenses)} across {allExpenses.length} entries</p>
          {spendPieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={spendPieData} dataKey="value" cx="50%" cy="50%" innerRadius={48} outerRadius={78} {...pieStrokeProps(dark)}
                    activeIndex={spendActiveIndex} activeShape={renderActivePieSector(dark)}
                    onMouseEnter={(_, i) => setSpendActiveIndex(i)}
                    onMouseLeave={() => setSpendActiveIndex(null)}
                    onClick={(_, i) => setSpendActiveIndex(prev => (prev === i ? null : i))}
                    style={{ cursor: 'pointer' }}>
                    {spendPieData.map((_, i) => (
                      <Cell key={i} fill={pieColors[i % pieColors.length]} fillOpacity={pieCellOpacity(spendActiveIndex, i)} />
                    ))}
                  </Pie>
                  {pieTooltip}
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-1">
                {spendPieData.slice(0, 4).map((c, i) => (
                  <div key={c.name} className="flex justify-between text-xs" style={{ opacity: pieCellOpacity(spendActiveIndex, i) }}>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: pieColors[i % pieColors.length] }} />
                      <span className="text-muted truncate">{c.name}</span>
                    </span>
                    <span className="font-semibold text-primary tnum">{fmt(c.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState Icon={ArrowDownRight} title="No spending yet" sub="Add expenses to see where your money goes." />
          )}
        </div>

        {/* Income by source */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="font-black text-primary">Income Sources</p>
            <Link to="/income" className="text-xs text-muted no-underline hover:text-primary">Details →</Link>
          </div>
          <p className="text-muted text-xs mb-2">{fmt(totalIncome)} from {pieData.length} source{pieData.length !== 1 ? 's' : ''}</p>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={48} outerRadius={78} {...pieStrokeProps(dark)}
                    activeIndex={pieActiveIndex} activeShape={renderActivePieSector(dark)}
                    onMouseEnter={(_, i) => setPieActiveIndex(i)}
                    onMouseLeave={() => setPieActiveIndex(null)}
                    onClick={(_, i) => setPieActiveIndex(prev => (prev === i ? null : i))}
                    style={{ cursor: 'pointer' }}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={pieColors[i % pieColors.length]} fillOpacity={pieCellOpacity(pieActiveIndex, i)} />
                    ))}
                  </Pie>
                  {pieTooltip}
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-1">
                {pieData.slice(0, 4).map((c, i) => (
                  <div key={c.name} className="flex justify-between text-xs" style={{ opacity: pieCellOpacity(pieActiveIndex, i) }}>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: pieColors[i % pieColors.length] }} />
                      <span className="text-muted truncate">{c.name}</span>
                    </span>
                    <span className="font-semibold text-primary tnum">{fmt(c.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState Icon={ArrowUpRight} title="No income yet" sub="Add income entries to see your sources." />
          )}
        </div>
      </div>

      {/* ── BUDGET + ACTIVITY ROW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Budget Overview */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="font-black text-primary">Budget Overview</p>
            <span className="text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
              style={{ background: surplus >= 0 ? 'var(--positive-bg)' : 'var(--negative-bg)', color: surplus >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
              {surplus >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {fmt(Math.abs(surplus))} {surplus >= 0 ? 'surplus' : 'deficit'}
            </span>
          </div>
          {allExpenses.length === 0 ? (
            <EmptyState Icon={Wallet} title="No budget data yet" sub="Add some expenses to see category totals here." />
          ) : (
            <div className="space-y-3">
              {sorted.slice(0, 4).map(([cat, amt]) => (
                <div key={cat}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-primary font-semibold">{cat}</span>
                    <span className="text-muted tnum">{fmt(amt)}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${Math.min(100, (amt / totalExpenses) * 100)}%` }}></div>
                  </div>
                </div>
              ))}
              <Link to="/goals" className="text-xs text-muted no-underline hover:text-primary inline-block pt-1">
                Set monthly limits in Goals & Budgets →
              </Link>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="font-black text-primary">Recent Activity</p>
            <Link to="/accounts" className="text-xs text-muted no-underline hover:text-primary">All transactions →</Link>
          </div>
          {recentActivity.length === 0 ? (
            <EmptyState Icon={BarChart3} title="No activity yet" sub="Your latest income and expenses will show up here." />
          ) : (
            <div>
              {recentActivity.map(item => (
                <div key={item.id + item.kind} className="list-row">
                  <div className="flex items-center gap-3 min-w-0">
                    <MerchantLogo name={item.source || item.description} size={36}
                      FallbackIcon={item.kind === 'income' ? ArrowUpRight : ArrowDownRight}
                      fallbackBg={item.kind === 'income' ? 'var(--positive-bg)' : 'var(--negative-bg)'}
                      fallbackColor={item.kind === 'income' ? 'var(--positive)' : 'var(--negative)'} />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-primary truncate">{item.source || item.description}</p>
                      <p className="text-xs text-muted">{item.date}</p>
                    </div>
                  </div>
                  <span className="font-black text-sm tnum flex-shrink-0" style={{ color: item.kind === 'income' ? 'var(--text-primary)' : 'var(--negative-strong)' }}>
                    {item.kind === 'income' ? '+' : '-'}{fmt(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── QUICK ACCESS ── */}
      <SectionTitle>Quick access</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Goals', sub: `${goals.length} in progress`, Icon: Target, path: '/goals' },
          { label: 'Investments', sub: 'Track holdings', Icon: TrendingUp, path: '/investments' },
          { label: 'Import Data', sub: 'Upload CSV files', Icon: Download, path: '/accounts' },
          { label: 'Analytics', sub: 'Charts & reports', Icon: BarChart3, path: '/analytics' },
        ].map(a => (
          <div key={a.label} className="card card-tap p-4" onClick={() => navigate(a.path)}>
            <div className="icon-chip mb-3" style={{ width: 36, height: 36 }}><a.Icon size={17} /></div>
            <p className="font-black text-primary text-sm">{a.label}</p>
            <p className="text-muted text-xs mt-0.5">{a.sub}</p>
          </div>
        ))}
      </div>

    </div>
  )
}
