// src/pages/Settings.jsx
// App settings: appearance, account, Pro status, data export, and the
// Clear All Data danger zone (moved here from the Dashboard so a
// permanently-destructive action no longer sits on the most-visited page).
import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Moon, Sun, LogOut, Sparkle, Zap, Download, Trash2, AlertTriangle, X,
  User, Palette, Database, ShieldCheck, FlaskConical, Users, Copy, Check, LogOut as LeaveIcon,
} from 'lucide-react'
import { supabase, authHeader } from '../lib/supabase'
import { useAuth } from '../App'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui'
import { FORCE_FREE_KEY } from '../hooks/useIsPro'
import { useHousehold } from '../hooks/useHousehold'

// Every table that holds the user's actual financial records — cleared by "Clear All Data".
// Deliberately excludes `subscriptions` (Stripe/Pro billing status) and `plaid_items`
// (bank connection credentials) since those are account/connection state, not "your data" —
// wiping them would silently cancel Pro access or break an existing bank link.
const CLEAR_DATA_TABLES = [
  'income', 'expenses', 'investments', 'loans', 'goals', 'assets',
  'account_transactions', 'accounts', 'balance', 'balance_accounts', 'balance_gains',
  'tracked_subscriptions',
]
const CLEAR_CONFIRM_PHRASE = 'DELETE'

function SettingsSection({ Icon, title, children }) {
  return (
    <div className="card p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="icon-chip" style={{ width: 32, height: 32, borderRadius: 10 }}><Icon size={15} /></div>
        <h2 className="font-black text-primary">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function SettingsRow({ label, sub, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3" style={{ borderBottom: '1px solid var(--card-border)' }}>
      <div className="min-w-0">
        <p className="font-semibold text-primary text-sm">{label}</p>
        {sub && <p className="text-muted text-xs mt-0.5">{sub}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

export default function Settings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { dark, setDark } = useOutletContext()

  const [isPro, setIsPro] = useState(false)
  const [proLoading, setProLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [showClearModal, setShowClearModal] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')
  const [clearing, setClearing] = useState(false)

  const {
    household, members, inviteCodes, loading: householdLoading,
    createHousehold, generateInviteCode, revokeInviteCode, redeemInviteCode, leaveHousehold,
  } = useHousehold(user.id)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [creatingHousehold, setCreatingHousehold] = useState(false)
  const [generatingCode, setGeneratingCode] = useState(false)
  const [copiedCodeId, setCopiedCodeId] = useState(null)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  const handleCreateHousehold = async () => {
    setCreatingHousehold(true)
    await createHousehold(`${user.email?.split('@')[0] || 'My'}'s Household`)
    setCreatingHousehold(false)
  }

  const handleGenerateCode = async () => {
    setGeneratingCode(true)
    await generateInviteCode()
    setGeneratingCode(false)
  }

  const handleJoin = async e => {
    e.preventDefault()
    if (!joinCode.trim()) return
    setJoining(true); setJoinError('')
    const { error } = await redeemInviteCode(joinCode)
    setJoining(false)
    if (error) setJoinError(error.message || 'That code is invalid or expired.')
    else setJoinCode('')
  }

  const handleCopyCode = code => {
    navigator.clipboard?.writeText(code)
    setCopiedCodeId(code)
    setTimeout(() => setCopiedCodeId(null), 1500)
  }

  const handleLeave = async () => {
    await leaveHousehold()
    setShowLeaveConfirm(false)
  }

  // DEV-TESTING-TOGGLE — lets a real Pro subscriber preview the free-tier
  // experience without touching their actual subscription. Local to this
  // browser only. Remove this state/section + FORCE_FREE_KEY in
  // src/hooks/useIsPro.js before shipping publicly.
  const [forcedFree, setForcedFree] = useState(() => localStorage.getItem(FORCE_FREE_KEY) === '1')
  const toggleForcedFree = () => {
    const next = !forcedFree
    if (next) localStorage.setItem(FORCE_FREE_KEY, '1')
    else localStorage.removeItem(FORCE_FREE_KEY)
    setForcedFree(next)
    // Every Pro-gated page reads this once on mount, so a full reload is the
    // simplest way to make sure every open page reflects the new setting.
    window.location.reload()
  }

  useEffect(() => {
    const checkPro = async () => {
      const { data } = await supabase
        .from('subscriptions').select('status, current_period_end')
        .eq('user_id', user.id).eq('status', 'active').maybeSingle()
      setIsPro(!!data)
      setProLoading(false)
    }
    checkPro()
  }, [user.id])

  const handleUpgrade = async () => {
    setUpgrading(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setUpgrading(false)
    } catch { setUpgrading(false) }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  // One-click backup: every money record (manual + synced) as a single CSV.
  const handleExport = async () => {
    setExporting(true)
    try {
      const [{ data: inc }, { data: exp }, { data: txns }] = await Promise.all([
        supabase.from('income').select('*').eq('user_id', user.id),
        supabase.from('expenses').select('*').eq('user_id', user.id),
        supabase.from('account_transactions').select('*').eq('user_id', user.id),
      ])
      const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
      const rows = ['Type,Date,Description,Category,Amount']
      ;(inc || []).forEach(i => rows.push(['Income', i.date, esc(i.source), i.frequency || 'one-time', i.amount].join(',')))
      ;(exp || []).forEach(e => rows.push(['Expense', e.date, esc(e.description), `${e.category || ''} / ${e.subcategory || ''}`, e.amount].join(',')))
      ;(txns || []).forEach(t => rows.push([`Account ${t.kind}`, t.date, esc(t.description), `${t.category || t.source || ''}`, t.amount].join(',')))
      const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'stride-export.csv'
      a.click()
    } finally {
      setExporting(false)
    }
  }

  const handleClearAllData = async () => {
    setClearing(true)
    await Promise.all(CLEAR_DATA_TABLES.map(table => supabase.from(table).delete().eq('user_id', user.id)))
    window.location.reload()
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Appearance, account, and your data" />

      <SettingsSection Icon={Palette} title="Appearance">
        <SettingsRow label="Theme" sub={dark ? 'Dark — black & emerald' : 'Light — California blue'}>
          <button onClick={() => setDark(!dark)} className="btn-secondary text-sm">
            {dark ? <Sun size={15} /> : <Moon size={15} />} Switch to {dark ? 'light' : 'dark'}
          </button>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection Icon={User} title="Account">
        <SettingsRow label="Signed in as" sub={user?.email}>
          <button onClick={handleSignOut} className="text-sm font-bold px-4 py-2 rounded-xl inline-flex items-center gap-1.5"
            style={{ color: 'var(--negative)', background: 'var(--negative-bg)' }}>
            <LogOut size={14} /> Sign Out
          </button>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection Icon={Users} title="Household">
        {householdLoading ? (
          <p className="text-muted text-sm py-2">Loading…</p>
        ) : !household ? (
          <>
            <p className="text-muted text-sm mb-4">
              Share accounts, transactions, income, expenses, goals, and budgets with a partner or family member.
              Investments, loans, subscriptions, and AI Coach stay personal.
            </p>
            <button onClick={handleCreateHousehold} disabled={creatingHousehold} className="btn-primary text-sm mb-5">
              {creatingHousehold ? 'Creating…' : <><Users size={14} /> Create a Household</>}
            </button>
            <div style={{ borderTop: '1px solid var(--card-border)' }} className="pt-4">
              <label className="label">Have an invite code?</label>
              <form onSubmit={handleJoin} className="flex gap-2">
                <input className="input-field flex-1" placeholder="e.g., A1B2C3" value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={6} />
                <button type="submit" disabled={joining || !joinCode.trim()} className="btn-secondary px-4">
                  {joining ? 'Joining…' : 'Join'}
                </button>
              </form>
              {joinError && <p className="text-xs mt-2" style={{ color: 'var(--negative-strong)' }}>{joinError}</p>}
            </div>
          </>
        ) : (
          <>
            <SettingsRow label={household.name} sub={`${members.length} member${members.length !== 1 ? 's' : ''}`}>
              <button onClick={() => setShowLeaveConfirm(true)} className="text-sm font-semibold px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5"
                style={{ color: 'var(--negative)', background: 'var(--negative-bg)' }}>
                <LeaveIcon size={14} /> Leave
              </button>
            </SettingsRow>

            <div className="py-3" style={{ borderBottom: '1px solid var(--card-border)' }}>
              <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Members</p>
              <div className="space-y-1.5">
                {members.map(m => (
                  <div key={m.user_id} className="flex justify-between text-sm">
                    <span className="text-primary">{m.user_id === user.id ? `You (${user.email})` : 'Household member'}</span>
                    <span className="text-muted text-xs">joined {new Date(m.joined_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-muted uppercase tracking-wider">Invite codes</p>
                <button onClick={handleGenerateCode} disabled={generatingCode} className="btn-secondary text-xs px-3 py-1.5">
                  {generatingCode ? 'Generating…' : '+ New Code'}
                </button>
              </div>
              {inviteCodes.length === 0 ? (
                <p className="text-muted text-xs">No active invite codes. Generate one to invite someone.</p>
              ) : (
                <div className="space-y-2">
                  {inviteCodes.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-2.5 rounded-xl" style={{ border: '1px solid var(--card-border)' }}>
                      <div>
                        <p className="font-mono font-bold text-primary tracking-widest">{c.code}</p>
                        <p className="text-xs text-muted">Expires {new Date(c.expires_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleCopyCode(c.code)} className="text-muted hover:text-primary p-1.5">
                          {copiedCodeId === c.code ? <Check size={15} /> : <Copy size={15} />}
                        </button>
                        <button onClick={() => revokeInviteCode(c.id)} className="text-muted hover:text-red-500 p-1.5"><Trash2 size={15} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </SettingsSection>

      {/* Leave household confirmation */}
      {showLeaveConfirm && (
        <div className="modal-overlay" onClick={() => setShowLeaveConfirm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <p className="font-black text-lg text-primary mb-3">Leave household?</p>
            <p className="text-muted text-sm mb-5">
              You'll stop sharing accounts, transactions, income, expenses, goals, and budgets with this household.
              Your own data isn't deleted — it just goes back to being private.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowLeaveConfirm(false)} className="btn-secondary justify-center">Cancel</button>
              <button onClick={handleLeave} className="btn-primary justify-center" style={{ background: '#ef4444', borderColor: '#ef4444' }}>Leave</button>
            </div>
          </div>
        </div>
      )}

      <SettingsSection Icon={ShieldCheck} title="Stride Pro">
        <SettingsRow
          label={proLoading ? 'Checking…' : isPro ? 'Pro is active' : 'Free plan'}
          sub={isPro ? 'AI Coach, bank sync, imports, investments & more are unlocked.' : 'Unlock AI Coach, automatic bank sync, CSV import, and more.'}
        >
          {proLoading ? null : isPro ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: 'var(--positive-bg)', color: 'var(--positive)', border: '1px solid var(--positive)' }}>
              <Sparkle size={12} /> Active
            </span>
          ) : (
            <button onClick={handleUpgrade} disabled={upgrading} className="btn-primary text-sm">
              {upgrading ? 'Redirecting…' : <><Zap size={14} /> Upgrade — $6.99/mo</>}
            </button>
          )}
        </SettingsRow>
      </SettingsSection>

      {/* DEV-TESTING-TOGGLE — only shown to real Pro subscribers; remove before launch */}
      {!proLoading && isPro && (
        <SettingsSection Icon={FlaskConical} title="Testing (remove before launch)">
          <SettingsRow
            label={forcedFree ? 'Viewing as: Free user' : 'Viewing as: your real plan (Pro)'}
            sub="Preview the app as a free user without cancelling or touching your actual subscription."
          >
            <button onClick={toggleForcedFree} className="btn-secondary text-sm">
              {forcedFree ? 'Restore Pro view' : 'View as Free'}
            </button>
          </SettingsRow>
        </SettingsSection>
      )}

      <SettingsSection Icon={Database} title="Your Data">
        <SettingsRow label="Export everything" sub="Download all income, expenses, and transactions as a CSV backup.">
          <button onClick={handleExport} disabled={exporting} className="btn-secondary text-sm">
            <Download size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </SettingsRow>
        <SettingsRow label="Clear all data" sub="Permanently delete every record. Cannot be undone.">
          <button onClick={() => setShowClearModal(true)}
            className="text-sm font-bold px-4 py-2 rounded-xl inline-flex items-center gap-1.5"
            style={{ color: 'var(--negative)', background: 'var(--negative-bg)' }}>
            <Trash2 size={14} /> Clear
          </button>
        </SettingsRow>
      </SettingsSection>

      {/* Clear All Data confirmation modal */}
      {showClearModal && (
        <div className="modal-overlay" onClick={() => !clearing && setShowClearModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-black text-lg flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--negative-bg)', color: 'var(--negative)' }}>
                <AlertTriangle size={20} /> Clear All Data
              </p>
              {!clearing && (
                <button onClick={() => setShowClearModal(false)} className="text-muted hover:text-primary"><X size={20} /></button>
              )}
            </div>
            <p className="text-muted text-sm mb-4">
              This permanently deletes all your income, expenses, investments, loans, goals, assets,
              accounts, and synced transactions. This cannot be undone. Your Pro subscription and any
              connected bank link are not affected.
            </p>
            <label className="label">Type {CLEAR_CONFIRM_PHRASE} to confirm</label>
            <input
              className="input-field mb-4"
              value={clearConfirmText}
              onChange={e => setClearConfirmText(e.target.value)}
              placeholder={CLEAR_CONFIRM_PHRASE}
              disabled={clearing}
              autoFocus
            />
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setShowClearModal(false)} disabled={clearing} className="btn-secondary justify-center">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAllData}
                disabled={clearing || clearConfirmText !== CLEAR_CONFIRM_PHRASE}
                className="btn-primary justify-center"
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
              >
                {clearing ? 'Clearing…' : 'Permanently Delete Everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
