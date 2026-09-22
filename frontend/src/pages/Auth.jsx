import React, { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { storeSession } from '../auth.jsx'

export default function AuthPage({ mode = 'login' }) {
  const isRegister = mode === 'register'
  const navigate = useNavigate()
  const location = useLocation()
  const registered = !!(location.state && location.state.registered)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('buyer')
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (isRegister) {
        const body = { email, password, role }
        if (role === 'seller' && companyName.trim()) body.company_name = companyName.trim()
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.status === 201) {
          navigate('/login', { state: { registered: true } })
          return
        }
        let detail = 'Ошибка регистрации'
        try {
          const j = await res.json()
          if (typeof j.detail === 'string') detail = j.detail
          else if (Array.isArray(j.detail)) detail = j.detail.map(d => d.msg).join(', ')
        } catch { /* keep default */ }
        setError(detail)
      } else {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        const data = await res.json().catch(() => null)
        if (res.ok && data && data.access_token) {
          storeSession({ ...data, email })
          navigate(data.role === 'seller' ? '/cabinet' : data.role === 'buyer' ? '/buyer' : '/')
          return
        }
        setError((data && data.detail) || 'Неверный email или пароль')
      }
    } catch {
      setError('Сеть недоступна, попробуйте позже')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pd-f8-wrap">
      <div className="pd-f8-card">
        <div className="pd-f8-tabs" role="tablist">
          <NavLink to="/login" end className={({ isActive }) => 'pd-f8-tab' + (isActive ? ' active' : '')}>Вход</NavLink>
          <NavLink to="/register" className={({ isActive }) => 'pd-f8-tab' + (isActive ? ' active' : '')}>Регистрация</NavLink>
        </div>

        {registered && !isRegister && (
          <div className="pd-f8-banner pd-f8-banner-ok">Регистрация прошла успешно — войдите</div>
        )}
        {error && <div className="pd-f8-banner pd-f8-banner-err">{error}</div>}

        <form className="pd-f8-form" onSubmit={submit}>
          {isRegister && (
            <div className="pd-f8-roles" role="tablist">
              <button type="button" className={'pd-f8-role' + (role === 'buyer' ? ' active' : '')} onClick={() => setRole('buyer')}>Покупатель</button>
              <button type="button" className={'pd-f8-role' + (role === 'seller' ? ' active' : '')} onClick={() => setRole('seller')}>Продавец (мастерская)</button>
            </div>
          )}
          {isRegister && role === 'seller' && (
            <label className="pd-f8-field">
              <span>Название мастерской (необязательно)</span>
              <input className="pd-input" type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="АвтоДеталь" />
            </label>
          )}
          <label className="pd-f8-field">
            <span>Email</span>
            <input className="pd-input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="user@gmail.com" autoComplete="email" />
          </label>
          <label className="pd-f8-field">
            <span>Пароль</span>
            <input className="pd-input" type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Минимум 6 символов" autoComplete={isRegister ? 'new-password' : 'current-password'} />
          </label>
          <button className="pd-btn-primary pd-f8-submit" type="submit" disabled={busy}>
            {busy ? 'Отправка…' : isRegister ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
