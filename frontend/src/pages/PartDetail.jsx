import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCart } from '../cart.jsx'

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
