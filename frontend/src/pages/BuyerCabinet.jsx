import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../cart.jsx'
import { authFetch, readSession } from '../auth.jsx'

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

// LIVE-машина: степпер по 8 состояниям; refunded/dispute — бейджем вне степпера.
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

// Действия покупателя (POST /deals/{id}/transition):
// created → Оплатить (эскроу); delivered → Подтвердить получение.
const BUYER_ACTIONS = {
  created: [{ to: 'escrow_paid', label: 'Оплатить (эскроу)' }],
  delivered: [{ to: 'buyer_confirmed', label: 'Подтвердить получение' }],
}

const fmtMoney = (n) =>
  typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('ru-RU') + ' ₽' : ''

const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ru-RU')
}

// ============================ Мелкие UI-блоки ============================

function Badge({ kind, children }) {
  return <span className={`pd-badge pd-badge-${kind}`}>{children}</span>
}

// Степпер отслеживания сделки по LIVE-машине из 8 состояний.
// refunded/dispute — вне степпера, показываем только бейджем.
function DealTracker({ deal }) {
  if (deal.status === 'refunded' || deal.status === 'dispute') {
    return (
      <p className={`pd-track-plain ${deal.status === 'refunded' ? 'pd-track-refunded' : ''}`}>
        {DEAL_STATUS_LABEL[deal.status]}
      </p>
    )
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

// ============================ Страница кабинета покупателя ============================

export default function BuyerCabinet() {
  const cart = useCart()
  const [deals, setDeals] = useState([])
  const [listings, setListings] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)

  const [address, setAddress] = useState('Москва, ул. Примерная, 1')
  const [msg, setMsg] = useState(null) // {type:'ok'|'err', text}
  const [submitting, setSubmitting] = useState(false)
  const [advancing, setAdvancing] = useState(null) // id сделки в обработке

  // --- Покупка в 1 клик (реквизиты) ---
  const [billingPayerName, setBillingPayerName] = useState('')
  const [billingInn, setBillingInn] = useState('')
  const [defaultAddress, setDefaultAddress] = useState('')
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)

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
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    authFetch('/api/buyer-profile')
      .then(async (r) => {
        if (r.ok) {
          const p = await r.json()
          setBillingPayerName(p.billing_payer_name || '')
          setBillingInn(p.billing_inn || '')
          setDefaultAddress(p.default_address || '')
        }
      })
      .catch(() => {})
      .finally(() => setProfileLoaded(true))
  }

  useEffect(() => { load() }, [])

  // Приоритет — компания залогиненного покупателя из сессии; legacy-fallback —
  // первая buyer-компания из списка (для старых сессий без company_id).
  const buyer = useMemo(() => {
    const sessionId = readSession()?.company_id
    if (sessionId) {
      const own = companies.find((c) => c.id === sessionId)
      if (own) return own
    }
    return companies.find((c) => c.role === 'buyer') || null
  }, [companies])
  const listingById = useMemo(() => {
    const m = {}
    listings.forEach((l) => { m[l.id] = l })
    return m
  }, [listings])

  // ---------- Сводка ----------
  const myOrders = useMemo(
    () =>
      deals
        .filter((d) => buyer && d.buyer_company_id === buyer.id)
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [deals, buyer],
  )
  const inProgress = useMemo(
    () =>
      myOrders.filter(
        (d) => d.status !== 'completed' && d.status !== 'refunded' && d.status !== 'dispute',
      ).length,
    [myOrders],
  )
  const spent = useMemo(
    () =>
      myOrders
        .filter((d) => d.status === 'completed')
        .reduce((sum, d) => sum + (Number(d.amount_rub) || 0), 0),
    [myOrders],
  )

  // ---------- Оформление заказа ----------
  const checkout = async () => {
    if (!buyer) {
      setMsg({ type: 'err', text: 'Покупатель не найден — обновите страницу' })
      return
    }
    if (!cart.items.length) {
      setMsg({ type: 'err', text: 'Корзина пуста' })
      return
    }
    setSubmitting(true)
    setMsg(null)
    const createdIds = []
    let lastErr = null
    for (const item of cart.items) {
      try {
        const r = await authFetch('/api/deals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listing_id: item.listing_id,
            buyer_company_id: buyer.id,
            amount_rub: item.price_rub,
            shipping_address: address.trim(),
          }),
        })
        const data = await r.json()
        if (!r.ok) {
          lastErr = data?.detail || 'Не удалось оформить заказ'
          continue
        }
        createdIds.push(item.listing_id)
      } catch {
        lastErr = 'Ошибка соединения с сервером'
      }
    }
    if (createdIds.length) {
      createdIds.forEach((id) => cart.remove(id))
      load()
      setMsg({
        type: 'ok',
        text: `Заказ оформлен: ${createdIds.length} поз. Деньги заморозятся в эскроу после оплаты.`,
      })
    }
    if (lastErr) setMsg({ type: 'err', text: lastErr })
    setSubmitting(false)
  }

  // ---------- Действия со сделкой: POST /deals/{id}/transition ----------
  const advanceDeal = async (deal, to) => {
    setAdvancing(deal.id)
    try {
      const r = await authFetch(`/api/deals/${deal.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, from_status: deal.status }),
      })
      const data = await r.json()
      if (!r.ok) {
        setMsg({ type: 'err', text: data?.detail || 'Не удалось обновить сделку' })
        return
      }
      if (data?.deal) {
        setDeals((prev) => prev.map((d) => (d.id === deal.id ? data.deal : d)))
      } else {
        load()
      }
      setMsg({ type: 'ok', text: `Сделка обновлена: ${DEAL_STATUS_LABEL[data.to_status] || data.to_status}` })
    } catch {
      setMsg({ type: 'err', text: 'Ошибка соединения с сервером' })
    } finally {
      setAdvancing(null)
    }
  }

  // ---------- Сохранение реквизитов для покупки в 1 клик ----------
  const saveProfile = async (e) => {
    e.preventDefault()
    setSavingProfile(true)
    setSaveMsg(null)
    try {
      const r = await authFetch('/api/buyer-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_payer_name: billingPayerName,
          billing_inn: billingInn,
          default_address: defaultAddress,
        }),
      })
      const data = await r.json().catch(() => null)
      if (r.ok) {
        setSaveMsg({ type: 'ok', text: 'Реквизиты сохранены — теперь доступна покупка в 1 клик' })
      } else {
        setSaveMsg({ type: 'err', text: data?.detail || 'Не удалось сохранить реквизиты' })
      }
    } catch {
      setSaveMsg({ type: 'err', text: 'Ошибка соединения с сервером' })
    } finally {
      setSavingProfile(false)
    }
  }

  if (loading) return <p className="pd-hint">Загрузка кабинета покупателя…</p>

  return (
    <div className="pd-cabinet pd-buyer">
      <h2>Кабинет покупателя</h2>

      {/* 1. Сводка */}
      <section aria-label="Сводка">
        <div className="pd-widgets">
          <div className="pd-widget">
            <b>{fmtMoney(cart.total)}</b>
            <span>корзина ({cart.count})</span>
          </div>
          <div className="pd-widget">
            <b>{myOrders.length}</b>
            <span>мои заказы</span>
          </div>
          <div className="pd-widget">
            <b>{inProgress}</b>
            <span>в пути / в работе</span>
          </div>
          <div className="pd-widget">
            <b>{fmtMoney(spent)}</b>
            <span>потрачено</span>
          </div>
        </div>
      </section>

      {/* 2. Корзина */}
      <section aria-label="Корзина">
        <h3>Корзина</h3>
        {cart.items.length === 0 ? (
          <p className="pd-muted">
            Корзина пуста. <Link to="/">Выберите детали в каталоге</Link>.
          </p>
        ) : (
          <>
            <ul className="pd-list pd-cart">
              {cart.items.map((item) => (
                <li key={item.listing_id} className="pd-cart-item">
                  <div className="pd-cart-main">
                    <strong>{item.title}</strong>
                    <span className="pd-cart-meta">
                      {fmtMoney(item.price_rub)}
                      {item.condition ? ` · ${item.condition}` : ''}
                      {item.seller_name ? ` · ${item.seller_name}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="pd-btn pd-btn-sm pd-btn-danger"
                    onClick={() => cart.remove(item.listing_id)}
                  >
                    Убрать
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="pd-form pd-checkout"
              onSubmit={(e) => { e.preventDefault(); checkout() }}
            >
              <label className="pd-field">
                <span className="pd-label">Адрес доставки</span>
                <input
                  className="pd-input"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Город, улица, дом"
                  required
                />
              </label>
              <button type="submit" className="pd-btn pd-btn-primary" disabled={submitting}>
                {submitting ? 'Оформление…' : `Оформить заказ (${cart.count}) — ${fmtMoney(cart.total)}`}
              </button>
            </form>
          </>
        )}
        {msg && (
          <p className={msg.type === 'ok' ? 'pd-form-ok' : 'pd-form-err'} role="status">
            {msg.text}
          </p>
        )}
      </section>

      {/* 3. Покупка в 1 клик (реквизиты) */}
      <section aria-label="Покупка в 1 клик">
        <h3>Покупка в 1 клик (реквизиты)</h3>
        {buyer?.verified ? (
          <p className="pd-form-ok">✓ Компания верифицирована</p>
        ) : (
          <p className="pd-muted">Не верифицирована — покупка в 1 клик недоступна до верификации</p>
        )}
        {profileLoaded && (
          <form className="pd-form" onSubmit={saveProfile}>
            <label className="pd-field">
              <span className="pd-label">Наименование плательщика</span>
              <input
                className="pd-input"
                type="text"
                value={billingPayerName}
                onChange={(e) => setBillingPayerName(e.target.value)}
                placeholder="ООО Ромашка"
              />
            </label>
            <label className="pd-field">
              <span className="pd-label">ИНН</span>
              <input
                className="pd-input"
                type="text"
                value={billingInn}
                onChange={(e) => setBillingInn(e.target.value)}
                placeholder="7701234567"
              />
            </label>
            <label className="pd-field">
              <span className="pd-label">Адрес доставки по умолчанию</span>
              <input
                className="pd-input"
                type="text"
                value={defaultAddress}
                onChange={(e) => setDefaultAddress(e.target.value)}
                placeholder="Москва, Ленина 10"
              />
            </label>
            <button type="submit" className="pd-btn pd-btn-primary" disabled={savingProfile}>
              {savingProfile ? 'Сохранение…' : 'Сохранить реквизиты'}
            </button>
          </form>
        )}
        {saveMsg && (
          <p className={saveMsg.type === 'ok' ? 'pd-form-ok' : 'pd-form-err'} role="status">
            {saveMsg.text}
          </p>
        )}
      </section>

      {/* 4. Мои заказы / отслеживание */}
      <section aria-label="Мои заказы">
        <h3>Мои заказы</h3>
        {myOrders.length === 0 ? (
          <p className="pd-muted">Заказов пока нет. Оформите первый из корзины.</p>
        ) : (
          <div className="pd-deals">
            {myOrders.map((d) => {
              const listing = listingById[d.listing_id]
              const actions = BUYER_ACTIONS[d.status] || []
              return (
                <div key={d.id} className="pd-deal-row pd-order">
                  <div className="pd-deal-row-main">
                    <strong>
                      <Link to={`/deal/${d.id}`} className="pd-deal-link">
                        {fmtMoney(d.amount_rub)}
                      </Link>
                    </strong>
                    <span className="pd-deal-row-meta">
                      {listing ? listing.title : 'Объявление'}
                      {d.created_at ? ` · ${fmtDate(d.created_at)}` : ''}
                      {d.shipping_address ? ` · доставка: ${d.shipping_address}` : ''}
                    </span>
                  </div>
                  <div className="pd-deal-row-badges">
                    <Badge kind={`status-${d.status}`}>{DEAL_STATUS_LABEL[d.status] || d.status}</Badge>
                    <Badge kind={`escrow-${d.escrow_status}`}>
                      эскроу: {ESCROW_LABEL[d.escrow_status] || d.escrow_status}
                    </Badge>
                  </div>
                  <DealTracker deal={d} />
                  {actions.length > 0 && (
                    <div className="pd-order-actions">
                      {actions.map((a) => (
                        <button
                          key={a.to}
                          type="button"
                          className="pd-btn pd-btn-sm pd-btn-primary"
                          disabled={advancing === d.id}
                          onClick={() => advanceDeal(d, a.to)}
                        >
                          {advancing === d.id ? '…' : a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
