import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, createContext, useContext, lazy, Suspense } from 'react'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import Auth from './pages/Auth'
import { TransactionProvider } from './hooks/useTransactions'

// Route-level code-splitting: each page ships as its own chunk, loaded on first visit
// instead of all bundling into one ~1.4MB file every visitor downloads up front.
// The loader map is kept separate from lazy() so the idle-prefetch effect below
// can warm every chunk in the background after first paint.
const PAGE_LOADERS = {
  Dashboard:     () => import('./pages/Dashboard'),
  Income:        () => import('./pages/Income'),
  Expenses:      () => import('./pages/Expenses'),
  NetWorth:      () => import('./pages/NetWorth'),
  Accounts:      () => import('./pages/Accounts'),
  Investments:   () => import('./pages/Investments'),
  Analytics:     () => import('./pages/Analytics'),
  Goals:         () => import('./pages/Goals'),
  Loans:         () => import('./pages/Loans'),
  Subscriptions: () => import('./pages/Subscriptions'),
  AICoach:       () => import('./pages/AICoach'),
  Settings:      () => import('./pages/Settings'),
}
const Dashboard         = lazy(PAGE_LOADERS.Dashboard)
const Income            = lazy(PAGE_LOADERS.Income)
const Expenses           = lazy(PAGE_LOADERS.Expenses)
const NetWorth           = lazy(PAGE_LOADERS.NetWorth)
const Accounts           = lazy(PAGE_LOADERS.Accounts)
const Investments        = lazy(PAGE_LOADERS.Investments)
const Analytics          = lazy(PAGE_LOADERS.Analytics)
const Goals              = lazy(PAGE_LOADERS.Goals)
const Loans              = lazy(PAGE_LOADERS.Loans)
const Subscriptions      = lazy(PAGE_LOADERS.Subscriptions)
const AICoach            = lazy(PAGE_LOADERS.AICoach)
const Settings           = lazy(PAGE_LOADERS.Settings)
const Success            = lazy(() => import('./pages/success'))
const Cancel             = lazy(() => import('./pages/cancel'))

export const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

function PageLoader() {
  // Branded splash: logo pulse + shimmer bar (dark-mode logo swaps via the .dark class)
  const dark = document.documentElement.classList.contains('dark')
  return (
    <div className="flex items-center justify-center min-h-screen page-bg">
      <div className="text-center">
        <img src={dark ? '/logo-dark.png' : '/logo.png'} alt="Stride"
          className="w-20 h-20 object-contain mx-auto mb-4 splash-logo" />
        <p className="font-black text-primary text-lg tracking-tight mb-3">Stride</p>
        <div className="skeleton mx-auto" style={{ width: 120, height: 5, borderRadius: 99 }} />
      </div>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/auth" replace />
  return children
}

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dark, setDark] = useState(() => localStorage.getItem('stride-dark') === 'true')

  useEffect(() => {
    if (dark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    localStorage.setItem('stride-dark', dark)
    // iOS paints the home-screen app's status bar (clock/wifi/battery row) from
    // this meta tag, so it has to flip with the in-app toggle or it stays the
    // light-mode blue even when the rest of the app has gone dark.
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', dark ? '#000000' : '#185894')
  }, [dark])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Warm every page chunk once the browser is idle after first paint, so
  // switching pages later is instant instead of showing a loading flash.
  // Doesn't compete with the initial load: waits for idle time (or 2.5s on
  // browsers without requestIdleCallback), and each chunk is small since the
  // heavy libraries (charts, spreadsheet parser) stay in their own bundles.
  useEffect(() => {
    if (!user) return
    const prefetch = () => Object.values(PAGE_LOADERS).forEach(load => { load().catch(() => {}) })
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 5000 })
      return () => window.cancelIdleCallback(id)
    }
    const t = setTimeout(prefetch, 2500)
    return () => clearTimeout(t)
  }, [user])

  return (
    <AuthContext.Provider value={{ user, loading }}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/auth" element={user && !loading ? <Navigate to="/" replace /> : <Auth />} />

            {/* Payment result pages — outside Layout so no nav/sidebar */}
            <Route path="/success" element={<ProtectedRoute><Success /></ProtectedRoute>} />
            <Route path="/cancel" element={<ProtectedRoute><Cancel /></ProtectedRoute>} />

            <Route path="/" element={
              <ProtectedRoute>
                <TransactionProvider userId={user?.id}>
                  <Layout dark={dark} setDark={setDark} />
                </TransactionProvider>
              </ProtectedRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="income" element={<Income />} />
              <Route path="expenses" element={<Expenses />} />
              <Route path="networth" element={<NetWorth />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="investments" element={<Investments />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="goals" element={<Goals />} />
              <Route path="loans" element={<Loans />} />
              <Route path="subscriptions" element={<Subscriptions />} />
              <Route path="coach" element={<AICoach />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}
