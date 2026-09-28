import React from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { CartProvider, useCart } from './cart.jsx'
import CartDrawer from './components/CartDrawer.jsx'
import { readSession, clearSession, ROLE_LABELS } from './auth.jsx'


// --- PERF-3: code-splitting роутов через React.lazy ---
const DonorView = React.lazy(() => import('./pages/DonorView.jsx'))
const DonorLots = React.lazy(() => import('./pages/DonorLots.jsx'))
const DonorLot = React.lazy(() => import('./pages/DonorLot.jsx'))
const Catalog = React.lazy(() => import('./pages/Catalog.jsx'))
const Cabinet = React.lazy(() => import('./pages/Cabinet.jsx'))
const Deal = React.lazy(() => import('./pages/Deal.jsx'))
const PartDetail = React.lazy(() => import('./pages/PartDetail.jsx'))
const BuyerCabinet = React.lazy(() => import('./pages/BuyerCabinet.jsx'))
const Chats = React.lazy(() => import('./pages/Chats.jsx'))
const ChatView = React.lazy(() => import('./pages/ChatView.jsx'))
const Kb = React.lazy(() => import('./pages/Kb.jsx'))
const Storefront = React.lazy(() => import('./pages/Storefront.jsx'))
const DonorWizard = React.lazy(() => import('./pages/DonorWizard.jsx'))
const Master = React.lazy(() => import('./pages/Master.jsx'))
const BlueprintEditor = React.lazy(() => import('./pages/BlueprintEditor.jsx'))
const AuthPage = React.lazy(() => import('./pages/Auth.jsx'))

function RouteFallback() {
  return <div className="scr-loading pd-route-loading">Загрузка…</div>
}

function HeaderNav({ onCartOpen }) {
  const { count } = useCart()
  const navigate = useNavigate()
  const [session, setSessionState] = React.useState(readSession())
  React.useEffect(() => {
    const onStorage = () => setSessionState(readSession())
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onStorage)
    window.addEventListener('pd-session-changed', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onStorage)
      window.removeEventListener('pd-session-changed', onStorage)
    }
  }, [])
  function logout() {
    clearSession()
    setSessionState(null)
    navigate('/')
  }
  return (
    <header className="pd-header">
      <NavLink to="/" className="pd-logo">⚙️ PartsDonor</NavLink>
      <nav className="pd-nav">
        <NavLink to="/" end>Каталог</NavLink>
        <NavLink to="/donor-lots">Доноры</NavLink>
        <NavLink to="/kb">База знаний</NavLink>
        <NavLink to="/cabinet">Кабинет</NavLink>
        <NavLink to="/buyer">Покупателю</NavLink>
        <NavLink to="/deal">Сделка</NavLink>
        <NavLink to="/chats">Сообщения</NavLink>
        <NavLink to="/storefront">Витрина</NavLink>
        <NavLink to="/masters">Мастера</NavLink>
        <NavLink to="/editor">Конструктор</NavLink>
        <NavLink to="/donor/new">Добавить донора</NavLink>
        <button type="button" className="cart-btn" onClick={onCartOpen} aria-label="Корзина">🛒 {count}</button>
        {session ? (
          <span className="pd-f8-auth">
            <span className="pd-f8-auth-user">{ROLE_LABELS[session.role] || session.role}: {session.email}</span>
            <button type="button" className="pd-f8-logout" onClick={logout}>Выйти</button>
          </span>
        ) : (
          <NavLink to="/login" className="pd-f8-login-link">Войти</NavLink>
        )}
      </nav>
    </header>
  )
}

function AppInner() {
  const { pathname } = useLocation()
  const [cartOpen, setCartOpen] = React.useState(false)
  const isShowcase = pathname === '/'
  const isMaster = pathname === '/masters' || pathname.startsWith('/master/') || pathname.startsWith('/storefront/')
  const isStorefront = pathname.startsWith('/storefront/')
  const isWizard = pathname.startsWith('/donor/new')
  const isChat = pathname === '/chats' || pathname.startsWith('/chat/')
  const isKb = pathname === '/kb' || pathname.startsWith('/kb/')
  const isEditor = pathname === '/editor' || pathname.startsWith('/editor/')
  return (
    <div className={`pd-app${isShowcase ? ' pd-app-showcase' : ''}${isStorefront ? ' pd-app-storefront' : ''}${isWizard ? ' pd-app-wizard' : ''}${isChat ? ' pd-app-chat' : ''}${isKb ? ' pd-app-kb' : ''}${isEditor ? ' pd-app-editor' : ''}`}>
      <HeaderNav onCartOpen={() => setCartOpen(true)} />
      <main className="pd-main">
        <React.Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Catalog />} />
          <Route path="/donor-lots" element={<DonorLots />} />
          <Route path="/donor-lot/:id" element={<DonorLot />} />
          <Route path="/part/:id" element={<PartDetail />} />
          <Route path="/donor/:brand/:model" element={<DonorView />} />
          <Route path="/cabinet" element={<Cabinet />} />
          <Route path="/buyer" element={<BuyerCabinet />} />
          <Route path="/deal" element={<Deal />} />
          <Route path="/deal/:id" element={<Deal />} />
          <Route path="/chats" element={<Chats />} />
          <Route path="/chat/:id" element={<ChatView />} />
          <Route path="/kb" element={<Kb />} />
          <Route path="/kb/:id" element={<Kb />} />
          <Route path="/storefront" element={<Storefront />} />
          <Route path="/storefront/:slug" element={<Storefront />} />
          <Route path="/masters" element={<Master />} />
          <Route path="/master/:companyId" element={<Master />} />
          <Route path="/donor/new" element={<DonorWizard />} />
          <Route path="/editor" element={<BlueprintEditor />} />
          <Route path="/editor/:brand/:model" element={<BlueprintEditor />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
        </Routes>
        </React.Suspense>
      </main>
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  )
}

export default function App() {
  return (
    <CartProvider>
      <AppInner />
    </CartProvider>
  )
}
