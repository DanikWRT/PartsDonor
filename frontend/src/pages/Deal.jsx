import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { authFetch } from '../auth.jsx'

// ============================ Лейблы (RU) ============================

const DEAL_STATUS_LABEL = {
  created: 'Создана',
  escrow_paid: 'Оплата в эскроу',
  seller_confirmed: 'Продавец подтвердил',
  shipped: 'Отгружена',
  delivered: 'Доставлена',
  buyer_confirmed: 'Получение подтверждено',
  payout: 'Выплата продавцу',
  completed: 'Завершена',
  refunded: 'Возврат',
  dispute: 'Спор',
}

const ESCROW_LABEL = {
  created: 'Создан',
  paid: 'Оплачен',
  in_progress: 'В работе',
  released: 'Выплачен',
  refunded: 'Возвращён',
}

// LIVE-машина (B6): 8 состояний основного пути; refunded/dispute — боковые.
const DEAL_STEPS = [
  'created',
  'escrow_paid',
  'seller_confirmed',
  'shipped',
  'delivered',
  'buyer_confirmed',
  'payout',
  'completed',
]

// Упрощённый escrow-прогресс «оплата → в пути → получено» для карточки.
// Статус маппится на одну из трёх фаз: money(escrow) / ship(в пути) / done(получено).
const ESCROW_PHASE = {
  created: 0,
  escrow_paid: 1,
  seller_confirmed: 1,
  shipped: 2,
  delivered: 2,
  buyer_confirmed: 2,
  payout: 3,
  completed: 3,
}
const PHASE_LABELS = ['Оплата', 'В пути', 'Получено']
// Межа фаз (escrow=1 => этап 1 «frozen»), для сплиттера степпера.

// Действия покупателя (переходы доступных состояний).
const BUYER_ACTIONS = {
  created: [{ to: 'escrow_paid', label: 'Оплатить (эскроу)', kind: 'primary' }],
  delivered: [{ to: 'buyer_confirmed', label: 'Подтвердить получение', kind: 'primary' }],
}
// Действия продавца.
const SELLER_ACTIONS = {
  escrow_paid: [{ to: 'seller_confirmed', label: 'Подтвердить готовность', kind: 'neutral' }],
  seller_confirmed: [{ to: 'shipped', label: 'Отгрузить', kind: 'neutral' }],
  shipped: [{ to: 'delivered', label: 'Отметить доставленным', kind: 'neutral' }],
  buyer_confirmed: [{ to: 'payout', label: 'Выплатить продавцу', kind: 'neutral' }],
  payout: [{ to: 'completed', label: 'Завершить сделку', kind: 'success' }],
}

// Окно подтверждения получения (после delivered), мс. Считается таймером-отсчётом.
const CONFIRM_WINDOW_MS = 3 * 24 * 60 * 60 * 1000 // 3 суток

const fmtMoney = (n) =>
  typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('ru-RU') + ' ₽' : ''

const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// «3 мин назад».
function timeAgo(iso, now) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.floor((now - t) / 1000))
  if (s < 60) return 'только что'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.floor(h / 24)
  return `${d} дн назад`
}

// «3ч 12м 05с» / «14д 3ч» — вниз для отсчёта, вверх для прожитого времени.
function fmtDuration(ms, { countdown = false } = {}) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}д ${h}ч`
  if (h > 0) return `${h}ч ${String(m).padStart(2, '0')}м`
  if (countdown) return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m} мин`
}

// ============================ Мелкие UI-блоки ============================

function Badge({ kind, children }) {
  return <span className={`pd-badge pd-badge-${kind}`}>{children}</span>
}

// Упрощённый escrow-прогресс: 3 фазы (оплата → в пути → получено) с денгами-осью.
function EscrowProgress({ deal }) {
  const phase = ESCROW_PHASE[deal.status] ?? 0
  const cap = Math.min(phase, PHASE_LABELS.length)
  return (
    <div className="pd-escrow-progress" aria-label="Прогресс escrow">
      {PHASE_LABELS.map((label, i) => {
        const active = i < cap
        const done = i < cap - 1
        return (
          <div
            key={label}
            className={
              'pd-escrow-phase' +
              (active ? ' active' : '') +
              (done ? ' done' : '')
            }
          >
            <span className="pd-escrow-dot" aria-hidden="true">{done ? '✓' : i + 1}</span>
            <span className="pd-escrow-label">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

// Полный степпер по LIVE-машине (8 состояний).
function DealTracker({ deal }) {
  if (deal.status === 'refunded' || deal.status === 'dispute') {
    return <p className="pd-track-plain">{DEAL_STATUS_LABEL[deal.status]}</p>
  }
  const idx = DEAL_STEPS.indexOf(deal.status)
  return (
    <ol className="pd-track">
      {DEAL_STEPS.map((s, i) => (
        <li
          key={s}
          className={
            'pd-track-step' +
            (i < idx ? ' done' : '') +
            (i === idx ? ' current' : '')
          }
        >
          <span className="pd-track-dot" aria-hidden="true">{i < idx ? '✓' : i + 1}</span>
          <span className="pd-track-label">{DEAL_STATUS_LABEL[s]}</span>
        </li>
      ))}
    </ol>
  )
}

// Таймеры: сколько в текущем статусе, сколько прошло с создания, отсчёт подтверждения.
function DealTimers({ deal, now }) {
  const lastAt = deal.transitions?.length
    ? deal.transitions[deal.transitions.length - 1].at
    : deal.created_at
  const createdMs = deal.created_at ? new Date(deal.created_at).getTime() : NaN
  const curMs = lastAt ? new Date(lastAt).getTime() : NaN
  const deliveredAt = deal.transitions
    ?.find((t) => t.to === 'delivered')?.at
  const confirmDeadline = deliveredAt ? new Date(deliveredAt).getTime() + CONFIRM_WINDOW_MS : NaN
  const confirmLeft = Number.isFinite(confirmDeadline) ? confirmDeadline - now : NaN

  const inCurrent = Number.isFinite(curMs) ? now - curMs : NaN
  const sinceCreated = Number.isFinite(createdMs) ? now - createdMs : NaN
  const awaiting = deal.status === 'delivered' && confirmLeft > 0

  return (
    <div className="pd-timers">
      <div className="pd-timer">
        <span className="pd-timer-label">В текущем статусе</span>
        <b>{Number.isFinite(inCurrent) ? fmtDuration(inCurrent) : '—'}</b>
      </div>
      <div className="pd-timer">
        <span className="pd-timer-label">Создана</span>
        <b>{Number.isFinite(sinceCreated) ? timeAgo(deal.created_at, now) : '—'}</b>
      </div>
      {awaiting ? (
        <div className="pd-timer pd-timer-alert">
          <span className="pd-timer-label">Подтвердить до</span>
          <b className="pd-timer-countdown">{fmtDuration(confirmLeft, { countdown: true })}</b>
        </div>
      ) : null}
    </div>
  )
}

// ============================ F6: Отзывы о продавце ============================

const fmtReviewDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

function Stars({ value, onChange, size }) {
  return (
    <span
      className={onChange ? 'pd-stars pd-stars-input' : 'pd-stars'}
      role={onChange ? 'radiogroup' : 'img'}
      aria-label={onChange ? 'Оценка от 1 до 5 звёзд' : `Рейтинг: ${value} из 5`}
    >
      {[1, 2, 3, 4, 5].map((i) =>
        onChange ? (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} ${i === 1 ? 'звезда' : 'звёзд'}`}
            className={'pd-star' + (i <= value ? ' on' : '')}
            style={size ? { fontSize: size } : undefined}
            onClick={() => onChange(i)}
          >
            ★
          </button>
        ) : (
          <span key={i} className={'pd-star' + (i <= Math.round(value) ? ' on' : '')} aria-hidden="true">
            ★
          </span>
        ),
      )}
    </span>
  )
}

function SellerReviews({ sellerId, sellerName }) {
  const [rating, setRating] = useState(null)
  const [reviews, setReviews] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [formRating, setFormRating] = useState(0)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [hasToken, setHasToken] = useState(false)

  const refresh = useCallback(() => {
    if (!sellerId) return
    Promise.all([
      fetch(`/api/companies/${sellerId}/rating`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/reviews?seller_id=${sellerId}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([rt, rv]) => {
        setRating(rt)
        setReviews(rv || [])
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [sellerId])

  useEffect(() => {
    setLoaded(false)
    setResult(null)
    refresh()
  }, [refresh])

  useEffect(() => {
    const sync = () => setHasToken(!!localStorage.getItem('pd-token'))
    sync()
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  if (!sellerId) return null

  const avg = rating?.avg_rating ?? 0
  const count = rating?.review_count ?? 0

  const submit = async (e) => {
    e.preventDefault()
    const token = localStorage.getItem('pd-token')
    if (!token) {
      setResult({ type: 'err', text: 'Нужен вход: войдите в аккаунт, чтобы оставить отзыв.' })
      return
    }
    if (!formRating) {
      setResult({ type: 'err', text: 'Выберите оценку от 1 до 5 звёзд.' })
      return
    }
    setSending(true)
    setResult(null)
    try {
      const r = await authFetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: formRating, comment, seller_id: sellerId }),
      })
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        setResult({
          type: 'err',
          text: (data?.detail || 'Не удалось отправить отзыв') +
            (r.status === 401 || r.status === 403 ? ' — нужен вход' : ''),
        })
        return
      }
      setResult({ type: 'ok', text: 'Спасибо! Отзыв опубликован.' })
      setFormRating(0)
      setComment('')
      refresh()
    } catch {
      setResult({ type: 'err', text: 'Ошибка соединения с сервером' })
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="pd-reviews" aria-label="Отзывы о продавце">
      <h3>Отзывы о продавце{sellerName ? `: ${sellerName}` : ''}</h3>
      <div className="pd-reviews-head">
        <Stars value={avg} />
        <span className="pd-reviews-avg">
          {count > 0 ? `${avg.toFixed(2)} из 5` : 'нет отзывов'}
        </span>
        <span className="pd-reviews-count">
          {count > 0 ? `${count} ${count === 1 ? 'отзыв' : 'отзывов'}` : ''}
        </span>
      </div>

      {loaded && count > 0 && (
        <ul className="pd-reviews-list">
          {reviews.map((rv) => (
            <li key={rv.id} className="pd-review">
              <div className="pd-review-head">
                <Stars value={rv.rating} />
                <span className="pd-review-date">{fmtReviewDate(rv.created_at)}</span>
              </div>
              {rv.comment && <p className="pd-review-comment">{rv.comment}</p>}
            </li>
          ))}
        </ul>
      )}
      {loaded && count === 0 && <p className="pd-muted">Отзывов пока нет — будьте первым!</p>}

      <form className="pd-review-form" onSubmit={submit}>
        <h4>Оставить отзыв</h4>
        {!hasToken && <p className="pd-hint pd-hint-login">Нужен вход — войдите, чтобы оставить отзыв.</p>}
        <Stars value={formRating} onChange={setFormRating} />
        <textarea
          className="pd-review-textarea"
          placeholder="Ваш комментарий (необязательно)"
          value={comment}
          rows={3}
          onChange={(e) => setComment(e.target.value)}
        />
        <button type="submit" className="pd-btn pd-btn-primary" disabled={sending || !formRating}>
          {sending ? 'Отправляем…' : 'Оставить отзыв'}
        </button>
        {result && (
          <p className={result.type === 'ok' ? 'pd-form-ok' : 'pd-form-err'} role="status">
            {result.text}
          </p>
        )}
      </form>
    </section>
  )
}

// ============================ Карточка одной сделки (для списка) ============================

function DealRow({ deal, listing, buyer, seller, now, onAdvance }) {
  const listingName = listing?.title || listing?.part_name || 'Объявление'
  const actions = [...(BUYER_ACTIONS[deal.status] || []), ...(SELLER_ACTIONS[deal.status] || [])]
  return (
    <div className="pd-deal-row pd-order">
      <div className="pd-deal-row-main">
        <strong>
          <Link to={`/deal/${deal.id}`} className="pd-deal-link">
            Сделка № {deal.id.slice(0, 8)} — {listingName}
          </Link>
        </strong>
        <span className="pd-deal-row-meta">
          {fmtMoney(deal.amount_rub)}
          {buyer ? ` · покупатель: ${buyer.name}` : ''}
          {seller ? ` · продавец: ${seller.name}` : ''}
          {deal.shipping_address ? ` · доставка: ${deal.shipping_address}` : ''}
          {deal.created_at ? ` · ${fmtDate(deal.created_at)}` : ''}
        </span>
      </div>
      <div className="pd-deal-row-badges">
        <Badge kind={`status-${deal.status}`}>{DEAL_STATUS_LABEL[deal.status] || deal.status}</Badge>
        <Badge kind={`escrow-${deal.escrow_status}`}>
          эскроу: {ESCROW_LABEL[deal.escrow_status] || deal.escrow_status}
        </Badge>
      </div>
      <DealTracker deal={deal} />
      <div className="pd-deal-row-foot">
        <DealTimers deal={deal} now={now} />
        {actions.length > 0 && (
          <div className="pd-order-actions">
            {actions.map((a) => (
              <button
                key={a.to}
                type="button"
                className={`pd-btn pd-btn-sm pd-btn-${a.kind || 'neutral'}`}
                onClick={() => onAdvance(deal, a.to)}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================ ЭКРАН СДЕЛКИ ============================

export default function Deal() {
  const { id } = useParams()
  const [deals, setDeals] = useState([])
  const [listings, setListings] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [msg, setMsg] = useState(null)
  const [advancing, setAdvancing] = useState(null)
  const [now, setNow] = useState(Date.now())

  // Таймер перерисовки — оживляет счётчики времени (раз в секунду).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const load = () => {
    Promise.all([
      fetch('/api/deals').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/listings').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/companies').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([d, l, c]) => {
        setDeals(d)
        setListings(l)
        setCompanies(c)
        if (id && !d.some((x) => x.id === id)) setNotFound(true)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  const byId = (list) => {
    const m = {}
    ;(list || []).forEach((x) => { m[x.id] = x })
    return m
  }
  const listingById = useMemo(() => byId(listings), [listings])
  const companyById = useMemo(() => byId(companies), [companies])

  const deal = useMemo(
    () => (id ? deals.find((d) => d.id === id) || null : null),
    [deals, id],
  )
  const listing = deal ? listingById[deal.listing_id] : null
  const buyer = deal ? companyById[deal.buyer_company_id] : null
  const seller = deal ? companyById[deal.seller_company_id] : null

  const advanceDeal = async (d, to) => {
    setAdvancing(d.id)
    setMsg(null)
    try {
      const r = await authFetch(`/api/deals/${d.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, from_status: d.status }),
      })
      const data = await r.json()
      if (!r.ok) {
        setMsg({
          type: 'err',
          text: (data?.detail || 'Не удалось обновить сделку') +
            (r.status === 401 || r.status === 403 ? ' — нужен вход' : ''),
        })
        return
      }
      if (data?.deal) {
        setDeals((prev) => prev.map((x) => (x.id === d.id ? data.deal : x)))
        setMsg({ type: 'ok', text: `Сделка обновлена: ${DEAL_STATUS_LABEL[data.to_status] || data.to_status}` })
      } else {
        load()
      }
    } catch {
      setMsg({ type: 'err', text: 'Ошибка соединения с сервером' })
    } finally {
      setAdvancing(null)
    }
  }

  const payDeal = async (d) => {
    setAdvancing(d.id)
    setMsg(null)
    try {
      const r = await authFetch(`/api/deals/${d.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const data = await r.json()
      if (!r.ok) {
        setMsg({
          type: 'err',
          text: (data?.detail || 'Платёж не создан') +
            (r.status === 401 || r.status === 403 ? ' — нужен вход' : ''),
        })
        return
      }
      // Создан платёж в ЮKassa (или синтетический в тестовом режиме).
      setMsg({
        type: 'ok',
        text: 'Платёж создан' + (data?.url ? ` — ${data.url}` : '') + '. После успешной оплаты сделка перейдёт в «эскроу оплачено».',
      })
    } catch {
      setMsg({ type: 'err', text: 'Ошибка соединения с сервером' })
    } finally {
      setAdvancing(null)
    }
  }

  if (loading) return <p className="pd-hint">Загрузка сделки…</p>
  if (deal === null && id) {
    return (
      <div className="pd-deal">
        <h2>Сделка не найдена</h2>
        <p className="pd-muted">Такой сделки нет или она не видна вам.</p>
        <Link to="/deal" className="pd-btn pd-btn-sm">← Все сделки</Link>
      </div>
    )
  }

  // ---------- Список сделок (без id) ----------
  if (deal === null) {
    const sorted = [...deals].sort((a, b) =>
      (b.created_at || '').localeCompare(a.created_at || ''),
    )
    return (
      <div className="pd-deal">
        <h2>Сделки и escrow</h2>
        {sorted.length === 0 ? (
          <p className="pd-muted">Сделок пока нет. Оформите заказ из корзины в кабинете покупателя.</p>
        ) : (
          <div className="pd-deals">
            {sorted.map((d) => (
              <DealRow
                key={d.id}
                deal={d}
                listing={listingById[d.listing_id]}
                buyer={companyById[d.buyer_company_id]}
                seller={companyById[d.seller_company_id]}
                now={now}
                onAdvance={advanceDeal}
              />
            ))}
          </div>
        )}
        {msg && (
          <p className={msg.type === 'ok' ? 'pd-form-ok' : 'pd-form-err'} role="status">{msg.text}</p>
        )}
      </div>
    )
  }

  // ---------- Полный экран одной сделки ----------
  const listingName = listing?.title || listing?.part_name || 'Объявление'
  const actions = [...(BUYER_ACTIONS[deal.status] || []), ...(SELLER_ACTIONS[deal.status] || [])]
  const canPay = deal.status === 'created' && (BUYER_ACTIONS[deal.status] || []).some((a) => a.to === 'escrow_paid')

  return (
    <div className="pd-deal pd-deal-screen">
      <div className="pd-deal-top">
        <h2>Сделка № {deal.id.slice(0, 8)}</h2>
        <div className="pd-deal-badges">
          <Badge kind={`status-${deal.status}`}>{DEAL_STATUS_LABEL[deal.status] || deal.status}</Badge>
          <Badge kind={`escrow-${deal.escrow_status}`}>
            эскроу: {ESCROW_LABEL[deal.escrow_status] || deal.escrow_status}
          </Badge>
        </div>
      </div>

      {/* 1. Чекаут (сумма, товар, стороны, доставка) */}
      <section className="pd-checkout-card" aria-label="Чекаут">
        <h3>Чекаут</h3>
        <dl className="pd-checkout-grid">
          <div><dt>Товар</dt><dd>{listingName}</dd></div>
          <div><dt>Сумма</dt><dd className="pd-amount">{fmtMoney(deal.amount_rub)}</dd></div>
          <div><dt>Покупатель</dt><dd>{buyer ? buyer.name : '—'}</dd></div>
          <div><dt>Продавец</dt><dd>{seller ? seller.name : '—'}</dd></div>
          <div><dt>Доставка</dt><dd>{deal.shipping_address || '—'}</dd></div>
          <div><dt>Способ оплаты</dt><dd>Эскроу (ЮKassa, «Безопасная сделка»)</dd></div>
        </dl>
        {canPay && (
          <button
            type="button"
            className="pd-btn pd-btn-primary"
            disabled={advancing === deal.id}
            onClick={() => payDeal(deal)}
          >
            {advancing === deal.id ? '…' : `Оплатить ${fmtMoney(deal.amount_rub)} в эскроу`}
          </button>
        )}
      </section>

      {/* 2. Эскроу-машина: 3 фазы + полный степпер */}
      <section aria-label="Статус escrow">
        <h3>Статусная машина escrow</h3>
        <EscrowProgress deal={deal} />
        <DealTracker deal={deal} />
      </section>

      {/* 3. Таймеры */}
      <section aria-label="Таймеры">
        <h3>Время</h3>
        <DealTimers deal={deal} now={now} />
      </section>

      {/* 4. Действия */}
      {actions.length > 0 && (
        <section aria-label="Действия">
          <h3>Действия</h3>
          <div className="pd-order-actions">
            {actions.map((a) => (
              <button
                key={a.to}
                type="button"
                className={`pd-btn pd-btn-${a.kind || 'neutral'}`}
                disabled={advancing === deal.id}
                onClick={() => advanceDeal(deal, a.to)}
              >
                {advancing === deal.id ? '…' : a.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 5. История переходов */}
      <section aria-label="История">
        <h3>История сделки</h3>
        {!deal.transitions?.length ? (
          <p className="pd-muted">Переходов пока не было.</p>
        ) : (
          <ol className="pd-history">
            {deal.transitions.map((t, i) => (
              <li key={i} className="pd-history-item">
                <span className="pd-history-from">{DEAL_STATUS_LABEL[t.from] || t.from}</span>
                →
                <span className="pd-history-to">{DEAL_STATUS_LABEL[t.to] || t.to}</span>
                <span className="pd-history-at">{fmtDate(t.at)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 6. F6: Отзывы о продавце */}
      {deal.seller_company_id && (
        <SellerReviews sellerId={deal.seller_company_id} sellerName={seller?.name} />
      )}

      {msg && (
        <p className={msg.type === 'ok' ? 'pd-form-ok' : 'pd-form-err'} role="status">{msg.text}</p>
      )}
      <Link to="/deal" className="pd-btn pd-btn-sm">← Все сделки</Link>
    </div>
  )
}
