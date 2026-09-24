import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { authFetch } from '../auth.jsx'
import { ExplodedScheme } from '../components/DonorExploded.jsx'

export default function DonorLot() {
  const { id } = useParams()
  const [lot, setLot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dealResult, setDealResult] = useState(null)
  const [requestMsg, setRequestMsg] = useState(null)
  const [requests, setRequests] = useState([])
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [dealLoading, setDealLoading] = useState(false)
  const [requestLoading, setRequestLoading] = useState(false)
  const [hasToken, setHasToken] = useState(false)
  const [sessionRole, setSessionRole] = useState(null)

  useEffect(() => {
    const raw = localStorage.getItem('pd-session')
    try {
      const s = raw ? JSON.parse(raw) : null
      if (s) { setHasToken(!!s.token); setSessionRole(s.role) }
    } catch { /* ignore */ }
    const sync = () => {
      try {
        const r = localStorage.getItem('pd-session')
        const s = r ? JSON.parse(r) : null
        setHasToken(!!s?.token)
        setSessionRole(s?.role || null)
      } catch { setHasToken(false); setSessionRole(null) }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/donor-lots/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => { setLot(d); setError(null) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="pd-hint">Загрузка донора…</p>
  if (error) return <p className="pd-muted">Ошибка: {error}</p>
  if (!lot) return <p className="pd-muted">Донор не найден</p>

  const handleBuy = async () => {
    if (!hasToken) { setDealResult({ kind: 'err', text: 'Необходим вход' }); return }
    setDealLoading(true)
    setDealResult(null)
    try {
      const r = await authFetch(`/api/donor-lots/${id}/deals`, { method: 'POST' })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body.detail || `HTTP ${r.status}`)
      }
      const data = await r.json()
      setDealResult(data)
      // Обновляем статус лота
      setLot((prev) => ({ ...prev, status: 'negotiated' }))
    } catch (e) {
      setDealResult({ kind: 'err', text: e.message })
    } finally {
      setDealLoading(false)
    }
  }

  const handleRequest = async (e) => {
    e.preventDefault()
    if (!amount || !hasToken) { setRequestMsg({ kind: 'err', text: 'Укажите сумму и войдите' }); return }
    setRequestLoading(true)
    setRequestMsg(null)
    try {
      const r = await authFetch(`/api/donor-lots/${id}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_rub: parseFloat(amount), message }),
      })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body.detail || `HTTP ${r.status}`)
      }
      setRequestMsg({ kind: 'ok', text: 'Заявка отправлена' })
      setAmount('')
      setMessage('')
      // Загрузим заявки если продавец
      if (sessionRole === 'seller') loadRequests()
    } catch (e) {
      setRequestMsg({ kind: 'err', text: e.message })
    } finally {
      setRequestLoading(false)
    }
  }

  const loadRequests = async () => {
    try {
      const r = await authFetch(`/api/donor-lots/${id}/requests`)
      if (r.ok) {
        const data = await r.json()
        setRequests(Array.isArray(data) ? data : [])
      }
    } catch { /* ignore */ }
  }

  const isSeller = sessionRole === 'seller' && lot.seller_id

  return (
    <div className="pd-donor-lot-page">
      <Link to={`/donor-lots`} className="pd-back-link">← Назад к донорам</Link>

      <h2>{lot.brand} {lot.model}</h2>

      <div className="pd-donor-lot-head">
        <div className="pd-donor-photo pd-donor-photo-hero">
          <img src={lot.donor_image || '/photos/device-donor.jpg'} alt={`${lot.brand} ${lot.model}`} loading="lazy" />
        </div>
        <div className="pd-donor-lot-info">
          <p className="pd-donor-lot-title">{lot.title}</p>
          <div className="pd-donor-lot-price">
            {lot.price_rub.toLocaleString('ru-RU')} ₽
          </div>
          <div className="pd-donor-lot-meta">
            <span>Состояние: {lot.condition}</span>
            <span>Происхождение: {lot.provenance}</span>
          </div>
          <div className="pd-donor-lot-seller">
            Продавец: {lot.seller_name}
            {lot.seller_rating != null && ` · Рейтинг: ${lot.seller_rating}`}
            {lot.seller_verified && ' ✓ Верифицирован'}
          </div>
        </div>
        <div className="pd-donor-lot-exploded">
          <ExplodedScheme
            components={lot.components || []}
            selectedKey={null}
            onSelect={() => {}}
            onSelectedKey={() => {}}
          />
        </div>
      </div>

      {/* Кнопка покупки */}
      {sessionRole === 'buyer' && lot.status !== 'sold' && (
        <div className="pd-donor-lot-actions">
          <button
            type="button"
            className="pd-btn pd-btn-primary"
            onClick={handleBuy}
            disabled={dealLoading}
          >
            {dealLoading ? 'Обработка…' : 'Купить целиком'}
          </button>
          {dealResult && dealResult.payment && dealResult.payment.confirmation_url && (
            <a href={dealResult.payment.confirmation_url} className="pd-btn pd-btn-sm" target="_blank" rel="noopener">
              Перейти к оплате
            </a>
          )}
          {dealResult && dealResult.deal && (
            <Link to={`/deal/${dealResult.deal.id}`} className="pd-btn pd-btn-sm pd-btn-secondary">
              Смотреть сделку {dealResult.deal.id.slice(0, 8)}
            </Link>
          )}
          {dealResult && dealResult.kind === 'err' && (
            <span className="pd-err">{dealResult.text}</span>
          )}
        </div>
      )}
      {!hasToken && lot.status !== 'sold' && (
        <p className="pd-note">Необходим вход для покупки целиком</p>
      )}

      {/* Форма заявки */}
      {hasToken && (
        <form className="pd-request-form" onSubmit={handleRequest}>
          <h3>Оставить заявку / предложение цены</h3>
          <div className="pd-form-row">
            <input
              type="number"
              className="pd-input"
              placeholder="Сумма ₽"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="1"
              required
            />
            <textarea
              className="pd-textarea"
              placeholder="Комментарий к заявке"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <button type="submit" className="pd-btn pd-btn-sm" disabled={requestLoading}>
            {requestLoading ? 'Отправка…' : 'Отправить заявку'}
          </button>
          {requestMsg && <p className={`pd-notice ${requestMsg.kind === 'ok' ? 'pd-ok' : 'pd-err'}`}>{requestMsg.text}</p>}
        </form>
      )}

      {/* Заявки продавца */}
      {isSeller && (
        <div className="pd-requests-section">
          <h3>Заявки на донор</h3>
          <button type="button" className="pd-btn pd-btn-sm pd-btn-secondary" onClick={loadRequests}>
            Обновить список
          </button>
          {requests.length === 0 ? (
            <p className="pd-muted">Нет заявок.</p>
          ) : (
            <ul className="pd-requests-list">
              {requests.map((req) => (
                <li key={req.id} className="pd-request-item">
                  <span>Покупатель: {req.buyer_name || req.buyer_company_id?.slice(0, 8)}</span>
                  <span>{req.amount_rub} ₽</span>
                  <span className={`pd-status-badge pd-status-${req.status}`}>{req.status}</span>
                  <span className="pd-request-msg">{req.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
