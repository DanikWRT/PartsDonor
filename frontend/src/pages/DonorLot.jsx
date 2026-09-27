import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { authFetch } from '../auth.jsx'
import { normalizeSlot } from '../components/DonorExploded.jsx'
import BlueprintExploded from '../components/BlueprintExploded.jsx'

// Экран развёртки донор-лота /donor-lot/:id — 3-колоночный blueprint
// (эталон ref-iphone16-blueprint-exploded.html). Данные: /api/donor-lots/:id,
// компоненты уже приходят из InvenTree (5 шт).
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
    const sync = () => {
      try {
        const r = localStorage.getItem('pd-session')
        const s = r ? JSON.parse(r) : null
        setHasToken(!!s?.token)
        setSessionRole(s?.role || null)
      } catch { setHasToken(false); setSessionRole(null) }
    }
    sync()
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

  const isSeller = sessionRole === 'seller' && lot.seller_id && false // (предложения по заявкам — в профиле продавца)

  // Нормализуем слоты в короткие ключи (для чертежа/карточек).
  const components = (lot.components || []).map((c) => {
    const slotKey = normalizeSlot(c.slot) || normalizeSlot(c.title) || 'other'
    return { ...c, slot: slotKey, slotKey, seller_name: null }
  })

  return (
    <BlueprintExploded
      components={components}
      meta={{
        brand: lot.brand,
        model: lot.model,
        revision: (String(lot.donor_part_id ?? '') || 'A2897'),
        donorPartId: lot.donor_part_id,
        explodedUrl: lot.exploded_url,
      }}
      back={<Link to="/donor-lots" className="ex-back">← Назад к донорам</Link>}
      detailExtra={(comp) => (
        <LotActions
          lot={lot}
          comp={comp}
          sessionRole={sessionRole}
          hasToken={hasToken}
          dealLoading={dealLoading}
          requestLoading={requestLoading}
          amount={amount}
          setAmount={setAmount}
          message={message}
          setMessage={setMessage}
          handleBuy={handleBuy}
          handleRequest={handleRequest}
          dealResult={dealResult}
          requestMsg={requestMsg}
        />
      )}
    />
  )
}

function LotActions({ lot, comp, sessionRole, hasToken, dealLoading, requestLoading, amount, setAmount, message, setMessage, handleBuy, handleRequest, dealResult, requestMsg }) {
  const unavailable = lot.status === 'sold'
  return (
    <div className="ex-lot-actions">
      {sessionRole === 'buyer' && !unavailable && (
        <button
          type="button"
          className="ex-btn ex-btn-primary"
          onClick={handleBuy}
          disabled={dealLoading}
        >
          {dealLoading ? 'Обработка…' : 'Купить целиком'}
        </button>
      )}
      {!hasToken && !unavailable && (
        <p className="pd-muted">Необходим вход для покупки целиком</p>
      )}
      {dealResult && dealResult.payment && dealResult.payment.confirmation_url && (
        <a href={dealResult.payment.confirmation_url} className="ex-btn" target="_blank" rel="noopener noreferrer">Перейти к оплате</a>
      )}
      {dealResult && dealResult.deal && (
        <Link to={`/deal/${dealResult.deal.id}`} className="ex-btn">Смотреть сделку {dealResult.deal.id.slice(0, 8)}</Link>
      )}
      {dealResult && dealResult.kind === 'err' && <p className="ex-err">{dealResult.text}</p>}

      {hasToken && (
        <form className="ex-request-form" onSubmit={handleRequest}>
          <h4>Заявка / предложение цены</h4>
          <div className="ex-form-row">
            <input type="number" className="ex-input" placeholder="Сумма ₽" value={amount} onChange={(e) => setAmount(e.target.value)} min="1" required />
            <input type="text" className="ex-input" placeholder="Комментарий" value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <button type="submit" className="ex-btn" disabled={requestLoading}>
            {requestLoading ? 'Отправка…' : 'Отправить заявку'}
          </button>
          {requestMsg && <p className={`ex-notice ${requestMsg.kind === 'ok' ? 'ex-ok' : 'ex-err'}`}>{requestMsg.text}</p>}
        </form>
      )}
    </div>
  )
}
