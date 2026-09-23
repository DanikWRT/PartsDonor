import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { authFetch } from '../auth.jsx'

// ============================ Лейблы (RU) ============================

const CONDITION_LABEL = {
  working: 'Рабочая',
  for_parts: 'На запчасти',
  untested: 'Не проверена',
  no_guarantee: 'Без гарантии',
}

const LISTING_STATUS_LABEL = {
  active: 'Активен',
  negotiated: 'В переговорах',
  sold: 'Продано',
  hidden: 'Скрыто',
}

const DEAL_STATUS_LABEL = {
  created: 'Создана',
  paid_escrow: 'Оплата в эскроу',
  shipped: 'Отгружена',
  delivered: 'Доставлена',
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

// Действия продавца по статусной машине сделки.
// (created → оплата покупателем в эскроу, это не действие продавца;
//  далее продавец отгружает → доставляет → подтверждает.)
const SELLER_ACTIONS = {
  paid_escrow: { target: 'shipped', label: 'Начать доставку' },
  shipped: { target: 'delivered', label: 'Доставлено' },
  delivered: { target: 'completed', label: 'Подтвердить' },
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

// ============================ Страница кабинета ============================

export default function Cabinet() {
  const [listings, setListings] = useState([])
  const [deals, setDeals] = useState([])
  const [schemas, setSchemas] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)

  // состояние формы создания
  const [form, setForm] = useState({
    title: '',
    price_rub: '',
    condition: 'working',
    provenance: '',
    device_schema_id: '',
    inventree_part_id: '',
  })
  const [formMsg, setFormMsg] = useState(null) // {type:'ok'|'err', text}
  const [submitting, setSubmitting] = useState(false)

  // инлайн-редактирование цены листинга
  const [editingId, setEditingId] = useState(null)
  const [priceDraft, setPriceDraft] = useState('')

  const seller = useMemo(() => {
    return (
      companies.find((c) => c.role === 'seller') ||
      companies.find((c) => c.name === 'СмартРемонт') ||
      null
    )
  }, [companies])

  const companyById = useMemo(() => {
    const m = {}
    companies.forEach((c) => { m[c.id] = c })
    return m
  }, [companies])

  const listingById = useMemo(() => {
    const m = {}
    listings.forEach((l) => { m[l.id] = l })
    return m
  }, [listings])

  const load = () => {
    Promise.all([
      fetch('/api/listings').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/deals').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/device-schemas').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/companies').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([l, d, s, c]) => {
        setListings(l)
        setDeals(d)
        setSchemas(s)
        setCompanies(c)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // ---------- Сводка (dashlet) ----------
  const revenue = useMemo(
    () =>
      deals
        .filter((d) => d.status === 'completed' || d.status === 'delivered')
        .reduce((sum, d) => sum + (Number(d.amount_rub) || 0), 0),
    [deals],
  )
  const activeCount = useMemo(() => listings.filter((l) => l.status === 'active').length, [listings])
  const inWorkCount = useMemo(
    () => deals.filter((d) => d.status !== 'completed' && d.status !== 'refunded').length,
    [deals],
  )

  // ---------- Действия с листингом ----------
  const patchListing = async (id, body) => {
    const r = await authFetch(`/api/listings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error('Не удалось обновить объявление')
    return r.json()
  }

  const setStatus = async (id, status) => {
    try {
      await patchListing(id, { status })
      setListings((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)))
    } catch (e) {
      setFormMsg({ type: 'err', text: e.message })
    }
  }

  const startEditPrice = (l) => {
    setEditingId(l.id)
    setPriceDraft(String(l.price_rub))
  }
  const savePrice = async (id) => {
    const val = Number(priceDraft)
    if (!Number.isFinite(val) || val <= 0) {
      setFormMsg({ type: 'err', text: 'Укажите корректную цену (число больше нуля)' })
      return
    }
    try {
      await patchListing(id, { price_rub: val })
      setListings((prev) => prev.map((l) => (l.id === id ? { ...l, price_rub: val } : l)))
      setEditingId(null)
    } catch (e) {
      setFormMsg({ type: 'err', text: e.message })
    }
  }

  // ---------- Создание объявления ----------
  const onField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submitCreate = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setFormMsg(null)
    const price = Number(form.price_rub)
    if (!form.title.trim()) {
      setFormMsg({ type: 'err', text: 'Укажите название объявления' })
      setSubmitting(false)
      return
    }
    if (!Number.isFinite(price) || price <= 0) {
      setFormMsg({ type: 'err', text: 'Укажите корректную цену (число больше нуля)' })
      setSubmitting(false)
      return
    }
    const body = {
      title: form.title.trim(),
      price_rub: price,
      condition: form.condition,
      provenance: form.provenance.trim(),
    }
    if (seller) body.seller_id = seller.id
    if (form.device_schema_id) body.device_schema_id = form.device_schema_id
    if (form.inventree_part_id) body.inventree_part_id = Number(form.inventree_part_id)

    try {
      const r = await authFetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (!r.ok) {
        setFormMsg({ type: 'err', text: data?.detail || 'Не удалось создать объявление' })
      } else {
        setFormMsg({ type: 'ok', text: 'Объявление создано' })
        setForm({ title: '', price_rub: '', condition: 'working', provenance: '', device_schema_id: '', inventree_part_id: '' })
        setListings((prev) => [data, ...prev])
      }
    } catch (err) {
      setFormMsg({ type: 'err', text: 'Ошибка соединения с сервером' })
    } finally {
      setSubmitting(false)
    }
  }

  // ---------- Действия со сделкой ----------
  const patchDeal = async (id, status) => {
    const r = await authFetch(`/api/deals/${id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: status }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data?.detail || 'Не удалось обновить сделку')
    return data
  }

  const advanceDeal = async (deal, target) => {
    try {
      const updated = await patchDeal(deal.id, target)
      const updatedDeal = updated?.deal ?? updated
      setDeals((prev) => prev.map((d) => (d.id === deal.id ? updatedDeal : d)))
    } catch (e) {
      setFormMsg({ type: 'err', text: e.message })
    }
  }

  if (loading) return <p className="pd-hint">Загрузка кабинета…</p>

  return (
    <div className="pd-cabinet">
      <h2>Кабинет продавца</h2>

      {/* 1. Сводка */}
      <section aria-label="Сводка">
        <div className="pd-widgets">
          <div className="pd-widget">
            <b>{fmtMoney(revenue)}</b>
            <span>выручка</span>
          </div>
          <div className="pd-widget">
            <b>{activeCount}</b>
            <span>активные листинги</span>
          </div>
          <div className="pd-widget">
            <b>{inWorkCount}</b>
            <span>сделки в работе</span>
          </div>
          <div className="pd-widget">
            <b>
              {seller ? seller.rating.toLocaleString('ru-RU') : '—'}
              {seller?.verified && <span className="pd-verified"> ✓</span>}
            </b>
            <span>{seller ? seller.name : 'Продавец'}{seller?.verified ? ' · проверен' : ''}</span>
          </div>
        </div>
      </section>

      {/* 2. Листинги */}
      <section aria-label="Объявления">
        <h3>Объявления</h3>
        {listings.length === 0 ? (
          <p className="pd-muted">Пока нет объявлений. Создайте первое ниже.</p>
        ) : (
          <ul className="pd-list pd-listings">
            {listings.map((l) => (
              <li key={l.id} className="pd-listing">
                <div className="pd-listing-main">
                  <strong className="pd-listing-title">{l.title}</strong>
                  <span className="pd-listing-meta">
                    {CONDITION_LABEL[l.condition] || l.condition}
                    {l.provenance ? ` · ${l.provenance}` : ''}
                    {l.created_at ? ` · ${fmtDate(l.created_at)}` : ''}
                  </span>
                  {editingId === l.id ? (
                    <span className="pd-price-edit">
                      <input
                        className="pd-input pd-input-sm"
                        type="number"
                        aria-label="Цена"
                        value={priceDraft}
                        onChange={(e) => setPriceDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') savePrice(l.id) }}
                      />
                      <button type="button" className="pd-btn pd-btn-sm" onClick={() => savePrice(l.id)}>Сохранить</button>
                      <button type="button" className="pd-btn pd-btn-sm pd-btn-ghost" onClick={() => setEditingId(null)}>Отмена</button>
                    </span>
                  ) : (
                    <span className="pd-listing-price">
                      {fmtMoney(l.price_rub)}
                      <button type="button" className="pd-btn pd-btn-sm pd-btn-ghost" onClick={() => startEditPrice(l)}>
                        Цена
                      </button>
                    </span>
                  )}
                </div>
                <div className="pd-listing-badges">
                  <Badge kind={`cond-${l.condition}`}>{CONDITION_LABEL[l.condition] || l.condition}</Badge>
                  <Badge kind={`status-${l.status}`}>{LISTING_STATUS_LABEL[l.status] || l.status}</Badge>
                </div>
                {l.status === 'active' && (
                  <div className="pd-listing-actions">
                    <button type="button" className="pd-btn pd-btn-sm pd-btn-ghost" onClick={() => setStatus(l.id, 'hidden')}>
                      Скрыть
                    </button>
                    <button type="button" className="pd-btn pd-btn-sm pd-btn-danger" onClick={() => setStatus(l.id, 'sold')}>
                      Продано
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3. Создать объявление */}
      <section aria-label="Создать объявление">
        <h3>Создать объявление</h3>
        <form className="pd-form" onSubmit={submitCreate}>
          <div className="pd-form-grid">
            <label className="pd-field pd-field-wide">
              <span className="pd-label">Название</span>
              <input className="pd-input" type="text" value={form.title} onChange={onField('title')} required />
            </label>
            <label className="pd-field">
              <span className="pd-label">Цена, ₽</span>
              <input className="pd-input" type="number" min="1" step="any" value={form.price_rub} onChange={onField('price_rub')} required />
            </label>
            <label className="pd-field">
              <span className="pd-label">Состояние</span>
              <select className="pd-select" value={form.condition} onChange={onField('condition')}>
                <option value="working">Рабочая</option>
                <option value="for_parts">На запчасти</option>
                <option value="untested">Не проверена</option>
                <option value="no_guarantee">Без гарантии</option>
              </select>
            </label>
            <label className="pd-field pd-field-wide">
              <span className="pd-label">Происхождение</span>
              <input className="pd-input" type="text" value={form.provenance} onChange={onField('provenance')} placeholder="Например: снято с донора iPhone 13 Pro" />
            </label>
            <label className="pd-field">
              <span className="pd-label">Модель (схема)</span>
              <select className="pd-select" value={form.device_schema_id} onChange={onField('device_schema_id')}>
                <option value="">— не указывать —</option>
                {schemas.map((s) => (
                  <option key={s.id} value={s.id}>{s.brand} {s.model}</option>
                ))}
              </select>
            </label>
            <label className="pd-field">
              <span className="pd-label">InvenTree part ID</span>
              <input className="pd-input" type="number" min="1" value={form.inventree_part_id} onChange={onField('inventree_part_id')} />
            </label>
          </div>
          <button type="submit" className="pd-btn pd-btn-primary" disabled={submitting}>
            {submitting ? 'Создание…' : 'Создать объявление'}
          </button>
        </form>
        {formMsg && (
          <p className={formMsg.type === 'ok' ? 'pd-form-ok' : 'pd-form-err'} role="status">
            {formMsg.text}
          </p>
        )}
      </section>

      {/* 4. Сделки */}
      <section aria-label="Заказы и сделки">
        <h3>Сделки</h3>
        {deals.length === 0 ? (
          <p className="pd-muted">Пока нет сделок.</p>
        ) : (
          <div className="pd-deals">
            {deals.map((d) => {
              const buyer = companyById[d.buyer_company_id]
              const listing = listingById[d.listing_id]
              const action = SELLER_ACTIONS[d.status]
              return (
                <div key={d.id} className="pd-deal-row">
                  <div className="pd-deal-row-main">
                    <strong>{fmtMoney(d.amount_rub)}</strong>
                    <span className="pd-deal-row-meta">
                      {listing ? listing.title : 'Объявление'}
                      {buyer ? ` · покупатель: ${buyer.name}` : ''}
                      {d.created_at ? ` · ${fmtDate(d.created_at)}` : ''}
                    </span>
                  </div>
                  <div className="pd-deal-row-badges">
                    <Badge kind={`status-${d.status}`}>{DEAL_STATUS_LABEL[d.status] || d.status}</Badge>
                    <Badge kind={`escrow-${d.escrow_status}`}>эскроу: {ESCROW_LABEL[d.escrow_status] || d.escrow_status}</Badge>
                  </div>
                  {action && (
                    <button type="button" className="pd-btn pd-btn-sm" onClick={() => advanceDeal(d, action.target)}>
                      {action.label}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* 5. Доноры / схемы */}
      <section aria-label="Доноры и детали">
        <h3>Доноры</h3>
        {schemas.length === 0 ? (
          <p className="pd-muted">Нет схем устройств.</p>
        ) : (
          <div className="pd-donors">
            {schemas.map((s) => (
              <Link key={s.id} to={`/donor/${encodeURIComponent(s.brand)}/${encodeURIComponent(s.model)}`} className="pd-donor-card">
                <strong>{s.brand} {s.model}</strong>
                <span className="pd-donor-card-slots">
                  {Object.keys(s.hotspots || {}).join(', ')}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
