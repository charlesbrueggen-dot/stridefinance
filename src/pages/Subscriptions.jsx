// src/pages/Subscriptions.jsx
// Detects recurring charges from transaction history and lets the user
// track/cancel/manually-add subscriptions. "Cancel" only updates our own
// tracking — there's no API to actually cancel a subscription with the
// provider — so we deep-link to their account page and let the user
// confirm once they've finished it there.
import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Repeat, ArrowUp, ArrowUpRight, X, CalendarDays, MessageCircle } from 'lucide-react'
import { useAuth } from '../App'
import { supabase } from '../lib/supabase'
import { useTransactions } from '../hooks/useTransactions'
import {
  useSubscriptions, detectRecurring, monthlyEquivalent, daysUntil,
  CATEGORIES, CATEGORY_ICON,
} from '../hooks/useSubscriptions'
import { fmtCurrency as fmt } from '../lib/format'
import { negotiationTips, negotiationCoachPrompt } from '../lib/negotiationTips'
import ProGate from '../components/ProGate'
import { PageHeader, EmptyState, PageSkeleton, SegTabs } from '../components/ui'
import { useIsPro } from '../hooks/useIsPro'
import MerchantLogo from '../components/MerchantLogo'
import BillCalendar from '../components/BillCalendar'

function RenewalBadge({ date }) {
  const d = daysUntil(date)
  if (d === null) return null
  if (d < 0)  return <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--negative-bg)', color: 'var(--negative)' }}>Overdue {Math.abs(d)}d</span>
  if (d === 0) return <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>Renews today</span>
  if (d <= 7)  return <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>Renews in {d}d</span>
  return <span className="text-xs text-muted">Renews {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
}

// Thin wrapper over the shared MerchantLogo — keeps every call site below
// unchanged (`<SubLogo name=... category=... />`) while the logo lookup and
// favicon rendering live in one shared place (src/lib/merchantLogo.js +
// src/components/MerchantLogo.jsx) that Accounts/Expenses/Dashboard also use.
function SubLogo({ name, category, size = 36 }) {
  return <MerchantLogo name={name} FallbackIcon={CATEGORY_ICON[category] || Repeat} size={size} />
}

const blankForm = () => ({
  name: '', amount: '', frequency: 'monthly', category: 'Other',
  next_billing_date: '', cancel_url: '',
})

export default function Subscriptions() {
  const { user } = useAuth()
  const { transactions, loading } = useTransactions()
  const {
    tracked: trackedSubs, track: trackSub, cancelDetected: cancelDetectedSub,
    cancel: cancelSub, reactivate: reactivateSub, addManual, updateSub,
  } = useSubscriptions(user?.id)

  const { isPro, proLoading } = useIsPro(user.id)
  const [cancelTarget, setCancelTarget] = useState(null) // { detected } or { tracked }
  const [detailSub, setDetailSub] = useState(null)       // tracked sub shown in the detail popup
  const [showTips, setShowTips] = useState(false)        // negotiation-tips panel inside that popup
  const [showForm, setShowForm] = useState(false)
  const [editingSub, setEditingSub] = useState(null)
  const [form, setForm] = useState(blankForm())
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('subs') // 'subs' | 'calendar'

  // Recurring expenses/income for the Calendar tab — Subscriptions otherwise only
  // touches account_transactions + tracked_subscriptions, so these are fetched
  // separately (same tables Income.jsx/Expenses.jsx already read from).
  const [recurringExpenses, setRecurringExpenses] = useState([])
  const [recurringIncome, setRecurringIncome] = useState([])
  useEffect(() => {
    if (!user?.id) return
    const load = async () => {
      const [{ data: exp }, { data: inc }] = await Promise.all([
        supabase.from('expenses').select('description, amount, next_due').eq('user_id', user.id).eq('recurring', true),
        supabase.from('income').select('source, amount, next_date').eq('user_id', user.id).neq('frequency', 'one-time'),
      ])
      setRecurringExpenses((exp || []).filter(e => e.next_due))
      setRecurringIncome((inc || []).filter(i => i.next_date))
    }
    load()
  }, [user?.id])

  const allDetected      = useMemo(() => detectRecurring(transactions), [transactions])
  const trackedKeys      = useMemo(() => new Set(trackedSubs.map(s => s.merchant_key)), [trackedSubs])
  const untrackedAll      = useMemo(() => allDetected.filter(d => !trackedKeys.has(d.merchantKey)), [allDetected, trackedKeys])
  // "possible" = seen once so far, not enough data to confirm a repeat yet — detection still
  // runs and keeps track of these internally (so they're ready to graduate the moment a second
  // charge confirms the pattern), they're just not surfaced in the UI since there's nothing
  // actionable to do with a single occurrence yet.
  const untrackedDetected = useMemo(() => untrackedAll.filter(d => d.confidence !== 'possible'), [untrackedAll])

  // Silently keep already-tracked subscriptions in sync with new transactions
  // (updates amount/last-charge/next-billing-date, flags price changes) —
  // this is the piece that'll do real work once transactions start flowing
  // in continuously from a connected bank.
  useEffect(() => {
    const stale = allDetected.filter(d => {
      const row = trackedSubs.find(s => s.merchant_key === d.merchantKey)
      return row && row.status === 'active' && row.last_charge_date !== d.lastDate
    })
    if (stale.length === 0) return
    ;(async () => { for (const d of stale) await trackSub(d) })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDetected])

  const activeSubs = trackedSubs
    .filter(s => s.status === 'active')
    .sort((a, b) => (a.next_billing_date || '9999').localeCompare(b.next_billing_date || '9999'))
  const cancelledSubs   = trackedSubs.filter(s => s.status === 'cancelled')
  const monthlySubTotal = activeSubs.reduce((s, sub) => s + monthlyEquivalent(sub), 0)
  const renewingSoon    = activeSubs.filter(s => {
    const d = daysUntil(s.next_billing_date)
    return d !== null && d <= 7
  })

  const calendarEvents = useMemo(() => [
    ...activeSubs.filter(s => s.next_billing_date).map(s => ({ date: s.next_billing_date, label: s.name, amount: s.amount, kind: 'subscription' })),
    ...recurringExpenses.map(e => ({ date: e.next_due, label: e.description, amount: e.amount, kind: 'expense' })),
    ...recurringIncome.map(i => ({ date: i.next_date, label: i.source, amount: i.amount, kind: 'income' })),
  ], [activeSubs, recurringExpenses, recurringIncome])

  const openAdd  = () => { setEditingSub(null); setForm(blankForm()); setShowForm(true) }

  // Deep link from the Dashboard's "+ Add" menu: /subscriptions?add=1 opens the form (Pro only)
  useEffect(() => {
    if (!proLoading && !loading && isPro && new URLSearchParams(window.location.search).get('add') === '1') openAdd()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proLoading, loading, isPro])
  const openEdit = sub => {
    setEditingSub(sub)
    setForm({
      name: sub.name, amount: sub.amount, frequency: sub.frequency,
      category: sub.category || 'Other', next_billing_date: sub.next_billing_date || '',
      cancel_url: sub.cancel_url || '',
    })
    setShowForm(true)
  }

  const handleSubmitForm = async e => {
    e.preventDefault(); setSaving(true)
    if (editingSub) await updateSub(editingSub.id, form)
    else             await addManual(form)
    setSaving(false); setShowForm(false)
  }

  if (proLoading || loading) return <PageSkeleton stats={2} hero={false} />

  if (!isPro) return (
    <ProGate
      feature="Subscriptions"
      Icon={Repeat}
      description="Automatically detect recurring charges like Netflix or Spotify, see what's renewing soon, and get a shortcut to cancel them."
      userId={user.id}
    />
  )

  return (
    <div>
      <PageHeader title="Subscriptions" subtitle="Recurring charges detected from your transactions">
        {tab === 'subs' && <button onClick={openAdd} className="btn-primary text-sm px-4">+ Add</button>}
      </PageHeader>

      <div className="mb-5">
        <SegTabs
          tabs={[{ value: 'subs', label: 'Subscriptions', Icon: Repeat }, { value: 'calendar', label: 'Bill Calendar', Icon: CalendarDays }]}
          active={tab} onChange={setTab}
        />
      </div>

      {tab === 'calendar' && <BillCalendar events={calendarEvents} />}

      {tab === 'subs' && <>
      {activeSubs.length > 0 && (
        <div className="card p-4 mb-5">
          <p className="text-muted text-xs mb-1">Monthly Subscription Cost</p>
          <p className="text-2xl font-black text-primary tnum">{fmt(monthlySubTotal)}/mo</p>
          <p className="text-xs text-muted mt-1">
            ≈ {fmt(monthlySubTotal * 12)}/yr · {activeSubs.length} active subscription{activeSubs.length !== 1 ? 's' : ''}
            {renewingSoon.length > 0 && <span> · {renewingSoon.length} renewing within 7 days</span>}
          </p>
        </div>
      )}

      {untrackedDetected.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Detected Recurring Charges</p>
          <div className="card px-4 py-1">
            {untrackedDetected.map(d => (
              <div key={d.merchantKey} className="list-row">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <SubLogo name={d.name} category={d.category} />
                  <div className="min-w-0">
                    <p className="font-semibold text-primary text-sm truncate">{d.name}</p>
                    <p className="text-xs text-muted truncate">{fmt(d.amount)} · {d.frequency} · est. next {d.nextDate}</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => trackSub(d)} className="btn-secondary text-xs px-3 py-1.5">+ Track</button>
                  <button onClick={() => setCancelTarget({ detected: d })} className="text-xs text-muted hover:text-red-500 px-3 py-1.5 rounded border"
                    style={{ borderColor: 'var(--card-border)' }}>Cancel</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubs.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Your Subscriptions</p>
          {/* Condensed rows — tap one for the full details popup */}
          <div className="card px-4 py-1">
            {activeSubs.map(sub => (
              <div key={sub.id} className="list-row cursor-pointer" onClick={() => { setDetailSub(sub); setShowTips(false) }}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <SubLogo name={sub.name} category={sub.category} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-primary text-sm truncate">{sub.name}</p>
                      {sub.previous_amount != null && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 inline-flex items-center gap-0.5"
                          style={{ background: 'var(--negative-bg)', color: 'var(--negative)' }}>
                          <ArrowUp size={11} /> price up
                        </span>
                      )}
                    </div>
                    <RenewalBadge date={sub.next_billing_date} />
                  </div>
                </div>
                <p className="font-black text-primary text-sm tnum flex-shrink-0">{fmt(sub.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {cancelledSubs.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Cancelled</p>
          <div className="card px-4 py-1 opacity-70">
            {cancelledSubs.map(sub => (
              <div key={sub.id} className="list-row">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <SubLogo name={sub.name} category={sub.category} />
                  <div className="min-w-0">
                    <p className="font-semibold text-primary text-sm line-through truncate">{sub.name}</p>
                    <p className="text-xs text-muted">{fmt(sub.amount)} · {sub.frequency}</p>
                  </div>
                </div>
                <button onClick={() => reactivateSub(sub.id)} className="text-xs text-muted hover:text-primary px-3 py-1.5 rounded border flex-shrink-0"
                  style={{ borderColor: 'var(--card-border)' }}>Reactivate</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {untrackedDetected.length === 0 && trackedSubs.length === 0 && (
        <div className="card" style={{ border: '2px dashed var(--card-border)' }}>
          <EmptyState Icon={Repeat} title="No recurring charges detected yet"
            sub="Once you log or sync a few months of transactions, repeating charges show up here automatically.">
            <button onClick={openAdd} className="btn-secondary">+ Add one manually</button>
          </EmptyState>
        </div>
      )}
      </>}

      {/* ══════════════════ SUBSCRIPTION DETAIL POPUP ══════════════════ */}
      {detailSub && (
        <div className="modal-overlay" onClick={() => setDetailSub(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3 min-w-0">
                <SubLogo name={detailSub.name} category={detailSub.category} size={46} />
                <div className="min-w-0">
                  <p className="font-black text-primary text-lg truncate">{detailSub.name}</p>
                  <RenewalBadge date={detailSub.next_billing_date} />
                </div>
              </div>
              <button onClick={() => setDetailSub(null)} className="text-muted hover:text-primary flex-shrink-0"><X size={20} /></button>
            </div>

            <div className="rounded-2xl p-4 mb-5" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
              {[
                ['Price', `${fmt(detailSub.amount)} / ${detailSub.frequency}`],
                ['Monthly equivalent', `${fmt(monthlyEquivalent(detailSub))}/mo`],
                ['Yearly cost', fmt(monthlyEquivalent(detailSub) * 12)],
                ['Category', detailSub.category || 'Other'],
                detailSub.next_billing_date && ['Next billing', new Date(detailSub.next_billing_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })],
                detailSub.last_charge_date && ['Last charge', detailSub.last_charge_date],
                detailSub.previous_amount != null && ['Previous price', `${fmt(detailSub.previous_amount)} (increased)`],
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 py-1.5 text-sm">
                  <span className="text-muted">{label}</span>
                  <span className="font-semibold text-primary text-right tnum">{value}</span>
                </div>
              ))}
            </div>

            <button onClick={() => setShowTips(v => !v)} className="btn-secondary w-full justify-center mb-3">
              <MessageCircle size={15} /> {showTips ? 'Hide negotiation tips' : 'Get negotiation tips'}
            </button>

            {showTips && (
              <div className="rounded-2xl p-4 mb-5 text-sm" style={{ background: 'var(--info-bg)', border: '1px solid var(--info)' }}>
                <p className="text-xs font-bold mb-2" style={{ color: 'var(--info)' }}>
                  We can't call {detailSub.name} for you — but here's a script:
                </p>
                <ul className="space-y-1.5 mb-3">
                  {negotiationTips(detailSub).map((tip, i) => (
                    <li key={i} className="flex gap-2 text-primary text-xs">
                      <span className="flex-shrink-0">•</span><span>{tip}</span>
                    </li>
                  ))}
                </ul>
                <Link to={`/coach?ask=${encodeURIComponent(negotiationCoachPrompt(detailSub))}`}
                  className="text-xs font-bold no-underline inline-block hover:opacity-80" style={{ color: 'var(--info)' }}>
                  Ask AI Coach for a personalized script →
                </Link>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setDetailSub(null); openEdit(detailSub) }} className="btn-secondary justify-center">Edit</button>
              <button onClick={() => { const s = detailSub; setDetailSub(null); setCancelTarget({ tracked: s }) }}
                className="btn-primary justify-center" style={{ background: '#ef4444', borderColor: '#ef4444' }}>
                Cancel Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ ADD / EDIT SUBSCRIPTION MODAL ══════════════════ */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <p className="accent-text font-black text-lg">{editingSub ? 'Edit Subscription' : 'Add Subscription'}</p>
              <button onClick={() => setShowForm(false)} className="text-muted hover:text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmitForm}>
              <div className="mb-4">
                <label className="label">Name</label>
                <input className="input-field" placeholder="e.g., Netflix" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="label">Amount ($)</label>
                  <input className="input-field" type="number" step="0.01" min="0" placeholder="0.00" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
                </div>
                <div>
                  <label className="label">Frequency</label>
                  <select className="input-field" value={form.frequency}
                    onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>
              <div className="mb-4">
                <label className="label">Category</label>
                <select className="input-field" value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="mb-4">
                <label className="label">Next Billing Date (optional)</label>
                <input className="input-field" type="date" value={form.next_billing_date}
                  onChange={e => setForm(f => ({ ...f, next_billing_date: e.target.value }))} />
              </div>
              <div className="mb-6">
                <label className="label">Cancel Page URL (optional)</label>
                <input className="input-field" type="url" placeholder="Auto-filled if left blank" value={form.cancel_url}
                  onChange={e => setForm(f => ({ ...f, cancel_url: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary justify-center">{saving ? 'Saving…' : editingSub ? 'Save Changes' : 'Add Subscription'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════ CANCEL SUBSCRIPTION MODAL ══════════════════ */}
      {cancelTarget && (
        <div className="modal-overlay" onClick={() => setCancelTarget(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            {(() => {
              const d    = cancelTarget.detected
              const t    = cancelTarget.tracked
              const name = d?.name || t?.name
              const url  = d ? d.cancelUrl : t.cancel_url
              return (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="accent-text font-black text-lg">Cancel {name}</p>
                    <button onClick={() => setCancelTarget(null)} className="text-muted hover:text-primary"><X size={20} /></button>
                  </div>
                  <p className="text-muted text-sm mb-5">
                    We can't cancel this with the provider for you. Finish it on their site, then confirm here so we stop counting it as active spend.
                  </p>
                  <a
                    href={url || `https://www.google.com/search?q=${encodeURIComponent(`cancel ${name} subscription`)}`}
                    target="_blank" rel="noreferrer"
                    className="btn-secondary w-full justify-center mb-3"
                  >
                    <ArrowUpRight size={15} /> Open {name}'s account page
                  </a>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setCancelTarget(null)} className="btn-secondary justify-center">Never mind</button>
                    <button
                      onClick={async () => {
                        if (t) await cancelSub(t.id)
                        else   await cancelDetectedSub(d)
                        setCancelTarget(null)
                      }}
                      className="btn-primary justify-center"
                      style={{ background: '#ef4444' }}
                    >
                      I've cancelled it
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
