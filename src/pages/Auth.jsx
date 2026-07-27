import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [resending, setResending] = useState(false)

  const switchMode = newMode => {
    setMode(newMode)
    setError('')
    setMessage('')
    setNeedsConfirmation(false)
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    setNeedsConfirmation(false)
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        if (error.message.toLowerCase().includes('confirm')) setNeedsConfirmation(true)
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) setError(error.message)
      else {
        setMessage('Check your email for a confirmation link!')
        setNeedsConfirmation(true)
      }
    }
    setLoading(false)
  }

  const handleResend = async () => {
    setResending(true)
    setError('')
    setMessage('')
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setError(error.message)
    else setMessage('Confirmation email resent — check your inbox.')
    setResending(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(145deg, #1a5a94 0%, #2a7ab8 50%, #3a8acc 100%)' }}>
      <div className="w-full max-w-md page-enter">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Stride" className="w-28 h-28 object-contain mx-auto mb-4" />
          <h1 className="text-4xl font-black text-white tracking-tight">Stride</h1>
          <p className="text-white/65 mt-2 text-sm font-medium">Money, made clear.</p>
        </div>

        <div className="rounded-3xl p-8" style={{ background: 'rgba(255,255,255,0.13)', border: '1px solid rgba(255,255,255,0.22)', backdropFilter: 'blur(16px)', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
          {/* Tabs */}
          <div className="flex rounded-xl p-1 mb-7" style={{ background: 'rgba(0,0,0,0.15)' }}>
            <button
              onClick={() => switchMode('login')}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all"
              style={{ background: mode === 'login' ? 'rgba(255,255,255,0.2)' : 'transparent', color: mode === 'login' ? 'white' : 'rgba(255,255,255,0.55)' }}
            >Sign In</button>
            <button
              onClick={() => switchMode('signup')}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all"
              style={{ background: mode === 'signup' ? 'rgba(255,255,255,0.2)' : 'transparent', color: mode === 'signup' ? 'white' : 'rgba(255,255,255,0.55)' }}
            >Create Account</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="label">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required className="input-field" />
            </div>
            <div className="mb-6">
              <label className="label">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" required minLength={6} className="input-field" />
            </div>

            {error && <div className="mb-4 p-3 rounded-xl text-sm font-medium" style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative)', color: 'var(--negative)' }}>{error}</div>}
            {message && <div className="mb-4 p-3 rounded-xl text-sm font-medium" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white' }}>{message}</div>}

            {needsConfirmation && (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || !email}
                className="mb-4 w-full text-center text-sm font-semibold underline"
                style={{ color: 'rgba(255,255,255,0.85)' }}
              >
                {resending ? 'Resending...' : 'Resend confirmation email'}
              </button>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 text-base">
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
