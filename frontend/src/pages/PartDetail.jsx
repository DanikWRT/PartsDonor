import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCart } from '../cart.jsx'
import { authFetch, readSession } from '../auth.jsx'

const CONDITION_LABEL = {
  working: 'Рабочая',
  for_parts: 'На запчасти',
  untested: 'Не проверена',
  no_guarantee: 'Без гарантии',
}

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('ru-RU') : n)

function Rating({ value, verified }) {
  return (
    <span className="pd-rating" title={`Рейтинг продавца: ${value || '—'}`}>
      {'★'.repeat(Math.round(value || 0))}
      <span>{value != null ? value.toFixed(1) : '—'}</span>
      {verified ? <span className="pd-verified">✓</span> : null}
    </span>
  )
}

export default function PartDetail() {
  const { id } = useParams()
  const { add, has } = useCart()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  const [buyerProfile, setBuyerProfile] = useState(null)
  const [companyVerified, setCompanyVerified] = useState(false)
  const [buying, setBuying] = useState(false)
  const [oneClickMsg, setOneClickMsg] = useState(null)

  useEffect(() => {
    const session = readSession()
    if (session?.token) {
      authFetch('/api/buyer-profile')
        .then((r) => (r.ok ? r.json() : null))
        .then(setBuyerProfile)
        .catch(() => {})
      fetch('/api/companies')
        .then((r) => (r.ok ? r.json() : []))
        .then((cs) => {
          const own = (cs || []).find((c) => c.id === session.company_id)
          setCompanyVerified(Boolean(own?.verified))
        })
        .catch(() => {})
    }
  }, [])

  const oneClickBuy = async () => {
    if (!best || buying) return
    setBuying(true)
    setOneClickMsg(null)
    try {
      const r = await authFetch('/api/deals/one-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: best.id }),
      })
      const resp = await r.json().catch(() => null)
      if (r.ok) {
        setOneClickMsg({
          type: 'ok',
          text: `Сделка создана и оплата инициирована (эскроу). Плательщик: ${resp.billing_payer_name}, ИНН ${resp.billing_inn}, доставка: ${resp.delivery_address}.`,
        })
      } else {
        const suffix = r.status === 401 || r.status === 403 ? ' — нужен вход / верификация' : ''
        setOneClickMsg({
          type: 'err',
          text: (resp?.detail || 'Не удалось оформить') + suffix,
        })
      }
    } catch {
      setOneClickMsg({ type: 'err', text: 'Ошибка соединения с сервером' })
    } finally {
      setBuying(false)
    }
  }

  useEffect(() => {
    setData(null)
    setErr(false)
    fetch(`/api/catalog/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('not found')
        return r.json()
      })
      .then(setData)
      .catch(() => setErr(true))
  }, [id])

  if (err) return (
    <div>
      <h2>Деталь не найдена</h2>
      <p className="pd-muted">Похоже, эта деталь недоступна.</p>
      <Link className="pd-back" to="/">← В каталог</Link>
    </div>
  )

  if (!data) return <p className="pd-hint">Загрузка карточки…</p>

  const best = data.listings && data.listings[0]
  const session = readSession()
  const oneClickReady = Boolean(session?.company_id && buyerProfile && companyVerified)

  return (
    <div className="pd-detail">
      <Link className="pd-back" to="/">← В каталог</Link>

      <div className="pd-detail-head">
        <div className="pd-detail-icon" aria-hidden="true" />
        <div>
          <h2>{data.name}</h2>
          <p className="pd-card-cat">{data.category}</p>
          {data.in_stock
            ? <span className="pd-badge in">В наличии на складе</span>
            : <span className="pd-badge out">Под заказ</span>}
        </div>
      </div>

      <div className="pd-detail-grid">
        {/* Цена и основная инфа */}
        <div className="pd-detail-price-block">
          {data.min_price != null ? (
            <div className="pd-price-big">{fmt(data.min_price)} ₽</div>
          ) : (
            <div className="pd-price-big">Цена по запросу</div>
          )}
          <div className="pd-price-from">от — лучшая цена среди {data.listings?.length || 0} предложений</div>
          {best && best.seller_name && (
            <div className="pd-seller">
              Продавец: <strong>{best.seller_name}</strong>
              <Rating value={best.seller_rating} verified={best.seller_verified} />
            </div>
          )}
          <Link to="/deal" className="pd-cta">Купить со сделкой</Link>
          {oneClickReady ? (
            <button
              type="button"
              className="pd-btn pd-btn-success pd-btn-cart"
              disabled={buying}
              onClick={oneClickBuy}
            >
              {buying ? 'Оформление…' : '⚡ Купить в 1 клик'}
            </button>
          ) : session?.company_id ? (
            <p className="pd-oneclick-hint">
              Купить в 1 клик: заполните{' '}
              <Link to="/buyer">реквизиты плательщика и адрес в кабинете покупателя</Link>
            </p>
          ) : null}
          {oneClickMsg && (
            <p
              className={oneClickMsg.type === 'ok' ? 'pd-form-ok' : 'pd-form-err'}
              role="status"
            >
              {oneClickMsg.text}
              {oneClickMsg.type === 'ok' && (
                <>
                  {' '}
                  <Link to="/deal">Мои сделки →</Link>
                </>
              )}
            </p>
          )}
          {best && best.price_rub != null && (
            <button
              type="button"
              className="pd-btn pd-btn-primary pd-btn-cart"
              disabled={has(best.id)}
              onClick={() =>
                add({
                  listing_id: best.id,
                  title: best.title || data.name,
                  price_rub: best.price_rub,
                  condition: best.condition,
                  seller_name: best.seller_name,
                })
              }
            >
              {has(best.id) ? '✓ В корзине' : 'В корзину'}
            </button>
          )}
        </div>

        {/* Параметры */}
        <div className="pd-detail-props">
          <h3>Параметры</h3>
          <dl>
            <dt>Состояние</dt>
            <dd>{best ? (CONDITION_LABEL[best.condition] || best.condition) : '—'}</dd>
            <dt>Гарантия</dt>
            <dd>{best ? (best.condition === 'no_guarantee' ? 'Нет гарантии' : 'Гарантия продавца') : '—'}</dd>
            <dt>История / происхождение</dt>
            <dd>{best ? (best.provenance || '—') : '—'}</dd>
            <dt>Производитель</dt>
            <dd>Apple (из донора)</dd>
          </dl>
        </div>
      </div>

      {/* Все предложения */}
      {data.listings && data.listings.length > 0 ? (
        <div className="pd-detail-offers">
          <h3>Предложения</h3>
          <ul className="pd-list">
            {data.listings.map((l) => (
              <li key={l.id} className="pd-offer">
                <div className="pd-offer-main">
                  <strong>{l.title}</strong>
                  <span className="pd-offer-price">{fmt(l.price_rub)} ₽</span>
                  <span className="pd-offer-meta">
                    {CONDITION_LABEL[l.condition] || l.condition} · {l.seller_name || 'Продавец'} 
                    {l.seller_rating != null ? ` · ${l.seller_rating.toFixed(1)} ★` : ''}
                  </span>
                </div>
                <Link to="/deal" className="pd-cta sm">Сделка</Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="pd-muted">Сейчас нет активных предложений на эту деталь.</p>
      )}
    </div>
  )
}
