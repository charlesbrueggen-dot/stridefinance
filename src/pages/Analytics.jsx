// src/pages/Analytics.jsx
// ─────────────────────────────────────────────────────────────────────────────
//  Analytics — now includes account_transactions in all totals:
//   • Income  = income table  + account_transactions kind='income'
//   • Expenses = expenses table + account_transactions kind='expense'
//  All charts auto-reflect the merged data.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo } from 'react'
import {
  Download, CreditCard, CheckCircle2, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Banknote, TrendingUp, Home, Handshake,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import { useTransactions } from '../hooks/useTransactions'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell
} from 'recharts'
import { pieStrokeProps, renderActivePieSector, pieCellOpacity, renderLegend, sortByValueDesc, barCursor } from '../lib/chartTheme'
import { fmtCurrency as fmt } from '../lib/format'
import { calcWithInterest } from '../lib/loanMath'
import { bucketMonthlyTotals, computeSavingsRate, bucketDailyTotals, rollingSavingsRate } from '../lib/savingsRate'
import { useDarkMode } from '../hooks/useDarkMode'

import { PageHeader, StatCard, PageSkeleton, SegTabs } from '../components/ui'

const fmtShort = n => { if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`; return fmt(n) }
const TABS     = ['Overview', 'Cash Flow', 'Spending', 'Net Worth', 'Loans']
const PIE_COLORS = ['#3b82f6','#f97316','#8b5cf6','#ef4444','#06b6d4','#84cc16','#ec4899','#14b8a6','#f59e0b','#64748b']

export default function Analytics() {
  const { user }                              = useAuth()
  const { expenseTxns, incomeTxns, loading: txnLoading } = useTransactions()

  // Own data
  const [income,      setIncome]      = useState([])
  const [expenses,    setExpenses]    = useState([])
  const [investments, setInvestments] = useState([])
  const [loans,       setLoans]       = useState([])
  const [assets,      setAssets]      = useState([])
  const [accounts,    setAccounts]    = useState([])
  const [dataLoading, setDataLoading] = useState(true)

  const [tab,   setTab]   = useState('Overview')
  const [range, setRange] = useState('6')
  const [subCatRange, setSubCatRange] = useState('all')
  const dark = useDarkMode()
  const [catActiveIndex, setCatActiveIndex] = useState(null)
  const [nwActiveIndex,  setNwActiveIndex]  = useState(null)

  useEffect(() => {
    const load = async () => {
      const [{ data: inc }, { data: exp }, { data: inv }, { data: ln }, { data: ast }, { data: acc }] = await Promise.all([
        supabase.from('income').select('*').eq('user_id', user.id),
        supabase.from('expenses').select('*').eq('user_id', user.id),
        supabase.from('investments').select('*').eq('user_id', user.id),
        supabase.from('loans').select('*').eq('user_id', user.id),
        supabase.from('assets').select('*').eq('user_id', user.id),
        supabase.from('accounts').select('*').eq('user_id', user.id),
      ])
      setIncome(inc || []); setExpenses(exp || []); setInvestments(inv || [])
      setLoans(ln || []); setAssets(ast || []); setAccounts(acc || [])
      setDataLoading(false)
    }
    load()
  }, [user.id])

  // ── Merge account_transactions into income/expense pools ──────────────────
  const allIncome = useMemo(() => [
    ...income,
    ...incomeTxns.map(t => ({ id: t.id, amount: t.amount, date: t.date, source: t.source || 'Account', _fromAcct: true })),
  ], [income, incomeTxns])

  const allExpenses = useMemo(() => [
    ...expenses,
    ...expenseTxns.map(t => ({ id: t.id, amount: t.amount, date: t.date, category: t.category || 'Wants', subcategory: t.subcategory || 'Other', _fromAcct: true })),
  ], [expenses, expenseTxns])

  // ── Month buckets (stat cards, CSV export, monthly bar charts) ─────────────
  const months = parseInt(range)

  const chartData = useMemo(
    () => bucketMonthlyTotals(allIncome, allExpenses, months),
    [allIncome, allExpenses, months]
  )

  // ── Day buckets (line/area charts — real resolution instead of 3-12 chunky dots) ──
  const days = useMemo(() => {
    const now   = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - months, now.getDate())
    return Math.max(1, Math.round((now - start) / 86400000) + 1)
  }, [months])

  const dailyData = useMemo(
    () => bucketDailyTotals(allIncome, allExpenses, days),
    [allIncome, allExpenses, days]
  )
  // Cap shown x-axis labels at ~5 regardless of range length so a year of daily points
  // doesn't render 365 overlapping ticks — 8 was still cramped on narrower/mobile widths.
  const dailyTickInterval = Math.max(0, Math.ceil(dailyData.length / 5) - 1)

  // ── Summary numbers ───────────────────────────────────────────────────────
  const totalIncome   = allIncome.reduce((s, i) => s + parseFloat(i.amount), 0)
  const totalExpenses = allExpenses.reduce((s, e) => s + parseFloat(e.amount), 0)
  const { avgMonthlyIncome, avgMonthlyExpenses, avgMonthlySavings, rate: savingsRate } = computeSavingsRate(chartData)

  // ── Net Worth ─────────────────────────────────────────────────────────────
  const portValue      = investments.reduce((s, i) => s + (i.shares * (i.current_price || i.avg_cost)), 0)
  const physicalAssets = assets.reduce((s, a) => s + a.value, 0)
  const moneyLent      = loans.filter(l => l.type === 'lent'     && !l.settled).reduce((s, l) => s + calcWithInterest(l.amount, l.interest_rate, l.loan_date), 0)
  const moneyOwed      = loans.filter(l => l.type === 'borrowed' && !l.settled).reduce((s, l) => s + calcWithInterest(l.amount, l.interest_rate, l.loan_date), 0)
  // "Cash" prefers real, connected/manual account balances (the same numbers the Accounts page
  // shows as Total Assets/Total Debt) over a lifetime income-minus-expenses estimate — the latter
  // only ever approximates cash on hand, and drifts further from reality the longer someone's
  // been recording transactions (a year of CSV-imported history can make it wildly wrong). It's
  // kept as a fallback for anyone tracking income/expenses manually with no accounts set up yet.
  const usingRealCash  = accounts.length > 0
  const cashBase       = usingRealCash
    ? accounts.reduce((s, a) => s + (a.type === 'Credit Card' ? -a.balance : a.balance), 0)
    : totalIncome - totalExpenses
  const netWorth       = cashBase + portValue + physicalAssets + moneyLent - moneyOwed

  const nwPieData = sortByValueDesc([
    cashBase > 0      && { name: 'Cash',              value: cashBase },
    portValue > 0     && { name: 'Investments',       value: portValue },
    physicalAssets > 0 && { name: 'Physical Assets', value: physicalAssets },
    moneyLent > 0     && { name: 'Money Lent',        value: moneyLent },
  ].filter(Boolean))
  const nwPieTotal = nwPieData.reduce((s, d) => s + d.value, 0)

  // ── Spending by category (merged) ─────────────────────────────────────────
  const catMap = {}
  allExpenses.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + parseFloat(e.amount) })
  const catData = Object.entries(catMap).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))

  // Subcategory breakdown (new — powered by account_transactions), independently
  // time-filtered from the page-level range selector above.
  const subCatExpenses = useMemo(() => {
    if (subCatRange === 'all') return allExpenses
    const cutoff = new Date()
    if (subCatRange === '1w') cutoff.setDate(cutoff.getDate() - 7)
    else if (subCatRange === '1m') cutoff.setMonth(cutoff.getMonth() - 1)
    else if (subCatRange === '1y') cutoff.setFullYear(cutoff.getFullYear() - 1)
    const cutoffStr = cutoff.toISOString().split('T')[0]
    return allExpenses.filter(e => e.date >= cutoffStr)
  }, [allExpenses, subCatRange])

  const subCatMap = {}
  subCatExpenses.forEach(e => {
    const key = `${e.category}: ${e.subcategory || 'Other'}`
    subCatMap[key] = (subCatMap[key] || 0) + parseFloat(e.amount)
  })
  const subCatData  = Object.entries(subCatMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }))
  const subCatTotal = subCatExpenses.reduce((s, e) => s + parseFloat(e.amount), 0)

  const spendTrendData   = chartData.map(m => ({ label: m.label, expenses: m.expenses }))
  const savingsRateData  = useMemo(() => rollingSavingsRate(dailyData, 7), [dailyData])

  // Loans
  const activeLoans   = loans.filter(l => !l.settled)
  const lentLoans     = activeLoans.filter(l => l.type === 'lent')
  const borrowedLoans = activeLoans.filter(l => l.type === 'borrowed')
  const totalLent     = lentLoans.reduce((s, l) => s + calcWithInterest(l.amount, l.interest_rate, l.loan_date), 0)
  const totalOwed     = borrowedLoans.reduce((s, l) => s + calcWithInterest(l.amount, l.interest_rate, l.loan_date), 0)

  const lineColorIncome = dark ? '#10b981' : '#1a3a6b'
  const lineColorExp    = dark ? '#ef4444' : '#e05c2a'
  const lineColorNet    = dark ? '#34d399' : '#f0a500'
  const tooltipStyle    = { background: 'var(--modal-bg)', border: '1px solid var(--card-border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13 }
  // Charts that color each item via <Cell> (pies, and bars colored per-bar) don't get that
  // color picked up for the tooltip's item text the way a single <Line>/<Area>/<Bar> stroke or
  // fill does — recharts falls back to a hardcoded black, unreadable on the dark-mode card.
  // Setting these explicitly keeps it on the theme's own readable color instead.
  const cellTooltipItemStyle  = { color: 'var(--text-primary)' }
  const cellTooltipLabelStyle = { color: 'var(--text-primary)' }

  const exportCSV = () => {
    const rows = ['Date,Income,Expenses,Net,Savings Rate %']
      .concat(chartData.map(m => `${m.label},${m.income},${m.expenses},${m.net},${m.income > 0 ? ((m.net / m.income) * 100).toFixed(1) : 0}`))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a    = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'stride-analytics.csv'; a.click()
  }

  const loading = dataLoading || txnLoading
  if (loading) return <PageSkeleton stats={4} hero={false} />

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Full picture — manual entries + account transactions">
        <button onClick={exportCSV} className="btn-secondary text-sm flex-shrink-0"><Download size={15} /> Export CSV</button>
      </PageHeader>

      {/* Account txn inclusion notice */}
      {(expenseTxns.length > 0 || incomeTxns.length > 0) && (
        <div className="rounded-xl px-4 py-3 mb-4 flex items-center gap-2 text-xs font-medium"
          style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: 'var(--text-primary)' }}>
          <CreditCard size={14} />
          <span>Includes {expenseTxns.length} account expense{expenseTxns.length !== 1 ? 's' : ''} and {incomeTxns.length} account income transaction{incomeTxns.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Range selector + tabs */}
      <div className="mb-3">
        <SegTabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      <div className="mb-5">
        <SegTabs small active={range} onChange={setRange}
          tabs={[{ value: '3', label: '3M' }, { value: '6', label: '6M' }, { value: '12', label: '1Y' }]} />
      </div>

      {/* ═══════════════════════ OVERVIEW ═══════════════════════ */}
      {tab === 'Overview' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard label="Total Income"    value={fmt(totalIncome)}   sub={`${allIncome.length} entries`}   tone="#10b981" />
            <StatCard label="Total Expenses"  value={fmt(totalExpenses)} sub={`${allExpenses.length} entries`} tone="#ef4444" />
            <StatCard label="Avg Monthly Income"  value={fmt(avgMonthlyIncome)}   sub="over selected period" tone={lineColorIncome} />
            <StatCard label="Avg Monthly Expense" value={fmt(avgMonthlyExpenses)} sub="over selected period" tone={lineColorExp} />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="card p-4">
              <p className="text-muted text-xs mb-1">Savings Rate</p>
              <p className="text-2xl font-black text-primary">{savingsRate}%</p>
              <p className="text-xs text-muted mt-0.5 flex items-center gap-1">
                {parseFloat(savingsRate) >= 20 ? <><CheckCircle2 size={12} /> Healthy</> : <><AlertTriangle size={12} /> Below 20%</>}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-muted text-xs mb-1">Avg Monthly Saved</p>
              <p className="text-2xl font-black" style={{ color: avgMonthlySavings >= 0 ? 'var(--text-primary)' : 'var(--negative-strong)' }}>{fmt(avgMonthlySavings)}</p>
              <p className="text-xs text-muted mt-0.5">per month</p>
            </div>
          </div>

          <div className="card p-5 mb-4">
            <p className="font-bold text-primary text-sm mb-3">Income vs Expenses</p>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={lineColorIncome} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={lineColorIncome} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={lineColorExp} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={lineColorExp} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="label" interval={dailyTickInterval} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => fmt(v)} />
                <Legend content={renderLegend} />
                <Area type="monotone" dataKey="income"   name="Income"   stroke={lineColorIncome} fill="url(#colorInc)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="expenses" name="Expenses" stroke={lineColorExp}    fill="url(#colorExp)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5">
            <p className="font-bold text-primary text-sm mb-3">Monthly Net (Income − Expenses)</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={cellTooltipItemStyle} labelStyle={cellTooltipLabelStyle} formatter={v => fmt(v)} cursor={barCursor} />
                <Bar dataKey="net" name="Net" radius={[4,4,0,0]}>
                  {chartData.map((m, i) => <Cell key={i} fill={m.net >= 0 ? lineColorIncome : lineColorExp} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ═══════════════════════ CASH FLOW ═══════════════════════ */}
      {tab === 'Cash Flow' && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <StatCard label="Total Cash In"  value={fmt(totalIncome)}   sub={`${allIncome.length} entries`}   tone="#10b981" />
            <StatCard label="Total Cash Out" value={fmt(totalExpenses)} sub={`${allExpenses.length} entries`} tone="#ef4444" />
          </div>
          <div className="card p-5 mb-4">
            <p className="font-bold text-primary text-sm mb-3">Cash Flow Over Time</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="label" interval={dailyTickInterval} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => fmt(v)} />
                <Legend content={renderLegend} />
                <Line type="monotone" dataKey="income"   name="Income"   stroke={lineColorIncome} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="expenses" name="Expenses" stroke={lineColorExp}    strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="net"      name="Net"      stroke={lineColorNet}    strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="card p-5">
            <p className="font-bold text-primary text-sm mb-3">Savings Accumulated</p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="label" interval={dailyTickInterval} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => fmt(v)} />
                <Area type="monotone" dataKey="cumulativeSavings" name="Saved" stroke="#10b981" fill="rgba(16,185,129,0.15)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ═══════════════════════ SPENDING ═══════════════════════ */}
      {tab === 'Spending' && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <StatCard label="Total Spent"   value={fmt(totalExpenses)}  sub={`${allExpenses.length} entries`} tone="#ef4444" />
            <StatCard label="Avg / Month"   value={fmt(avgMonthlyExpenses)} sub="over period" tone="#f97316" />
          </div>

          {catData.length > 0 && (
            <div className="card p-5 mb-4">
              <p className="font-bold text-primary text-sm mb-3">Spending by Category</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={catData} dataKey="value" cx="50%" cy="50%" outerRadius={80} {...pieStrokeProps(dark)}
                    activeIndex={catActiveIndex} activeShape={renderActivePieSector(dark)}
                    onMouseEnter={(_, i) => setCatActiveIndex(i)}
                    onMouseLeave={() => setCatActiveIndex(null)}
                    onClick={(_, i) => setCatActiveIndex(prev => (prev === i ? null : i))}
                    style={{ cursor: 'pointer' }}>
                    {catData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} fillOpacity={pieCellOpacity(catActiveIndex, i)} />
                    ))}
                  </Pie>
                  <Tooltip formatter={v => fmt(v)} contentStyle={tooltipStyle} itemStyle={cellTooltipItemStyle} labelStyle={cellTooltipLabelStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1">
                {catData.map((c, i) => (
                  <div key={c.name} className="flex justify-between text-xs cursor-pointer"
                    style={{ opacity: pieCellOpacity(catActiveIndex, i) }}
                    onMouseEnter={() => setCatActiveIndex(i)}
                    onMouseLeave={() => setCatActiveIndex(null)}
                    onClick={() => setCatActiveIndex(prev => (prev === i ? null : i))}>
                    <span className="flex items-center gap-1 min-w-0">
                      <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-muted truncate">{c.name}</span>
                    </span>
                    <span className="font-medium text-primary flex-shrink-0 ml-2">{fmt(c.value)} · {totalExpenses > 0 ? ((c.value / totalExpenses) * 100).toFixed(0) : '0'}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subcategory breakdown — powered by account_transactions data */}
          {allExpenses.length > 0 && (
            <div className="card p-5 mb-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                <p className="font-bold text-primary text-sm">Subcategory Breakdown</p>
                <SegTabs small active={subCatRange} onChange={setSubCatRange}
                  tabs={[{ value: '1w', label: '1W' }, { value: '1m', label: '1M' }, { value: '1y', label: '1Y' }, { value: 'all', label: 'All' }]} />
              </div>
              <p className="text-muted text-xs mb-3">Top 8 subcategories across all sources</p>
              {subCatData.length === 0 ? (
                <div className="text-center py-6 text-muted text-sm">No spending in this range</div>
              ) : (
              <div className="space-y-3">
                {subCatData.map(({ name, value }) => (
                  <div key={name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-primary font-medium">{name}</span>
                      <span className="text-muted">{fmt(value)}</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${Math.min(100, (value / subCatTotal) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          )}

          <div className="card p-5 mb-4">
            <p className="font-bold text-primary text-sm mb-3">Monthly Spending Trend</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={spendTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => fmt(v)} cursor={barCursor} />
                <Bar dataKey="expenses" name="Spending" fill={lineColorExp} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ═══════════════════════ NET WORTH ═══════════════════════ */}
      {tab === 'Net Worth' && (
        <>
          <div className="card p-6 mb-4 flex items-center justify-between">
            <div>
              <p className="text-muted text-xs mb-1">Total Net Worth</p>
              <p className="text-4xl font-black" style={{ color: netWorth >= 0 ? 'var(--text-primary)' : 'var(--negative-strong)' }}>{fmt(Math.abs(netWorth))}</p>
              <p className="text-xs text-muted mt-1">
                {netWorth >= 0 ? 'Positive position' : 'Deficit'}
                {' · Cash from '}{usingRealCash ? 'connected/manual account balances' : 'recorded income minus expenses (no accounts yet)'}
              </p>
            </div>
            <span className="opacity-30">{netWorth >= 0 ? <ArrowUpRight size={48} /> : <ArrowDownRight size={48} />}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { label: 'Cash',             value: cashBase,              color: '#10b981', Icon: Banknote },
              { label: 'Portfolio',         value: portValue,             color: '#3b82f6', Icon: TrendingUp },
              { label: 'Physical Assets',   value: physicalAssets,        color: '#8b5cf6', Icon: Home },
              { label: 'Net Loan Position', value: moneyLent - moneyOwed, color: moneyLent - moneyOwed >= 0 ? '#f59e0b' : '#ef4444', Icon: Handshake },
            ].map(item => (
              <div key={item.label} className="card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <item.Icon size={14} className="text-muted" />
                  <p className="text-muted text-xs">{item.label}</p>
                </div>
                <p className="text-lg font-black" style={{ color: item.value >= 0 ? 'var(--text-primary)' : 'var(--negative-strong)' }}>
                  {fmt(Math.abs(item.value))}
                </p>
              </div>
            ))}
          </div>

          {nwPieData.length > 0 && (
            <div className="card p-5 mb-4">
              <p className="font-bold text-primary mb-3 text-sm">Asset Allocation</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={nwPieData} dataKey="value" cx="50%" cy="50%" outerRadius={85} {...pieStrokeProps(dark)}
                    activeIndex={nwActiveIndex} activeShape={renderActivePieSector(dark)}
                    onMouseEnter={(_, i) => setNwActiveIndex(i)}
                    onMouseLeave={() => setNwActiveIndex(null)}
                    onClick={(_, i) => setNwActiveIndex(prev => (prev === i ? null : i))}
                    style={{ cursor: 'pointer' }}>
                    {nwPieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} fillOpacity={pieCellOpacity(nwActiveIndex, i)} />
                    ))}
                  </Pie>
                  <Tooltip formatter={v => fmt(v)} contentStyle={tooltipStyle} itemStyle={cellTooltipItemStyle} labelStyle={cellTooltipLabelStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1">
                {nwPieData.map((d, i) => (
                  <div key={d.name} className="flex justify-between text-xs cursor-pointer"
                    style={{ opacity: pieCellOpacity(nwActiveIndex, i) }}
                    onMouseEnter={() => setNwActiveIndex(i)}
                    onMouseLeave={() => setNwActiveIndex(null)}
                    onClick={() => setNwActiveIndex(prev => (prev === i ? null : i))}>
                    <span className="flex items-center gap-1 min-w-0">
                      <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-muted truncate">{d.name}</span>
                    </span>
                    <span className="font-medium text-primary flex-shrink-0 ml-2">{fmt(d.value)} · {((d.value / nwPieTotal) * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card p-5">
            <p className="font-bold text-primary mb-3 text-sm">Savings Rate Trend</p>
            <p className="text-muted text-xs mb-3">7-day trailing average · 20%+ is considered healthy</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={savingsRateData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="label" interval={dailyTickInterval} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => `${v}%`} />
                <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Savings Rate" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ═══════════════════════ LOANS ═══════════════════════ */}
      {tab === 'Loans' && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatCard label="Money Lent Out"   value={fmt(totalLent)} sub={`${lentLoans.length} active`}     tone="#10b981" />
            <StatCard label="Money You Owe"    value={fmt(totalOwed)} sub={`${borrowedLoans.length} active`} tone="#ef4444" />
            <StatCard label="Net Loan Position" value={fmt(totalLent - totalOwed)} sub={totalLent - totalOwed >= 0 ? 'In your favor' : 'You owe more'} tone={totalLent - totalOwed >= 0 ? '#10b981' : '#ef4444'} />
          </div>

          {activeLoans.length > 0 && (
            <div className="card p-5 mb-4">
              <p className="font-bold text-primary mb-3 text-sm">Active Loans Breakdown</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={activeLoans.map(l => ({ name: l.person_name, amount: parseFloat(calcWithInterest(l.amount, l.interest_rate, l.loan_date).toFixed(2)), type: l.type }))} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={cellTooltipItemStyle} labelStyle={cellTooltipLabelStyle} formatter={v => fmt(v)} cursor={barCursor} />
                  <Bar dataKey="amount" name="Amount" radius={[4,4,0,0]}>
                    {activeLoans.map((l, i) => <Cell key={i} fill={l.type === 'lent' ? '#10b981' : '#ef4444'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 text-xs font-bold">
                <span style={{ color: 'var(--positive-strong)' }}>● Lent Out</span>
                <span style={{ color: 'var(--negative-strong)' }}>● Borrowed</span>
              </div>
            </div>
          )}

          <div className="card p-5">
            <p className="font-bold text-primary mb-4 text-sm">Active Loans Detail</p>
            {activeLoans.length === 0 ? (
              <p className="text-center text-muted text-sm py-6">No active loans.</p>
            ) : (
              <div className="space-y-3">
                {activeLoans.map(loan => {
                  const current  = calcWithInterest(loan.amount, loan.interest_rate, loan.loan_date)
                  const interest = current - loan.amount
                  const isLent   = loan.type === 'lent'
                  return (
                    <div key={loan.id} className="flex items-center justify-between p-3 rounded-xl" style={{ border: '1px solid var(--card-border)' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: isLent ? 'var(--positive-bg)' : 'var(--negative-bg)', color: isLent ? 'var(--positive)' : 'var(--negative)' }}>
                          {isLent ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                        </div>
                        <div>
                          <p className="font-semibold text-primary text-sm">{loan.person_name}</p>
                          <p className="text-xs text-muted">{isLent ? 'You lent' : 'You borrowed'} · {loan.loan_date}</p>
                          {loan.interest_rate > 0 && <p className="text-xs" style={{ color: 'var(--warning-strong)' }}>+{fmt(interest)} interest accrued</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-sm" style={{ color: isLent ? 'var(--positive-strong)' : 'var(--negative-strong)' }}>{fmt(current)}</p>
                        {loan.interest_rate > 0 && <p className="text-xs text-muted">orig: {fmt(loan.amount)}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="card p-4 mt-4">
            <p className="font-bold text-primary text-sm mb-2">Impact on Net Worth</p>
            <p className="text-xs text-muted mb-3">Loans affect your total financial position</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Loans add to net worth</span>
              <span className="font-bold" style={{ color: 'var(--positive-strong)' }}>+{fmt(totalLent)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted">Debts reduce net worth</span>
              <span className="font-bold" style={{ color: 'var(--negative-strong)' }}>-{fmt(totalOwed)}</span>
            </div>
            <div className="border-t mt-2 pt-2 flex justify-between text-sm font-black" style={{ borderColor: 'var(--card-border)' }}>
              <span className="text-primary">Net contribution</span>
              <span style={{ color: totalLent - totalOwed >= 0 ? 'var(--positive-strong)' : 'var(--negative-strong)' }}>{fmt(totalLent - totalOwed)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
