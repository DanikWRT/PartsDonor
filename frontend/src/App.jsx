import React from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import DonorView from './pages/DonorView.jsx'
import DonorLots from './pages/DonorLots.jsx'
import DonorLot from './pages/DonorLot.jsx'
import Catalog from './pages/Catalog.jsx'
import Cabinet from './pages/Cabinet.jsx'
import Deal from './pages/Deal.jsx'
import PartDetail from './pages/PartDetail.jsx'
import BuyerCabinet from './pages/BuyerCabinet.jsx'
import Chats from './pages/Chats.jsx'
import ChatView from './pages/ChatView.jsx'
import Storefront from './pages/Storefront.jsx'
import { CartProvider, useCart } from './cart.jsx'
import AuthPage from './pages/Auth.jsx'
import { readSession, clearSession, ROLE_LABELS } from './auth.jsx'

function HeaderNav() {
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
        <NavLink to="/cabinet">Кабинет</NavLink>
        <NavLink to="/buyer">Покупателю</NavLink>
        <NavLink to="/deal">Сделка</NavLink>
        <NavLink to="/chats">Сообщения</NavLink>
        <NavLink to="/storefront">Витрина</NavLink>
        <NavLink to="/buyer" className="pd-cart-link">Корзина ({count})</NavLink>
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

export default function App() {
  return (
    <CartProvider>
      <div className="pd-app">
      <HeaderNav />
      <main className="pd-main">
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
          <Route path="/storefront" element={<Storefront />} />
          <Route path="/storefront/:slug" element={<Storefront />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
        </Routes>
      </main>
      </div>
    </CartProvider>
  )
}
