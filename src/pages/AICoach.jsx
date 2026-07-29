import { useState, useEffect, useRef } from 'react'
import { Bot, ArrowUp } from 'lucide-react'
import ProGate from '../components/ProGate'
import { PageSkeleton } from '../components/ui'
import { useAuth } from '../App'
import { supabase, authHeader } from '../lib/supabase'
import { fmtCurrency as fmt } from '../lib/format'
import { useTransactions } from '../hooks/useTransactions'
import { bucketMonthlyTotals, computeSavingsRate } from '../lib/savingsRate'
import { useDarkMode } from '../hooks/useDarkMode'
import { useIsPro } from '../hooks/useIsPro'

const SAVINGS_RATE_MONTHS = 6

const SYSTEM_PROMPT = (financialData) => `You are Stride Coach, a sharp and supportive personal finance coach built into the Stride Finance app. You have a warm but direct style — you don't sugarcoat, but you're always encouraging.

Here is the user's current financial data from their Stride dashboard:

INCOME:
- Total Income: ${fmt(financialData.totalIncome)}
- Sources: ${financialData.income.map(i => `${i.source}: ${fmt(i.amount)} (${i.frequency || 'one-time'})`).join(', ') || 'None yet'}

EXPENSES:
- Total Expenses: ${fmt(financialData.totalExpenses)}
- This Month: ${fmt(financialData.monthExpenses)}
- By Category: ${financialData.expensesByCategory.map(([cat, amt]) => `${cat}: ${fmt(amt)}`).join(', ') || 'None yet'}

SAVINGS RATE (avg. over the last ${SAVINGS_RATE_MONTHS} months): ${financialData.savingsRate}%
SURPLUS/DEFICIT: ${financialData.surplus >= 0 ? '+' : ''}${fmt(financialData.surplus)}

GOALS: ${financialData.goals.map(g => `${g.name} (target: ${fmt(g.target_amount)}, saved: ${fmt(g.current_amount)})`).join(', ') || 'No goals set yet'}

LOANS/DEBTS: ${financialData.loans.length} active loan(s)

Guidelines:
- Reference their ACTUAL numbers when giving advice — be specific, not generic
- Keep responses concise (2-4 short paragraphs max unless they ask for detail)
- Use plain language, no jargon
- If they haven't entered much data yet, encourage them to add it so you can give better advice
- You can suggest they navigate to specific pages in the app (Income, Expenses, Goals, etc.)
- Never make up financial data — only use what's provided above
- Format numbers in USD when referencing amounts`

export default function AICoach() {
  const { user } = useAuth()
  const { isPro, proLoading } = useIsPro(user.id)
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hey! I'm your Stride Coach 👋 I've pulled up your financial data and I'm ready to help. You can ask me anything — whether it's analyzing your spending, planning for a goal, or figuring out how to save more. What's on your mind?",
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [financialData, setFinancialData] = useState(null)
  const [dataLoading, setDataLoading] = useState(true)
  const dark = useDarkMode()
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const { expenseTxns, incomeTxns } = useTransactions()

  // Deep link from Dashboard insight cards: /coach?ask=<encoded prompt> prefills
  // the input (doesn't auto-send — same "opens ready to review" pattern the
  // ?add=1 deep links use elsewhere in the app).
  useEffect(() => {
    const ask = new URLSearchParams(window.location.search).get('ask')
    if (ask) { setInput(ask); setTimeout(() => inputRef.current?.focus(), 100) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    const loadData = async () => {
      const [{ data: income }, { data: expenses }, { data: goals }, { data: loans }] = await Promise.all([
        supabase.from('income').select('*').eq('user_id', user.id),
        supabase.from('expenses').select('*').eq('user_id', user.id),
        supabase.from('goals').select('*').eq('user_id', user.id),
        supabase.from('loans').select('*').eq('user_id', user.id),
      ])

      const gls = goals || []
      const lns = loans || []

      // Merge manual entries with synced/imported account transactions — matches Dashboard
      // and Analytics, so the coach's numbers agree with what the rest of the app shows.
      const allIncome = [
        ...(income || []),
        ...incomeTxns.map(t => ({ id: t.id, amount: t.amount, date: t.date, source: t.source || t.description || 'Account' })),
      ]
      const allExpenses = [
        ...(expenses || []),
        ...expenseTxns.map(t => ({ id: t.id, amount: t.amount, date: t.date, category: t.category || 'Wants' })),
      ]

      const totalIncome = allIncome.reduce((s, i) => s + parseFloat(i.amount), 0)
      const totalExpenses = allExpenses.reduce((s, e) => s + parseFloat(e.amount), 0)
      const thisMonth = new Date().toISOString().slice(0, 7)
      const monthExpenses = allExpenses.filter(e => e.date?.slice(0, 7) === thisMonth).reduce((s, e) => s + parseFloat(e.amount), 0)

      const catMap = {}
      allExpenses.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + parseFloat(e.amount) })
      const expensesByCategory = Object.entries(catMap).sort((a, b) => b[1] - a[1])

      const monthlyTotals = bucketMonthlyTotals(allIncome, allExpenses, SAVINGS_RATE_MONTHS)
      const { rate: savingsRate } = computeSavingsRate(monthlyTotals)
      const surplus = totalIncome - totalExpenses

      setFinancialData({ income: allIncome, expenses: allExpenses, goals: gls, loans: lns, totalIncome, totalExpenses, monthExpenses, expensesByCategory, savingsRate, surplus })
      setDataLoading(false)
    }
    loadData()
  }, [user.id, incomeTxns, expenseTxns])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading || !financialData) return

    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      // Prompt caching: the system prompt (this user's financial summary) and the
      // growing message history are byte-identical on every message within one
      // sitting, so a cache breakpoint on each lets later turns in the same
      // conversation read the prefix instead of paying full price again. Note:
      // Haiku 4.5's minimum cacheable prefix is 4096 tokens — a short session or
      // modest financial summary won't actually hit the cache (harmless no-op,
      // not an error), but longer conversations and heavier data do.
      const outgoingMessages = newMessages.map(m => ({ role: m.role, content: m.content }))
      const lastMsg = outgoingMessages[outgoingMessages.length - 1]
      outgoingMessages[outgoingMessages.length - 1] = {
        ...lastMsg,
        content: [{ type: 'text', text: lastMsg.content, cache_control: { type: 'ephemeral' } }],
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
          userId: user.id,
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: [{ type: 'text', text: SYSTEM_PROMPT(financialData), cache_control: { type: 'ephemeral' } }],
          messages: outgoingMessages,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error?.message || `Server error ${response.status}`)
      }

      const data = await response.json()
      const textBlock = data.content?.find(block => block.type === 'text')
      const reply = textBlock?.text || 'Sorry, I could not generate a response.'
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${err.message}` }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const STARTERS = [
    "How's my savings rate looking?",
    "Where am I overspending?",
    "Help me reach my goals faster",
    "How can I reduce my expenses?",
  ]

  if (proLoading || dataLoading) return <PageSkeleton stats={3} hero={false} />

  if (!isPro) return (
    <ProGate
      feature="Stride AI Coach"
      Icon={Bot}
      description="Get personalized financial advice powered by AI — analyzing your real spending, income, and goals to give you specific, actionable guidance."
      userId={user.id}
    />
  )

  return (
    <div className="flex flex-col h-[calc(100dvh-215px)] lg:h-[calc(100dvh-130px)]" style={{ maxHeight: 820, minHeight: 380 }}>
      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
            style={{ background: dark ? '#0d0d0d' : 'rgba(255,255,255,0.9)', border: dark ? '2px solid #10b981' : '2px solid rgba(255,255,255,0.4)' }}>
            <img src={dark ? '/logo-dark.png' : '/logo.png'} alt="Stride Coach" className="w-7 h-7 object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-black text-primary tracking-tight">Stride Coach</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>
              <p className="text-muted text-xs">Your AI finance coach · data synced</p>
            </div>
          </div>
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-2 min-h-0">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
              style={msg.role === 'user'
                ? { background: dark ? '#10b981' : 'rgba(255,255,255,0.9)', color: dark ? '#000' : '#1a3a6b', fontWeight: 600, borderRadius: '18px 18px 4px 18px' }
                : { background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)', borderRadius: '18px 18px 18px 4px', whiteSpace: 'pre-wrap' }
              }
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="px-5 py-3 rounded-2xl text-sm" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '18px 18px 18px 4px' }}>
              <span className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}

        {messages.length === 1 && !loading && (
          <div className="flex flex-wrap gap-2 pt-2">
            {STARTERS.map(s => (
              <button key={s} onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50) }}
                className="text-xs px-3 py-2 rounded-full font-semibold transition-opacity hover:opacity-75"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Financial snapshot */}
      <div className="flex-shrink-0 grid grid-cols-3 gap-2 my-3">
        {[
          { label: 'Total Income', val: fmt(financialData.totalIncome) },
          { label: 'This Month', val: fmt(financialData.monthExpenses) },
          { label: 'Savings', val: `${financialData.savingsRate}%` },
        ].map(s => (
          <div key={s.label} className="card px-3 py-2 text-center">
            <p className="text-xs text-muted">{s.label}</p>
            <p className="text-sm font-black text-primary">{s.val}</p>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 flex gap-2">
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask your coach anything…"
          disabled={loading}
          className="input-field resize-none"
          style={{ minHeight: '44px', maxHeight: '120px', lineHeight: '1.5', paddingTop: '10px' }}
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()} className="btn-primary px-4 flex-shrink-0" style={{ alignSelf: 'flex-end', height: '44px' }}>
          <ArrowUp size={18} />
        </button>
      </div>
    </div>
  )
}
